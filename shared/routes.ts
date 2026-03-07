import { z } from "zod";
import { users, chats, messages, contacts } from "./schema";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  users: {
    create: {
      method: "POST" as const,
      path: "/api/users" as const,
      input: z.object({ displayName: z.string() }),
      responses: { 201: z.custom<typeof users.$inferSelect>(), 400: errorSchemas.validation },
    },
    get: {
      method: "GET" as const,
      path: "/api/users/:id" as const,
      responses: { 200: z.custom<typeof users.$inferSelect>(), 404: errorSchemas.notFound },
    },
    contacts: {
      method: "GET" as const,
      path: "/api/users/:id/contacts" as const,
      responses: { 200: z.array(z.custom<typeof users.$inferSelect>()) },
    },
    addContact: {
      method: "POST" as const,
      path: "/api/users/:id/contacts" as const,
      input: z.object({ contactId: z.string() }),
      responses: { 201: z.custom<typeof contacts.$inferSelect>(), 400: errorSchemas.validation },
    },
    chats: {
      method: "GET" as const,
      path: "/api/users/:id/chats" as const,
      responses: { 200: z.array(z.custom<typeof chats.$inferSelect & { name?: string, avatarUrl?: string }>()) },
    }
  },
  chats: {
    create: {
      method: "POST" as const,
      path: "/api/chats" as const,
      input: z.object({ participantIds: z.array(z.string()) }),
      responses: { 201: z.custom<typeof chats.$inferSelect>(), 400: errorSchemas.validation },
    },
    getMessages: {
      method: "GET" as const,
      path: "/api/chats/:id/messages" as const,
      responses: { 200: z.array(z.custom<typeof messages.$inferSelect>()), 404: errorSchemas.notFound },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export const ws = {
  send: {
    message: z.object({ chatId: z.string(), content: z.string(), senderId: z.string(), type: z.string().optional() }),
    typing: z.object({ chatId: z.string(), userId: z.string(), isTyping: z.boolean() }),
  },
  receive: {
    message: z.object({ id: z.number(), chatId: z.string(), senderId: z.string(), content: z.string(), type: z.string(), createdAt: z.string() }),
    typing: z.object({ chatId: z.string(), userId: z.string(), isTyping: z.boolean() }),
  },
};
