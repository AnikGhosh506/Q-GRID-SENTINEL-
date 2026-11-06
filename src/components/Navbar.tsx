import React from 'react';
import { Shield, Bluetooth, Activity, Cpu, Lock, Sparkles, Database } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onConnectBluetooth: () => void;
  onRequestIOSGuide?: () => void;
  averageQber?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onConnectBluetooth,
  averageQber = 1.15,
}) => {
  const navItems = [
    { id: 'topology', label: 'Quantum 3D & Grid', icon: Activity },
    { id: 'oscilloscope', label: 'Harmonic Oscilloscope', icon: Cpu },
    { id: 'quantum', label: 'PQC & IDS Matrix', icon: Lock },
    { id: 'bluetooth', label: 'Web Bluetooth', icon: Bluetooth },
    { id: 'ai-sentinel', label: 'AI Sentinel', icon: Sparkles },
    { id: 'database', label: 'Cloud DB & Firelog', icon: Database },
  ];

  const isElevatedQber = averageQber > 11.0;

  return (
    <header
      id="main-navbar"
      className="sticky top-0 z-50 w-full border-b-2 border-[#00ff88]/50 bg-[#050914]/98 backdrop-blur-xl shadow-[0_4px_25px_rgba(0,255,136,0.18)] px-4 lg:px-8 py-3"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Top Row on Mobile / Left+Right on Desktop */}
        <div className="flex items-center justify-between gap-4">
          {/* Zone 1: Brand Wordmark with Shield Icon */}
          <a
            href="#topology"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('topology');
            }}
            className="flex items-center gap-2.5 text-lg sm:text-xl font-bold tracking-wider text-[#00ff88] glow-green whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#00ff88]/60 bg-emerald-950/70 shadow-[0_0_12px_rgba(0,255,136,0.35)]">
              <Shield className="h-4 w-4 text-[#00ff88]" />
            </span>
            <span>Q-GRID SENTINEL</span>
          </a>

          {/* Mobile/Tablet Action Button */}
          <div className="flex lg:hidden items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onConnectBluetooth}
              className="cyber-btn-primary px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Bluetooth className="h-3.5 w-3.5" />
              <span>Connect BLE</span>
            </button>
          </div>
        </div>

        {/* Zone 2: Always-Visible High-Contrast Navigation Bar */}
        <nav
          aria-label="Primary Dashboard Navigation"
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1 no-scrollbar"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-mono font-bold tracking-wide transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
                  isActive
                    ? 'bg-emerald-500/20 border-[#00ff88] text-[#00ff88] shadow-[0_0_14px_rgba(0,255,136,0.35)] glow-green'
                    : 'bg-[#0a1020]/90 border-slate-700/80 text-slate-200 hover:border-[#00ff88]/60 hover:text-[#00ff88] hover:bg-emerald-950/30'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isActive ? 'text-[#00ff88]' : 'text-cyan-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Desktop Primary Action Button (Connect Web Bluetooth Device Q-GRID_SENTINEL) */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <span
            className={`text-xs font-mono font-semibold tabular-nums ${
              isElevatedQber ? 'text-[#ff0055] glow-red' : 'text-emerald-300'
            }`}
          >
            GRID QBER: {averageQber.toFixed(2)}%
          </span>
          <button
            id="connect-ble-btn"
            type="button"
            onClick={onConnectBluetooth}
            className="cyber-btn-primary px-4 py-2 text-xs rounded-lg flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Bluetooth className="h-3.5 w-3.5" />
            <span>Connect Q-GRID_SENTINEL</span>
          </button>
        </div>
      </div>
    </header>
  );
};

