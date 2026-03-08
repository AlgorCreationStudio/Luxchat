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
  const ringingRef = useRef(false);

  useEffect(() => {
    ringingRef.current = true;

    // Show system notification so user sees it even with app in background
    const showCallNotification = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(`📞 Llamada de ${callerName}`, {
            body: 'Toca para contestar en LuxChat',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'incoming-call',
            renotify: true,
          } as any);
        } catch { /* no SW support */ }
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`📞 Llamada de ${callerName}`, {
          body: 'Toca para contestar en LuxChat',
          icon: '/icon-192.png',
        });
      }
    };
    showCallNotification();

    // Ringtone using AudioContext — repeated beep
    let timeoutId: ReturnType<typeof setTimeout>;
    const beep = () => {
      if (!ringingRef.current) return;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.setValueAtTime(620, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.85);
        setTimeout(() => ctx.close().catch(() => {}), 950);
      } catch { /* blocked */ }
      if (ringingRef.current) timeoutId = setTimeout(beep, 1400);
    };
    timeoutId = setTimeout(beep, 80);

    return () => {
      ringingRef.current = false;
      clearTimeout(timeoutId);
      // Dismiss the notification when call is answered/rejected
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) =>
          reg.getNotifications({ tag: 'incoming-call' }).then((ns) => ns.forEach((n) => n.close()))
        ).catch(() => {});
      }
    };
  }, [callerName]);

  return (
    <>
      {/* ── MOBILE: fullscreen native-style ── */}
      <div className="md:hidden fixed inset-0 z-[100] flex flex-col">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
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
          <div className="flex flex-col items-center gap-5 mt-8">
            <p className="text-sm text-white/50 uppercase tracking-widest">Llamada entrante</p>
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

          <div className="flex items-end justify-between w-full max-w-xs">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={onReject}
                className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center shadow-xl shadow-destructive/40 active:scale-95 transition-transform"
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </button>
              <span className="text-white/50 text-sm">Rechazar</span>
            </div>
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
