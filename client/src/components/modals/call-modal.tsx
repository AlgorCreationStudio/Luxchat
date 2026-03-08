import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, Video, MicOff, VideoOff } from 'lucide-react';
import { Avatar } from '../ui-library';

export function CallModal({ 
  isOpen, 
  onClose, 
  contactName,
  callStatus,
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  contactName: string;
  callStatus?: 'calling' | 'connected' | 'rejected' | 'ended';
}) {
  const [micOn, setMicOn] = useState(true);
  const [vidOn, setVidOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const status = callStatus ?? 'calling';

  useEffect(() => {
    if (status === 'connected') setElapsed(0);
  }, [status]);

  useEffect(() => {
    if (status !== 'connected') return;
    const interval = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === 'rejected' || status === 'ended') {
      // Longer delay on mobile to let user see the status before dismissing
      const t = setTimeout(onClose, 2800);
      return () => clearTimeout(t);
    }
  }, [status, onClose]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const statusLabel = {
    calling: 'Llamando...',
    connected: formatTime(elapsed),
    rejected: 'Llamada rechazada',
    ended: 'Llamada finalizada',
  }[status];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none flex justify-center items-center">
               <div className="w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[100px] animate-pulse"></div>
            </div>

            <motion.div
              initial={{ scale: 0.9, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 50, opacity: 0 }}
              className="relative z-10 flex flex-col items-center gap-12 w-full max-w-sm"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Avatar fallback={contactName} size="xl" className="w-32 h-32 text-4xl ring-4 ring-primary/30" />
                  {status === 'calling' && (
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                  )}
                  {status === 'connected' && (
                    <div className="absolute inset-0 rounded-full border-4 border-green-500/50 animate-pulse"></div>
                  )}
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-display font-bold text-foreground tracking-wide">{contactName}</h2>
                  <p className={`mt-2 uppercase tracking-widest text-sm font-medium ${
                    status === 'rejected' || status === 'ended' 
                      ? 'text-destructive' 
                      : status === 'connected' 
                        ? 'text-green-400'
                        : 'text-muted-foreground'
                  }`}>
                    {statusLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 bg-card/40 p-4 rounded-full border border-white/5 backdrop-blur-md">
                <button 
                  onClick={() => setMicOn(!micOn)}
                  disabled={status !== 'connected'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${micOn ? 'bg-white/10 hover:bg-white/20 text-foreground' : 'bg-destructive/20 text-destructive hover:bg-destructive/30'}`}
                >
                  {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                
                <button 
                  onClick={onClose}
                  className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 hover:scale-105 transition-all shadow-lg shadow-destructive/30"
                >
                  <PhoneOff className="w-8 h-8 text-white" />
                </button>
                
                <button 
                  onClick={() => setVidOn(!vidOn)}
                  disabled={status !== 'connected'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${vidOn ? 'bg-white/10 hover:bg-white/20 text-foreground' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                >
                  {vidOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
