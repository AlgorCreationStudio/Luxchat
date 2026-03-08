import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

const WsSendMessage = z.object({
  chatId: z.string(),
  senderId: z.string(),
  content: z.string().default(""),
  type: z.string().default("text"),
  audioData: z.string().optional(),
  audioType: z.string().optional(),
  audioDuration: z.number().optional(),
  mediaData: z.string().optional(),
  mediaType: z.string().optional(),
  replyToId: z.number().optional(),
  replyToText: z.string().optional(),
  replyToSenderName: z.string().optional(),
  replyToSenderId: z.string().optional(),
  replyToIsAudio: z.boolean().optional(),
});

const WsTyping = z.object({ chatId: z.string(), userId: z.string(), isTyping: z.boolean(), name: z.string() });
const WsRead = z.object({ chatId: z.string(), readBy: z.string() });
const WsReaction = z.object({ messageId: z.number(), userId: z.string(), emoji: z.string() });
const WsDelete = z.object({ messageId: z.number(), chatId: z.string() });
const WsCall = z.object({ toUserId: z.string(), fromUserId: z.string(), fromName: z.string(), action: z.enum(["incoming", "answer", "reject", "end"]) });
const WsContactRequest = z.object({ toUserId: z.string(), fromUserId: z.string(), fromName: z.string() });

type SerializableIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function normalizeIceServers(input: unknown): SerializableIceServer[] {
  const rawServers = Array.isArray(input)
    ? input
    : (typeof input === 'object' && input && 'iceServers' in input && Array.isArray((input as { iceServers?: unknown }).iceServers)
      ? (input as { iceServers: unknown[] }).iceServers
      : (typeof input === 'object'
        && input
        && 'v' in input
        && typeof (input as { v?: unknown }).v === 'object'
        && (input as { v?: { iceServers?: unknown } }).v
        && Array.isArray((input as { v?: { iceServers?: unknown[] } }).v?.iceServers)
          ? (input as { v: { iceServers: unknown[] } }).v.iceServers
          : null));

  if (!rawServers) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  const normalized = rawServers.flatMap((server) => {
    if (!server || typeof server !== 'object') return [];

    const rawUrls = 'urls' in server
      ? (server as { urls?: unknown }).urls
      : (server as { url?: unknown }).url;

    if (typeof rawUrls !== 'string' && !Array.isArray(rawUrls)) {
      return [];
    }

    const urls = Array.isArray(rawUrls)
      ? rawUrls.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : rawUrls;

    if ((Array.isArray(urls) && urls.length === 0) || urls === '') {
      return [];
    }

    return [{
      urls,
      username: typeof (server as { username?: unknown }).username === 'string'
        ? (server as { username?: string }).username
        : undefined,
      credential: typeof (server as { credential?: unknown }).credential === 'string'
        ? (server as { credential?: string }).credential
        : undefined,
    } satisfies SerializableIceServer];
  });

  return normalized.length > 0 ? normalized : [{ urls: 'stun:stun.l.google.com:19302' }];
}

type ClientMap = Map<string, Set<WebSocket>>;

function addClient(clients: ClientMap, userId: string, ws: WebSocket) {
  const sockets = clients.get(userId) ?? new Set<WebSocket>();
  sockets.add(ws);
  clients.set(userId, sockets);
}

function removeClient(clients: ClientMap, userId: string, ws: WebSocket) {
  const sockets = clients.get(userId);
  if (!sockets) return false;

  sockets.delete(ws);
  if (sockets.size === 0) {
    clients.delete(userId);
    return true;
  }

  return false;
}

function sendToUser(clients: ClientMap, userId: string, payload: object) {
  const sockets = clients.get(userId);
  if (!sockets || sockets.size === 0) return;

  const json = JSON.stringify(payload);
  for (const ws of Array.from(sockets)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
      continue;
    }

    sockets.delete(ws);
  }

  if (sockets.size === 0) {
    clients.delete(userId);
  }
}

function broadcast(clients: ClientMap, userIds: string[], payload: object) {
  userIds.forEach((uid) => sendToUser(clients, uid, payload));
}

