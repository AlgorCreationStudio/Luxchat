import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/use-auth-store';
import { Sidebar } from '@/components/layout/sidebar';
import { ChatWindow } from '@/components/chat/chat-window';
import { IncomingCallModal } from '@/components/modals/incoming-call-modal';
import { CallModal } from '@/components/modals/call-modal';
import { useChats } from '@/hooks/use-api';
import { useWebSocket } from '@/hooks/use-websocket';
import { useWebRTC, RTCStatus } from '@/hooks/use-webrtc';
import { MessageSquareDashed } from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/chat/:id');
  const { data: chats = [] } = useChats(user?.id);
  const { on, sendCall, sendWebRTCSignal } = useWebSocket();

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{
    fromUserId: string;
    fromName: string;
    offer?: RTCSessionDescriptionInit;
  } | null>(null);

  // Active call (answered incoming)
  const [activeCall, setActiveCall] = useState<{ fromUserId: string; fromName: string } | null>(null);
  const [callStatus, setCallStatus] = useState<RTCStatus>('idle');

  // WebRTC for the RECEIVER side — lives here so it survives modal mounts
  const handleSignal = useCallback((type: 'offer' | 'answer' | 'ice', data: unknown) => {
    if (!activeCall) return;
    sendWebRTCSignal(activeCall.fromUserId, type, data);
  }, [activeCall, sendWebRTCSignal]);

  const { answerCall, receiveIce, hangUp, toggleMic, micOn } = useWebRTC(
    setCallStatus,
    handleSignal,
  );

  useEffect(() => {
    if (!user) setLocation('/');
  }, [user, setLocation]);

  // Listen for incoming call signal
  const incomingCallRef = useRef(incomingCall);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  useEffect(() => {
    return on('call', (payload) => {
      if (payload.action === 'incoming' && payload.toUserId === user?.id) {
        setIncomingCall({ fromUserId: payload.fromUserId, fromName: payload.fromName });
      }
      if (payload.action === 'end') {
        setCallStatus('ended');
        setIncomingCall(null);
      }
      if (payload.action === 'reject') {
        setIncomingCall(null);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, user?.id]);

  // Receive WebRTC offer and ICE candidates for the receiver
  useEffect(() => {
    return on('webrtc_signal', (payload) => {
      if (payload.signalType === 'offer') {
        // Attach offer to incomingCall
        setIncomingCall((prev) =>
          prev ? { ...prev, offer: payload.data as RTCSessionDescriptionInit } : prev
        );
      }
      if (payload.signalType === 'ice') {
        receiveIce(payload.data as RTCIceCandidateInit);
      }
    });
  }, [on, receiveIce]);

  if (!user) return null;

  const activeChat = chats.find(c => c.id === params?.id);
  const isChatOpen = match && params?.id;

  const handleAnswerCall = async () => {
    if (!incomingCall) return;
    sendCall(incomingCall.fromUserId, 'answer');
    setActiveCall({ fromUserId: incomingCall.fromUserId, fromName: incomingCall.fromName });
    setCallStatus('calling');
    setIncomingCall(null);
    if (incomingCall.offer) {
      await answerCall(incomingCall.offer).catch(() => setCallStatus('ended'));
    }
  };

  const handleRejectCall = () => {
    if (!incomingCall) return;
    sendCall(incomingCall.fromUserId, 'reject');
    setIncomingCall(null);
  };

  const handleEndActiveCall = () => {
    if (activeCall) {
      sendCall(activeCall.fromUserId, 'end');
    }
    hangUp();
    setActiveCall(null);
    setCallStatus('idle');
  };

  return (
    <div className="flex w-full bg-background overflow-hidden" style={{ height: '100dvh' }}>
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

      {activeCall && (
        <CallModal
          isOpen={!!activeCall}
          onClose={handleEndActiveCall}
          contactName={activeCall.fromName}
          callStatus={callStatus}
          micOn={micOn}
          onToggleMic={toggleMic}
        />
      )}

      <div className={`${isChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-80 h-full flex-col`}>
        <Sidebar />
      </div>

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
