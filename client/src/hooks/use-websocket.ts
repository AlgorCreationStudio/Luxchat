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
  | { type: 'webrtc_signal'; payload: { fromUserId: string; signalType: 'offer' | 'answer' | 'ice'; data: unknown } }
  | { type: 'presence'; payload: { userId: string; status: 'online' | 'offline'; lastSeen?: string } };

type WsEventMap = {
  typing: (payload: { chatId: string; userId: string; isTyping: boolean; name: string }) => void;
  read: (payload: { chatId: string; readBy: string }) => void;
  call: (payload: { toUserId: string; fromUserId: string; fromName: string; action: string }) => void;
  contact_request: (payload: { fromUserId: string; fromName: string }) => void;
  webrtc_signal: (payload: { fromUserId: string; signalType: 'offer' | 'answer' | 'ice'; data: unknown }) => void;
  presence: (payload: { userId: string; status: 'online' | 'offline'; lastSeen?: string }) => void;
};

// ─── SINGLETON WebSocket ─────────────────────────────────────────────────────
// One connection per user session, shared across all hook instances.
// Multiple components call useWebSocket() — without a singleton each would
// open its own WS, and the server overwrites the client entry every time,
// killing whichever connection was active (including the audio stream).

let singletonSocket: WebSocket | null = null;
let singletonUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Global listeners shared by all hook instances
const globalListeners = new Map<string, Set<Function>>();

// Callbacks the singleton calls when a message arrives (set by the primary hook)
let onMessageCb: ((msg: WsIncoming) => void) | null = null;

