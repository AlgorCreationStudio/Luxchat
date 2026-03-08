import { useRef, useCallback, useState } from 'react';

// ICE servers fetched from our own backend — credentials never exposed in client code
async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/ice-servers');
    if (res.ok) return await res.json();
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

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const createPC = useCallback(async (): Promise<RTCPeerConnection> => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) onNeedSignal('ice', e.candidate);
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        onStatusChange('connected');
      }
      // Only treat 'failed' as ended — 'disconnected' is transient and may recover
      if (pc.connectionState === 'failed') {
        onStatusChange('ended');
        cleanup();
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;

    const pc = await createPC();
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    onNeedSignal('offer', offer);
    onStatusChange('calling');
  }, [createPC, cleanup, onNeedSignal, onStatusChange]);

  // CALLEE: receive offer and send answer
  const answerCall = useCallback(async (offer: RTCSessionDescriptionInit) => {
    cleanup();
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
    onStatusChange('calling'); // caller will move to connected via connectionstatechange
  }, [createPC, cleanup, onNeedSignal, onStatusChange]);

  // CALLER: receive answer from callee
  const receiveAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!pcRef.current) return;
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    remoteDescSetRef.current = true;

    // Flush buffered ICE candidates
    for (const c of pendingIceRef.current) {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingIceRef.current = [];
  }, []);

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
