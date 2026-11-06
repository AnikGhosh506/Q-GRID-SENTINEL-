import React from 'react';
import { Smartphone, X, Share, PlusSquare } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-cyan-500/40 bg-[#090e18] p-6 shadow-2xl font-mono text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-cyan-500/20 pb-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-500/40">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-cyan-300">INSTALL Q-GRID SENTINEL</h3>
            <span className="text-xs text-slate-400">iOS Safari & Mobile PWA Guide</span>
          </div>
        </div>

        <div className="space-y-4 text-xs leading-relaxed text-slate-300">
          <div className="flex items-start gap-3 p-3 rounded bg-slate-900/80 border border-slate-800">
            <Share className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block">Step 1: Tap Share Icon</strong>
              <span>In the Safari browser bottom toolbar, tap the <strong>Share</strong> button.</span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded bg-slate-900/80 border border-slate-800">
            <PlusSquare className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block">Step 2: Add to Home Screen</strong>
              <span>Scroll down the action sheet and select <strong>Add to Home Screen</strong>.</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            Q-GRID SENTINEL will run in standalone high-performance exhibition mode with full offline caching.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded bg-cyan-600 text-white font-bold text-xs hover:bg-cyan-500 transition"
        >
          GOT IT
        </button>
      </div>
    </div>
  );
};
