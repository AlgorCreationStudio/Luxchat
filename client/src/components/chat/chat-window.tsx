import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Phone, Mic, Paperclip, Smile } from 'lucide-react';
import { useAuthStore } from '@/store/use-auth-store';
import { useMessages } from '@/hooks/use-api';
import { useWebSocket } from '@/hooks/use-websocket';
import { useRecording } from '@/hooks/use-recording';
import { Avatar } from '../ui-library';
import { MessageBubble } from './message-bubble';
import { ReplyBar } from './reply-bar';
import { RecordingOverlay } from './recording-overlay';
import { CallModal } from '../modals/call-modal';
import { useToast } from '@/hooks/use-toast';
import type { Message } from '@shared/schema';

interface Props { chatId: string; chatName?: string; chatAvatar?: string | null }

export function ChatWindow({ chatId, chatName = 'Direct Message', chatAvatar }: Props) {
  const user = useAuthStore((s) => s.user);
  const { data: rawMessages = [], isLoading } = useMessages(chatId);
  const { sendMessage, sendAudio, sendTyping, sendRead, sendReact: sendReaction, sendDelete, on } = useWebSocket();
  const { state: recState, start: startRec, lock: lockRec, stop: stopRec, cancel: cancelRec } = useRecording();
  const { toast } = useToast();

  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<(Message & { senderName: string }) | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isCallOpen, setCallOpen] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceBtnRef = useRef<HTMLButtonElement>(null);
  const touchStartY = useRef<number>(0);
  const holdingRef = useRef(false);

  // Enrich messages with senderName (mock — in real app fetch from user cache)
  const messages = rawMessages.map((m) => ({
    ...m,
    senderName: m.senderId === user?.id ? (user?.displayName ?? 'Tú') : chatName,
  }));

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isAtBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Mark as read
  useEffect(() => {
    if (chatId) sendRead(chatId);
  }, [chatId, messages.length, sendRead]);

  // Listen for typing events
  useEffect(() => {
    return on('typing', ({ chatId: cid, userId, isTyping, name }) => {
      if (cid !== chatId || userId === user?.id) return;
      setTypingUsers((prev) =>
        isTyping ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((n) => n !== name)
      );
    });
  }, [chatId, user?.id, on]);

  // Auto-stop recording at 60s
  useEffect(() => {
    if (recState.seconds >= 60) handleStopRec();
  }, [recState.seconds]);

  // --- Handlers ---
  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !user) return;
    sendMessage(chatId, input.trim(), replyTo ? {
      replyToId: replyTo.id,
      replyToText: replyTo.content,
      replyToSenderName: replyTo.senderName,
      replyToSenderId: replyTo.senderId,
      replyToIsAudio: replyTo.type === 'audio',
    } : undefined);
    setInput('');
    setReplyTo(null);
    inputRef.current?.focus();
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    sendTyping(chatId, true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => sendTyping(chatId, false), 2000);
    // Auto-resize textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Voice recording — pointer events on the button
  const handleVoicePointerDown = async (e: React.PointerEvent) => {
    e.preventDefault();
    holdingRef.current = true;
    touchStartY.current = e.clientY;
    setLockProgress(0);
    const ok = await startRec();
    if (!ok) toast({ title: 'No se pudo acceder al micrófono', variant: 'destructive' });
  };

  const handleVoicePointerMove = useCallback((e: PointerEvent) => {
    if (!recState.isRecording || recState.isLocked) return;
    const dy = touchStartY.current - e.clientY; // positive = dragging up
    const progress = Math.max(0, Math.min(1, dy / 80));
    setLockProgress(progress);
    if (progress >= 1) lockRec();
  }, [recState.isRecording, recState.isLocked, lockRec]);

  const handleVoicePointerUp = useCallback(async () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (!recState.isLocked && recState.isRecording) {
      await handleStopRec();
    }
  }, [recState.isLocked, recState.isRecording]);

  useEffect(() => {
    window.addEventListener('pointermove', handleVoicePointerMove);
    window.addEventListener('pointerup', handleVoicePointerUp);
    return () => {
      window.removeEventListener('pointermove', handleVoicePointerMove);
      window.removeEventListener('pointerup', handleVoicePointerUp);
    };
  }, [handleVoicePointerMove, handleVoicePointerUp]);

  const handleStopRec = async () => {
    const result = await stopRec();
    if (!result) return;
    const { blob, mime, seconds } = result;
    if (blob.size > 900_000) { toast({ title: 'Nota de voz muy larga', variant: 'destructive' }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      sendAudio(chatId, b64, mime, seconds, replyTo);
      setReplyTo(null);
    };
    reader.readAsDataURL(blob);
  };

  const handleCancelRec = () => { cancelRec(); setLockProgress(0); };

  const handleScrollTo = useCallback((msgId: number) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1000); }
  }, []);

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Ambient */}
      <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="h-20 border-b border-border/50 flex items-center justify-between px-8 bg-card/40 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Avatar src={chatAvatar} fallback={chatName} />
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">{chatName}</h2>
            {typingUsers.length > 0 ? (
              <p className="text-xs text-secondary font-medium flex items-center gap-1">
                <span className="inline-flex gap-0.5">
                  {[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-secondary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </span>
                escribiendo...
              </p>
            ) : (
              <p className="text-xs text-secondary/60 tracking-widest uppercase">Online</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setCallOpen(true)}
          className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-foreground hover:bg-secondary hover:text-secondary-foreground hover:shadow-lg hover:shadow-secondary/20 transition-all hover:-translate-y-0.5"
        >
          <Phone className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 z-10" ref={scrollRef}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p className="font-display text-2xl mb-2 text-white/40">Say Hello</p>
            <p className="text-sm">This is the beginning of your legendary conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col justify-end min-h-full">
            {messages.map((msg) => (
              <div key={msg.id} id={`msg-${msg.id}`} className="transition-colors rounded-xl [&.flash]:bg-primary/10">
                <MessageBubble
                  message={msg}
                  isMe={msg.senderId === user?.id}
                  onReply={setReplyTo}
                  onReact={(msgId, emoji) => sendReaction(msgId, emoji)}
                  onDelete={(msgId) => sendDelete(msgId, chatId)}
                  onScrollTo={handleScrollTo}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input zone */}
      <div className="flex-shrink-0 z-10 border-t border-border/50 bg-card/40 backdrop-blur-md">
        {/* Reply bar */}
        {replyTo && (
          <ReplyBar replyTo={replyTo} isMe={replyTo.senderId === user?.id} onClear={() => setReplyTo(null)} />
        )}

        {/* Input bar — fixed height container */}
        <div className="relative" style={{ minHeight: '64px' }}>
          {recState.isRecording ? (
            // Recording overlay replaces the input bar in-place, same height
            <div className="absolute inset-0">
              <RecordingOverlay
                seconds={recState.seconds}
                isLocked={recState.isLocked}
                lockProgress={lockProgress}
                onCancel={handleCancelRec}
                onSend={handleStopRec}
              />
            </div>
          ) : (
            <div className="flex items-end gap-2 px-4 py-3">
              {/* Attach */}
              <label className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer transition-colors flex-shrink-0">
                <Paperclip className="w-5 h-5" />
                <input type="file" accept="image/*,video/*" className="hidden" onChange={() => {}} />
              </label>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 bg-black/20 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none overflow-hidden leading-relaxed"
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />

              {/* Send or Voice */}
              {input.trim() ? (
                <button
                  onClick={handleSend}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95 flex-shrink-0"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              ) : (
                <button
                  ref={voiceBtnRef}
                  onPointerDown={handleVoicePointerDown}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0 touch-none select-none"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <CallModal isOpen={isCallOpen} onClose={() => setCallOpen(false)} contactName={chatName} />
    </div>
  );
}
