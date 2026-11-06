import React from 'react';
import { GridNode, AttackType } from '../types/grid';
import { AlertTriangle, ShieldAlert, Cpu, RefreshCw, Zap, Flame } from 'lucide-react';

interface AttackSimulatorPanelProps {
  nodes: GridNode[];
  selectedNodeId: string | null;
  onSelectNodeId: (id: string) => void;
  onInjectAttack: (nodeId: string, attackType: AttackType) => void;
  onClearAttacks: () => void;
}

export const AttackSimulatorPanel: React.FC<AttackSimulatorPanelProps> = ({
  nodes,
  selectedNodeId,
  onSelectNodeId,
  onInjectAttack,
  onClearAttacks,
}) => {
  const activeNode = (nodes && nodes.length > 0) 
    ? (nodes.find((n) => n.id === selectedNodeId) || nodes[0]) 
    : null;

  if (!activeNode) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-[#090e18] p-6 text-center font-mono text-xs text-slate-400">
        INITIALIZING SMART GRID NODES FOR THREAT SANDBOX...
      </div>
    );
  }

  const attackScenarios: { type: AttackType; title: string; desc: string; severity: string }[] = [
    {
      type: 'STUXNET_HARMONIC_DRIFT',
      title: 'STUXNET SCADA HARMONIC DRIFT',
      desc: 'Injects fake frequency phase instructions forcing grid frequency to drift to 53.5Hz, raising Total Harmonic Distortion (THD) above 7%.',
      severity: 'CRITICAL'
    },
    {
      type: 'MITM_SPOOFING',
      title: 'BLE MITM PACKET SPOOFING',
      desc: 'Intercepts GATT characteristic 0x181A telemetry broadcasts and injects unauthorized voltage switching payloads.',
      severity: 'HIGH'
    },
    {
      type: 'QUANTUM_PROBE',
      title: 'QUANTUM DECRYPTION PROBE',
      desc: 'Simulates a quantum computer brute-forcing legacy RSA keys, testing Q-GRID Kyber-1024 post-quantum resistance.',
      severity: 'CRITICAL'
    },
    {
      type: 'DDOS_SYNC_FLOOD',
      title: 'SCADA BLE SYN FLOOD',
      desc: 'Floods the BLE edge gateway with 100,000 connection requests per second, causing signal RSSI degradation.',
      severity: 'HIGH'
    },
    {
      type: 'REPLAY_ATTACK',
      title: 'CAPACITOR REPLAY ATTACK',
      desc: 'Replays historical capacitor switching commands to trigger grid voltage surge oscillatory harmonics.',
      severity: 'MEDIUM'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Sandbox Header */}
      <div className="rounded-xl border border-rose-500/30 bg-[#090e18] p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-950 text-rose-400 border border-rose-500/40">
            <Flame className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-rose-400">EXHIBITION CYBER THREAT INJECTION SANDBOX</h3>
            <p className="text-xs text-slate-400 font-mono">
              Simulate real-world smart grid & SCADA cyber attacks to demonstrate post-quantum defense mechanics.
            </p>
          </div>
        </div>

        <button
          onClick={onClearAttacks}
          className="px-4 py-2 rounded-lg border border-emerald-500/50 bg-emerald-950/40 text-emerald-300 font-mono text-xs font-bold hover:bg-emerald-900/60 transition flex items-center gap-2 shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
          <span>RESTORE NOMINAL GRID STATE</span>
        </button>
      </div>

      {/* Node Selector for Attack Injection */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-4 shadow-xl">
        <label className="block text-xs font-mono text-slate-400 mb-2">
          SELECT TARGET SMART GRID SUBSTATION NODE FOR CYBER THREAT SIMULATION:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {nodes.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelectNodeId(n.id)}
              className={`p-3 rounded-lg border font-mono text-xs text-left transition ${
                activeNode.id === n.id
                  ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300 shadow-md'
                  : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <p className="font-bold truncate">{n.name}</p>
              <span className="text-[10px] text-slate-400">{n.macAddress}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Attack Vectors Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {attackScenarios.map((scenario) => {
          const isCurrentActive = activeNode.activeAttack === scenario.type;

          return (
            <div
              key={scenario.type}
              className={`rounded-xl p-5 transition flex flex-col justify-between shadow-lg ${
                isCurrentActive
                  ? 'cyber-panel-alert animate-flash-red border-2 border-rose-500'
                  : 'border border-slate-800 bg-[#090e18] hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between border-b border-slate-800 pb-2 mb-3">
                  <h4 className="font-bold text-sm text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    <span>{scenario.title}</span>
                  </h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    scenario.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-600' : 'bg-amber-950 text-amber-400'
                  }`}>
                    {scenario.severity}
                  </span>
                </div>

                <p className="text-xs text-slate-300 font-mono leading-relaxed mb-4">
                  {scenario.desc}
                </p>
              </div>

              <div className="flex gap-2">
                {isCurrentActive ? (
                  <button
                    onClick={() => onInjectAttack(activeNode.id, 'NONE')}
                    className="w-full py-2 px-3 rounded-lg border border-emerald-500 text-emerald-300 font-mono text-xs font-bold bg-emerald-950/40 hover:bg-emerald-900/60 transition"
                  >
                    NEUTRALIZE & DISARM ATTACK
                  </button>
                ) : (
                  <button
                    onClick={() => onInjectAttack(activeNode.id, scenario.type)}
                    className="w-full py-2 px-3 rounded-lg border border-rose-500 text-rose-300 font-mono text-xs font-bold bg-rose-950/40 hover:bg-rose-900/60 transition flex items-center justify-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    <span>LAUNCH ATTACK ON {activeNode.name}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
