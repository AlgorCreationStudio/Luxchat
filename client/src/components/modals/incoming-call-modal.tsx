import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Phone, PhoneOff } from 'lucide-react';
import { Avatar } from '../ui-library';

interface IncomingCallModalProps {
  callerName: string;
  callerId: string;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, callerId, onAnswer, onReject }: IncomingCallModalProps) {
  useEffect(() => {
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const beep = () => {
      if (stopped) return;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.setValueAtTime(620, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.8);
        setTimeout(() => ctx.close().catch(() => {}), 900);
      } catch {
        // AudioContext blocked — silent fallback
      }
      if (!stopped) timeoutId = setTimeout(beep, 1400);
    };

    timeoutId = setTimeout(beep, 100);
    return () => { stopped = true; clearTimeout(timeoutId); };
  }, []);

  return (
    <>
      {/* ── MOBILE: full-screen overlay with bottom sheet feel ── */}
      <div className="md:hidden fixed inset-0 z-[100] flex flex-col">
        {/* Dark backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

        {/* Content centered vertically */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="relative z-10 flex flex-col items-center justify-between h-full px-8"
          style={{
            paddingTop: 'max(4rem, env(safe-area-inset-top))',
            paddingBottom: 'max(3rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Top: caller info */}
          <div className="flex flex-col items-center gap-5 mt-8">
            <p className="text-sm text-white/50 uppercase tracking-widest">Llamada entrante</p>

            {/* Avatar with pulse */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping scale-125" />
              <div className="absolute inset-0 rounded-full bg-green-500/10 animate-ping scale-150" style={{ animationDelay: '0.3s' }} />
              <Avatar fallback={callerName} size="xl" className="w-28 h-28 text-4xl relative z-10 ring-4 ring-white/10" />
            </div>

            <div className="text-center">
              <h2 className="text-3xl font-display font-bold text-white">{callerName}</h2>
              <p className="text-white/40 text-sm mt-1">LuxChat</p>
            </div>
          </div>

          {/* Bottom: big action buttons */}
          <div className="flex items-end justify-between w-full max-w-xs">
            {/* Reject */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={onReject}
                className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center shadow-xl shadow-destructive/40 active:scale-95 transition-transform"
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </button>
              <span className="text-white/50 text-sm">Rechazar</span>
            </div>

            {/* Answer */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={onAnswer}
                className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-500/40 active:scale-95 transition-transform"
              >
                <Phone className="w-8 h-8 text-white" />
              </button>
              <span className="text-white/50 text-sm">Contestar</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── DESKTOP: compact top banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -100 }}
        className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
      >
        <div className="bg-card border border-white/10 rounded-3xl p-6 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="relative flex justify-center mb-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-secondary/20 animate-ping" />
            </div>
            <Avatar fallback={callerName} size="xl" className="w-16 h-16 text-2xl relative z-10" />
          </div>

          <div className="text-center mb-6">
            <p className="text-xs text-secondary/70 uppercase tracking-widest mb-1">Llamada entrante</p>
            <h3 className="text-xl font-display font-bold text-foreground">{callerName}</h3>
          </div>

          <div className="flex items-center justify-center gap-8">
            <button
              onClick={onReject}
              className="w-14 h-14 rounded-full bg-destructive/20 border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive hover:text-white transition-all hover:scale-105"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              onClick={onAnswer}
              className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400 hover:bg-green-500 hover:text-white transition-all hover:scale-105"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
