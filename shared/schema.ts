import { pgTable, text, serial, boolean, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  tag: text("tag"),          // Short 6-char code e.g. "AB12CD"
  status: text("status").default("online"),
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(),       // who receives the request / owns the contact
  contactId: uuid("contact_id").notNull(), // the other person
  fromUserId: uuid("from_user_id"),        // who SENT the request
  status: text("status").default("accepted"), // pending | accepted | rejected
  createdAt: timestamp("created_at").defaultNow(),
});

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  isGroup: boolean("is_group").default(false),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMembers = pgTable("chat_members", {
  chatId: uuid("chat_id").notNull(),
  userId: uuid("user_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: uuid("chat_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  content: text("content").notNull().default(""),
  type: text("type").default("text"),
  audioData: text("audio_data"),
  audioType: text("audio_type"),
  audioDuration: integer("audio_duration"),
  mediaData: text("media_data"),
  mediaType: text("media_type"),
  replyToId: integer("reply_to_id"),
  replyToText: text("reply_to_text"),
  replyToSenderName: text("reply_to_sender_name"),
  replyToSenderId: uuid("reply_to_sender_id"),
  replyToIsAudio: boolean("reply_to_is_audio").default(false),
  read: boolean("read").default(false),
  deleted: boolean("deleted").default(false),
  reactions: text("reactions").default("{}"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastSeen: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ChatWithMeta = Chat & { avatarUrl?: string | null; lastMessage?: string; unread?: number };
