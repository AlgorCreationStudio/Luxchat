import { db } from "./db";
import {
  users, contacts, chats, chatMembers, messages,
  type User, type InsertUser, type Contact, type Chat, type ChatMember, type Message,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

type CreateMessageInput = {
  chatId: string;
  senderId: string;
  content: string;
  type?: string;
  // Audio
  audioData?: string;
  audioType?: string;
  audioDuration?: number;
  // Media
  mediaData?: string;
  mediaType?: string;
  // Reply
  replyToId?: number;
  replyToText?: string;
  replyToSenderName?: string;
  replyToSenderId?: string;
  replyToIsAudio?: boolean;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(id: string, status: string): Promise<void>;

  getUserContacts(userId: string): Promise<User[]>;
  addContact(userId: string, contactId: string): Promise<Contact>;

  getUserChats(userId: string): Promise<(Chat & { name?: string; avatarUrl?: string; lastMessage?: string })[]>;
  createChat(participantIds: string[]): Promise<Chat>;
  getChat(id: string): Promise<Chat | undefined>;
  getChatMembers(chatId: string): Promise<ChatMember[]>;

  getChatMessages(chatId: string): Promise<Message[]>;
  createMessage(msg: CreateMessageInput): Promise<Message>;
  markMessagesRead(chatId: string, userId: string): Promise<void>;
  deleteMessage(messageId: number): Promise<void>;
  updateReactions(messageId: number, reactions: string): Promise<void>;
  getMessageReactions(messageId: number): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserStatus(id: string, status: string): Promise<void> {
    await db.update(users).set({ status, lastSeen: new Date() }).where(eq(users.id, id));
  }

  async getUserContacts(userId: string): Promise<User[]> {
    const rows = await db.select().from(contacts).where(eq(contacts.userId, userId));
    if (rows.length === 0) return [];
    const allUsers = await db.select().from(users);
    return allUsers.filter((u) => rows.some((r) => r.contactId === u.id));
  }

  async addContact(userId: string, contactId: string): Promise<Contact> {
    // Check contact exists
    const target = await this.getUser(contactId);
    if (!target) throw new Error("User not found");
    const [contact] = await db.insert(contacts).values({ userId, contactId }).returning();
    return contact;
  }

  async getUserChats(userId: string): Promise<(Chat & { name?: string; avatarUrl?: string; lastMessage?: string })[]> {
    const memberships = await db.select().from(chatMembers).where(eq(chatMembers.userId, userId));
    if (memberships.length === 0) return [];

    const result = [];
    for (const m of memberships) {
      const [chat] = await db.select().from(chats).where(eq(chats.id, m.chatId));
      if (!chat) continue;

      // Get last message
      const [lastMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const lastMessage = lastMsg
        ? lastMsg.deleted
          ? "🚫 Mensaje eliminado"
          : lastMsg.type === "audio"
          ? "🎤 Nota de voz"
          : lastMsg.content || ""
        : "";

      if (!chat.isGroup) {
        const members = await db.select().from(chatMembers).where(eq(chatMembers.chatId, chat.id));
        const other = members.find((mm) => mm.userId !== userId);
        if (other) {
          const otherUser = await this.getUser(other.userId);
          if (otherUser) {
            result.push({
              ...chat,
              name: otherUser.displayName,
              avatarUrl: otherUser.avatarUrl ?? undefined,
              lastMessage,
            });
            continue;
          }
        }
      }
      result.push({ ...chat, lastMessage });
    }
    return result;
  }

  async createChat(participantIds: string[]): Promise<Chat> {
    // Check if 1-on-1 chat already exists between these two
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
    const [message] = await db
      .insert(messages)
      .values({
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
      })
      .returning();
    return message;
  }

  async markMessagesRead(chatId: string, userId: string): Promise<void> {
    // Mark all messages in chat not sent by userId as read
    await db
      .update(messages)
      .set({ read: true })
      .where(eq(messages.chatId, chatId));
  }

  async deleteMessage(messageId: number): Promise<void> {
    await db
      .update(messages)
      .set({ deleted: true, content: "", audioData: null, mediaData: null })
      .where(eq(messages.id, messageId));
  }

  async updateReactions(messageId: number, reactions: string): Promise<void> {
    await db.update(messages).set({ reactions }).where(eq(messages.id, messageId));
  }

  async getMessageReactions(messageId: number): Promise<string> {
    const [msg] = await db.select({ reactions: messages.reactions }).from(messages).where(eq(messages.id, messageId));
    return msg?.reactions ?? "{}";
  }
}

export const storage = new DatabaseStorage();
