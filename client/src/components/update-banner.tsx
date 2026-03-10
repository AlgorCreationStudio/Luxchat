import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';

const POLL_INTERVAL = 10_000; // 10 seconds

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentVersion = useRef<string | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    // Method 1: poll /api/version
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();

        if (currentVersion.current === null) {
          currentVersion.current = version;
        } else if (version !== currentVersion.current && !dismissed.current) {
          // Confirm the new version a second time after a delay to ensure
          // Railway has fully booted before showing the update banner
          setTimeout(async () => {
            try {
              const res2 = await fetch('/api/version', { cache: 'no-store' });
              if (!res2.ok) return;
              const { version: v2 } = await res2.json();
              if (v2 !== currentVersion.current && !dismissed.current) {
                setUpdateAvailable(true);
              }
            } catch {}
          }, 5000);
        }
      } catch {
        // Offline or server down — ignore
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL);

    // Method 2: Service Worker update event (more reliable on mobile PWA)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller && !dismissed.current) {
              setUpdateAvailable(true);
            }
          });
        });
      }).catch(() => {});
    }

    return () => clearInterval(interval);
  }, []);

  const handleUpdate = async () => {
    // Wait for Railway server to be fully ready before reloading
    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (res.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    window.location.reload();
  };

  const handleDismiss = () => {
    dismissed.current = true;
    setUpdateAvailable(false);
  };

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="fixed top-0 left-0 right-0 z-[300] flex justify-center px-4 pt-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-3 bg-[#1a1a2e] border border-primary/30 rounded-2xl px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl max-w-sm w-full">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4 text-primary animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Nueva versión disponible</p>
              <p className="text-xs text-muted-foreground">Actualiza para ver los cambios</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleUpdate}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Actualizar
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
