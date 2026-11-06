import React, { useEffect, useRef, useState } from 'react';
import { init3DScene, triggerEveAlert, setCameraPreset } from '../scene';
import { RotateCcw, ShieldAlert, Move } from 'lucide-react';

interface ThreeSceneCanvasProps {
  isAttacking: boolean;
  qber?: number;
  interactiveStage?: boolean;
  onTriggerSimulatedAttack?: () => void;
  onClearAttack?: () => void;
}

export const ThreeSceneCanvas: React.FC<ThreeSceneCanvasProps> = ({
  isAttacking,
  interactiveStage = false,
  onTriggerSimulatedAttack,
  onClearAttack,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeCam, setActiveCam] = useState<'default' | 'top' | 'eve' | 'channel'>('default');

  // Movable state for the 3D Stage container / floating HUD panel
  const [hudOffset, setHudOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingHud, setIsDraggingHud] = useState(false);
  const hudDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number }>({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const cleanup = init3DScene(containerRef.current);
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    triggerEveAlert(isAttacking);
  }, [isAttacking]);

  const handlePreset = (preset: 'default' | 'top' | 'eve' | 'channel') => {
    setActiveCam(preset);
    setCameraPreset(preset);
  };

  const handleHudPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    setIsDraggingHud(true);
    hudDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: hudOffset.x,
      origY: hudOffset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleHudPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingHud) return;
    e.stopPropagation();
    setHudOffset({
      x: hudDragRef.current.origX + (e.clientX - hudDragRef.current.startX),
      y: hudDragRef.current.origY + (e.clientY - hudDragRef.current.startY),
    });
  };

  const handleHudPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingHud) {
      e.stopPropagation();
      setIsDraggingHud(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  if (!interactiveStage) {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-0 w-full h-full opacity-45 pointer-events-auto"
        style={{ background: '#050811' }}
      />
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-emerald-500/30 bg-[#050811] shadow-2xl">
      {/* Top 3D Stage Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 bg-[#070b14]/95 px-4 py-3 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider text-emerald-400">
            3D QUANTUM CHANNEL TOPOLOGY — ALICE · BOB · EVE
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Drag 3D Scene to Orbit · Drag HUD to Move</span>
        </div>

        {/* Camera Angle Selector HUD */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handlePreset('default')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer whitespace-nowrap shrink-0 ${
              activeCam === 'default'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/80 border border-slate-800'
            }`}
          >
            Perspective Orbit
          </button>
          <button
            onClick={() => handlePreset('channel')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer whitespace-nowrap shrink-0 ${
              activeCam === 'channel'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/80 border border-slate-800'
            }`}
          >
            Alice–Bob Link
          </button>
          <button
            onClick={() => handlePreset('eve')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer whitespace-nowrap shrink-0 ${
              activeCam === 'eve'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/80 border border-slate-800'
            }`}
          >
            Focus Eve Node
          </button>
          <button
            onClick={() => handlePreset('top')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer whitespace-nowrap shrink-0 ${
              activeCam === 'top'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/80 border border-slate-800'
            }`}
          >
            Top-Down Grid
          </button>
        </div>
      </div>

      {/* 3D WebGL Viewport Container */}
      <div className="relative h-[420px] sm:h-[500px] w-full">
        <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

        {/* Movable Floating Node Legend HUD (Top-Left) */}
        <div
          onPointerDown={handleHudPointerDown}
          onPointerMove={handleHudPointerMove}
          onPointerUp={handleHudPointerUp}
          style={{
            transform: `translate3d(${hudOffset.x}px, ${hudOffset.y}px, 0)`,
          }}
          className={`absolute top-4 left-4 flex flex-col gap-2 rounded-lg border border-white/15 bg-black/75 p-3 backdrop-blur-md text-xs font-mono select-none touch-none ${
            isDraggingHud ? 'cursor-grabbing ring-2 ring-emerald-400/60' : 'cursor-grab'
          }`}
        >
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-1 text-[10px] text-emerald-400">
            <span className="flex items-center gap-1 font-semibold">
              <Move className="h-3 w-3" />
              <span>DRAG HUD</span>
            </span>
            {(hudOffset.x !== 0 || hudOffset.y !== 0) && (
              <button
                type="button"
                onClick={() => setHudOffset({ x: 0, y: 0 })}
                className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-cyan-400 font-bold">▲ ALICE [SUBSTATION TX]</span>
            <span className="text-slate-400">BB84 / Kyber Polarizer</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="text-emerald-400 font-bold">▲ BOB [GRID GATEWAY RX]</span>
            <span className="text-slate-400">Quantum Key Verifier</span>
          </div>
          <div className="flex items-center justify-between gap-6 border-t border-white/10 pt-1.5">
            <span className={`font-bold ${isAttacking ? 'text-rose-400 glow-red' : 'text-slate-400'}`}>
              {isAttacking ? '✖ EVE [ACTIVE INTERCEPTOR]' : '● EVE [PASSIVE / DORMANT]'}
            </span>
            <span className={isAttacking ? 'text-rose-300 font-bold' : 'text-slate-500'}>
              {isAttacking ? 'MITM PHOTON TAP' : 'Muted Gray (Idle)'}
            </span>
          </div>
        </div>

        {/* Bottom-Right Interactive 3D Eve Switch & Control HUD */}
        <div className="absolute bottom-4 right-4 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-black/80 px-3.5 py-2.5 backdrop-blur-md text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-semibold">EVE ATTACK SWITCH:</span>
            <button
              type="button"
              role="switch"
              aria-checked={isAttacking}
              onClick={isAttacking ? onClearAttack : onTriggerSimulatedAttack}
              className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                isAttacking
                  ? 'bg-[#ff0055]/30 border-[#ff0055]'
                  : 'bg-emerald-500/20 border-[#00ff88]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                  isAttacking ? 'translate-x-6 bg-[#ff0055]' : 'translate-x-1 bg-[#00ff88]'
                }`}
              />
            </button>
          </div>

          {isAttacking ? (
            <button
              type="button"
              onClick={onClearAttack}
              className="cyber-btn-primary px-3 py-1.5 rounded text-xs font-mono cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Eve (Nominal)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onTriggerSimulatedAttack}
              className="cyber-btn-danger px-3 py-1.5 rounded text-xs font-mono cursor-pointer flex items-center gap-1.5"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Trigger Eve Red Alert</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
