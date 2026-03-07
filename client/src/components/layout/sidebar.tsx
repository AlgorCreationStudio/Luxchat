import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { MessageSquare, Users, Plus, LogOut, Copy, Check, Bell, UserCheck, UserX } from 'lucide-react';
import { useAuthStore } from '@/store/use-auth-store';
import { useContacts, useChats, useCreateChat, usePendingRequests, useAcceptContact, useRejectContact } from '@/hooks/use-api';
import { Avatar, Button } from '../ui-library';
import { AddContactModal } from '../modals/add-contact-modal';
import { useToast } from '@/hooks/use-toast';

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'requests'>('chats');
  const [isAddContactOpen, setAddContactOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();

  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const { toast } = useToast();

  const { data: contacts = [], isLoading: loadingContacts } = useContacts(user?.id);
  const { data: chats = [], isLoading: loadingChats } = useChats(user?.id);
  const { data: pendingRequests = [] } = usePendingRequests(user?.id);
  const createChat = useCreateChat();
  const acceptContact = useAcceptContact();
  const rejectContact = useRejectContact();

  const handleCopyTag = () => {
    const tagToCopy = user?.tag || user?.id || '';
    navigator.clipboard.writeText(tagToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => { logout(); setLocation('/'); };

  const startChat = (contactId: string) => {
    if (!user) return;
    createChat.mutate([user.id, contactId], {
      onSuccess: (chat) => setLocation(`/chat/${chat.id}`)
    });
  };

  const handleAccept = (requestId: number) => {
    if (!user) return;
    acceptContact.mutate({ userId: user.id, requestId }, {
      onSuccess: () => toast({ title: "Contacto aceptado ✓", className: "bg-primary text-primary-foreground border-none" })
    });
  };

  const handleReject = (requestId: number) => {
    if (!user) return;
    rejectContact.mutate({ userId: user.id, requestId });
  };

  const totalUnread = chats.reduce((sum, c) => sum + (c.unread || 0), 0);

  return (
    <div className="w-full md:w-80 h-full bg-card border-r border-border flex flex-col relative z-20">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border/50 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold gold-gradient-text tracking-wider">LUXCHAT</h1>
          <button onClick={handleLogout} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 bg-black/20 p-3 rounded-2xl border border-white/5">
          <Avatar src={user?.avatarUrl} fallback={user?.displayName || "?"} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{user?.displayName}</p>
            <div
              onClick={handleCopyTag}
              className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors mt-0.5"
              title="Copiar tag"
            >
              <span className="font-mono font-bold text-primary/70">
                {user?.tag ? `#${user.tag}` : user?.id?.slice(0, 8).toUpperCase()}
              </span>
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-3 pb-2 gap-1">
        {([
          { key: 'chats', icon: MessageSquare, label: 'Chats', badge: totalUnread },
          { key: 'contacts', icon: Users, label: 'Contactos', badge: 0 },
          { key: 'requests', icon: Bell, label: 'Solicitudes', badge: pendingRequests.length },
        ] as const).map(({ key, icon: Icon, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all relative ${activeTab === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
          >
            <div className="flex items-center justify-center gap-1 relative">
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{label}</span>
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            {activeTab === key && (
              <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* CHATS TAB */}
        {activeTab === 'chats' && (
          loadingChats ? (
            <p className="text-sm text-muted-foreground text-center py-8 animate-pulse">Cargando...</p>
          ) : chats.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">Sin chats. Ve a contactos para empezar.</p>
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setLocation(`/chat/${chat.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
              >
                <Avatar fallback={chat.name || "Chat"} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors text-sm">
                    {chat.name || "Direct Message"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{chat.lastMessage || "Toca para abrir"}</p>
                </div>
                {(chat.unread ?? 0) > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                    {(chat.unread ?? 0) > 9 ? '9+' : chat.unread}
                  </span>
                )}
              </div>
            ))
          )
        )}

        {/* CONTACTS TAB */}
        {activeTab === 'contacts' && (
          <>
            <Button
              variant="outline"
              className="w-full mb-3 border-dashed border-white/20 hover:border-primary/50 hover:text-primary bg-transparent text-muted-foreground text-sm"
              onClick={() => setAddContactOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" /> Agregar Contacto
            </Button>
            {loadingContacts ? (
              <p className="text-sm text-muted-foreground text-center py-8 animate-pulse">Cargando...</p>
            ) : contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin contactos aún.</p>
            ) : (
              contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
                  onClick={() => startChat(contact.id)}
                >
                  <div className="relative">
                    <Avatar fallback={contact.displayName} src={contact.avatarUrl} />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card ${contact.status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate group-hover:text-secondary transition-colors text-sm">{contact.displayName}</p>
                    <p className="text-xs font-mono text-muted-foreground/70">{contact.tag ? `#${contact.tag}` : ''}</p>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          pendingRequests.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Sin solicitudes pendientes</p>
            </div>
          ) : (
            pendingRequests.map((req) => (
              <motion.div
                key={req.requestId}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/5"
              >
                <Avatar fallback={req.displayName} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{req.displayName}</p>
                  <p className="text-xs font-mono text-muted-foreground/70">{req.tag ? `#${req.tag}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleAccept(req.requestId)}
                    className="w-8 h-8 rounded-full bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all"
                  >
                    <UserCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReject(req.requestId)}
                    className="w-8 h-8 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white flex items-center justify-center transition-all"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )
        )}
      </div>

      <AddContactModal isOpen={isAddContactOpen} onClose={() => setAddContactOpen(false)} />
    </div>
  );
}
