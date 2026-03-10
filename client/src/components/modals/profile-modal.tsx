import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/use-auth-store';
import { Avatar, Button, Input } from '../ui-library';
import { useToast } from '@/hooks/use-toast';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Imagen muy grande', description: 'Máximo 2MB', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const body: any = {};
      if (displayName.trim() && displayName.trim() !== user.displayName) body.displayName = displayName.trim();
      if (avatarPreview) body.avatarUrl = avatarPreview;

      if (Object.keys(body).length === 0) { onClose(); return; }

      const res = await fetch(`/api/users/${user.id}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to update profile');

      const updatedUser = await res.json();
      setUser(updatedUser);
      toast({ title: 'Perfil actualizado ✓', className: 'bg-primary text-primary-foreground border-none' });
      onClose();
    } catch {
      toast({ title: 'Error al actualizar perfil', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="w-full max-w-sm bg-card border border-white/10 rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-foreground">Mi perfil</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar upload */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                <Avatar
                  src={avatarPreview ?? user?.avatarUrl}
                  fallback={user?.displayName ?? '?'}
                  size="xl"
                  className="w-24 h-24 text-3xl"
                />
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-7 h-7 text-white" />
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <p className="text-xs text-muted-foreground mt-2">Toca para cambiar foto</p>
            </div>

            {/* Name */}
            <div className="space-y-2 mb-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">Nombre</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre..."
                maxLength={30}
                className="h-11"
              />
            </div>

            {/* Tag (read-only) */}
            <div className="space-y-2 mb-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">Tu tag</label>
              <div className="h-11 bg-black/20 border border-white/10 rounded-xl flex items-center px-4">
                <span className="font-mono text-primary font-bold">#{user?.tag}</span>
                <span className="text-xs text-muted-foreground ml-2">— compártelo para que te agreguen</span>
              </div>
            </div>

            <Button onClick={handleSave} isLoading={loading} className="w-full h-11">
              <Check className="w-4 h-4 mr-2" /> Guardar cambios
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
