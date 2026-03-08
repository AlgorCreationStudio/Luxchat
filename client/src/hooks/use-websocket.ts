import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/use-auth-store';
import type { Message } from '@shared/schema';

type WsIncoming =
  | { type: 'message'; payload: Message }
  | { type: 'typing'; payload: { chatId: string; userId: string; isTyping: boolean; name: string } }
  | { type: 'read'; payload: { chatId: string; readBy: string } }
  | { type: 'reaction'; payload: { messageId: number; chatId: string; reactions: string } }
  | { type: 'delete'; payload: { messageId: number; chatId: string } }
  | { type: 'call'; payload: { toUserId: string; fromUserId: string; fromName: string; action: string } }
  | { type: 'contact_request'; payload: { fromUserId: string; fromName: string } }
  | { type: 'webrtc_signal'; payload: { fromUserId: string; signalType: 'offer' | 'answer' | 'ice'; data: unknown } };

type WsEventMap = {
  typing: (payload: { chatId: string; userId: string; isTyping: boolean; name: string }) => void;
  read: (payload: { chatId: string; readBy: string }) => void;
  call: (payload: { toUserId: string; fromUserId: string; fromName: string; action: string }) => void;
  contact_request: (payload: { fromUserId: string; fromName: string }) => void;
  webrtc_signal: (payload: { fromUserId: string; signalType: 'offer' | 'answer' | 'ice'; data: unknown }) => void;
};


// Browser notifications — uses SW for mobile (iOS/Android PWA), falls back to Notification API
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

async function showNotification(title: string, body: string, icon?: string) {
  if (!document.hidden) return; // Only notify when app is in background
  const ico = icon || '/icon-192.png';
  // Try Service Worker first (works on Android PWA and some iOS versions)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.showNotification) {
        await reg.showNotification(title, { body, icon: ico, badge: ico });
        return;
      }
    } catch { /* fall through */ }
  }
  // Fallback: plain Notification API (desktop)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: ico });
  }
}

