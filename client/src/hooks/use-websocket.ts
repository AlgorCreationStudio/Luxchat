import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/use-auth-store';
import type { Message } from '@shared/schema';

type WsIncoming =
  | { type: 'message'; payload: Message }
  | { type: 'typing'; payload: { chatId: string; userId: string; isTyping: boolean; name: string } }
  | { type: 'read'; payload: { chatId: string; readBy: string } }
  | { type: 'reaction'; payload: { messageId: number; reactions: string } }
  | { type: 'delete'; payload: { messageId: number; chatId: string } };

export type TypingState = { [chatId: string]: { userId: string; name: string }[] };

type WsEventMap = {
  typing: (payload: { chatId: string; userId: string; isTyping: boolean; name: string }) => void;
  read: (payload: { chatId: string; readBy: string }) => void;
};

const listeners = new Map<string, Set<Function>>();

export function useWebSocket() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => console.log('[WS] Connected');

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
        }

        if (msg.type === 'typing') {
          listeners.get('typing')?.forEach((fn) => fn(msg.payload));
        }

        if (msg.type === 'read') {
          listeners.get('read')?.forEach((fn) => fn(msg.payload));
          queryClient.invalidateQueries({ queryKey: ['messages', msg.payload.chatId] });
        }

        if (msg.type === 'reaction') {
          queryClient.setQueryData<Message[]>(['messages', undefined], (old) => {
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
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    socket.onclose = () => console.log('[WS] Disconnected');
    wsRef.current = socket;
    return () => socket.close();
  }, [user?.id, queryClient]);

  const send = useCallback(
    (data: object) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      }
    },
    []
  );

  const sendMessage = useCallback(
    (chatId: string, content: string, extra?: Partial<Message>) => {
      if (!user) return;
      send({ type: 'message', payload: { chatId, content, senderId: user.id, type: 'text', ...extra } });
    },
    [user, send]
  );

  const sendAudio = useCallback(
    (chatId: string, audioData: string, audioType: string, audioDuration: number, replyTo?: Message | null) => {
      if (!user) return;
      send({
        type: 'message',
        payload: {
          chatId,
          content: '',
          senderId: user.id,
          type: 'audio',
          audioData,
          audioType,
          audioDuration,
          ...(replyTo ? {
            replyToId: replyTo.id,
            replyToText: replyTo.content,
            replyToSenderName: replyTo.senderName,
            replyToSenderId: replyTo.senderId,
            replyToIsAudio: replyTo.type === 'audio',
          } : {}),
        },
      });
    },
    [user, send]
  );

  const sendTyping = useCallback(
    (chatId: string, isTyping: boolean) => {
      if (!user) return;
      send({ type: 'typing', payload: { chatId, userId: user.id, isTyping, name: user.displayName } });
    },
    [user, send]
  );

  const sendRead = useCallback(
    (chatId: string) => {
      if (!user) return;
      send({ type: 'read', payload: { chatId, readBy: user.id } });
    },
    [user, send]
  );

  const sendReaction = useCallback(
    (messageId: number, emoji: string) => {
      if (!user) return;
      send({ type: 'reaction', payload: { messageId, userId: user.id, emoji } });
    },
    [user, send]
  );

  const sendDelete = useCallback(
    (messageId: number, chatId: string) => {
      send({ type: 'delete', payload: { messageId, chatId } });
    },
    [send]
  );

  const on = useCallback(<K extends keyof WsEventMap>(event: K, fn: WsEventMap[K]) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => listeners.get(event)?.delete(fn);
  }, []);

  return { sendMessage, sendAudio, sendTyping, sendRead, sendReaction, sendDelete, on };
}
