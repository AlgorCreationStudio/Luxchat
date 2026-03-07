import React, { useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useAuthStore } from '@/store/use-auth-store';
import { Sidebar } from '@/components/layout/sidebar';
import { ChatWindow } from '@/components/chat/chat-window';
import { useChats } from '@/hooks/use-api';
import { MessageSquareDashed } from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/chat/:id');
  const { data: chats = [] } = useChats(user?.id);

  useEffect(() => {
    if (!user) setLocation('/');
  }, [user, setLocation]);

  if (!user) return null;

  const activeChat = chats.find(c => c.id === params?.id);
  const isChatOpen = match && params?.id;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar — full screen on mobile when no chat open, fixed width on desktop */}
      <div className={`
        ${isChatOpen ? 'hidden md:flex' : 'flex'}
        w-full md:w-80 h-full flex-col
      `}>
        <Sidebar />
      </div>

      {/* Chat area — full screen on mobile when chat open, flex-1 on desktop */}
      <main className={`
        ${isChatOpen ? 'flex' : 'hidden md:flex'}
        flex-1 h-full relative border-l border-border/50 shadow-[-20px_0_50px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex-col
      `}>
        {isChatOpen ? (
          <ChatWindow
            chatId={params!.id}
            chatName={activeChat?.name ?? 'Direct Message'}
            chatAvatar={activeChat?.avatarUrl}
            onBack={() => setLocation('/app')}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-card/20">
            <div className="w-32 h-32 rounded-full border border-white/5 bg-white/5 flex items-center justify-center mb-6 shadow-2xl">
              <MessageSquareDashed className="w-12 h-12 text-primary/40" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground mb-3">Welcome to LuxChat</h2>
            <p className="text-muted-foreground">Select a conversation or add a contact to begin.</p>
          </div>
        )}
      </main>
    </div>
  );
}
