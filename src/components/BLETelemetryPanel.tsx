import React, { useState } from 'react';
import { GridNode } from '../types/grid';
import { bluetoothService, QGRID_SERVICE_UUID, QGRID_CHARACTERISTIC_UUID, TARGET_DEVICE_NAME } from '../services/bluetooth';
import { Smartphone, Radio, CheckCircle2, AlertTriangle, Power, Terminal } from 'lucide-react';

interface BLETelemetryPanelProps {
  nodes: GridNode[];
  onConnectRealBLE: () => void;
}

export const BLETelemetryPanel: React.FC<BLETelemetryPanelProps> = ({
  nodes,
}) => {
  const [bleStatusMsg, setBleStatusMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [customJsonInput, setCustomJsonInput] = useState<string>('{"qber": 19.4, "attack": true}');

  const isAnyAttack = nodes.some((n) => n.activeAttack !== 'NONE');

  const handlePair = async () => {
    setIsScanning(true);
    setBleStatusMsg(`Requesting Web Bluetooth device "${TARGET_DEVICE_NAME}" (Service: ${QGRID_SERVICE_UUID.substring(0, 8)}...)...`);

    const result = await bluetoothService.requestRealBluetoothDevice();
    setIsScanning(false);

    if (result.success) {
      setBleStatusMsg(`Successfully paired with ${result.deviceName}! Subscribed to GATT Characteristic ${QGRID_CHARACTERISTIC_UUID}. Press your physical ESP32 switch or use the test switch below.`);
    } else {
      setBleStatusMsg(`Pairing Result: ${result.error}`);
    }
  };

  const handleToggleHardwareSimSwitch = () => {
    const nextState = !isAnyAttack;
    bluetoothService.toggleAttackSwitch(nextState);
    setCustomJsonInput(
      nextState ? '{"qber": 18.6, "attack": true}' : '{"qber": 1.15, "attack": false}'
    );
    setBleStatusMsg(
      nextState
        ? 'Simulated ESP32 Switch ON: Streamed {"qber": 18.6, "attack": true} -> Red Alert & 3D Eve Node Activated!'
        : 'Simulated ESP32 Switch OFF: Streamed {"qber": 1.15, "attack": false} -> Nominal Grid Restored.'
    );
  };

  const handleInjectCustomJson = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = bluetoothService.parseESP32Payload(customJsonInput);
    if (parsed.qber !== null || parsed.attack !== null) {
      const q = parsed.qber ?? 1.15;
      const a = parsed.attack ?? q > 11;
      bluetoothService.processIncomingQBERStream(q, a, undefined, 'BLE_HARDWARE', customJsonInput);
      setBleStatusMsg(`Parsed & Applied ESP32 GATT Payload: QBER=${q.toFixed(2)}%, Attack=${a}`);
    } else {
      setBleStatusMsg('Invalid payload format. Expected {"qber": float, "attack": bool}.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Bluetooth Pairing Action Header */}
      <div className="rounded-xl border border-cyan-500/30 bg-[#090e18] p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-500/40 shrink-0">
            <Radio className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-300">WEB BLUETOOTH (BLE) EDGE MESH CONTROLLER</h3>
            <p className="text-xs text-slate-400 font-mono">
              Target Device: <span className="text-cyan-300 font-bold">{TARGET_DEVICE_NAME}</span> | Service UUID: <span className="text-purple-300 font-bold">{QGRID_SERVICE_UUID}</span> | Characteristic: <span className="text-emerald-300 font-bold">{QGRID_CHARACTERISTIC_UUID}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePair}
          disabled={isScanning}
          className="cyber-btn-primary px-5 py-2.5 rounded-lg text-xs flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
        >
          <Smartphone className="h-4 w-4" />
          <span>{isScanning ? 'CONNECTING BLE...' : `CONNECT '${TARGET_DEVICE_NAME}'`}</span>
        </button>
      </div>

      {/* ESP32 Physical Switch Emulator & Live JSON Stream Tester */}
      <div className="rounded-xl border border-emerald-500/30 bg-[#090e18] p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-3">
          <div className="flex items-center gap-3">
            <Power className={`h-5 w-5 ${isAnyAttack ? 'text-[#ff0055]' : 'text-[#00ff88]'}`} />
            <div>
              <h4 className="font-bold text-sm text-[#00ff88]">
                ESP32 HARDWARE ATTACK SWITCH &amp; GATT JSON STREAM TESTER
              </h4>
              <p className="text-xs font-mono text-slate-400">
                Test the exact GATT characteristic stream <code className="text-cyan-300">{`{"qber": float, "attack": bool}`}</code> or toggle the switch directly:
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[#05070c] px-4 py-2">
            <span className="text-xs font-mono text-slate-300">ESP32 GPIO SWITCH:</span>
            <button
              type="button"
              role="switch"
              aria-checked={isAnyAttack}
              onClick={handleToggleHardwareSimSwitch}
              className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                isAnyAttack
                  ? 'bg-[#ff0055]/30 border-[#ff0055]'
                  : 'bg-emerald-500/20 border-[#00ff88]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                  isAnyAttack ? 'translate-x-6 bg-[#ff0055]' : 'translate-x-1 bg-[#00ff88]'
                }`}
              />
            </button>
            <span className={`text-xs font-mono font-bold ${isAnyAttack ? 'text-[#ff0055]' : 'text-[#00ff88]'}`}>
              {isAnyAttack ? 'PRESSED (ATTACK)' : 'RELEASED (IDLE)'}
            </span>
          </div>
        </div>

        <form onSubmit={handleInjectCustomJson} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-[#05070c] px-3 py-2">
            <Terminal className="h-4 w-4 text-cyan-400 shrink-0" />
            <input
              type="text"
              value={customJsonInput}
              onChange={(e) => setCustomJsonInput(e.target.value)}
              className="w-full bg-transparent text-xs font-mono text-cyan-300 outline-none"
              placeholder='{"qber": 19.4, "attack": true}'
            />
          </div>
          <button
            type="submit"
            className="cyber-btn-primary px-4 py-2 rounded-lg text-xs font-mono font-bold cursor-pointer whitespace-nowrap"
          >
            Send GATT JSON Packet
          </button>
        </form>
      </div>

      {bleStatusMsg && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-3 text-xs font-mono text-cyan-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-400" />
          <span>{bleStatusMsg}</span>
        </div>
      )}

      {/* BLE Nodes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.map((node) => {
          const signalPercent = Math.max(0, Math.min(100, (node.rssi + 100) * 1.66));

          return (
            <div
              key={node.id}
              className={`rounded-xl border p-4 transition shadow-lg ${
                node.isolated 
                  ? 'border-slate-800 bg-slate-950/80 opacity-75'
                  : node.activeAttack !== 'NONE'
                  ? 'border-rose-500/60 bg-rose-950/20'
                  : 'border-cyan-500/20 bg-[#090e18]'
              }`}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-3 mb-3">
                <div>
                  <h4 className="font-bold text-sm text-cyan-300">{node.name}</h4>
                  <span className="text-[11px] font-mono text-slate-400">{node.macAddress}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  node.isolated ? 'bg-slate-800 text-slate-400' :
                  node.activeAttack !== 'NONE' ? 'bg-rose-950 text-rose-400 border border-rose-600' : 'bg-emerald-950 text-emerald-400'
                }`}>
                  {node.status}
                </span>
              </div>

              {/* RSSI Signal Gauge */}
              <div className="space-y-2 text-xs font-mono mb-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">BLE RSSI Strength:</span>
                  <span className="text-cyan-400 font-bold">{node.rssi} dBm</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      signalPercent > 60 ? 'bg-emerald-400' : signalPercent > 30 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${signalPercent}%` }}
                  />
                </div>
              </div>

              {/* Detailed GATT Telemetry */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/50 p-2.5 rounded border border-slate-800">
                <div>
                  <span className="text-slate-400">QBER Rate:</span>
                  <p className={`font-bold ${(node.qber || 1.15) > 11 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {(node.qber || 1.15).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">THD:</span>
                  <p className={`font-bold ${node.thd > 3.0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {node.thd}%
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Frequency:</span>
                  <p className="font-bold text-cyan-300">{node.frequency} Hz</p>
                </div>
                <div>
                  <span className="text-slate-400">Packets:</span>
                  <p className="font-bold text-purple-300">{node.packetsReceived}</p>
                </div>
              </div>

              {node.activeAttack !== 'NONE' && (
                <div className="mt-3 p-2 rounded bg-rose-950/60 border border-rose-600/40 text-[11px] font-mono text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span>Attack Active: {node.activeAttack}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
