import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Phone, Mic, Paperclip, ArrowLeft, Video } from 'lucide-react';
import { useAuthStore } from '@/store/use-auth-store';
import { useMessages, useMarkRead } from '@/hooks/use-api';
import { useWebSocket } from '@/hooks/use-websocket';
import { getWebRTCErrorMessage, useWebRTC } from '@/hooks/use-webrtc';
import { useRecording } from '@/hooks/use-recording';
import { Avatar } from '../ui-library';
import { MessageBubble } from './message-bubble';
import { ReplyBar } from './reply-bar';
import { RecordingOverlay } from './recording-overlay';
import { CallModal } from '../modals/call-modal';
import { useE2E } from '@/hooks/use-e2e';
import { useToast } from '@/hooks/use-toast';
import type { Message } from '@shared/schema';

interface Props {
  chatId: string;
  chatName?: string;
  chatAvatar?: string | null;
  onBack?: () => void;
}

export function ChatWindow({ chatId, chatName = 'Direct Message', chatAvatar, onBack }: Props) {
  // ── State (ALL hooks declared first, unconditionally) ─────────────────────────
  const user = useAuthStore((s) => s.user);
  const { data: rawMessages = [], isLoading } = useMessages(chatId);
  const { sendMessage, sendAudio, sendTyping, sendRead, sendReaction, sendDelete, sendCall, sendWebRTCSignal, on } = useWebSocket();
  const { state: recState, start: startRec, lock: lockRec, stop: stopRec, cancel: cancelRec } = useRecording();
  const markRead = useMarkRead();
  const { toast } = useToast();

  const [input, setInput] = useState('');
  const [decryptedMap, setDecryptedMap] = useState<Record<number, string>>({});
  const [replyTo, setReplyTo] = useState<(Message & { senderName: string }) | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isCallOpen, setCallOpen] = useState(false);
  const [callStatus, setCallStatus] = useState<import('@/hooks/use-webrtc').RTCStatus>('idle');
  const [callMode, setCallMode] = useState<'audio' | 'video'>('audio');
  const [lockProgress, setLockProgress] = useState(0);
  const [otherUserId, setOtherUserId] = useState('');
  const [otherUserStatus, setOtherUserStatus] = useState<'online' | 'offline'>('offline');

  const otherUserIdRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceBtnRef = useRef<HTMLButtonElement>(null);
  const touchStartY = useRef<number>(0);
  const holdingRef = useRef(false);
  const isFocused = useRef(true);

  const handleCallerSignal = useCallback((type: 'offer' | 'answer' | 'ice', data: unknown) => {
    if (otherUserIdRef.current) sendWebRTCSignal(otherUserIdRef.current, type, data);
  }, [sendWebRTCSignal]);

  const {
    startCall, receiveAnswer, receiveIce: callerReceiveIce, hangUp: callerHangUp,
    toggleMic: callerToggleMic, micOn: callerMicOn,
    toggleCamera: callerToggleCamera, cameraOn: callerCameraOn,
    callMode: activeCallMode,
    localVideoRef: callerLocalVideoRef, remoteVideoRef: callerRemoteVideoRef,
  } = useWebRTC(setCallStatus, handleCallerSignal);

  // E2E — declared here so hook order is always stable
  const { encrypt, decrypt } = useE2E(otherUserId || null);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const messages = rawMessages.map((m) => ({
    ...m,
    senderName: m.senderId === user?.id ? (user?.displayName ?? 'Tú') : chatName,
    decryptedContent: (m as any).encrypted ? decryptedMap[m.id] : undefined,
  }));

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const encrypted = rawMessages.filter((m) => (m as any).encrypted && m.content && !decryptedMap[m.id]);
    if (encrypted.length === 0) return;
    encrypted.forEach(async (m) => {
      const plain = await decrypt(m.content);
      setDecryptedMap((prev) => ({ ...prev, [m.id]: plain }));
    });
  }, [rawMessages, decrypt, otherUserId]);

  // Reset decrypted cache when switching chats
  useEffect(() => {
    setDecryptedMap({});
  }, [chatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isAtBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const markAsRead = () => {
      if (chatId && user) {
        markRead.mutate({ chatId, userId: user.id });
        sendRead(chatId);
      }
    };
    markAsRead();
    window.addEventListener('focus', markAsRead);
    const onVisible = () => { if (document.visibilityState === 'visible') markAsRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', markAsRead);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [chatId, user?.id]);

  useEffect(() => {
    return on('typing', ({ chatId: cid, userId, isTyping, name }) => {
      if (cid !== chatId || userId === user?.id) return;
      setTypingUsers((prev) =>
        isTyping ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((n) => n !== name)
      );
    });
  }, [chatId, user?.id, on]);

  useEffect(() => {
    if (recState.seconds >= 60) handleStopRec();
  }, [recState.seconds]);

  const handleVoicePointerMove = useCallback((e: PointerEvent) => {
    if (!recState.isRecording || recState.isLocked) return;
    const dy = touchStartY.current - e.clientY;
    const progress = Math.max(0, Math.min(1, dy / 80));
    setLockProgress(progress);
    if (progress >= 1) lockRec();
  }, [recState.isRecording, recState.isLocked, lockRec]);

  const handleVoicePointerUp = useCallback(async () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (!recState.isLocked && recState.isRecording) await handleStopRec();
  }, [recState.isLocked, recState.isRecording]);

  useEffect(() => {
    window.addEventListener('pointermove', handleVoicePointerMove);
    window.addEventListener('pointerup', handleVoicePointerUp);
    return () => {
      window.removeEventListener('pointermove', handleVoicePointerMove);
      window.removeEventListener('pointerup', handleVoicePointerUp);
    };
  }, [handleVoicePointerMove, handleVoicePointerUp]);

  // Listen for real-time presence changes
  useEffect(() => {
    return on('presence', ({ userId, status }) => {
      if (userId === otherUserIdRef.current) setOtherUserStatus(status);
    });
  }, [on]);

  useEffect(() => {
    if (!chatId || !user?.id) return;
    fetch(`/api/chats/${chatId}/members`)
      .then((r) => r.json())
      .then((members: { id: string }[]) => {
        const other = members.find((m) => m.id !== user.id);
        if (other) { setOtherUserId(other.id); otherUserIdRef.current = other.id; setOtherUserStatus((other as any).status === 'online' ? 'online' : 'offline'); }
      })
      .catch(() => {});
  }, [chatId, user?.id]);

  useEffect(() => {
    return on('call', (payload) => {
      if (payload.fromUserId !== otherUserIdRef.current && payload.toUserId !== otherUserIdRef.current) return;
      if (payload.action === 'answer') setCallStatus('connected');
      if (payload.action === 'reject') setCallStatus('rejected');
      if (payload.action === 'end') { setCallStatus('ended'); callerHangUp(); }
    });
  }, [on, callerHangUp]);

  useEffect(() => {
    return on('webrtc_signal', (payload) => {
      if (payload.fromUserId !== otherUserIdRef.current) return;
      if (payload.signalType === 'answer') {
        void receiveAnswer(payload.data as RTCSessionDescriptionInit).catch((error) => {
          console.error('[Call] Failed to apply remote answer', error);
          callerHangUp();
          toast({ variant: 'destructive', title: 'No se pudo conectar la llamada', description: getWebRTCErrorMessage(error) });
        });
      }
      if (payload.signalType === 'ice') callerReceiveIce(payload.data as RTCIceCandidateInit);
    });
  }, [on, receiveAnswer, callerReceiveIce, callerHangUp, toast]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !user) return;
    const { text: encContent, encrypted } = await encrypt(input.trim());
    sendMessage(chatId, encContent, {
      encrypted,
      ...(replyTo ? {
        replyToId: replyTo.id,
        replyToText: replyTo.content,
        replyToSenderName: replyTo.senderName,
        replyToSenderId: replyTo.senderId,
        replyToIsAudio: replyTo.type === 'audio',
      } : {}),
    } as any);
    setInput('');
    setReplyTo(null);
    inputRef.current?.focus();
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    sendTyping(chatId, true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => sendTyping(chatId, false), 2000);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleVoicePointerDown = async (e: React.PointerEvent) => {
    e.preventDefault();
    holdingRef.current = true;
    touchStartY.current = e.clientY;
    setLockProgress(0);
    const ok = await startRec();
    if (!ok) toast({ title: 'No se pudo acceder al micrófono', variant: 'destructive' });
  };

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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1000);
    }
  }, []);

  const handleVideoCall = async () => { setCallMode('video'); await handleCallWithMode('video'); };
  const handleCall = async () => { setCallMode('audio'); await handleCallWithMode('audio'); };

  const handleCallWithMode = async (mode: 'audio' | 'video') => {
    let targetId = otherUserId;
    if (!targetId && chatId && user?.id) {
      try {
        const r = await fetch(`/api/chats/${chatId}/members`);
        const members: { id: string }[] = await r.json();
        const other = members.find((m) => m.id !== user.id);
        if (other) { targetId = other.id; setOtherUserId(other.id); otherUserIdRef.current = other.id; }
      } catch {}
    }
    if (!targetId) {
      toast({ variant: 'destructive', title: 'No se pudo iniciar la llamada', description: 'No se encontró el participante.' });
      return;
    }
    otherUserIdRef.current = targetId;
    setCallStatus('calling');
    setCallOpen(true);
    try {
      sendCall(targetId, 'incoming');
      await startCall(mode);
    } catch (error) {
      console.error('[Call] Outgoing call startup failed', error);
      callerHangUp();
      setCallOpen(false);
      setCallStatus('idle');
      toast({ variant: 'destructive', title: 'No se pudo iniciar la llamada', description: getWebRTCErrorMessage(error) });
    }
  };

  const handleEndCall = () => {
    if (otherUserId) sendCall(otherUserId, 'end');
    callerHangUp();
    setCallOpen(false);
    setCallStatus('idle');
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="h-16 md:h-20 border-b border-border/50 flex items-center justify-between px-4 md:px-8 bg-card/40 backdrop-blur-md z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden p-2 -ml-1 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <Avatar src={chatAvatar} fallback={chatName} />
          <div>
            <h2 className="font-display text-base md:text-xl font-bold text-foreground">{chatName}</h2>
            {typingUsers.length > 0 ? (
              <p className="text-xs text-secondary font-medium flex items-center gap-1">
                <span className="inline-flex gap-0.5">
                  {[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-secondary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </span>
                escribiendo...
              </p>
            ) : (
              <p className={`text-xs tracking-widest uppercase font-semibold ${otherUserStatus === 'online' ? 'text-green-400' : 'text-muted-foreground/50'}`}>
                {otherUserStatus === 'online' ? '● Online' : '○ Offline'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleVideoCall} className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center text-foreground hover:bg-secondary hover:text-secondary-foreground hover:shadow-lg hover:shadow-secondary/20 transition-all">
            <Video className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={handleCall} className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center text-foreground hover:bg-secondary hover:text-secondary-foreground hover:shadow-lg hover:shadow-secondary/20 transition-all">
            <Phone className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 z-10" ref={scrollRef}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p className="font-display text-2xl mb-2 text-white/40">Say Hello</p>
            <p className="text-sm">This is the beginning of your conversation.</p>
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
      <div className="flex-shrink-0 z-10 border-t border-border/50 bg-card/40 backdrop-blur-md pb-safe">
        {replyTo && (
          <ReplyBar replyTo={replyTo} isMe={replyTo.senderId === user?.id} onClear={() => setReplyTo(null)} />
        )}
        <div className="relative" style={{ minHeight: '56px' }}>
          {recState.isRecording ? (
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
            <div className="flex items-end gap-2 px-3 md:px-4 py-3">
              <label className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer transition-colors flex-shrink-0">
                <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
                <input type="file" accept="image/*,video/*" className="hidden" onChange={() => {}} />
              </label>
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
              {input.trim() ? (
                <button onClick={handleSend} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95 flex-shrink-0">
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              ) : (
                <button ref={voiceBtnRef} onPointerDown={handleVoicePointerDown} className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0 touch-none select-none">
                  <Mic className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <CallModal
        isOpen={isCallOpen}
        onClose={handleEndCall}
        contactName={chatName}
        callStatus={callStatus}
        micOn={callerMicOn}
        onToggleMic={callerToggleMic}
        cameraOn={callerCameraOn}
        onToggleCamera={callerToggleCamera}
        callMode={activeCallMode}
        localVideoRef={callerLocalVideoRef}
        remoteVideoRef={callerRemoteVideoRef}
      />
    </div>
  );
}
