import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share, Plus, MoreVertical, Download } from 'lucide-react';

type Platform = 'ios' | 'android' | 'desktop' | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/.test(ua);
  const isStandalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) return null; // Already installed
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if user already dismissed this session
    const alreadyDismissed = sessionStorage.getItem('install-dismissed');
    if (alreadyDismissed) return;

    const p = detectPlatform();
    setPlatform(p);

    // For Android/Desktop: listen for the native beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (p === 'android' || p === 'desktop') {
        setTimeout(() => setVisible(true), 3000);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);

    // For iOS: show after 3s (no native prompt available)
    if (p === 'ios') {
      const t = setTimeout(() => setVisible(true), 3000);
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler); };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem('install-dismissed', '1');
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setVisible(false);
    }
  };

  if (!visible || !platform) return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Sheet sliding from bottom */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[201] max-w-md mx-auto"
          >
            <div className="bg-[#0f0f1a] border border-white/10 rounded-t-3xl p-6 shadow-2xl">
              {/* Handle */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <img src="/icon-192.png" alt="LuxChat" className="w-12 h-12 rounded-2xl shadow-lg" />
                  <div>
                    <h3 className="font-display font-bold text-white text-lg leading-tight">LuxChat</h3>
                    <p className="text-xs text-white/40 mt-0.5">Agregar a pantalla de inicio</p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Platform-specific instructions */}
              {platform === 'ios' && <IOSInstructions />}
              {platform === 'android' && <AndroidInstructions onInstall={handleInstall} hasPWAPrompt={!!deferredPrompt} />}
              {platform === 'desktop' && <DesktopInstructions onInstall={handleInstall} hasPWAPrompt={!!deferredPrompt} />}

              {/* Dismiss */}
              <button
                onClick={handleDismiss}
                className="w-full mt-4 py-2.5 text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                Ahora no
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function IOSInstructions() {
  const steps = [
    {
      icon: <Share className="w-5 h-5 text-[#c9a84c]" />,
      label: 'Toca el botón',
      detail: 'Compartir (⬆) en la barra de Safari',
    },
    {
      icon: <Plus className="w-5 h-5 text-[#2fcfb0]" />,
      label: '"Agregar a inicio"',
      detail: 'Desplázate hacia abajo en el menú',
    },
    {
      icon: <img src="/icon-192.png" className="w-5 h-5 rounded" />,
      label: 'Confirma',
      detail: 'Toca "Agregar" en la esquina superior derecha',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40 uppercase tracking-widest font-mono mb-4">Safari · iOS</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-4 bg-white/[0.04] rounded-2xl p-3.5">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            {s.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{s.label}</p>
            <p className="text-xs text-white/40 mt-0.5">{s.detail}</p>
          </div>
          <span className="ml-auto text-xs font-mono text-white/20">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function AndroidInstructions({ onInstall, hasPWAPrompt }: { onInstall: () => void; hasPWAPrompt: boolean }) {
  if (hasPWAPrompt) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-white/40 uppercase tracking-widest font-mono mb-4">Chrome · Android</p>
        <button
          onClick={onInstall}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#c9a84c] to-[#e6d089] text-[#0a0a12] font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.98]"
        >
          <Download className="w-5 h-5" />
          Instalar LuxChat
        </button>
        <p className="text-xs text-center text-white/30">Sin tiendas de apps. Rápido y sin anuncios.</p>
      </div>
    );
  }

  const steps = [
    {
      icon: <MoreVertical className="w-5 h-5 text-[#c9a84c]" />,
      label: 'Menú del navegador',
      detail: 'Toca los 3 puntos (⋮) arriba a la derecha',
    },
    {
      icon: <Plus className="w-5 h-5 text-[#2fcfb0]" />,
      label: '"Agregar a pantalla de inicio"',
      detail: 'O "Instalar aplicación"',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40 uppercase tracking-widest font-mono mb-4">Chrome · Android</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-4 bg-white/[0.04] rounded-2xl p-3.5">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            {s.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{s.label}</p>
            <p className="text-xs text-white/40 mt-0.5">{s.detail}</p>
          </div>
          <span className="ml-auto text-xs font-mono text-white/20">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function DesktopInstructions({ onInstall, hasPWAPrompt }: { onInstall: () => void; hasPWAPrompt: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40 uppercase tracking-widest font-mono mb-4">Chrome · Desktop</p>
      {hasPWAPrompt ? (
        <button
          onClick={onInstall}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#c9a84c] to-[#e6d089] text-[#0a0a12] font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Download className="w-5 h-5" />
          Instalar LuxChat
        </button>
      ) : (
        <div className="flex items-center gap-4 bg-white/[0.04] rounded-2xl p-3.5">
          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-[#c9a84c]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Instalar desde la barra</p>
            <p className="text-xs text-white/40 mt-0.5">Busca el ícono ⊕ en la barra de direcciones</p>
          </div>
        </div>
      )}
    </div>
  );
}
