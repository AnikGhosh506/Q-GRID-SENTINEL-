import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg border border-amber-500/50 bg-[#090e18]/95 px-4 py-2.5 text-xs font-mono text-amber-300 shadow-2xl backdrop-blur-md">
      <WifiOff className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
      <div>
        <span className="font-bold block">OFFLINE EDGE MODE ACTIVE</span>
        <span className="text-[11px] text-slate-400">Serving cached PWA smart grid telemetry & Service Worker storage.</span>
      </div>
    </div>
  );
};
