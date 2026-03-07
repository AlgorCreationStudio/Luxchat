import { pgTable, text, serial, boolean, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  status: text("status").default("online"),
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  contactId: uuid("contact_id").notNull(),
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
  type: text("type").default("text"), // text | audio | image | deleted
  // Audio
  audioData: text("audio_data"),      // base64 data URL
  audioType: text("audio_type"),      // mime type
  audioDuration: integer("audio_duration"), // seconds
  // Media
  mediaData: text("media_data"),
  mediaType: text("media_type"),
  // Reply
  replyToId: integer("reply_to_id"),
  replyToText: text("reply_to_text"),
  replyToSenderName: text("reply_to_sender_name"),
  replyToSenderId: uuid("reply_to_sender_id"),
  replyToIsAudio: boolean("reply_to_is_audio").default(false),
  // Read
  read: boolean("read").default(false),
  deleted: boolean("deleted").default(false),
  reactions: text("reactions").default("{}"), // JSON string
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, lastSeen: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Contact = typeof contacts.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ChatWithMeta = Chat & { name?: string; avatarUrl?: string; lastMessage?: string; unread?: number };
