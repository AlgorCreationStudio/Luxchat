import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Search } from 'lucide-react';
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* 
            Desktop: centered modal
            Mobile: bottom sheet that sits above the keyboard
          */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="
              fixed z-50 w-full
              /* Mobile: anchor to bottom, no transform */
              bottom-0 left-0 right-0
              /* Desktop: center it */
              md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto
              md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md
            "
          >
            <div className="
              glass-panel flex flex-col gap-5 relative overflow-hidden
              /* Mobile: rounded top corners, safe-area bottom padding */
              rounded-t-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]
              /* Desktop: fully rounded */
              md:rounded-2xl md:p-8
            ">
              {/* Handle — mobile only */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto md:hidden" />

              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-semibold text-foreground">Agregar Contacto</h3>
                  <p className="text-sm text-muted-foreground">Busca por tag de LuxChat</p>
                </div>
              </div>

              {/* Tu tag */}
              {user?.tag && (
                <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2 text-xs text-muted-foreground border border-white/5">
                  <span>Tu tag:</span>
                  <span className="font-mono text-primary font-bold">{user.tag}</span>
                  <span className="text-muted-foreground/50 hidden sm:inline">— compártelo para que te encuentren</span>
                </div>
              )}

              {/* Search */}
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
                <Button onClick={handleSearch} isLoading={searching} className="px-4 flex-shrink-0">
                  <Search className="w-4 h-4" />
                </Button>
              </div>

              {/* Result */}
              {found && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-black/20 border border-white/5"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold flex-shrink-0">
                    {found.displayName[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{found.displayName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{found.tag}</p>
                  </div>
                  <Button onClick={handleSendRequest} isLoading={addContact.isPending} className="flex-shrink-0">
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
