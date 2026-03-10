import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { User, Chat, Message } from "@shared/schema";

function getAuthHeaders() {
  try {
    const stored = localStorage.getItem('luxchat-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      if (token) return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    }
  } catch {}
  return { 'Content-Type': 'application/json' };
}

// --- USERS ---
export function useCreateUser() {
  return useMutation({
    mutationFn: async (data: { displayName: string }) => {
      const res = await fetch(api.users.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to create user"); }
      return res.json() as Promise<User>;
    },
  });
}

export function useUser(id?: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.users.get.path, { id: id! }));
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json() as Promise<User>;
    },
    enabled: !!id,
  });
}

export function useUserByTag(tag?: string) {
  return useQuery({
    queryKey: ["user-by-tag", tag],
    queryFn: async () => {
      const res = await fetch(`/api/users/by-tag/${tag}`);
      if (!res.ok) throw new Error("User not found");
      return res.json() as Promise<User>;
    },
    enabled: !!tag && tag.length >= 4,
    retry: false,
  });
}

// --- CONTACTS ---
export function useContacts(userId?: string) {
  return useQuery({
    queryKey: ["contacts", userId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.users.contacts.path, { id: userId! }));
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json() as Promise<User[]>;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });
}

export function usePendingRequests(userId?: string) {
  return useQuery({
    queryKey: ["pending-requests", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/pending-requests`);
      if (!res.ok) throw new Error("Failed to fetch pending requests");
      return res.json() as Promise<(User & { requestId: number })[]>;
    },
    enabled: !!userId,
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  });
}

export function useAddContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, contactId }: { userId: string; contactId: string }) => {
      const res = await fetch(buildUrl(api.users.addContact.path, { id: userId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to add contact"); }
      return res.json();
    },
    onSuccess: (_, { userId }) => qc.invalidateQueries({ queryKey: ["contacts", userId] }),
  });
}

export function useAcceptContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, requestId }: { userId: string; requestId: number }) => {
      const res = await fetch(`/api/users/${userId}/contacts/${requestId}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to accept");
      return res.json();
    },
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ["pending-requests", userId] });
      qc.invalidateQueries({ queryKey: ["contacts", userId] });
    },
  });
}

export function useRejectContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, requestId }: { userId: string; requestId: number }) => {
      const res = await fetch(`/api/users/${userId}/contacts/${requestId}/reject`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to reject");
      return res.json();
    },
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ["pending-requests", userId] });
    },
  });
}

// --- CHATS ---
export function useChats(userId?: string) {
  return useQuery({
    queryKey: ["chats", userId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.users.chats.path, { id: userId! }));
      if (!res.ok) throw new Error("Failed to fetch chats");
      return res.json() as Promise<(Chat & { name?: string; avatarUrl?: string; lastMessage?: string; unread?: number })[]>;
    },
    enabled: !!userId,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (participantIds: string[]) => {
      const res = await fetch(api.chats.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds }),
      });
      if (!res.ok) throw new Error("Failed to create chat");
      return res.json() as Promise<Chat>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chats"] }),
  });
}

// --- MESSAGES ---
export function useMessages(chatId?: string) {
  return useQuery({
    queryKey: ["messages", chatId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.chats.getMessages.path, { id: chatId! }));
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json() as Promise<Message[]>;
    },
    enabled: !!chatId,
    staleTime: 0,
  });
}

export function useMarkRead() {
  return useMutation({
    mutationFn: async ({ chatId, userId }: { chatId: string; userId: string }) => {
      await fetch(`/api/chats/${chatId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    },
  });
}
