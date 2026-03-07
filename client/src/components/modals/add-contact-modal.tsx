import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus } from 'lucide-react';
import { Button, Input } from '../ui-library';
import { useAuthStore } from '@/store/use-auth-store';
import { useAddContact } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

export function AddContactModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [contactId, setContactId] = useState('');
  const user = useAuthStore(s => s.user);
  const addContact = useAddContact();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId.trim() || !user) return;
    
    addContact.mutate(
      { userId: user.id, contactId: contactId.trim() },
      {
        onSuccess: () => {
          toast({ title: "Contact added successfully", className: "bg-primary text-primary-foreground border-none" });
          setContactId('');
          onClose();
        },
        onError: (err) => {
          toast({ title: "Failed to add contact", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-6"
          >
            <div className="glass-panel rounded-2xl p-8 flex flex-col gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              
              <button onClick={onClose} className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-semibold text-foreground">Add Contact</h3>
                  <p className="text-sm text-muted-foreground">Enter their LuxChat ID to connect</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wider">Contact ID (UUID)</label>
                  <Input 
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                    autoFocus
                  />
                </div>
                <Button type="submit" isLoading={addContact.isPending} className="w-full mt-2">
                  Send Request
                </Button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
