import { db } from "./db";
import {
  users, contacts, chats, chatMembers, messages,
  type User, type InsertUser, type Contact, type Chat, type ChatMember, type Message,
} from "@shared/schema";
import { eq, and, desc, ne } from "drizzle-orm";

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
};

function generateTag(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class DatabaseStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByTag(tag: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.tag, tag.toUpperCase()));
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

  // Returns accepted contacts
  async getUserContacts(userId: string): Promise<User[]> {
    const rows = await db.select().from(contacts).where(
      and(eq(contacts.userId, userId), eq(contacts.status, "accepted"))
    );
    if (rows.length === 0) return [];
    const allUsers = await db.select().from(users);
    return allUsers.filter((u) => rows.some((r) => r.contactId === u.id));
  }

  // Returns incoming pending requests with sender info
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

  // Send a contact request (pending)
  async addContact(userId: string, contactId: string): Promise<Contact> {
    const target = await this.getUser(contactId);
    if (!target) throw new Error("User not found");
    if (userId === contactId) throw new Error("You can't add yourself");

    // Check if already exists
    const [existing] = await db.select().from(contacts).where(
      and(eq(contacts.userId, userId), eq(contacts.contactId, contactId))
    );
    if (existing) throw new Error("Contact already added or request pending");

    // Create pending request — both sides need a row
    const [contact] = await db.insert(contacts).values({
      userId: contactId,   // the receiver
      contactId: userId,   // the sender (as the "contact")
      fromUserId: userId,  // who sent it
      status: "pending",
    }).returning();
    return contact;
  }

  async acceptContact(requestId: number, userId: string): Promise<void> {
    // Get the request
    const [req] = await db.select().from(contacts).where(eq(contacts.id, requestId));
    if (!req || req.userId !== userId) throw new Error("Request not found");

    // Update request to accepted
    await db.update(contacts).set({ status: "accepted" }).where(eq(contacts.id, requestId));

    // Create reverse contact row so both can see each other
    const [reverseExists] = await db.select().from(contacts).where(
      and(eq(contacts.userId, req.contactId), eq(contacts.contactId, userId))
    );
    if (!reverseExists) {
      await db.insert(contacts).values({
        userId: req.contactId,
        contactId: userId,
        fromUserId: userId,
        status: "accepted",
      });
    } else {
      await db.update(contacts).set({ status: "accepted" }).where(
        and(eq(contacts.userId, req.contactId), eq(contacts.contactId, userId))
      );
    }
  }

  async rejectContact(requestId: number, userId: string): Promise<void> {
    await db.update(contacts).set({ status: "rejected" }).where(
      and(eq(contacts.id, requestId), eq(contacts.userId, userId))
    );
  }

  async getUserChats(userId: string): Promise<(Chat & { name?: string; avatarUrl?: string; lastMessage?: string; unread?: number })[]> {
    const memberships = await db.select().from(chatMembers).where(eq(chatMembers.userId, userId));
    if (memberships.length === 0) return [];

    const result = [];
    for (const m of memberships) {
      const [chat] = await db.select().from(chats).where(eq(chats.id, m.chatId));
      if (!chat) continue;

      const [lastMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const lastMessage = lastMsg
        ? lastMsg.deleted ? "🚫 Mensaje eliminado"
          : lastMsg.type === "audio" ? "🎤 Nota de voz"
          : lastMsg.content || ""
        : "";

      // Count unread
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
    }).returning();
    return message;
  }

  async markMessagesRead(chatId: string, userId: string): Promise<void> {
    // Only mark messages NOT sent by this user as read
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
}

export const storage = new DatabaseStorage();
