import { db } from "./db";
import {
  users, contacts, chats, chatMembers, messages, pushSubscriptions,
  type User, type InsertUser, type Contact, type Chat, type ChatMember, type Message, type ChatWithMeta, type PushSubscription,
} from "@shared/schema";
import { eq, and, desc, ilike } from "drizzle-orm";

type CreateMessageInput = {
  chatId: string;
  senderId: string;
  content: string;
  type?: string;
  audioData?: string;
  audioType?: string;
  audioDuration?: number;
  mediaData?: string;
  mediaType?: string;
  replyToId?: number;
  replyToText?: string;
  replyToSenderName?: string;
  replyToSenderId?: string;
  replyToIsAudio?: boolean;
  encrypted?: boolean;
};

function generateTag(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export class DatabaseStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByTag(tag: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.tag, tag.trim().toUpperCase()));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const tag = generateTag();
    const [user] = await db.insert(users).values({ ...insertUser, tag }).returning();
    return user;
  }

  async updateUserStatus(id: string, status: string): Promise<void> {
    await db.update(users).set({ status, lastSeen: new Date() }).where(eq(users.id, id));
  }

  async updateUserAvatar(id: string, avatarUrl: string): Promise<User> {
    const [user] = await db.update(users).set({ avatarUrl }).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserPublicKey(id: string, publicKey: string): Promise<void> {
    await db.update(users).set({ publicKey }).where(eq(users.id, id));
  }

  async updateUserProfile(id: string, data: { displayName?: string; avatarUrl?: string }): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async getUserContacts(userId: string): Promise<User[]> {
    const rows = await db.select().from(contacts).where(
      and(eq(contacts.userId, userId), eq(contacts.status, "accepted"))
    );
    if (rows.length === 0) return [];
    const allUsers = await db.select().from(users);
    return allUsers.filter((u) => rows.some((r) => r.contactId === u.id));
  }

  async getPendingRequests(userId: string): Promise<(User & { requestId: number })[]> {
    const rows = await db.select().from(contacts).where(
      and(eq(contacts.contactId, userId), eq(contacts.status, "pending"))
    );
    if (rows.length === 0) return [];
    const result: (User & { requestId: number })[] = [];
    for (const row of rows) {
      const sender = await this.getUser(row.fromUserId ?? row.userId);
      if (sender) result.push({ ...sender, requestId: row.id });
    }
    return result;
  }

  async addContact(userId: string, contactId: string): Promise<Contact> {
    const target = await this.getUser(contactId);
    if (!target) throw new Error("User not found");
    if (userId === contactId) throw new Error("You can't add yourself");
    const [existing] = await db.select().from(contacts).where(
      and(eq(contacts.userId, userId), eq(contacts.contactId, contactId))
    );
    if (existing) throw new Error("Contact already added or request pending");
    const [contact] = await db.insert(contacts).values({
      userId, contactId, fromUserId: userId, status: "pending",
    }).returning();
    return contact;
  }

  async acceptContact(requestId: number, userId: string): Promise<void> {
    const [req] = await db.select().from(contacts).where(eq(contacts.id, requestId));
    if (!req || req.contactId !== userId) throw new Error("Request not found");
    await db.update(contacts).set({ status: "accepted" }).where(eq(contacts.id, requestId));
    const [reverseExists] = await db.select().from(contacts).where(
      and(eq(contacts.userId, userId), eq(contacts.contactId, req.userId))
    );
    if (!reverseExists) {
      await db.insert(contacts).values({ userId, contactId: req.userId, fromUserId: userId, status: "accepted" });
    } else {
      await db.update(contacts).set({ status: "accepted" }).where(
        and(eq(contacts.userId, userId), eq(contacts.contactId, req.userId))
      );
    }
  }

  async rejectContact(requestId: number, userId: string): Promise<void> {
    await db.update(contacts).set({ status: "rejected" }).where(
      and(eq(contacts.id, requestId), eq(contacts.contactId, userId))
    );
  }

  async getUserChats(userId: string): Promise<ChatWithMeta[]> {
    const memberships = await db.select().from(chatMembers).where(eq(chatMembers.userId, userId));
    if (memberships.length === 0) return [];
    const result = [];
    for (const m of memberships) {
      const [chat] = await db.select().from(chats).where(eq(chats.id, m.chatId));
      if (!chat) continue;
      const [lastMsg] = await db.select().from(messages).where(eq(messages.chatId, chat.id)).orderBy(desc(messages.createdAt)).limit(1);
      const lastMessage = lastMsg
        ? lastMsg.deleted ? "🚫 Mensaje eliminado"
          : lastMsg.type === "audio" ? "🎤 Nota de voz"
          : lastMsg.encrypted ? "🔒 Mensaje cifrado"
          : lastMsg.content || ""
        : "";
      const allMsgs = await db.select().from(messages).where(eq(messages.chatId, chat.id));
      const unread = allMsgs.filter(msg => !msg.read && msg.senderId !== userId).length;
      if (!chat.isGroup) {
        const members = await db.select().from(chatMembers).where(eq(chatMembers.chatId, chat.id));
        const other = members.find((mm) => mm.userId !== userId);
        if (other) {
          const otherUser = await this.getUser(other.userId);
          if (otherUser) {
            result.push({ ...chat, name: otherUser.displayName, avatarUrl: otherUser.avatarUrl ?? undefined, lastMessage, unread });
            continue;
          }
        }
      }
      result.push({ ...chat, lastMessage, unread });
    }
    return result;
  }

  async createChat(participantIds: string[]): Promise<Chat> {
    if (participantIds.length === 2) {
      const [a, b] = participantIds;
      const aMemberships = await db.select().from(chatMembers).where(eq(chatMembers.userId, a));
      for (const m of aMemberships) {
        const members = await db.select().from(chatMembers).where(eq(chatMembers.chatId, m.chatId));
        if (members.length === 2 && members.some((mm) => mm.userId === b)) {
          const [existing] = await db.select().from(chats).where(eq(chats.id, m.chatId));
          if (existing && !existing.isGroup) return existing;
        }
      }
    }
    const isGroup = participantIds.length > 2;
    const [chat] = await db.insert(chats).values({ isGroup }).returning();
    for (const uid of participantIds) {
      await db.insert(chatMembers).values({ chatId: chat.id, userId: uid });
    }
    return chat;
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat;
  }

  async getChatMembers(chatId: string): Promise<ChatMember[]> {
    return db.select().from(chatMembers).where(eq(chatMembers.chatId, chatId));
  }

  async getChatMessages(chatId: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.createdAt);
  }

  async createMessage(msg: CreateMessageInput): Promise<Message> {
    const [message] = await db.insert(messages).values({
      chatId: msg.chatId,
      senderId: msg.senderId,
      content: msg.content ?? "",
      type: msg.type ?? "text",
      audioData: msg.audioData,
      audioType: msg.audioType,
      audioDuration: msg.audioDuration,
      mediaData: msg.mediaData,
      mediaType: msg.mediaType,
      replyToId: msg.replyToId,
      replyToText: msg.replyToText,
      replyToSenderName: msg.replyToSenderName,
      replyToSenderId: msg.replyToSenderId,
      replyToIsAudio: msg.replyToIsAudio ?? false,
      reactions: "{}",
      read: false,
      deleted: false,
      encrypted: msg.encrypted ?? false,
    }).returning();
    return message;
  }

  async markMessagesRead(chatId: string, userId: string): Promise<void> {
    const chatMessages = await db.select().from(messages).where(eq(messages.chatId, chatId));
    for (const msg of chatMessages) {
      if (msg.senderId !== userId && !msg.read) {
        await db.update(messages).set({ read: true }).where(eq(messages.id, msg.id));
      }
    }
  }

  async deleteMessage(messageId: number): Promise<void> {
    await db.update(messages).set({ deleted: true, content: "", audioData: null, mediaData: null })
      .where(eq(messages.id, messageId));
  }

  async updateReactions(messageId: number, reactions: string): Promise<void> {
    await db.update(messages).set({ reactions }).where(eq(messages.id, messageId));
  }

  async getMessageReactions(messageId: number): Promise<string> {
    const [msg] = await db.select({ reactions: messages.reactions }).from(messages).where(eq(messages.id, messageId));
    return msg?.reactions ?? "{}";
  }

  async getMessageChatId(messageId: number): Promise<string | undefined> {
    const [msg] = await db.select({ chatId: messages.chatId }).from(messages).where(eq(messages.id, messageId));
    return msg?.chatId;
  }

  async savePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await db.insert(pushSubscriptions).values({ userId, ...sub })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
}

export const storage = new DatabaseStorage();