function memberIds(members: { userId: string }[]): string[] {
  return members.map((m) => m.userId);
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Users
  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Find user by tag — MUST be before /api/users/:id to avoid Express conflict
  app.get("/api/users/by-tag/:tag", async (req, res) => {
    const user = await storage.getUserByTag(req.params.tag);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash, ...safeUser } = user as any;
    res.json(safeUser);
  });

  app.get(api.users.get.path, async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  // Get accepted contacts
  app.get(api.users.contacts.path, async (req, res) => {
    res.json(await storage.getUserContacts(req.params.id));
  });

  // Get pending incoming requests
  app.get("/api/users/:id/pending-requests", async (req, res) => {
    res.json(await storage.getPendingRequests(req.params.id));
  });

  // Send contact request
  app.post(api.users.addContact.path, async (req, res) => {
    try {
      const input = api.users.addContact.input.parse(req.body);
      const contact = await storage.addContact(req.params.id, input.contactId);
      res.status(201).json(contact);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message });
      const msg = err instanceof Error ? err.message : "Internal server error";
      res.status(400).json({ message: msg });
    }
  });

  // Accept contact request
  app.post("/api/users/:id/contacts/:requestId/accept", async (req, res) => {
    try {
      await storage.acceptContact(Number(req.params.requestId), req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Error" });
    }
  });

  // Reject contact request
  app.post("/api/users/:id/contacts/:requestId/reject", async (req, res) => {
    try {
      await storage.rejectContact(Number(req.params.requestId), req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Error" });
    }
  });

  app.get(api.users.chats.path, async (req, res) => {
    res.json(await storage.getUserChats(req.params.id));
  });

  // Chats
  app.post(api.chats.create.path, async (req, res) => {
    try {
      const input = api.chats.create.input.parse(req.body);
      const chat = await storage.createChat(input.participantIds);
      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.chats.getMessages.path, async (req, res) => {
    res.json(await storage.getChatMessages(req.params.id));
  });

  // Xirsys ICE servers — credentials stay server-side
  app.get('/api/ice-servers', async (req, res) => {
    const ident   = process.env.XIRSYS_IDENT;
    const secret  = process.env.XIRSYS_SECRET;
    const channel = process.env.XIRSYS_CHANNEL || 'LuxChat';

    if (!ident || !secret) {
      // Fallback: Google STUN only
      return res.json([{ urls: 'stun:stun.l.google.com:19302' }]);
    }

    try {
      const r = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${ident}:${secret}`).toString('base64'),
        },
        body: JSON.stringify({ format: 'urls' }),
      });
      const data = await r.json() as unknown;
      return res.json(normalizeIceServers(data));
    } catch { /* fall through */ }

    res.json([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  // Get chat members
  app.get("/api/chats/:id/members", async (req, res) => {
    const members = await storage.getChatMembers(req.params.id);
    const users = await Promise.all(members.map((m) => storage.getUser(m.userId)));
    res.json(users.filter(Boolean));
  });

  // Mark chat as read (explicit, not auto)
  app.post("/api/chats/:id/read", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });
    await storage.markMessagesRead(req.params.id, userId);
    res.json({ success: true });
  });

  // WebSocket
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = url.searchParams.get("userId") ?? "";
    if (userId) {
      addClient(clients, userId, ws);
      storage.updateUserStatus(userId, "online").catch(() => {});

      // Push any pending contact requests immediately on connect
      storage.getPendingRequests(userId).then((pending) => {
        if (pending.length > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "pending_flush", payload: { count: pending.length } }));
        }
      }).catch(() => {});
    }

    ws.on("message", async (raw) => {
      try {
        const { type, payload } = JSON.parse(raw.toString());

        if (type === "message") {
          const p = WsSendMessage.parse(payload);
          const saved = await storage.createMessage(p);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members), {
            type: "message",
            payload: { ...saved, createdAt: saved.createdAt?.toISOString() ?? new Date().toISOString() },
          });
        }

        if (type === "typing") {
          const p = WsTyping.parse(payload);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members).filter((id) => id !== p.userId), { type: "typing", payload: p });
        }

        if (type === "read") {
          const p = WsRead.parse(payload);
          await storage.markMessagesRead(p.chatId, p.readBy);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members), { type: "read", payload: p });
        }

        if (type === "reaction") {
          const p = WsReaction.parse(payload);
          const currentJson = await storage.getMessageReactions(p.messageId);
          const reactions: Record<string, string[]> = JSON.parse(currentJson);

          if (!reactions[p.emoji]) reactions[p.emoji] = [];
          const idx = reactions[p.emoji].indexOf(p.userId);
          if (idx >= 0) {
            reactions[p.emoji].splice(idx, 1);
          } else {
            for (const e of Object.keys(reactions)) {
              reactions[e] = reactions[e].filter((uid) => uid !== p.userId);
            }
            reactions[p.emoji].push(p.userId);
          }

          const newJson = JSON.stringify(reactions);
          await storage.updateReactions(p.messageId, newJson);

          // Get chatId so we can broadcast correctly
          const chatId = await storage.getMessageChatId(p.messageId);
          if (chatId) {
            const members = await storage.getChatMembers(chatId);
            broadcast(clients, memberIds(members), {
              type: "reaction",
              payload: { messageId: p.messageId, chatId, reactions: newJson }
            });
          }
        }

        if (type === "delete") {
          const p = WsDelete.parse(payload);
          await storage.deleteMessage(p.messageId);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members), { type: "delete", payload: p });
        }

        // Call signaling
        if (type === "call") {
          const p = WsCall.parse(payload);
          sendToUser(clients, p.toUserId, { type: "call", payload: p });
        }

        // Contact request notification
        if (type === "webrtc_signal") {
          sendToUser(clients, payload.toUserId, { type: "webrtc_signal", payload });
        }

        if (type === "contact_request") {
          const p = WsContactRequest.parse(payload);
          sendToUser(clients, p.toUserId, { type: "contact_request", payload: p });
        }

      } catch (err) {
        console.error("[WS] Error:", err);
      }
    });

    ws.on("close", () => {
      if (userId) {
        const isLastClient = removeClient(clients, userId, ws);
        if (isLastClient) {
          storage.updateUserStatus(userId, "offline").catch(() => {});
        }
      }
    });
  });

  return httpServer;
}
