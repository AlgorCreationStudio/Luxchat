import React from 'react';
import { X, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@shared/schema';

interface ReplyBarProps {
  replyTo: Message & { senderName: string };
  isMe: boolean;
  onClear: () => void;
}

export function ReplyBar({ replyTo, isMe, onClear }: ReplyBarProps) {
  const isAudio = replyTo.type === 'audio';
  const preview = isAudio ? '🎤 Nota de voz' : (replyTo.content || '📎 Archivo');

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-black/20 border-t border-white/5 animate-in slide-in-from-bottom-2 duration-150">
      {/* Color stripe */}
      <div className={cn('w-1 h-10 rounded-full flex-shrink-0', isMe ? 'bg-primary' : 'bg-secondary')} />

      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-semibold', isMe ? 'text-primary' : 'text-secondary')}>
          {isMe ? 'Tú' : replyTo.senderName}
        </p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          {isAudio && <Mic className="w-3 h-3 flex-shrink-0" />}
          {preview}
        </p>
      </div>

      <button
        onClick={onClear}
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
