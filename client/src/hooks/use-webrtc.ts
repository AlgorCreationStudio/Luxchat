import { useRef, useCallback, useState } from 'react';

export function getWebRTCErrorMessage(error: unknown): string {
  const name = typeof error === 'object' && error && 'name' in error
    ? String((error as { name?: unknown }).name ?? '')
    : '';
  const message = error instanceof Error ? error.message : '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'El navegador bloqueó el micrófono. Permite el acceso al micrófono para llamar.';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró ningún micrófono disponible para iniciar la llamada.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'El micrófono está siendo usado por otra aplicación o pestaña.';
  }

  if (name === 'SecurityError') {
    return 'Las llamadas requieren HTTPS o localhost para acceder al micrófono.';
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'La configuración de audio no es compatible con este dispositivo.';
  }

  if (message) {
    return message;
  }

  return 'Se produjo un error desconocido al iniciar la llamada.';
}

function normalizeIceServers(input: unknown): RTCIceServer[] {
  const rawServers = Array.isArray(input)
    ? input
    : (typeof input === 'object' && input && 'iceServers' in input && Array.isArray((input as { iceServers?: unknown }).iceServers)
      ? (input as { iceServers: unknown[] }).iceServers
      : (typeof input === 'object'
        && input
        && 'v' in input
        && typeof (input as { v?: unknown }).v === 'object'
        && (input as { v?: { iceServers?: unknown } }).v
        && Array.isArray((input as { v?: { iceServers?: unknown[] } }).v?.iceServers)
          ? (input as { v: { iceServers: unknown[] } }).v.iceServers
          : null));

  if (!rawServers) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  const normalized = rawServers.flatMap((server) => {
    if (!server || typeof server !== 'object') return [];

    const rawUrls = 'urls' in server
      ? (server as { urls?: unknown }).urls
      : (server as { url?: unknown }).url;

    if (typeof rawUrls !== 'string' && !Array.isArray(rawUrls)) {
      return [];
    }

    const urls = Array.isArray(rawUrls)
      ? rawUrls.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : rawUrls;

    if ((Array.isArray(urls) && urls.length === 0) || urls === '') {
      return [];
    }

    return [{
      urls,
      username: typeof (server as { username?: unknown }).username === 'string'
        ? (server as { username?: string }).username
        : undefined,
      credential: typeof (server as { credential?: unknown }).credential === 'string'
        ? (server as { credential?: string }).credential
        : undefined,
    } satisfies RTCIceServer];
  });

  return normalized.length > 0 ? normalized : [{ urls: 'stun:stun.l.google.com:19302' }];
}

// ICE servers fetched from our own backend — credentials never exposed in client code
async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/ice-servers');
    if (res.ok) {
      const data = await res.json();
      return normalizeIceServers(data);
    }
  } catch (e) {
    console.warn('[WebRTC] Failed to fetch ICE servers, using STUN only', e);
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export type RTCStatus = 'idle' | 'calling' | 'connected' | 'rejected' | 'ended';

export function useWebRTC(
  onStatusChange: (status: RTCStatus) => void,
  onNeedSignal: (type: 'offer' | 'answer' | 'ice', data: unknown) => void
) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [micOn, setMicOnState] = useState(true);
  // Buffer ICE candidates that arrive before remoteDescription is set
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  // Buffer answer that may arrive before PC is created
  const pendingAnswerRef = useRef<RTCSessionDescriptionInit | null>(null);

  const cleanup = useCallback((options?: { preservePendingIce?: boolean }) => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (!options?.preservePendingIce) {
      pendingIceRef.current = [];
    }
    remoteDescSetRef.current = false;
    pendingAnswerRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const createPC = useCallback(async (): Promise<RTCPeerConnection> => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    let cleanedUpOnFailure = false;

    const handleConnected = () => {
      onStatusChange('connected');
    };

    const handleFailure = () => {
      if (cleanedUpOnFailure) return;
      cleanedUpOnFailure = true;
      onStatusChange('ended');
      cleanup();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) onNeedSignal('ice', e.candidate);
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        handleConnected();
      }
      // Only treat 'failed' as ended — 'disconnected' is transient and may recover
      if (pc.connectionState === 'failed') {
        handleFailure();
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        handleConnected();
      }
      if (pc.iceConnectionState === 'failed') {
        handleFailure();
      }
    };

    pc.ontrack = (e) => {
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      remoteAudioRef.current.srcObject = e.streams[0];
      // Resume audio context on mobile if needed
      remoteAudioRef.current.play().catch(() => {});
    };

    return pc;
  }, [onNeedSignal, onStatusChange, cleanup]);

  // CALLER: initiate call
  const startCall = useCallback(async () => {
    cleanup();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = await createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onNeedSignal('offer', offer);
      onStatusChange('calling');

      // Flush any answer that arrived while we were setting up
      if (pendingAnswerRef.current) {
        const buffered = pendingAnswerRef.current;
        pendingAnswerRef.current = null;
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(buffered));
          remoteDescSetRef.current = true;
          for (const c of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingIceRef.current = [];
          onStatusChange('connected');
        }
      }
    } catch (error) {
      console.error('[WebRTC] Failed to start outgoing call', error);
      cleanup();
      throw error;
    }
  }, [createPC, cleanup, onNeedSignal, onStatusChange]);

  // CALLEE: receive offer and send answer
  const answerCall = useCallback(async (offer: RTCSessionDescriptionInit) => {
    cleanup({ preservePendingIce: true });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = await createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      remoteDescSetRef.current = true;

      // Flush any buffered ICE candidates
      for (const c of pendingIceRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onNeedSignal('answer', answer);
      onStatusChange('connected'); // callee answered → show connected immediately
    } catch (error) {
      console.error('[WebRTC] Failed to answer incoming call', error);
      cleanup();
      throw error;
    }
  }, [createPC, cleanup, onNeedSignal, onStatusChange]);

  // CALLER: receive answer from callee
  const receiveAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) {
      console.warn('[WebRTC] receiveAnswer: no active call');
      return;
    }
    if (pc.signalingState !== 'have-local-offer') {
      console.warn('[WebRTC] receiveAnswer: wrong state', pc.signalingState, '— ignoring');
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      remoteDescSetRef.current = true;

      // Flush buffered ICE candidates
      for (const c of pendingIceRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingIceRef.current = [];

      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        onStatusChange('connected');
      }
    } catch (error) {
      console.error('[WebRTC] Failed to apply remote answer', error);
      throw error;
    }
  }, [onStatusChange]);

  // Both: receive ICE candidate — buffer if remoteDescription not set yet
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

  const hangUp = useCallback(() => {
    cleanup();
    onStatusChange('ended');
  }, [cleanup, onStatusChange]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMicOnState((prev) => !prev);
  }, []);

  return { startCall, answerCall, receiveAnswer, receiveIce, hangUp, toggleMic, micOn };
}
