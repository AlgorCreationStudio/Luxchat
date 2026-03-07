import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/use-auth-store';
import { useCreateUser } from '@/hooks/use-api';
import { Button, Input } from '@/components/ui-library';
import { MessageSquareDashed } from 'lucide-react';

export default function AuthPage() {
  const [displayName, setDisplayName] = useState('');
  const [, setLocation] = useLocation();
  const login = useAuthStore(s => s.login);
  const createUser = useCreateUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    createUser.mutate({ displayName: displayName.trim() }, {
      onSuccess: (user) => {
        login(user);
        setLocation('/app');
      },
      onError: (err) => {
        alert(err.message); // In real app, use Toast
      }
    });
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center overflow-hidden">
      {/* Abstract Luxury Orbs */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px] mix-blend-screen animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[150px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }}></div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md p-8 sm:p-12 glass-panel rounded-3xl"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 mb-6 -rotate-6">
            <MessageSquareDashed className="w-8 h-8 text-primary-foreground rotate-6" />
          </div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">LuxChat</h1>
          <p className="text-primary font-medium tracking-[0.2em] uppercase text-xs">Premium Connect</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name..."
              className="h-14 text-lg"
              autoFocus
              maxLength={20}
            />
          </div>
          
          <Button 
            type="submit" 
            isLoading={createUser.isPending}
            disabled={!displayName.trim()}
            className="w-full h-14 text-lg mt-4 shadow-xl shadow-primary/20"
          >
            Enter Experience
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
