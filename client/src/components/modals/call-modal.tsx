import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, Video, MicOff, VideoOff } from 'lucide-react';
import { Avatar } from '../ui-library';

export function CallModal({ isOpen, onClose, contactName }: { isOpen: boolean; onClose: () => void, contactName: string }) {
  const [status, setStatus] = useState<'connecting' | 'connected'>('connecting');
  const [micOn, setMicOn] = useState(true);
  const [vidOn, setVidOn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStatus('connecting');
      const timer = setTimeout(() => setStatus('connected'), 2500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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
                  {status === 'connecting' && (
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                  )}
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-display font-bold text-foreground tracking-wide">{contactName}</h2>
                  <p className="text-muted-foreground mt-2 uppercase tracking-widest text-sm font-medium">
                    {status === 'connecting' ? 'Calling...' : '00:00'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 bg-card/40 p-4 rounded-full border border-white/5 backdrop-blur-md">
                <button 
                  onClick={() => setMicOn(!micOn)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-white/10 hover:bg-white/20 text-foreground' : 'bg-destructive/20 text-destructive hover:bg-destructive/30'}`}
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
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${vidOn ? 'bg-white/10 hover:bg-white/20 text-foreground' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
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
