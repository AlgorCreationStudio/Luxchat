import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff } from 'lucide-react';
import { Avatar } from '../ui-library';

interface IncomingCallModalProps {
  callerName: string;
  callerId: string;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ callerName, callerId, onAnswer, onReject }: IncomingCallModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Play ringtone using Web Audio API
    const ctx = new AudioContext();
    let stopped = false;

    const playRing = async () => {
      while (!stopped) {
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
        await new Promise(r => setTimeout(r, 1200));
      }
    };

    playRing();

    return () => {
      stopped = true;
      ctx.close();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
    >
      <div className="bg-card border border-white/10 rounded-3xl p-6 shadow-2xl shadow-black/50 backdrop-blur-xl">
        {/* Pulse ring */}
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
  );
}
