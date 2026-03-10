import React, { useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Trash2, SmilePlus, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioPlayer } from './audio-player';
import type { Message } from '@shared/schema';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface MessageBubbleProps {
  message: Message & { senderName: string; decryptedContent?: string };
  isMe: boolean;
  onReply: (msg: Message & { senderName: string }) => void;
  onReact: (msgId: number, emoji: string) => void;
  onDelete: (msgId: number) => void;
  onScrollTo?: (msgId: number) => void;
}

export function MessageBubble({ message, isMe, onReply, onReact, onDelete, onScrollTo }: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const time = message.createdAt ? format(new Date(message.createdAt), 'HH:mm') : '';
  const reactions = (() => {
    try { return JSON.parse(message.reactions || '{}') as Record<string, string[]>; } catch { return {}; }
  })();
  const hasReactions = Object.values(reactions).some((r) => r.length > 0);

  if (message.deleted) {
    return (
      <div className={cn('flex w-full mb-3', isMe ? 'justify-end' : 'justify-start')}>
        <div className="px-4 py-2 rounded-2xl bg-muted/30 border border-white/5 text-muted-foreground text-sm italic">
          🚫 Mensaje eliminado
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn('flex w-full mb-3 group', isMe ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false); }}
    >
      <div className={cn('max-w-[72%] flex flex-col gap-1', isMe ? 'items-end' : 'items-start')}>
        {/* Reply block */}
        {message.replyToId && (
          <div
            className={cn(
              'flex gap-2 px-3 py-1.5 rounded-xl bg-black/20 border border-white/5 cursor-pointer hover:bg-black/30 transition-colors text-xs max-w-full',
              isMe ? 'self-end' : 'self-start'
            )}
            onClick={() => message.replyToId && onScrollTo?.(message.replyToId)}
          >
            <div className={cn('w-0.5 rounded-full flex-shrink-0', message.replyToSenderId === message.senderId ? 'bg-primary' : 'bg-secondary')} />
            <div className="min-w-0">
              <p className={cn('font-semibold', message.replyToSenderId === message.senderId ? 'text-primary' : 'text-secondary')}>
                {message.replyToSenderId === message.senderId ? 'Tú' : message.replyToSenderName}
              </p>
              <p className="text-muted-foreground truncate">
                {message.replyToIsAudio ? '🎤 Nota de voz' : (message.replyToText || '📎 Archivo')}
              </p>
            </div>
          </div>
        )}

        {/* Bubble */}
        <div className="flex items-end gap-2">
          {/* Actions (left for outgoing, right for incoming handled below) */}
          {isMe && showActions && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onReply(message)} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors text-xs px-2">
                ↩
              </button>
              <button onClick={() => setShowReactions(!showReactions)} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(message.id)} className="p-1.5 rounded-full bg-white/5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed relative shadow-md',
              isMe
                ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-tr-sm shadow-primary/10'
                : 'bg-muted border border-white/5 text-foreground rounded-tl-sm'
            )}
            onDoubleClick={() => onReply(message)}
          >
            {message.type === 'audio' && message.audioData ? (
              <AudioPlayer src={message.audioData} duration={message.audioDuration} isMe={isMe} />
            ) : (
              <span className="flex items-start gap-1">
                {(message as any).encrypted && !message.decryptedContent && <Lock className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-50" />}
                {message.decryptedContent || message.content}
              </span>
            )}

            {/* Media */}
            {message.mediaData && (
              <img src={message.mediaData} alt="" className="max-w-[240px] rounded-xl mt-1" />
            )}
          </div>

          {!isMe && showActions && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setShowReactions(!showReactions)} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onReply(message)} className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors text-xs px-2">
                ↩
              </button>
            </div>
          )}
        </div>

        {/* Reaction picker */}
        {showReactions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn('flex gap-1 p-1.5 bg-card border border-white/10 rounded-full shadow-xl', isMe ? 'self-end' : 'self-start')}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onReact(message.id, emoji); setShowReactions(false); }}
                className="text-base w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}

        {/* Reactions display */}
        {hasReactions && (
          <div className={cn('flex flex-wrap gap-1', isMe ? 'justify-end' : 'justify-start')}>
            {Object.entries(reactions).filter(([, users]) => users.length > 0).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors"
              >
                <span>{emoji}</span>
                <span className="text-muted-foreground">{users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-muted-foreground">{time}</span>
          {isMe && (
            message.read
              ? <CheckCheck className="w-3 h-3 text-secondary" />
              : <Check className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
