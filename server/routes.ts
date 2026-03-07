import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

// ── WebSocket message schemas ──────────────────────────────────────────────
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

const WsTyping = z.object({
  chatId: z.string(),
  userId: z.string(),
  isTyping: z.boolean(),
  name: z.string(),
});

const WsRead = z.object({ chatId: z.string(), readBy: z.string() });

const WsReaction = z.object({
  messageId: z.number(),
  userId: z.string(),
  emoji: z.string(),
});

const WsDelete = z.object({ messageId: z.number(), chatId: z.string() });

// ── Helpers ────────────────────────────────────────────────────────────────
function broadcast(clients: Map<string, WebSocket>, userIds: string[], payload: object) {
  const json = JSON.stringify(payload);
  userIds.forEach((uid) => {
    const ws = clients.get(uid);
    if (ws?.readyState === WebSocket.OPEN) ws.send(json);
  });
}

function memberIds(members: { userId: string }[]): string[] {
  return members.map((m) => m.userId);
}

// ── Routes ─────────────────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Users
  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const user = await storage.createUser(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.users.get.path, async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.get(api.users.contacts.path, async (req, res) => {
    res.json(await storage.getUserContacts(req.params.id));
  });

  app.post(api.users.addContact.path, async (req, res) => {
    try {
      const input = api.users.addContact.input.parse(req.body);
      const contact = await storage.addContact(req.params.id, input.contactId);
      res.status(201).json(contact);
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      const msg = err instanceof Error ? err.message : "Internal server error";
      res.status(400).json({ message: msg });
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
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.chats.getMessages.path, async (req, res) => {
    res.json(await storage.getChatMessages(req.params.id));
  });

  // ── WebSocket ────────────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Map<string, WebSocket>(); // userId → ws

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = url.searchParams.get("userId") ?? "";
    if (userId) {
      clients.set(userId, ws);
      storage.updateUserStatus(userId, "online").catch(() => {});
    }

    ws.on("message", async (raw) => {
      try {
        const { type, payload } = JSON.parse(raw.toString());

        // ── New message ──────────────────────────────────────────────────
        if (type === "message") {
          const p = WsSendMessage.parse(payload);
          const saved = await storage.createMessage(p);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members), {
            type: "message",
            payload: { ...saved, createdAt: saved.createdAt?.toISOString() ?? new Date().toISOString() },
          });
        }

        // ── Typing indicator ─────────────────────────────────────────────
        if (type === "typing") {
          const p = WsTyping.parse(payload);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(
            clients,
            memberIds(members).filter((id) => id !== p.userId),
            { type: "typing", payload: p }
          );
        }

        // ── Mark read ────────────────────────────────────────────────────
        if (type === "read") {
          const p = WsRead.parse(payload);
          await storage.markMessagesRead(p.chatId, p.readBy);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members), { type: "read", payload: p });
        }

        // ── Reaction ─────────────────────────────────────────────────────
        if (type === "reaction") {
          const p = WsReaction.parse(payload);
          const currentJson = await storage.getMessageReactions(p.messageId);
          const reactions: Record<string, string[]> = JSON.parse(currentJson);

          if (!reactions[p.emoji]) reactions[p.emoji] = [];
          const idx = reactions[p.emoji].indexOf(p.userId);
          if (idx >= 0) {
            reactions[p.emoji].splice(idx, 1); // toggle off
          } else {
            // Remove user from any other emoji first (one reaction per user)
            for (const e of Object.keys(reactions)) {
              reactions[e] = reactions[e].filter((uid) => uid !== p.userId);
            }
            reactions[p.emoji].push(p.userId);
          }

          const newJson = JSON.stringify(reactions);
          await storage.updateReactions(p.messageId, newJson);

          // Broadcast to whole chat — need chatId from message
          // We parse it from the first message fetch (simplified: broadcast to all connected)
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "reaction", payload: { messageId: p.messageId, reactions: newJson } }));
            }
          });
        }

        // ── Delete message ───────────────────────────────────────────────
        if (type === "delete") {
          const p = WsDelete.parse(payload);
          await storage.deleteMessage(p.messageId);
          const members = await storage.getChatMembers(p.chatId);
          broadcast(clients, memberIds(members), { type: "delete", payload: p });
        }

      } catch (err) {
        console.error("[WS] Error:", err);
      }
    });

    ws.on("close", () => {
      if (userId) {
        clients.delete(userId);
        storage.updateUserStatus(userId, "offline").catch(() => {});
      }
    });
  });

  return httpServer;
}
