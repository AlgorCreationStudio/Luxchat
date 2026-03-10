import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Avatar } from '../ui-library';
import type { RTCStatus, CallMode } from '@/hooks/use-webrtc';

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  callStatus: RTCStatus;
  micOn: boolean;
  onToggleMic: () => void;
  cameraOn?: boolean;
  onToggleCamera?: () => void;
  callMode?: CallMode;
  localVideoRef?: React.RefObject<HTMLVideoElement>;
  remoteVideoRef?: React.RefObject<HTMLVideoElement>;
}

export function CallModal({
  isOpen, onClose, contactName, callStatus,
  micOn, onToggleMic,
  cameraOn = true, onToggleCamera,
  callMode = 'audio',
  localVideoRef, remoteVideoRef,
}: CallModalProps) {

  useEffect(() => {
    if (callStatus === 'rejected' || callStatus === 'ended') {
      const t = setTimeout(onClose, 2800);
      return () => clearTimeout(t);
    }
  }, [callStatus, onClose]);

  const elapsed = useElapsed(callStatus === 'connected');

  const statusLabel: Record<RTCStatus, string> = {
    idle: 'Iniciando...',
    calling: 'Llamando...',
    connected: callMode === 'video' ? '🎥 ' + formatTime(elapsed) : formatTime(elapsed),
    rejected: 'Llamada rechazada',
    ended: 'Llamada finalizada',
  };

  const isVideo = callMode === 'video';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center"
        >
          {/* Video backgrounds */}
          {isVideo && (
            <>
              {/* Remote video — fullscreen background */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Local video — PiP bottom right */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-24 right-4 w-32 h-48 md:w-40 md:h-56 object-cover rounded-2xl border-2 border-white/20 shadow-2xl z-10"
                style={{ transform: 'scaleX(-1)' }}
              />
            </>
          )}

          {/* Ambient glow — only for audio */}
          {!isVideo && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none flex justify-center items-center">
              <div className="w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[100px] animate-pulse" />
            </div>
          )}

          <motion.div
            initial={{ scale: 0.9, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 50, opacity: 0 }}
            className="relative z-10 flex flex-col items-center gap-10 w-full max-w-sm px-6"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            {/* Avatar + name — hidden during active video */}
            {(!isVideo || callStatus !== 'connected') && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Avatar fallback={contactName} size="xl" className="w-28 h-28 text-4xl ring-4 ring-primary/30" />
                  {callStatus === 'calling' && (
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  )}
                  {callStatus === 'connected' && (
                    <div className="absolute inset-0 rounded-full border-4 border-green-500/50 animate-pulse" />
                  )}
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-display font-bold text-foreground tracking-wide">{contactName}</h2>
                  <p className={`mt-2 uppercase tracking-widest text-sm font-medium ${
                    callStatus === 'rejected' || callStatus === 'ended' ? 'text-destructive'
                      : callStatus === 'connected' ? 'text-green-400'
                      : 'text-muted-foreground'
                  }`}>
                    {statusLabel[callStatus]}
                  </p>
                </div>
              </div>
            )}

            {/* Timer during active video */}
            {isVideo && callStatus === 'connected' && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-1.5 text-white text-sm font-mono">
                {statusLabel.connected}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-4 bg-card/40 p-4 rounded-full border border-white/10 backdrop-blur-md">
              {/* Mic */}
              <button
                onClick={onToggleMic}
                disabled={callStatus !== 'connected'}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${
                  micOn ? 'bg-white/10 hover:bg-white/20 text-foreground' : 'bg-destructive/20 text-destructive'
                }`}
              >
                {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </button>

              {/* Camera (only for video calls) */}
              {isVideo && onToggleCamera && (
                <button
                  onClick={onToggleCamera}
                  disabled={callStatus !== 'connected'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${
                    cameraOn ? 'bg-white/10 hover:bg-white/20 text-foreground' : 'bg-destructive/20 text-destructive'
                  }`}
                >
                  {cameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
              )}

              {/* Hang up */}
              <button
                onClick={onClose}
                className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 hover:scale-105 transition-all shadow-lg shadow-destructive/30"
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </button>

              {!isVideo && <div className="w-14 h-14" />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function useElapsed(running: boolean) {
  const [elapsed, setElapsed] = React.useState(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);
  return elapsed;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}
