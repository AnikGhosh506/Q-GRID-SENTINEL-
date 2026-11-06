import React, { useState, useEffect } from 'react';
import { GridNode } from '../types/grid';
import { bluetoothService } from '../services/bluetooth';
import { QBER_CRITICAL_THRESHOLD } from '../services/edgeAI';
import { Shield, Slash, AlertOctagon, CheckCircle2, Power, Zap } from 'lucide-react';

interface FirewallRulesPanelProps {
  nodes: GridNode[];
  onToggleIsolation: (nodeId: string) => void;
  onRotateAllKeys: () => void;
}

export const FirewallRulesPanel: React.FC<FirewallRulesPanelProps> = ({
  nodes,
  onToggleIsolation,
  onRotateAllKeys,
}) => {
  const initialConfig = bluetoothService.getFirewallConfig();
  const [automatedMitigation, setAutomatedMitigation] = useState(initialConfig.automatedMitigation);
  const [pllFrequencyLock, setPllFrequencyLock] = useState(initialConfig.pllFrequencyLock);
  const [enforceStrictGatt, setEnforceStrictGatt] = useState(initialConfig.enforceStrictGatt);
  const [enablePqcKyber, setEnablePqcKyber] = useState(initialConfig.enablePqcKyber);
  const [blockedMacs, setBlockedMacs] = useState<string[]>(['FF:EE:DD:00:11:22']);
  const [newMacInput, setNewMacInput] = useState('');
  const [statusToast, setStatusToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = bluetoothService.subscribeFirewallConfig((cfg) => {
      setAutomatedMitigation(cfg.automatedMitigation);
      setEnablePqcKyber(cfg.enablePqcKyber);
      setEnforceStrictGatt(cfg.enforceStrictGatt);
      setPllFrequencyLock(cfg.pllFrequencyLock);
    });
    return () => unsub();
  }, []);

  const handleToggleAutomatedMitigation = () => {
    const nextVal = !automatedMitigation;
    setAutomatedMitigation(nextVal);
    bluetoothService.updateFirewallRules({ automatedMitigation: nextVal });
    setStatusToast(
      `Automated Mitigation ${nextVal ? 'ENABLED' : 'DISABLED'}: ${
        nextVal
          ? `Auto-triggering Kyber-1024 key rotation for any substation node exceeding ${QBER_CRITICAL_THRESHOLD.toFixed(1)}% QBER.`
          : 'Manual intervention required for key rotation on QBER spikes.'
      }`
    );
  };

  const handleToggleKyberSwitch = () => {
    const nextVal = !enablePqcKyber;
    setEnablePqcKyber(nextVal);
    bluetoothService.updateFirewallRules({ enablePqcKyber: nextVal });
    setStatusToast(
      `Rule #1 Switch ${nextVal ? 'ENABLED' : 'DISABLED'}: Mandatory Kyber-1024 KEM Handshake ${
        nextVal ? 'enforced across all nodes.' : 'set to permissive mode.'
      }`
    );
  };

  const handleToggleStrictGattSwitch = () => {
    const nextVal = !enforceStrictGatt;
    setEnforceStrictGatt(nextVal);
    bluetoothService.updateFirewallRules({ enforceStrictGatt: nextVal });
    setStatusToast(
      `Rule #2 Switch ${nextVal ? 'ENABLED' : 'DISABLED'}: Strict GATT Characteristic Sanitization ${
        nextVal ? 'actively blocking spoofed BLE writes.' : 'paused.'
      }`
    );
  };

  const handleChangePll = (val: number) => {
    setPllFrequencyLock(val);
    bluetoothService.updateFirewallRules({ pllFrequencyLock: val });
    setStatusToast(`Rule #3 Updated: Phase-Lock Loop (PLL) frequency locked to ${val.toFixed(2)} Hz.`);
  };

  const handleAddMac = () => {
    if (newMacInput && !blockedMacs.includes(newMacInput.toUpperCase())) {
      const mac = newMacInput.toUpperCase();
      setBlockedMacs([...blockedMacs, mac]);
      setNewMacInput('');
      setStatusToast(`Added MAC ${mac} to SCADA BLE hardware blacklist.`);
    }
  };

  const handleRemoveMac = (mac: string) => {
    setBlockedMacs(blockedMacs.filter((m) => m !== mac));
    setStatusToast(`Removed MAC ${mac} from SCADA BLE hardware blacklist.`);
  };

  const allIsolated = nodes.length > 0 && nodes.every((n) => n.isolated);

  return (
    <div className="space-y-6">
      {statusToast && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 text-xs font-mono text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#00ff88] shrink-0" />
            <span>{statusToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SCADA Firewall Rules */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 text-cyan-400 border-b border-cyan-500/20 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <h3 className="font-bold tracking-wider text-sm sm:text-base">
                  POST-QUANTUM SCADA FIREWALL RULES &amp; BREAKER SWITCHES
                </h3>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border ${
                  automatedMitigation
                    ? 'bg-emerald-950/80 text-[#00ff88] border-[#00ff88]/60 shadow-[0_0_12px_rgba(0,255,136,0.35)]'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
              >
                {automatedMitigation ? '● AUTO-MITIGATION ACTIVE' : '○ MANUAL MITIGATION'}
              </span>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {/* Automated Mitigation Toggle Switch */}
              <div
                className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-all ${
                  automatedMitigation
                    ? 'bg-emerald-950/25 border-[#00ff88]/50 shadow-[0_0_20px_rgba(0,255,136,0.12)]'
                    : 'bg-slate-900/80 border-cyan-500/30'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Zap
                      className={`h-4 w-4 ${
                        automatedMitigation ? 'text-[#00ff88] animate-pulse' : 'text-cyan-400'
                      }`}
                    />
                    <p className="font-bold text-white text-xs sm:text-sm">
                      Automated Mitigation (Auto Key Rotation on QBER &gt; {QBER_CRITICAL_THRESHOLD.toFixed(1)}%)
                    </p>
                  </div>
                  <span className="text-slate-300 mt-1 block">
                    Automatically triggers Post-Quantum Kyber-1024 key rotation for any node where QBER exceeds the{' '}
                    {QBER_CRITICAL_THRESHOLD.toFixed(1)}% threshold, rather than requiring manual intervention.
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className={automatedMitigation ? 'text-[#00ff88] font-bold' : 'text-slate-400'}>
                    {automatedMitigation ? 'ENABLED' : 'MANUAL'}
                  </span>
                  <button
                    id="automated-mitigation-toggle"
                    type="button"
                    role="switch"
                    aria-label="Automated Mitigation"
                    aria-checked={automatedMitigation}
                    onClick={handleToggleAutomatedMitigation}
                    className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      automatedMitigation
                        ? 'bg-emerald-500/30 border-[#00ff88] shadow-[0_0_12px_rgba(0,255,136,0.45)]'
                        : 'bg-slate-800 border-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        automatedMitigation
                          ? 'translate-x-6 bg-[#00ff88] shadow-[0_0_8px_#00ff88]'
                          : 'translate-x-1 bg-slate-400'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Rule 1 Toggle Switch */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div>
                  <p className="font-bold text-slate-200">
                    Rule #1: Mandatory Kyber-1024 KEM Handshake
                  </p>
                  <span className="text-slate-400">
                    Rejects any GATT BLE connection attempting legacy RSA or ECC signatures.
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className={enablePqcKyber ? 'text-[#00ff88] font-bold' : 'text-slate-500'}>
                    {enablePqcKyber ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enablePqcKyber}
                    onClick={handleToggleKyberSwitch}
                    className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      enablePqcKyber
                        ? 'bg-emerald-500/30 border-[#00ff88]'
                        : 'bg-slate-800 border-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        enablePqcKyber ? 'translate-x-6 bg-[#00ff88]' : 'translate-x-1 bg-slate-400'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Rule 2 Toggle Switch */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div>
                  <p className="font-bold text-slate-200">
                    Rule #2: Strict GATT Characteristic Sanitization (beb5483e...)
                  </p>
                  <span className="text-slate-400">
                    Blocks unauthenticated telemetry writes attempting to alter capacitor state.
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className={enforceStrictGatt ? 'text-[#00ff88] font-bold' : 'text-slate-500'}>
                    {enforceStrictGatt ? 'ACTIVE' : 'BYPASSED'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enforceStrictGatt}
                    onClick={handleToggleStrictGattSwitch}
                    className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      enforceStrictGatt
                        ? 'bg-emerald-500/30 border-[#00ff88]'
                        : 'bg-slate-800 border-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        enforceStrictGatt ? 'translate-x-6 bg-[#00ff88]' : 'translate-x-1 bg-slate-400'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Rule 3: Frequency Phase Lock Loop Slider */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-200">
                    Rule #3: Phase-Lock Loop (PLL) Active Frequency Lock:
                  </span>
                  <span className="text-cyan-400 font-bold tabular-nums">
                    {pllFrequencyLock.toFixed(2)} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min="48.0"
                  max="52.0"
                  step="0.05"
                  value={pllFrequencyLock}
                  onChange={(e) => handleChangePll(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                />
                <span className="text-[11px] text-slate-400 block">
                  Adjust active dampening target frequency for IEEE 1547 sub-station grid alignment.
                </span>
              </div>

              {/* Per-Substation Hardware Breaker Switches */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-cyan-300 flex items-center gap-2">
                    <Power className="h-4 w-4 text-[#00ff88]" />
                    <span>SUBSTATION MICROGRID BREAKER SWITCHES</span>
                  </span>
                  <span className="text-[11px] text-slate-400">CLICK SWITCH TO ISOLATE / RECONNECT</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {nodes.map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center justify-between rounded border border-slate-800 bg-[#05070c] px-3 py-2"
                    >
                      <div className="truncate pr-2">
                        <p className="font-bold text-slate-200 truncate">{node.name}</p>
                        <span
                          className={`text-[10px] ${
                            node.isolated ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {node.isolated ? 'ISOLATED (OPEN)' : 'CONNECTED (CLOSED)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!node.isolated}
                        onClick={() => {
                          onToggleIsolation(node.id);
                          setStatusToast(
                            `Substation Breaker Switch toggled for ${node.name}.`
                          );
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                          !node.isolated
                            ? 'bg-emerald-500/30 border-[#00ff88]'
                            : 'bg-rose-950/60 border-rose-500/60'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                            !node.isolated ? 'translate-x-5 bg-[#00ff88]' : 'translate-x-1 bg-rose-400'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Grid Islanding Trigger */}
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-rose-400 text-base flex items-center gap-2">
                <AlertOctagon className="h-5 w-5" />
                <span>EMERGENCY SMART GRID ISLANDING PROTOCOL</span>
              </h4>
              <p className="text-xs text-slate-300 font-mono mt-1">
                Immediately isolates or reconnects all microgrid edge nodes during a cascading cyber attack.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                nodes.forEach((n) => {
                  if (allIsolated ? n.isolated : !n.isolated) {
                    onToggleIsolation(n.id);
                  }
                });
                setStatusToast(
                  allIsolated
                    ? 'All microgrid substations reconnected to main grid.'
                    : 'Emergency Islanding engaged: all substations isolated.'
                );
              }}
              className={`${
                allIsolated ? 'cyber-btn-primary' : 'cyber-btn-danger'
              } px-4 py-2.5 rounded-lg text-xs shrink-0 cursor-pointer`}
            >
              {allIsolated ? 'RECONNECT ALL SUBSTATIONS' : 'TRIGGER ISLANDING'}
            </button>
          </div>
        </div>

        {/* MAC Blacklist Editor */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-rose-400 border-b border-cyan-500/20 pb-3 mb-4">
              <Slash className="h-5 w-5" />
              <h3 className="font-bold tracking-wider text-sm sm:text-base">BLE MAC BLACKLIST</h3>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="e.g. 4A:8B:12:FE:90:01"
                value={newMacInput}
                onChange={(e) => setNewMacInput(e.target.value)}
                className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleAddMac}
                className="px-3 py-1.5 rounded bg-cyan-600 text-white font-mono text-xs font-bold hover:bg-cyan-500 transition cursor-pointer"
              >
                BLOCK
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {blockedMacs.map((mac) => (
                <div
                  key={mac}
                  className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800 font-mono text-xs"
                >
                  <span className="text-rose-400 font-bold">{mac}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMac(mac)}
                    className="text-slate-400 hover:text-slate-200 text-[11px] cursor-pointer"
                  >
                    UNBLOCK
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                onRotateAllKeys();
                setStatusToast('Rotated Post-Quantum Kyber-1024 keys across all substations.');
              }}
              className="w-full py-2.5 rounded border border-purple-500 bg-purple-950/40 text-purple-300 font-mono text-xs font-bold hover:bg-purple-900/60 transition cursor-pointer"
            >
              ROTATE PQC FIREWALL MESH KEYS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
