import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  duration?: number | null; // seconds hint from server
  isMe: boolean;
}

const NUM_BARS = 22;

function genBars(src: string): number[] {
  // Deterministic waveform from src string
  const seed = src.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: NUM_BARS }, (_, i) =>
    Math.max(4, 18 + Math.sin(i * 0.9 + seed * 0.1) * 10 + Math.cos(i * 1.7) * 6)
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ src, duration: durationHint, isMe }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [duration, setDuration] = useState<number | null>(durationHint ?? null);
  const [currentTime, setCurrentTime] = useState(0);
  const bars = genBars(src);

  // Try to get duration as soon as possible
  const trySetDuration = useCallback(() => {
    const au = audioRef.current;
    if (au && isFinite(au.duration) && au.duration > 0) {
      setDuration(au.duration);
    }
  }, []);

  useEffect(() => {
    const au = audioRef.current;
    if (!au) return;
    const handlers = {
      loadedmetadata: trySetDuration,
      durationchange: trySetDuration,
      canplay: trySetDuration,
      timeupdate: () => {
        setCurrentTime(au.currentTime);
        if (au.duration && isFinite(au.duration)) {
          setProgress(au.currentTime / au.duration);
          trySetDuration();
        }
      },
      ended: () => {
        setPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (au.duration && isFinite(au.duration)) setDuration(au.duration);
      },
    };
    Object.entries(handlers).forEach(([ev, fn]) => au.addEventListener(ev, fn));
    // Force metadata load
    if (au.readyState >= 1) trySetDuration();
    else au.load();

    return () => Object.entries(handlers).forEach(([ev, fn]) => au.removeEventListener(ev, fn));
  }, [trySetDuration]);

  const toggle = async () => {
    const au = audioRef.current;
    if (!au) return;
    if (playing) {
      au.pause();
      setPlaying(false);
    } else {
      try { await au.play(); setPlaying(true); } catch {}
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const au = audioRef.current;
    if (!au || !isFinite(au.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    au.currentTime = p * au.duration;
    setProgress(p);
  };

  const displayTime = playing || currentTime > 0
    ? fmt(currentTime)
    : duration != null ? fmt(duration) : '--:--';

  const activeColor = isMe ? 'bg-primary-foreground/80' : 'bg-secondary';
  const inactiveColor = isMe ? 'bg-primary-foreground/20' : 'bg-white/15';
  const btnColor = isMe
    ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground'
    : 'bg-white/10 hover:bg-white/20 text-foreground';

  return (
    <div className="flex items-center gap-3 py-1 min-w-[200px] max-w-[280px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={toggle}
        className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors', btnColor)}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform */}
      <div
        className="flex items-center gap-[2px] flex-1 h-8 cursor-pointer"
        onClick={seek}
      >
        {bars.map((h, i) => {
          const barProgress = i / NUM_BARS;
          const isPlayed = barProgress <= progress;
          return (
            <div
              key={i}
              className={cn('flex-1 max-w-[4px] rounded-full transition-colors', isPlayed ? activeColor : inactiveColor)}
              style={{ height: `${h}px` }}
            />
          );
        })}
      </div>

      <span className={cn('text-[11px] font-mono flex-shrink-0 tabular-nums', isMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {displayTime}
      </span>
    </div>
  );
}
