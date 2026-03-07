import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { MessageSquare, Users, Plus, LogOut, Copy, Check } from 'lucide-react';
import { useAuthStore } from '@/store/use-auth-store';
import { useContacts, useChats, useCreateChat } from '@/hooks/use-api';
import { Avatar, Button } from '../ui-library';
import { AddContactModal } from '../modals/add-contact-modal';

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  const [isAddContactOpen, setAddContactOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();
  
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  
  const { data: contacts = [], isLoading: loadingContacts } = useContacts(user?.id);
  const { data: chats = [], isLoading: loadingChats } = useChats(user?.id);
  const createChat = useCreateChat();

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const startChat = (contactId: string) => {
    // Basic check: see if we already have a 1-on-1 chat with this contact
    // In a real app we'd have better logic, but here we just create or navigate
    if (!user) return;
    createChat.mutate([user.id, contactId], {
      onSuccess: (chat) => {
        setLocation(`/chat/${chat.id}`);
      }
    });
  };

  return (
    <div className="w-80 h-full bg-card border-r border-border flex flex-col relative z-20">
      {/* User Profile Header */}
      <div className="p-6 border-b border-border/50 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold gold-gradient-text tracking-wider">LUXCHAT</h1>
          <button onClick={handleLogout} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors" title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-4 bg-black/20 p-3 rounded-2xl border border-white/5">
          <Avatar src={user?.avatarUrl} fallback={user?.displayName || "?"} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{user?.displayName}</p>
            <div 
              onClick={handleCopyId}
              className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors mt-0.5"
            >
              <span className="truncate max-w-[120px]">{user?.id}</span>
              {copied ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 pt-4 pb-2 gap-2">
        <button 
          onClick={() => setActiveTab('chats')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all relative ${activeTab === 'chats' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Chats
          </div>
          {activeTab === 'chats' && (
            <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button 
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all relative ${activeTab === 'contacts' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />
            Contacts
          </div>
          {activeTab === 'contacts' && (
            <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeTab === 'chats' ? (
          loadingChats ? (
            <p className="text-sm text-muted-foreground text-center py-8 animate-pulse">Loading chats...</p>
          ) : chats.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">No chats yet. Go to contacts to start a conversation.</p>
            </div>
          ) : (
            chats.map((chat) => (
              <div 
                key={chat.id} 
                onClick={() => setLocation(`/chat/${chat.id}`)}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
              >
                <Avatar fallback={chat.name || "Chat"} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{chat.name || "Direct Message"}</p>
                  <p className="text-xs text-muted-foreground truncate">Tap to open chat</p>
                </div>
              </div>
            ))
          )
        ) : (
          <>
            <Button variant="outline" className="w-full mb-4 border-dashed border-white/20 hover:border-primary/50 hover:text-primary bg-transparent text-muted-foreground" onClick={() => setAddContactOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Contact
            </Button>
            {loadingContacts ? (
              <p className="text-sm text-muted-foreground text-center py-8 animate-pulse">Loading contacts...</p>
            ) : contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Your contact list is empty.</p>
            ) : (
              contacts.map((contact) => (
                <div 
                  key={contact.id} 
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group"
                  onClick={() => startChat(contact.id)}
                >
                  <Avatar fallback={contact.displayName} src={contact.avatarUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate group-hover:text-secondary transition-colors">{contact.displayName}</p>
                    <p className="text-xs text-secondary/70 truncate capitalize tracking-wider">{contact.status || 'Offline'}</p>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      <AddContactModal isOpen={isAddContactOpen} onClose={() => setAddContactOpen(false)} />
    </div>
  );
}