function connectSingleton(userId: string) {
  if (
    singletonSocket &&
    singletonUserId === userId &&
    (singletonSocket.readyState === WebSocket.OPEN ||
      singletonSocket.readyState === WebSocket.CONNECTING)
  ) {
    return; // already connected for this user
  }

  if (singletonSocket) {
    singletonSocket.onclose = null;
    singletonSocket.close();
    singletonSocket = null;
  }

  singletonUserId = userId;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws?userId=${userId}`);
  singletonSocket = ws;

  ws.onopen = () => {
    console.log('[WS] Connected');
    // Keepalive ping every 20s to prevent Railway/proxy timeout
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(ping);
      }
    }, 20000);
    (ws as any)._pingInterval = ping;
  };

  ws.onmessage = (event) => {
    try {
      const msg: WsIncoming = JSON.parse(event.data);
      onMessageCb?.(msg);
    } catch (err) {
      console.error('[WS] Parse error:', err);
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected — reconnecting in 2s');
    clearInterval((ws as any)._pingInterval);
    singletonSocket = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (singletonUserId) connectSingleton(singletonUserId);
    }, 2000);
  };

  ws.onerror = () => ws.close();
}

function sendSingleton(data: object) {
  const json = JSON.stringify(data);
  if (singletonSocket?.readyState === WebSocket.OPEN) {
    singletonSocket.send(json);
  } else {
    // Retry once after connection
    const retry = () => {
      if (singletonSocket?.readyState === WebSocket.OPEN) {
        singletonSocket.send(json);
      }
    };
    setTimeout(retry, 500);
  }
}

// ─── Notifications ───────────────────────────────────────────────────────────
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

async function showNotification(title: string, body: string) {
  if (!document.hidden) return;
  const ico = '/icon-192.png';
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.showNotification) { await reg.showNotification(title, { body, icon: ico, badge: ico }); return; }
    } catch { /* fall through */ }
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: ico });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWebSocket() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Connect singleton and wire up message handler
  useEffect(() => {
    if (!user?.id) return;

    connectSingleton(user.id);

    onMessageCb = (msg) => {
      if (msg.type === 'message') {
        const newMsg = msg.payload;
        queryClient.setQueryData<Message[]>(['messages', newMsg.chatId], (old = []) => {
          if (old.some((m) => m.id === newMsg.id)) return old;
          return [...old, newMsg];
        });
        queryClient.invalidateQueries({ queryKey: ['chats', user.id] });
        if (newMsg.senderId !== user.id) {
          const content = newMsg.type === 'audio' ? '🎤 Nota de voz' : newMsg.content;
          showNotification('LuxChat', content);
        }
      }
      if (msg.type === 'typing') globalListeners.get('typing')?.forEach((fn) => fn(msg.payload));
      if (msg.type === 'read') {
        globalListeners.get('read')?.forEach((fn) => fn(msg.payload));
        queryClient.setQueryData<Message[]>(['messages', msg.payload.chatId], (old) => {
          if (!old) return old;
          return old.map((m) => m.senderId !== user.id ? { ...m, read: true } : m);
        });
      }
      if (msg.type === 'reaction') {
        queryClient.setQueryData<Message[]>(['messages', msg.payload.chatId], (old) => {
          if (!old) return old;
          return old.map((m) => m.id === msg.payload.messageId ? { ...m, reactions: msg.payload.reactions } : m);
        });
      }
      if (msg.type === 'delete') {
        queryClient.setQueryData<Message[]>(['messages', msg.payload.chatId], (old) => {
          if (!old) return old;
          return old.map((m) => m.id === msg.payload.messageId ? { ...m, deleted: true, content: '' } : m);
        });
      }
      if (msg.type === 'call') {
        globalListeners.get('call')?.forEach((fn) => fn(msg.payload));
        if (msg.payload.action === 'incoming') showNotification('LuxChat', `📞 Llamada entrante de ${msg.payload.fromName}`);
      }
      if (msg.type === 'webrtc_signal') globalListeners.get('webrtc_signal')?.forEach((fn) => fn(msg.payload));
      if (msg.type === 'presence') {
        globalListeners.get('presence')?.forEach((fn) => fn(msg.payload));
      }
      if (msg.type === 'contact_request') {
        globalListeners.get('contact_request')?.forEach((fn) => fn(msg.payload));
        queryClient.invalidateQueries({ queryKey: ['pending-requests', user.id] });
        showNotification('LuxChat', `👤 ${msg.payload.fromName} quiere conectar contigo`);
      }
    };

    return () => {
      // Don't close the socket on unmount — other components still use it
      // Just clear the message callback if we were the last one
    };
  }, [user?.id, queryClient]);

  const sendMessage = useCallback((chatId: string, content: string, extra?: Partial<Message>) => {
    if (!user) return;
    sendSingleton({ type: 'message', payload: { chatId, content, senderId: user.id, type: 'text', ...extra } });
  }, [user]);

  const sendAudio = useCallback((chatId: string, audioData: string, audioType: string, audioDuration: number, replyTo?: (Message & { senderName?: string }) | null) => {
    if (!user) return;
    sendSingleton({ type: 'message', payload: { chatId, content: '', senderId: user.id, type: 'audio', audioData, audioType, audioDuration, ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.content, replyToSenderName: (replyTo as any).senderName, replyToSenderId: replyTo.senderId, replyToIsAudio: replyTo.type === 'audio' } : {}) } });
  }, [user]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (!user) return;
    sendSingleton({ type: 'typing', payload: { chatId, userId: user.id, isTyping, name: user.displayName } });
  }, [user]);

  const sendRead = useCallback((chatId: string) => {
    if (!user) return;
    sendSingleton({ type: 'read', payload: { chatId, readBy: user.id } });
  }, [user]);

  const sendReaction = useCallback((messageId: number, emoji: string) => {
    if (!user) return;
    sendSingleton({ type: 'reaction', payload: { messageId, userId: user.id, emoji } });
  }, [user]);

  const sendDelete = useCallback((messageId: number, chatId: string) => {
    sendSingleton({ type: 'delete', payload: { messageId, chatId } });
  }, []);

  const sendCall = useCallback((toUserId: string, action: 'incoming' | 'answer' | 'reject' | 'end') => {
    if (!user) return;
    sendSingleton({ type: 'call', payload: { toUserId, fromUserId: user.id, fromName: user.displayName, action } });
  }, [user]);

  const sendWebRTCSignal = useCallback((toUserId: string, signalType: 'offer' | 'answer' | 'ice', data: unknown) => {
    if (!user) return;
    sendSingleton({ type: 'webrtc_signal', payload: { toUserId, fromUserId: user.id, signalType, data } });
  }, [user]);

  const sendContactRequestNotif = useCallback((toUserId: string) => {
    if (!user) return;
    sendSingleton({ type: 'contact_request', payload: { toUserId, fromUserId: user.id, fromName: user.displayName } });
  }, [user]);

  const on = useCallback(<K extends keyof WsEventMap>(event: K, fn: WsEventMap[K]) => {
    if (!globalListeners.has(event)) globalListeners.set(event, new Set());
    globalListeners.get(event)!.add(fn as Function);
    return () => { globalListeners.get(event)?.delete(fn as Function); };
  }, []);

  return { sendMessage, sendAudio, sendTyping, sendRead, sendReaction, sendDelete, sendCall, sendContactRequestNotif, sendWebRTCSignal, on };
}
