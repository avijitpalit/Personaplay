import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, Check, X } from 'lucide-react';
import { usePwaInstall } from '../lib/usePwaInstall';
import { motion, AnimatePresence } from 'motion/react';

export default function PwaInstallButton() {
  const { isInstallable, isInstalled, isIOS, installApp } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = () => {
    if (isInstallable) {
      installApp();
    } else if (isIOS) {
      setShowIosGuide(true);
    } else {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-2 bg-gradient-to-r from-accent/20 to-pink-500/20 hover:from-accent/30 hover:to-pink-500/30 border border-accent/40 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg shadow-accent/10 transition-all cursor-pointer"
        title="Add to Home Screen as Standalone App"
      >
        <Download size={14} className="text-accent animate-bounce" />
        <span>Install App</span>
      </button>

      {/* Installation instructions modal for iOS or browsers without direct prompt */}
      <AnimatePresence>
        {showIosGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-6 rounded-3xl max-w-sm w-full border border-white/20 shadow-2xl relative"
            >
              <button
                onClick={() => setShowIosGuide(false)}
                className="absolute top-4 right-4 p-2 text-white/40 hover:text-white rounded-full bg-white/5 transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-accent/20 rounded-2xl text-accent border border-accent/30">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-white text-lg leading-tight">Install PersonaPlay</h3>
                  <p className="text-[11px] text-white/50">Run in standalone full-screen mode</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-white/80 my-4">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="p-1.5 bg-white/10 rounded-lg text-accent mt-0.5">
                    <Share size={14} />
                  </div>
                  <div>
                    <strong className="text-white block font-semibold">1. Tap the Share button</strong>
                    <span className="text-white/50 text-[11px]">In Safari or Chrome bottom/top toolbar</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="p-1.5 bg-white/10 rounded-lg text-accent mt-0.5">
                    <PlusSquare size={14} />
                  </div>
                  <div>
                    <strong className="text-white block font-semibold">2. Choose "Add to Home Screen"</strong>
                    <span className="text-white/50 text-[11px]">Scroll down the menu list</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="p-1.5 bg-white/10 rounded-lg text-accent mt-0.5">
                    <Check size={14} />
                  </div>
                  <div>
                    <strong className="text-white block font-semibold">3. Tap "Add"</strong>
                    <span className="text-white/50 text-[11px]">Launch directly from your home screen as a standalone app!</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIosGuide(false)}
                className="w-full py-2.5 bg-accent hover:bg-accent/90 text-white rounded-xl font-semibold text-xs transition-colors mt-2"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
