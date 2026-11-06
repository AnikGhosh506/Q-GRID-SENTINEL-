import React, { useEffect, useRef } from 'react';
import { GridNode } from '../types/grid';
import { Activity, Radio, Cpu, BarChart2 } from 'lucide-react';

interface GridOscilloscopeProps {
  selectedNode: GridNode;
}

export const GridOscilloscope: React.FC<GridOscilloscopeProps> = ({ selectedNode }) => {
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!selectedNode) return;
    const waveCanvas = waveCanvasRef.current;
    const fftCanvas = fftCanvasRef.current;
    if (!waveCanvas || !fftCanvas) return;

    const waveCtx = waveCanvas.getContext('2d');
    const fftCtx = fftCanvas.getContext('2d');
    if (!waveCtx || !fftCtx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      // 1. Render Waveform
      const w = waveCanvas.width;
      const h = waveCanvas.height;
      waveCtx.clearRect(0, 0, w, h);

      // Grid Lines
      waveCtx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      waveCtx.lineWidth = 1;
      for (let x = 0; x < w; x += 30) {
        waveCtx.beginPath();
        waveCtx.moveTo(x, 0);
        waveCtx.lineTo(x, h);
        waveCtx.stroke();
      }
      for (let y = 0; y < h; y += 20) {
        waveCtx.beginPath();
        waveCtx.moveTo(0, y);
        waveCtx.lineTo(w, y);
        waveCtx.stroke();
      }

      // Center Line
      waveCtx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
      waveCtx.beginPath();
      waveCtx.moveTo(0, h / 2);
      waveCtx.lineTo(w, h / 2);
      waveCtx.stroke();

      // Sine Wave Generation with Attack Distortion Physics
      waveCtx.beginPath();
      waveCtx.lineWidth = 2.5;

      const isAttacked = selectedNode.activeAttack !== 'NONE';
      waveCtx.strokeStyle = isAttacked ? '#ff0055' : '#00f0ff';

      phase += (selectedNode.frequency / 50.0) * 0.12;

      for (let x = 0; x < w; x++) {
        const normX = (x / w) * Math.PI * 8;
        let yVal = Math.sin(normX + phase) * (h * 0.35);

        // Inject harmonic distortion (THD)
        if (selectedNode.thd > 2.0) {
          const thirdHarmonic = Math.sin(normX * 3 + phase * 2) * (selectedNode.thd * 2.5);
          const fifthHarmonic = Math.sin(normX * 5 + phase * 3) * (selectedNode.thd * 1.2);
          yVal += thirdHarmonic + fifthHarmonic;
        }

        if (selectedNode.activeAttack === 'STUXNET_HARMONIC_DRIFT') {
          // Add high-frequency noise & square clipping
          yVal += (Math.random() - 0.5) * 18;
        }

        const screenY = h / 2 - yVal;
        if (x === 0) waveCtx.moveTo(x, screenY);
        else waveCtx.lineTo(x, screenY);
      }
      waveCtx.stroke();

      // 2. Render FFT Spectrum Bars
      const fw = fftCanvas.width;
      const fh = fftCanvas.height;
      fftCtx.clearRect(0, 0, fw, fh);

      const numBars = 16;
      const barWidth = fw / numBars - 4;

      for (let i = 0; i < numBars; i++) {
        let barHeight = Math.sin(i * 0.5 + phase) * (fh * 0.4) + fh * 0.3;
        
        if (i === 1) barHeight = fh * 0.85; // Fundamental 50Hz component
        if (selectedNode.thd > 3.0 && (i === 3 || i === 5)) {
          barHeight += (selectedNode.thd / 10) * fh * 0.5; // Harmonic spikes
        }

        const barX = i * (barWidth + 4) + 2;
        const barY = fh - barHeight;

        fftCtx.fillStyle = isAttacked ? '#ff0055' : i === 1 ? '#00f0ff' : '#00ff88';
        fftCtx.fillRect(barX, barY, barWidth, barHeight);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [selectedNode]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Primary Oscilloscope Canvas */}
      <div className="lg:col-span-2 rounded-xl border border-cyan-500/20 bg-[#090e18] p-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-3">
          <div className="flex items-center gap-2 text-cyan-400">
            <Activity className="h-5 w-5 animate-pulse" />
            <h3 className="font-bold tracking-wider text-sm sm:text-base">
              REAL-TIME VOLTAGE HARMONIC OSCILLOSCOPE — {selectedNode.name}
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-400">50.00Hz BASELINE</span>
        </div>

        <canvas
          ref={waveCanvasRef}
          width={800}
          height={260}
          className="w-full h-[220px] rounded border border-slate-800 bg-[#05070c]"
        />

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="rounded bg-slate-900/60 p-2.5 border border-slate-800">
            <span className="text-slate-400">Grid Voltage:</span>
            <p className="text-base font-bold text-cyan-400">{selectedNode.voltage} kV</p>
          </div>
          <div className="rounded bg-slate-900/60 p-2.5 border border-slate-800">
            <span className="text-slate-400">System Frequency:</span>
            <p className="text-base font-bold text-cyan-400">{selectedNode.frequency} Hz</p>
          </div>
          <div className="rounded bg-slate-900/60 p-2.5 border border-slate-800">
            <span className="text-slate-400">Harmonic Distortion:</span>
            <p className={`text-base font-bold ${selectedNode.thd > 3.0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {selectedNode.thd}%
            </p>
          </div>
          <div className="rounded bg-slate-900/60 p-2.5 border border-slate-800">
            <span className="text-slate-400">Waveform State:</span>
            <p className={`text-xs font-bold ${selectedNode.activeAttack !== 'NONE' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {selectedNode.activeAttack !== 'NONE' ? 'DISTORTED / ATTACK' : 'CLEAN SINE WAVE'}
            </p>
          </div>
        </div>
      </div>

      {/* FFT Spectrum Analyzer Sidebar */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-4 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 border-b border-cyan-500/20 pb-3 mb-3">
            <BarChart2 className="h-5 w-5" />
            <h3 className="font-bold tracking-wider text-sm sm:text-base">FFT HARMONIC SPECTRUM</h3>
          </div>

          <canvas
            ref={fftCanvasRef}
            width={340}
            height={180}
            className="w-full h-[180px] rounded border border-slate-800 bg-[#05070c]"
          />
        </div>

        <div className="mt-4 space-y-2 text-xs font-mono text-slate-300">
          <div className="flex justify-between border-b border-slate-800 pb-1">
            <span className="text-slate-400">Fundamental (H1 50Hz):</span>
            <span className="text-cyan-400 font-bold">100.0%</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-1">
            <span className="text-slate-400">3rd Harmonic (H3 150Hz):</span>
            <span className={selectedNode.thd > 2.0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
              {(selectedNode.thd * 0.6).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-1">
            <span className="text-slate-400">5th Harmonic (H5 250Hz):</span>
            <span className={selectedNode.thd > 4.0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
              {(selectedNode.thd * 0.4).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
