import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/use-auth-store';
import { Sidebar } from '@/components/layout/sidebar';
import { ChatWindow } from '@/components/chat/chat-window';
import { IncomingCallModal } from '@/components/modals/incoming-call-modal';
import { CallModal } from '@/components/modals/call-modal';
import { useChats } from '@/hooks/use-api';
import { useWebSocket } from '@/hooks/use-websocket';
import { MessageSquareDashed } from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/chat/:id');
  const { data: chats = [] } = useChats(user?.id);
  const { on, sendCall } = useWebSocket();

  const [incomingCall, setIncomingCall] = useState<{ fromUserId: string; fromName: string; offer?: RTCSessionDescriptionInit } | null>(null);
  // Answered incoming call shown in CallModal
  const [answeredCall, setAnsweredCall] = useState<{ fromUserId: string; fromName: string; offer?: RTCSessionDescriptionInit } | null>(null);
  const [answeredCallStatus, setAnsweredCallStatus] = useState<import('@/hooks/use-webrtc').RTCStatus>('calling');

  useEffect(() => {
    if (!user) setLocation('/');
  }, [user, setLocation]);

  // Listen for incoming calls & call lifecycle events
  const answeredCallRef = useRef<{ fromUserId: string; fromName: string } | null>(null);
  useEffect(() => { answeredCallRef.current = answeredCall; }, [answeredCall]);

  useEffect(() => {
    return on('call', (payload) => {
      if (payload.action === 'incoming' && payload.toUserId === user?.id) {
        setIncomingCall({ fromUserId: payload.fromUserId, fromName: payload.fromName });
      }
      if (payload.action === 'end' && answeredCallRef.current) {
        setAnsweredCallStatus('ended');
      }
      if (payload.action === 'end' || payload.action === 'reject') {
        setIncomingCall(null);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, user?.id]);

  // Attach WebRTC offer to the incoming call when it arrives
  useEffect(() => {
    return on('webrtc_signal', (payload) => {
      if (payload.signalType === 'offer') {
        setIncomingCall((prev) =>
          prev ? { ...prev, offer: payload.data as RTCSessionDescriptionInit } : prev
        );
      }
    });
  }, [on]);

  if (!user) return null;

  const activeChat = chats.find(c => c.id === params?.id);
  const isChatOpen = match && params?.id;

  const handleAnswerCall = () => {
    if (!incomingCall) return;
    sendCall(incomingCall.fromUserId, 'answer');
    setAnsweredCall(incomingCall);
    setAnsweredCallStatus('calling');
    setIncomingCall(null);
  };

  const handleRejectCall = () => {
    if (!incomingCall) return;
    sendCall(incomingCall.fromUserId, 'reject');
    setIncomingCall(null);
  };

  const handleEndAnsweredCall = () => {
    if (answeredCall) {
      sendCall(answeredCall.fromUserId, 'end');
    }
    setAnsweredCall(null);
  };

  return (
    <div className="flex w-full bg-background overflow-hidden" style={{ height: '100dvh' }}>
      {/* Incoming call overlay */}
      <AnimatePresence>
        {incomingCall && (
          <IncomingCallModal
            callerName={incomingCall.fromName}
            callerId={incomingCall.fromUserId}
            onAnswer={handleAnswerCall}
            onReject={handleRejectCall}
          />
        )}
      </AnimatePresence>

      {/* Answered incoming call modal */}
      {answeredCall && (
        <CallModal
          isOpen={!!answeredCall}
          onClose={handleEndAnsweredCall}
          contactName={answeredCall.fromName}
          contactId={answeredCall.fromUserId}
          callStatus={answeredCallStatus}
          setCallStatus={setAnsweredCallStatus}
          incomingOffer={answeredCall?.offer ?? null}
        />
      )}

      {/* Sidebar */}
      <div className={`${isChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-80 h-full flex-col`}>
        <Sidebar />
      </div>

      {/* Chat area */}
      <main className={`${isChatOpen ? 'flex' : 'hidden md:flex'} flex-1 h-full relative border-l border-border/50 shadow-[-20px_0_50px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex-col`}>
        {isChatOpen ? (
          <ChatWindow
            chatId={params!.id}
            chatName={activeChat?.name ?? 'Direct Message'}
            chatAvatar={activeChat?.avatarUrl}
            onBack={() => setLocation('/app')}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-card/20">
            <div className="w-32 h-32 rounded-full border border-white/5 bg-white/5 flex items-center justify-center mb-6 shadow-2xl">
              <MessageSquareDashed className="w-12 h-12 text-primary/40" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-3">Welcome to LuxChat</h2>
            <p className="text-muted-foreground">Selecciona una conversación para comenzar.</p>
          </div>
        )}
      </main>
    </div>
  );
}
