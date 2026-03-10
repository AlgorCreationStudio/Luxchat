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
import { getWebRTCErrorMessage, useWebRTC, RTCStatus } from '@/hooks/use-webrtc';
import { useToast } from '@/hooks/use-toast';
import { MessageSquareDashed } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/chat/:id');
  const { data: chats = [] } = useChats(user?.id);
  const { on, sendCall, sendWebRTCSignal } = useWebSocket();
  usePushNotifications();

  type IncomingCallState = {
    fromUserId: string;
    fromName: string;
    offer?: RTCSessionDescriptionInit;
  };

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);

  // Active call (answered incoming)
  const [activeCall, setActiveCall] = useState<{ fromUserId: string; fromName: string } | null>(null);
  const [callStatus, setCallStatus] = useState<RTCStatus>('idle');
  const incomingCallRef = useRef(incomingCall);
  const activeCallRef = useRef(activeCall);
  const receiverPeerIdRef = useRef('');
  const answerRequestedRef = useRef(false);
  const pendingOfferRef = useRef<{ fromUserId: string; offer: RTCSessionDescriptionInit } | null>(null);

  // WebRTC for the RECEIVER side — lives here so it survives modal mounts
  const handleSignal = useCallback((type: 'offer' | 'answer' | 'ice', data: unknown) => {
    const peerUserId = activeCallRef.current?.fromUserId
      ?? incomingCallRef.current?.fromUserId
      ?? receiverPeerIdRef.current;
    if (!peerUserId) return;
    sendWebRTCSignal(peerUserId, type, data);
  }, [sendWebRTCSignal]);

  const { answerCall, receiveIce, hangUp, toggleMic, micOn, toggleCamera, cameraOn, callMode, localVideoRef, remoteVideoRef } = useWebRTC(
    setCallStatus,
    handleSignal,
  );

  useEffect(() => {
    if (!user) setLocation('/');
  }, [user, setLocation]);

  // Listen for incoming call signal
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  const isAnsweringRef = useRef(false);
  const startAnswerCall = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (isAnsweringRef.current) return; // prevent double-call
    isAnsweringRef.current = true;
    try {
      await answerCall(offer);
      setCallStatus('connected'); // answer sent successfully → show connected immediately
      answerRequestedRef.current = false;
    } catch (error) {
      answerRequestedRef.current = false;
      setCallStatus('ended');
      toast({
        variant: 'destructive',
        title: 'No se pudo responder la llamada',
        description: getWebRTCErrorMessage(error),
      });
    }
  }, [answerCall, toast]);

  useEffect(() => {
    const unsubscribe = on('call', (payload) => {
      if (payload.action === 'incoming' && payload.toUserId === user?.id) {
        receiverPeerIdRef.current = payload.fromUserId;
        answerRequestedRef.current = false;
        const pendingOffer = pendingOfferRef.current?.fromUserId === payload.fromUserId
          ? pendingOfferRef.current.offer
          : undefined;
        pendingOfferRef.current = null;
        setIncomingCall({ fromUserId: payload.fromUserId, fromName: payload.fromName, offer: pendingOffer });
      }
      if (payload.action === 'end') {
        setCallStatus('ended');
        setIncomingCall(null);
        answerRequestedRef.current = false;
        pendingOfferRef.current = null;
      }
      if (payload.action === 'reject') {
        setIncomingCall(null);
        answerRequestedRef.current = false;
        pendingOfferRef.current = null;
      }
    });
    return () => {
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, user?.id]);

  // Receive WebRTC offer and ICE candidates for the receiver
  useEffect(() => {
    const unsubscribe = on('webrtc_signal', (payload) => {
      const peerUserId = activeCallRef.current?.fromUserId
        ?? incomingCallRef.current?.fromUserId
        ?? receiverPeerIdRef.current;
      if (peerUserId && payload.fromUserId !== peerUserId) return;

      if (payload.signalType === 'offer') {
        const offer = payload.data as RTCSessionDescriptionInit;
        pendingOfferRef.current = { fromUserId: payload.fromUserId, offer };

        if (answerRequestedRef.current) {
          pendingOfferRef.current = null;
          void startAnswerCall(offer);
          return;
        }

        // Attach offer to incomingCall until user answers.
        setIncomingCall((prev) => {
          if (!prev || prev.fromUserId !== payload.fromUserId) return prev;
          pendingOfferRef.current = null;
          return { ...prev, offer };
        });
      }
      if (payload.signalType === 'ice') {
        receiveIce(payload.data as RTCIceCandidateInit);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [on, receiveIce, startAnswerCall]);

  if (!user) return null;

  const activeChat = chats.find(c => c.id === params?.id);
  const isChatOpen = match && params?.id;

  const handleAnswerCall = async () => {
    const currentIncomingCall = incomingCallRef.current;
    if (!currentIncomingCall) return;
    const offer = currentIncomingCall.offer
      ?? (pendingOfferRef.current?.fromUserId === currentIncomingCall.fromUserId
        ? pendingOfferRef.current.offer
        : undefined);

    answerRequestedRef.current = true;
    receiverPeerIdRef.current = currentIncomingCall.fromUserId;
    sendCall(currentIncomingCall.fromUserId, 'answer');
    setActiveCall({ fromUserId: currentIncomingCall.fromUserId, fromName: currentIncomingCall.fromName });
    setCallStatus('calling');
    setIncomingCall(null);

    if (offer) {
      pendingOfferRef.current = null;
      await startAnswerCall(offer);
    }
  };

  const handleRejectCall = () => {
    const currentIncomingCall = incomingCallRef.current;
    if (!currentIncomingCall) return;

    receiverPeerIdRef.current = '';
    answerRequestedRef.current = false;
    pendingOfferRef.current = null;
    sendCall(currentIncomingCall.fromUserId, 'reject');
    setIncomingCall(null);
  };

  const handleEndActiveCall = () => {
    const currentActiveCall = activeCallRef.current;
    if (currentActiveCall) {
      sendCall(currentActiveCall.fromUserId, 'end');
    }
    receiverPeerIdRef.current = '';
    answerRequestedRef.current = false;
    isAnsweringRef.current = false;
    pendingOfferRef.current = null;
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
          cameraOn={cameraOn}
          onToggleCamera={toggleCamera}
          callMode={callMode}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
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
