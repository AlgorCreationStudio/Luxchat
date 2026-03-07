import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Search, Check, User } from 'lucide-react';
import { Button, Input } from '../ui-library';
import { useAuthStore } from '@/store/use-auth-store';
import { useAddContact } from '@/hooks/use-api';
import { useWebSocket } from '@/hooks/use-websocket';
import { useToast } from '@/hooks/use-toast';

export function AddContactModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tag, setTag] = useState('');
  const [found, setFound] = useState<{ id: string; displayName: string; tag?: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const user = useAuthStore(s => s.user);
  const addContact = useAddContact();
  const { sendContactRequestNotif } = useWebSocket();
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!tag.trim()) return;
    setSearching(true);
    setFound(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/users/by-tag/${tag.trim().toUpperCase()}`);
      if (res.ok) {
        const u = await res.json();
        if (u.id === user?.id) {
          setNotFound(true);
        } else {
          setFound(u);
        }
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = () => {
    if (!found || !user) return;
    addContact.mutate(
      { userId: user.id, contactId: found.id },
      {
        onSuccess: () => {
          // Notify the other user in real-time
          sendContactRequestNotif(found.id);
          toast({ title: "Solicitud enviada ✓", className: "bg-primary text-primary-foreground border-none" });
          setTag('');
          setFound(null);
          onClose();
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleClose = () => {
    setTag('');
    setFound(null);
    setNotFound(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-6"
          >
            <div className="glass-panel rounded-2xl p-8 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <button onClick={handleClose} className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-semibold text-foreground">Agregar Contacto</h3>
                  <p className="text-sm text-muted-foreground">Busca por tag de LuxChat</p>
                </div>
              </div>

              {/* Tag info */}
              {user?.tag && (
                <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2 text-xs text-muted-foreground border border-white/5">
                  <span>Tu tag:</span>
                  <span className="font-mono text-primary font-bold">{user.tag}</span>
                  <span className="text-muted-foreground/50">— compártelo para que te encuentren</span>
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={tag}
                  onChange={(e) => { setTag(e.target.value.toUpperCase()); setFound(null); setNotFound(false); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Ej: AB12CD"
                  className="font-mono tracking-widest"
                  maxLength={8}
                  autoFocus
                />
                <Button onClick={handleSearch} isLoading={searching} className="px-4">
                  <Search className="w-4 h-4" />
                </Button>
              </div>

              {/* Result */}
              {found && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-black/20 border border-white/5"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {found.displayName[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{found.displayName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{found.tag}</p>
                  </div>
                  <Button onClick={handleSendRequest} isLoading={addContact.isPending} size="sm">
                    Enviar
                  </Button>
                </motion.div>
              )}

              {notFound && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive text-center">
                  No se encontró ningún usuario con ese tag
                </motion.p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