export function useWebSocket() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Map<string, Set<Function>>());
  const outboundQueueRef = useRef<string[]>([]);

  const flushQueue = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (outboundQueueRef.current.length > 0) {
      const next = outboundQueueRef.current.shift();
      if (!next) continue;
      ws.send(next);
    }
  }, []);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let dead = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[WS] Connected');
        flushQueue();
      };

    socket.onmessage = (event) => {
      try {
        const msg: WsIncoming = JSON.parse(event.data);

        if (msg.type === 'message') {
          const newMsg = msg.payload;
          queryClient.setQueryData<Message[]>(['messages', newMsg.chatId], (old = []) => {
            if (old.some((m) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });
          queryClient.invalidateQueries({ queryKey: ['chats', user.id] });

          // Browser notification for messages from others
          if (newMsg.senderId !== user.id) {
            const content = newMsg.type === 'audio' ? '🎤 Nota de voz' : newMsg.content;
            showNotification('LuxChat', content);
          }
        }

        if (msg.type === 'typing') {
          listenersRef.current.get('typing')?.forEach((fn) => fn(msg.payload));
        }

        if (msg.type === 'read') {
          listenersRef.current.get('read')?.forEach((fn) => fn(msg.payload));
          // Update read status in cached messages
          queryClient.setQueryData<Message[]>(['messages', msg.payload.chatId], (old) => {
            if (!old) return old;
            return old.map((m) => m.senderId !== user.id ? { ...m, read: true } : m);
          });
        }

        if (msg.type === 'reaction') {
          // Fix: use chatId from payload to update the correct query
          queryClient.setQueryData<Message[]>(['messages', msg.payload.chatId], (old) => {
            if (!old) return old;
            return old.map((m) =>
              m.id === msg.payload.messageId ? { ...m, reactions: msg.payload.reactions } : m
            );
          });
        }

        if (msg.type === 'delete') {
          queryClient.setQueryData<Message[]>(['messages', msg.payload.chatId], (old) => {
            if (!old) return old;
            return old.map((m) =>
              m.id === msg.payload.messageId ? { ...m, deleted: true, content: '' } : m
            );
          });
        }

        if (msg.type === 'call') {
          listenersRef.current.get('call')?.forEach((fn) => fn(msg.payload));
          if (msg.payload.action === 'incoming') {
            showNotification('LuxChat', `📞 Llamada entrante de ${msg.payload.fromName}`);
          }
        }

        if (msg.type === 'webrtc_signal') {
          listenersRef.current.get('webrtc_signal')?.forEach((fn) => fn(msg.payload));
        }

        if (msg.type === 'contact_request') {
          listenersRef.current.get('contact_request')?.forEach((fn) => fn(msg.payload));
          queryClient.invalidateQueries({ queryKey: ['pending-requests', user.id] });
          showNotification('LuxChat', `👤 ${msg.payload.fromName} quiere conectar contigo`);
        }

        if ((msg as any).type === 'pending_flush') {
          queryClient.invalidateQueries({ queryKey: ['pending-requests', user.id] });
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

      socket.onclose = () => {
        console.log('[WS] Disconnected');
        if (!dead) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      dead = true;
      clearTimeout(reconnectTimer);
      socket?.close();
      wsRef.current = null;
      outboundQueueRef.current = [];
    };
  }, [user?.id, queryClient, flushQueue]);

  const send = useCallback((data: object) => {
    const json = JSON.stringify(data);
    const ws = wsRef.current;

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(json);
      return;
    }

    outboundQueueRef.current.push(json);
  }, []);

  const sendMessage = useCallback((chatId: string, content: string, extra?: Partial<Message>) => {
    if (!user) return;
    send({ type: 'message', payload: { chatId, content, senderId: user.id, type: 'text', ...extra } });
  }, [user, send]);

  const sendAudio = useCallback((chatId: string, audioData: string, audioType: string, audioDuration: number, replyTo?: (Message & { senderName?: string }) | null) => {
    if (!user) return;
    send({
      type: 'message',
      payload: {
        chatId, content: '', senderId: user.id, type: 'audio',
        audioData, audioType, audioDuration,
        ...(replyTo ? {
          replyToId: replyTo.id,
          replyToText: replyTo.content,
          replyToSenderName: (replyTo as any).senderName,
          replyToSenderId: replyTo.senderId,
          replyToIsAudio: replyTo.type === 'audio',
        } : {}),
      },
    });
  }, [user, send]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (!user) return;
    send({ type: 'typing', payload: { chatId, userId: user.id, isTyping, name: user.displayName } });
  }, [user, send]);

  // Only mark read explicitly — not auto
  const sendRead = useCallback((chatId: string) => {
    if (!user) return;
    send({ type: 'read', payload: { chatId, readBy: user.id } });
  }, [user, send]);

  const sendReaction = useCallback((messageId: number, emoji: string) => {
    if (!user) return;
    send({ type: 'reaction', payload: { messageId, userId: user.id, emoji } });
  }, [user, send]);

  const sendDelete = useCallback((messageId: number, chatId: string) => {
    send({ type: 'delete', payload: { messageId, chatId } });
  }, [send]);

  const sendCall = useCallback((toUserId: string, action: 'incoming' | 'answer' | 'reject' | 'end') => {
    if (!user) return;
    send({ type: 'call', payload: { toUserId, fromUserId: user.id, fromName: user.displayName, action } });
  }, [user, send]);

  const sendWebRTCSignal = useCallback((toUserId: string, signalType: 'offer' | 'answer' | 'ice', data: unknown) => {
    if (!user) return;
    send({ type: 'webrtc_signal', payload: { toUserId, fromUserId: user.id, signalType, data } });
  }, [user, send]);

  const sendContactRequestNotif = useCallback((toUserId: string) => {
    if (!user) return;
    send({ type: 'contact_request', payload: { toUserId, fromUserId: user.id, fromName: user.displayName } });
  }, [user, send]);

  const on = useCallback(<K extends keyof WsEventMap>(event: K, fn: WsEventMap[K]) => {
    if (!listenersRef.current.has(event)) listenersRef.current.set(event, new Set());
    listenersRef.current.get(event)!.add(fn);
    return () => {
      listenersRef.current.get(event)?.delete(fn);
    };
  }, []);

  return { sendMessage, sendAudio, sendTyping, sendRead, sendReaction, sendDelete, sendCall, sendContactRequestNotif, sendWebRTCSignal, on };
}
