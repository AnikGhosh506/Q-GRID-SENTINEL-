export type AttackType = 
  | 'NONE'
  | 'MITM_SPOOFING'
  | 'STUXNET_HARMONIC_DRIFT'
  | 'DDOS_SYNC_FLOOD'
  | 'QUANTUM_PROBE'
  | 'REPLAY_ATTACK';

export type NodeStatus = 'NOMINAL' | 'WARNING' | 'CRITICAL' | 'ISOLATED';

export type QuantumKeyStatus = 
  | 'KYBER_1024_SYNCED'
  | 'DILITHIUM_5_VERIFIED'
  | 'KEY_ROTATION_PENDING'
  | 'COMPROMISED'
  | 'RENEGOTIATING';

export interface NodeEventLog {
  id: string;
  timestamp: string;
  category: 'CONNECTION' | 'MITIGATION' | 'ALERT';
  action: string;
  details: string;
}

export interface GridNode {
  id: string;
  name: string;
  type: 'TRANSFORMER' | 'SOLAR_ARRAY' | 'WIND_TURBINE' | 'QUANTUM_RELAY' | 'SCADA_GATEWAY';
  x: number; // grid position x percentage
  y: number; // grid position y percentage
  voltage: number; // in kV or V
  frequency: number; // Hz (nominal 50.00 / 60.00)
  thd: number; // Total Harmonic Distortion %
  qber: number; // Quantum Bit Error Rate %
  rssi: number; // dBm for Bluetooth signal
  latencyMs?: number; // BLE packet round-trip latency in ms
  macAddress: string;
  status: NodeStatus;
  activeAttack: AttackType;
  pqcKeyStatus: QuantumKeyStatus;
  lastPacketTime: number;
  packetsReceived: number;
  isolated: boolean;
  eventHistory?: NodeEventLog[];
}

export interface PacketLog {
  id: string;
  timestamp: string;
  sourceMac: string;
  targetNodeId: string;
  protocol: 'BLE_GATT_SCADA' | 'PQC_KYBER_1024' | 'IEC_61850' | 'MODBUS_TCP';
  type: 'TELEMETRY' | 'COMMAND' | 'KEY_EXCHANGE' | 'MALICIOUS_PAYLOAD';
  payloadSummary: string;
  status: 'ACCEPTED' | 'BLOCKED' | 'FLAGGED';
}

export interface AIThreatReport {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
  impactAnalysis: string;
  recommendedActions: string[];
  defensePlaybook: string;
  confidenceScore: number;
}
