import { useState, useRef, useCallback, useEffect } from 'react';

export interface RecordingState {
  isRecording: boolean;
  isLocked: boolean;
  seconds: number;
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isLocked: false,
    seconds: 0,
  });

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>('audio/webm');
  const secondsRef = useRef<number>(0);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = useCallback(async (): Promise<boolean> => {
    if (state.isRecording) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 22050 },
      });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mimeRef.current = mime;
      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(100);
      mediaRecRef.current = rec;

      setState({ isRecording: true, isLocked: false, seconds: 0 });
      secondsRef.current = 0;
      intervalRef.current = setInterval(() => {
        secondsRef.current += 1;
        setState((prev) => ({ ...prev, seconds: secondsRef.current }));
      }, 1000);
      navigator.vibrate?.(50);
      return true;
    } catch {
      return false;
    }
  }, [state.isRecording]);

  const lock = useCallback(() => {
    setState((prev) => ({ ...prev, isLocked: true }));
    navigator.vibrate?.([20, 10, 20]);
  }, []);

  const stop = useCallback((): Promise<{ blob: Blob; mime: string; seconds: number } | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecRef.current;
      if (!rec) { resolve(null); return; }

      const mime = mimeRef.current;
      const seconds = secondsRef.current;
      clearTimer();

      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecRef.current = null;
        secondsRef.current = 0;
    setState({ isRecording: false, isLocked: false, seconds: 0 });
        resolve(seconds >= 1 ? { blob, mime, seconds } : null);
      };
      rec.stop();
    });
  }, [state.seconds]);

  const cancel = useCallback(() => {
    const rec = mediaRecRef.current;
    clearTimer();
    if (rec) {
      rec.onstop = () => {
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecRef.current = null;
      };
      rec.stop();
    }
    setState({ isRecording: false, isLocked: false, seconds: 0 });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { clearTimer(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  return { state, start, lock, stop, cancel };
}
