import React, { useEffect, useRef } from 'react';
import { X, Send, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordingOverlayProps {
  seconds: number;
  isLocked: boolean;
  lockProgress: number; // 0-1
  onCancel: () => void;
  onSend: () => void;
}

const NUM_BARS = 28;

export function RecordingOverlay({ seconds, isLocked, lockProgress, onCancel, onSend }: RecordingOverlayProps) {
  const waveRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // Animate waveform
  useEffect(() => {
    const bars = waveRef.current?.querySelectorAll<HTMLDivElement>('.rec-bar');
    if (!bars) return;
    let t = 0;
    const animate = () => {
      bars.forEach((bar, i) => {
        const h = Math.max(3, 14 + Math.sin(t * 3 + i * 0.4) * 8 + Math.cos(t * 2 + i * 0.7) * 5);
        bar.style.height = `${h}px`;
      });
      t += 0.08;
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    // Full-width, exact height, no absolute positioning issues
    <div className="flex items-center w-full h-full bg-[rgba(8,8,14,0.97)] border-t-2 border-destructive/30">
      {/* Cancel */}
      <button
        onClick={onCancel}
        className="w-14 h-full flex items-center justify-center text-destructive/60 hover:text-destructive flex-shrink-0 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Dot + Time */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="font-mono text-sm font-bold text-destructive tabular-nums">{fmt(seconds)}</span>
      </div>

      {/* Waveform */}
      <div ref={waveRef} className="flex items-center gap-[2px] flex-1 h-8 mx-3 overflow-hidden">
        {Array.from({ length: NUM_BARS }).map((_, i) => (
          <div
            key={i}
            className="rec-bar flex-1 max-w-[4px] rounded-full bg-destructive/40 transition-none"
            style={{ height: '4px' }}
          />
        ))}
      </div>

      {/* Lock indicator */}
      {!isLocked && (
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 mr-2">
          <Lock className={cn('w-4 h-4 transition-colors', lockProgress > 0.7 ? 'text-primary' : 'text-muted-foreground')} />
          <div className="w-0.5 h-5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="w-full bg-primary transition-all duration-100 rounded-full"
              style={{ height: `${lockProgress * 100}%`, marginTop: `${(1 - lockProgress) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Send */}
      <button
        onClick={onSend}
        className="w-14 h-full flex items-center justify-center bg-destructive text-white flex-shrink-0 hover:bg-destructive/80 transition-colors"
      >
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
}
