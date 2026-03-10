import { useRef, useCallback, useState } from 'react';

export function getWebRTCErrorMessage(error: unknown): string {
  const name = typeof error === 'object' && error && 'name' in error ? String((error as any).name ?? '') : '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'El navegador bloqueó el micrófono/cámara. Permite el acceso para llamar.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se encontró ningún micrófono o cámara disponible.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'El micrófono o cámara está siendo usado por otra aplicación.';
  if (name === 'SecurityError') return 'Las llamadas requieren HTTPS o localhost.';
  return message || 'Se produjo un error desconocido al iniciar la llamada.';
}

function normalizeIceServers(input: unknown): RTCIceServer[] {
  const rawServers = Array.isArray(input) ? input
    : (typeof input === 'object' && input && 'v' in input && Array.isArray((input as any).v?.iceServers)
      ? (input as any).v.iceServers
      : (typeof input === 'object' && input && 'iceServers' in input && Array.isArray((input as any).iceServers)
        ? (input as any).iceServers : null));

  if (!rawServers) return [{ urls: 'stun:stun.l.google.com:19302' }];

  const normalized = rawServers.flatMap((server: any) => {
    if (!server || typeof server !== 'object') return [];
    const rawUrls = server.urls ?? server.url;
    if (typeof rawUrls !== 'string' && !Array.isArray(rawUrls)) return [];
    const urls = Array.isArray(rawUrls) ? rawUrls.filter((v: any) => typeof v === 'string' && v.length > 0) : rawUrls;
    if ((Array.isArray(urls) && urls.length === 0) || urls === '') return [];
    return [{ urls, username: server.username, credential: server.credential } as RTCIceServer];
  });

  return normalized.length > 0 ? normalized : [{ urls: 'stun:stun.l.google.com:19302' }];
}

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/ice-servers');
    if (res.ok) return normalizeIceServers(await res.json());
  } catch (e) {
    console.warn('[WebRTC] Failed to fetch ICE servers', e);
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export type RTCStatus = 'idle' | 'calling' | 'connected' | 'rejected' | 'ended';
export type CallMode = 'audio' | 'video';

export function useWebRTC(
  onStatusChange: (status: RTCStatus) => void,
  onNeedSignal: (type: 'offer' | 'answer' | 'ice', data: unknown) => void
) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [micOn, setMicOnState] = useState(true);
  const [cameraOn, setCameraOnState] = useState(true);
  const [callMode, setCallMode] = useState<CallMode>('audio');
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const pendingAnswerRef = useRef<RTCSessionDescriptionInit | null>(null);

  const cleanup = useCallback((options?: { preservePendingIce?: boolean }) => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (!options?.preservePendingIce) pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    pendingAnswerRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.pause();
      remoteAudioRef.current.parentNode?.removeChild(remoteAudioRef.current);
      remoteAudioRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const createPC = useCallback(async (): Promise<RTCPeerConnection> => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    let cleanedUpOnFailure = false;

    const handleConnected = () => onStatusChange('connected');
    const handleFailure = () => {
      if (cleanedUpOnFailure) return;
      cleanedUpOnFailure = true;
      onStatusChange('ended');
      cleanup();
    };

    pc.onicecandidate = (e) => { if (e.candidate) onNeedSignal('ice', e.candidate); };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') handleConnected();
      if (pc.connectionState === 'failed') handleFailure();
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') handleConnected();
      if (pc.iceConnectionState === 'failed') handleFailure();
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      const hasVideo = stream.getVideoTracks().length > 0;

      if (hasVideo && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {});
      } else {
        // Audio only
        if (!remoteAudioRef.current) {
          const audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', '');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          remoteAudioRef.current = audio;
        }
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((err) => console.error('[WebRTC] Audio play failed:', err));
      }
    };

    return pc;
  }, [onNeedSignal, onStatusChange, cleanup]);

  const startCall = useCallback(async (mode: CallMode = 'audio') => {
    cleanup();
    setCallMode(mode);
    try {
      const constraints = mode === 'video'
        ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }
        : { audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (mode === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = await createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onNeedSignal('offer', offer);
      onStatusChange('calling');

      if (pendingAnswerRef.current) {
        const buffered = pendingAnswerRef.current;
        pendingAnswerRef.current = null;
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(buffered));
          remoteDescSetRef.current = true;
          for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          pendingIceRef.current = [];
          onStatusChange('connected');
        }
      }
    } catch (error) {
      cleanup();
      throw error;
    }
  }, [createPC, cleanup, onNeedSignal, onStatusChange]);

  const answerCall = useCallback(async (offer: RTCSessionDescriptionInit) => {
    cleanup({ preservePendingIce: true });

    // Detect if offer has video tracks
    const hasVideo = offer.sdp?.includes('m=video') ?? false;
    const mode: CallMode = hasVideo ? 'video' : 'audio';
    setCallMode(mode);

    try {
      const constraints = hasVideo
        ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }
        : { audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (hasVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = await createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      remoteDescSetRef.current = true;

      for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onNeedSignal('answer', answer);
      onStatusChange('connected');
    } catch (error) {
      cleanup();
      throw error;
    }
  }, [createPC, cleanup, onNeedSignal, onStatusChange]);

  const receiveAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) { console.warn('[WebRTC] receiveAnswer: no active call'); return; }
    if (pc.signalingState !== 'have-local-offer') {
      console.warn('[WebRTC] receiveAnswer: wrong state', pc.signalingState);
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      remoteDescSetRef.current = true;
      for (const c of pendingIceRef.current) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      pendingIceRef.current = [];
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        onStatusChange('connected');
      }
    } catch (error) {
      console.error('[WebRTC] Failed to apply remote answer', error);
      throw error;
    }
  }, [onStatusChange]);

  const receiveIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!pcRef.current || !remoteDescSetRef.current) {
      pendingIceRef.current.push(candidate);
      return;
    }
    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[WebRTC] Failed to add ICE candidate', e);
    }
  }, []);

  const hangUp = useCallback(() => { cleanup(); onStatusChange('ended'); }, [cleanup, onStatusChange]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMicOnState((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCameraOnState((prev) => !prev);
  }, []);

  return {
    startCall, answerCall, receiveAnswer, receiveIce, hangUp,
    toggleMic, micOn,
    toggleCamera, cameraOn, callMode,
    localVideoRef, remoteVideoRef,
  };
}
