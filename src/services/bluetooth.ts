import { GridNode, AttackType, PacketLog, NodeEventLog } from '../types/grid';
import { evaluateQBERWithEdgeAI, QBER_CRITICAL_THRESHOLD } from './edgeAI';

export const QGRID_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const QGRID_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const TARGET_DEVICE_NAME = 'Q-GRID_SENTINEL';

export interface BluetoothTelemetryEvent {
  nodeId: string;
  voltage: number;
  frequency: number;
  thd: number;
  rssi: number;
  macAddress: string;
}

export interface QBERStreamEvent {
  qber: number;
  attack: boolean;
  rawPayload: string;
  source: 'BLE_HARDWARE' | 'UI_SWITCH';
  timestamp: number;
}

export interface FirewallConfig {
  enablePqcKyber: boolean;
  enforceStrictGatt: boolean;
  pllFrequencyLock: number;
  automatedMitigation: boolean;
}

export class WebBluetoothGridService {
  private isBrowserBluetoothSupported: boolean;
  private connectedRealDevice: any = null;
  private activeCharacteristic: any = null;
  private bleReadPollTimer: any = null;
  private lastBlePayloadStr: string = '';
  private hardwareSwitchActive: boolean = false;
  private lastHardwareQber: number | null = null;
  private firewallConfig: FirewallConfig = {
    enablePqcKyber: true,
    enforceStrictGatt: true,
    pllFrequencyLock: 50.0,
    automatedMitigation: false,
  };
  private autoMitigationTimers: Map<string, any> = new Map();
  private firewallListeners: ((config: FirewallConfig) => void)[] = [];
  private nodes: GridNode[] = [];
  private listeners: ((nodes: GridNode[]) => void)[] = [];
  private packetListeners: ((packet: PacketLog) => void)[] = [];
  private qberStreamListeners: ((event: QBERStreamEvent) => void)[] = [];
  private timer: any = null;

  constructor() {
    this.isBrowserBluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    this.initDefaultNodes();
    this.startSimulationLoop();
  }

  public isSupported(): boolean {
    return this.isBrowserBluetoothSupported;
  }

  public isDeviceConnected(): boolean {
    return Boolean(this.connectedRealDevice && this.connectedRealDevice.gatt?.connected);
  }

  public getConnectedDeviceName(): string | null {
    return this.connectedRealDevice ? (this.connectedRealDevice.name || TARGET_DEVICE_NAME) : null;
  }

  public getFirewallConfig(): FirewallConfig {
    return { ...this.firewallConfig };
  }

  public subscribeFirewallConfig(callback: (config: FirewallConfig) => void) {
    this.firewallListeners.push(callback);
    callback(this.getFirewallConfig());
    return () => {
      this.firewallListeners = this.firewallListeners.filter((l) => l !== callback);
    };
  }

  private notifyFirewallListeners() {
    const snapshot = this.getFirewallConfig();
    this.firewallListeners.forEach((cb) => cb(snapshot));
  }

  private createNodeEvent(
    category: NodeEventLog['category'],
    action: string,
    details: string
  ): NodeEventLog {
    return {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      category,
      action,
      details,
    };
  }

  private appendNodeEvent(
    node: GridNode,
    category: NodeEventLog['category'],
    action: string,
    details: string
  ): NodeEventLog[] {
    const entry = this.createNodeEvent(category, action, details);
    const existing = node.eventHistory || [];
    return [entry, ...existing].slice(0, 25);
  }

  private initDefaultNodes() {
    const bootTime = new Date(Date.now() - 45000).toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const syncTime = new Date(Date.now() - 12000).toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    this.nodes = [
      {
        id: 'node-alpha-1',
        name: 'ALPHA-1 SUBSTATION',
        type: 'TRANSFORMER',
        x: 25,
        y: 30,
        voltage: 230.4,
        frequency: 50.02,
        thd: 1.2,
        qber: 1.15,
        rssi: -48,
        latencyMs: 18,
        macAddress: '4A:8B:12:FE:90:01',
        status: 'NOMINAL',
        activeAttack: 'NONE',
        pqcKeyStatus: 'KYBER_1024_SYNCED',
        lastPacketTime: Date.now(),
        packetsReceived: 14280,
        isolated: false,
        eventHistory: [
          {
            id: 'init-alpha-2',
            timestamp: syncTime,
            category: 'MITIGATION',
            action: 'Kyber-1024 KEM Handshake Verified',
            details: 'Post-quantum session key established over GATT characteristic beb5483e.',
          },
          {
            id: 'init-alpha-1',
            timestamp: bootTime,
            category: 'CONNECTION',
            action: 'BLE Edge Telemetry Connected',
            details: 'MAC 4A:8B:12:FE:90:01 paired at -48 dBm (RTT 18ms).',
          },
        ],
      },
      {
        id: 'node-beta-3',
        name: 'BETA-3 SOLAR MATRIX',
        type: 'SOLAR_ARRAY',
        x: 65,
        y: 25,
        voltage: 0.40,
        frequency: 50.00,
        thd: 1.8,
        qber: 1.40,
        rssi: -54,
        latencyMs: 24,
        macAddress: '5C:9D:44:EE:81:03',
        status: 'NOMINAL',
        activeAttack: 'NONE',
        pqcKeyStatus: 'DILITHIUM_5_VERIFIED',
        lastPacketTime: Date.now(),
        packetsReceived: 9840,
        isolated: false,
        eventHistory: [
          {
            id: 'init-beta-2',
            timestamp: syncTime,
            category: 'MITIGATION',
            action: 'Dilithium-5 Signature Verified',
            details: 'Zero-trust inverter attestation confirmed.',
          },
          {
            id: 'init-beta-1',
            timestamp: bootTime,
            category: 'CONNECTION',
            action: 'BLE Edge Telemetry Connected',
            details: 'MAC 5C:9D:44:EE:81:03 paired at -54 dBm (RTT 24ms).',
          },
        ],
      },
      {
        id: 'node-gamma-9',
        name: 'GAMMA-9 QUANTUM RELAY',
        type: 'QUANTUM_RELAY',
        x: 45,
        y: 60,
        voltage: 132.0,
        frequency: 49.98,
        thd: 0.9,
        qber: 0.75,
        rssi: -42,
        latencyMs: 12,
        macAddress: '1F:3A:77:AA:92:09',
        status: 'NOMINAL',
        activeAttack: 'NONE',
        pqcKeyStatus: 'KYBER_1024_SYNCED',
        lastPacketTime: Date.now(),
        packetsReceived: 28490,
        isolated: false,
        eventHistory: [
          {
            id: 'init-gamma-2',
            timestamp: syncTime,
            category: 'MITIGATION',
            action: 'BB84 Quantum Relay Entanglement Synced',
            details: 'Baseline QBER locked at 0.75% across primary trunk.',
          },
          {
            id: 'init-gamma-1',
            timestamp: bootTime,
            category: 'CONNECTION',
            action: 'BLE Edge Telemetry Connected',
            details: 'MAC 1F:3A:77:AA:92:09 paired at -42 dBm (RTT 12ms).',
          },
        ],
      },
      {
        id: 'node-delta-4',
        name: 'DELTA-4 WIND TURBINE',
        type: 'WIND_TURBINE',
        x: 80,
        y: 70,
        voltage: 69.1,
        frequency: 50.04,
        thd: 2.1,
        qber: 1.85,
        rssi: -68,
        latencyMs: 36,
        macAddress: '8E:22:90:BC:44:04',
        status: 'NOMINAL',
        activeAttack: 'NONE',
        pqcKeyStatus: 'KYBER_1024_SYNCED',
        lastPacketTime: Date.now(),
        packetsReceived: 11200,
        isolated: false,
        eventHistory: [
          {
            id: 'init-delta-2',
            timestamp: syncTime,
            category: 'MITIGATION',
            action: 'Kyber-1024 KEM Handshake Verified',
            details: 'Turbine PLC encrypted tunnel active.',
          },
          {
            id: 'init-delta-1',
            timestamp: bootTime,
            category: 'CONNECTION',
            action: 'BLE Edge Telemetry Connected',
            details: 'MAC 8E:22:90:BC:44:04 paired at -68 dBm (RTT 36ms).',
          },
        ],
      },
      {
        id: 'node-epsilon-7',
        name: 'EPSILON-7 SCADA GATEWAY',
        type: 'SCADA_GATEWAY',
        x: 20,
        y: 75,
        voltage: 0.48,
        frequency: 50.01,
        thd: 1.5,
        qber: 1.10,
        rssi: -52,
        latencyMs: 21,
        macAddress: '9A:11:33:CD:55:07',
        status: 'NOMINAL',
        activeAttack: 'NONE',
        pqcKeyStatus: 'DILITHIUM_5_VERIFIED',
        lastPacketTime: Date.now(),
        packetsReceived: 34100,
        isolated: false,
        eventHistory: [
          {
            id: 'init-epsilon-2',
            timestamp: syncTime,
            category: 'MITIGATION',
            action: 'SCADA Gateway Strict GATT Policy Active',
            details: 'Characteristic beb5483e write-sanitization enabled.',
          },
          {
            id: 'init-epsilon-1',
            timestamp: bootTime,
            category: 'CONNECTION',
            action: 'BLE Edge Telemetry Connected',
            details: 'MAC 9A:11:33:CD:55:07 paired at -52 dBm (RTT 21ms).',
          },
        ],
      }
    ];
  }

  /**
   * Ultra-resilient parser for incoming ESP32 BLE payloads:
   * Handles:
   * - Standard JSON: {"qber": 18.5, "attack": true}
   * - Null-terminated C strings: {"qber": 18.5, "attack": 1}\0
   * - Numeric or string booleans: {"qber": "18.5", "attack": 1} or {"attack": "true"}
   * - Raw button/switch strings: "1", "0", "true", "false", "ATTACK", "ON", "OFF"
   */
  public parseESP32Payload(raw: string): { qber: number | null; attack: boolean | null } {
    // Strip null bytes and non-printable control characters from C/ESP32 buffers
    const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    if (!cleaned) {
      return { qber: null, attack: null };
    }

    let parsedQber: number | null = null;
    let parsedAttack: boolean | null = null;

    // 1. Try JSON parsing (extract {...} if surrounded by log characters)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const candidateJson = jsonMatch ? jsonMatch[0] : cleaned;

    try {
      const normalizedJson = candidateJson
        .replace(/'/g, '"')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      const data = JSON.parse(normalizedJson);

      if (data && typeof data === 'object') {
        const rawQber = data.qber ?? data.QBER ?? data.error_rate ?? data.val;
        if (rawQber !== undefined && rawQber !== null) {
          const num = parseFloat(String(rawQber));
          if (!Number.isNaN(num)) {
            parsedQber = parseFloat(num.toFixed(2));
          }
        }

        const rawAttack =
          data.attack ??
          data.ATTACK ??
          data.isAttack ??
          data.alert ??
          data.button ??
          data.switch ??
          data.state ??
          data.eve;
        if (rawAttack !== undefined && rawAttack !== null) {
          if (typeof rawAttack === 'boolean') {
            parsedAttack = rawAttack;
          } else if (typeof rawAttack === 'number') {
            parsedAttack = rawAttack !== 0;
          } else if (typeof rawAttack === 'string') {
            const lower = rawAttack.toLowerCase().trim();
            parsedAttack =
              lower === 'true' ||
              lower === '1' ||
              lower === 'high' ||
              lower === 'on' ||
              lower === 'attack' ||
              lower === 'pressed';
          }
        }
      }
    } catch {
      // 2. Regex fallback if JSON is truncated by 20-byte BLE MTU limit (e.g. {"qber":19.4,"attack":1)
      const qberRegex = /"?qber"?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(cleaned);
      if (qberRegex) {
        parsedQber = parseFloat(parseFloat(qberRegex[1]).toFixed(2));
      }
      const attackRegex = /"?(?:attack|button|switch|alert)"?\s*:\s*(true|false|1|0|"true"|"false"|"1"|"0")/i.exec(
        cleaned
      );
      if (attackRegex) {
        const val = attackRegex[1].replace(/"/g, '').toLowerCase();
        parsedAttack = val === 'true' || val === '1';
      }
    }

    // 3. Plain string / single value fallback (e.g. ESP32 sends "1", "0", "ATTACK", "NORMAL", or "19.5")
    if (parsedQber === null && parsedAttack === null) {
      const lower = cleaned.toLowerCase();
      if (lower === '1' || lower === 'true' || lower === 'attack' || lower === 'on' || lower === 'high' || lower === 'pressed') {
        parsedAttack = true;
        parsedQber = 18.5;
      } else if (lower === '0' || lower === 'false' || lower === 'normal' || lower === 'off' || lower === 'low' || lower === 'released') {
        parsedAttack = false;
        parsedQber = 1.15;
      } else {
        const num = parseFloat(cleaned);
        if (!Number.isNaN(num)) {
          parsedQber = parseFloat(num.toFixed(2));
          parsedAttack = parsedQber > QBER_CRITICAL_THRESHOLD;
        }
      }
    }

    // If attack is true from hardware button press but ESP32 sent nominal/zero QBER, elevate QBER to reflect interception
    if (parsedAttack === true && (parsedQber === null || parsedQber <= QBER_CRITICAL_THRESHOLD)) {
      parsedQber = parsedQber !== null && parsedQber > 1.5 ? parsedQber : 18.4;
    } else if (parsedAttack === false && parsedQber === null) {
      parsedQber = 1.15;
    }

    return { qber: parsedQber, attack: parsedAttack };
  }

  private handleRawBleDataView(dataView: DataView, deviceId?: string) {
    if (!dataView || dataView.byteLength === 0) return;

    const decoder = new TextDecoder('utf-8');
    let decodedPayload = decoder.decode(dataView);

    // Also handle single-byte binary 0x01 / 0x00 button press from ESP32
    if (dataView.byteLength === 1) {
      const byteVal = dataView.getUint8(0);
      if (byteVal === 0 || byteVal === 1) {
        decodedPayload = byteVal === 1 ? '{"qber":18.8,"attack":true}' : '{"qber":1.15,"attack":false}';
      }
    }

    const cleanedPayload = decodedPayload.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    if (!cleanedPayload) return;

    const { qber: parsedQber, attack: parsedAttack } = this.parseESP32Payload(cleanedPayload);

    if (parsedQber !== null || parsedAttack !== null) {
      const targetNode = this.nodes.find((n) => n.id.startsWith('real-ble')) || this.nodes[0];
      const effectiveAttack = parsedAttack !== null ? parsedAttack : (parsedQber !== null && parsedQber > QBER_CRITICAL_THRESHOLD);
      const effectiveQber = parsedQber !== null ? parsedQber : (effectiveAttack ? 18.4 : 1.15);

      this.hardwareSwitchActive = effectiveAttack || effectiveQber > QBER_CRITICAL_THRESHOLD;
      this.lastHardwareQber = effectiveQber;

      this.processIncomingQBERStream(effectiveQber, effectiveAttack, targetNode?.id, 'BLE_HARDWARE', cleanedPayload);

      // Log packet only when payload changes or attack is active to avoid flooding on 400ms read poll
      if (cleanedPayload !== this.lastBlePayloadStr) {
        this.lastBlePayloadStr = cleanedPayload;
        this.emitPacketLog({
          id: `ble-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toLocaleTimeString(),
          sourceMac: `BLE:${deviceId?.substring(0, 8) || 'Q-GRID'}`,
          targetNodeId: targetNode?.id || 'real-ble-node',
          protocol: 'BLE_GATT_SCADA',
          type: (effectiveAttack || effectiveQber > QBER_CRITICAL_THRESHOLD) ? 'MALICIOUS_PAYLOAD' : 'TELEMETRY',
          payloadSummary: `ESP32 BLE STREAM: ${cleanedPayload} -> QBER=${effectiveQber.toFixed(2)}%, Attack=${effectiveAttack}`,
          status: (effectiveAttack || effectiveQber > QBER_CRITICAL_THRESHOLD) ? 'FLAGGED' : 'ACCEPTED'
        });
      }
    }
  }

  // Connect to real Web Bluetooth Device (Device: Q-GRID_SENTINEL, Service: 4fafc201-1fb5-459e-8fcc-c5c9c331914b, Characteristic: beb5483e-36e1-4688-b7f5-ea07361b26a8)
  public async requestRealBluetoothDevice(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isBrowserBluetoothSupported) {
      return { success: false, error: 'Web Bluetooth API is not supported in this browser engine.' };
    }

    try {
      let device;
      try {
        device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { name: TARGET_DEVICE_NAME },
            { namePrefix: 'Q-GRID' },
            { services: [QGRID_SERVICE_UUID] }
          ],
          optionalServices: [QGRID_SERVICE_UUID, 'battery_service', 'environmental_sensing']
        });
      } catch (filterErr: any) {
        if (filterErr?.name === 'NotFoundError') {
          return { success: false, error: 'Bluetooth device selection was cancelled.' };
        }
        device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [QGRID_SERVICE_UUID, 'battery_service', 'environmental_sensing']
        });
      }

      this.connectedRealDevice = device;

      if (this.bleReadPollTimer) {
        clearInterval(this.bleReadPollTimer);
        this.bleReadPollTimer = null;
      }

      const server = await device.gatt.connect();

      let service;
      try {
        service = await server.getPrimaryService(QGRID_SERVICE_UUID);
      } catch (svcErr) {
        console.warn(`Primary service ${QGRID_SERVICE_UUID} not found directly, inspecting available services:`, svcErr);
        const services = await server.getPrimaryServices();
        service = services[0];
      }

      if (service) {
        let characteristic;
        try {
          characteristic = await service.getCharacteristic(QGRID_CHARACTERISTIC_UUID);
        } catch {
          const allChars = await service.getCharacteristics();
          characteristic = allChars.find(
            (c: any) =>
              c.uuid.toLowerCase().includes('beb5483e') ||
              c.properties?.notify ||
              c.properties?.read
          ) || allChars[0];
        }

        if (characteristic) {
          this.activeCharacteristic = characteristic;

          // 1. Subscribe to GATT Notifications
          try {
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
              if (event?.target?.value) {
                this.handleRawBleDataView(event.target.value, device.id);
              }
            });
          } catch (notifyErr) {
            console.warn('GATT startNotifications warning (falling back to readValue polling):', notifyErr);
          }

          // 2. Also poll readValue() every 400ms so ESP32 sketches without BLE2902 descriptor still respond immediately on switch press
          this.bleReadPollTimer = setInterval(async () => {
            if (!device.gatt?.connected || !this.activeCharacteristic) return;
            try {
              if (this.activeCharacteristic.properties?.read !== false) {
                const val = await this.activeCharacteristic.readValue();
                if (val) {
                  this.handleRawBleDataView(val, device.id);
                }
              }
            } catch {
              // Ignore if read not permitted while notifying
            }
          }, 400);
        }
      }

      const nodeId = `real-ble-${device.id || Date.now()}`;
      const existingIdx = this.nodes.findIndex((n) => n.id === nodeId);
      if (existingIdx === -1) {
        const newNode: GridNode = {
          id: nodeId,
          name: device.name ? device.name.toUpperCase() : TARGET_DEVICE_NAME,
          type: 'SCADA_GATEWAY',
          x: 50,
          y: 45,
          voltage: 230.0,
          frequency: 50.00,
          thd: 0.8,
          qber: 1.10,
          rssi: -40,
          latencyMs: 14,
          macAddress: `BLE:${device.id?.substring(0, 8) || 'AA:BB:CC'}`,
          status: 'NOMINAL',
          activeAttack: 'NONE',
          pqcKeyStatus: 'KYBER_1024_SYNCED',
          lastPacketTime: Date.now(),
          packetsReceived: 1,
          isolated: false,
          eventHistory: [
            this.createNodeEvent(
              'CONNECTION',
              'Hardware BLE GATT Connected',
              `Paired with ${device.name || TARGET_DEVICE_NAME} on service ${QGRID_SERVICE_UUID.substring(0, 8)}...`
            ),
          ],
        };
        this.nodes.unshift(newNode);
      } else {
        this.nodes[existingIdx] = {
          ...this.nodes[existingIdx],
          lastPacketTime: Date.now(),
          eventHistory: this.appendNodeEvent(
            this.nodes[existingIdx],
            'CONNECTION',
            'Hardware BLE Session Re-established',
            `GATT server reconnected (${device.name || TARGET_DEVICE_NAME}).`
          ),
        };
      }

      this.notifyListeners();
      return { success: true, deviceName: device.name || TARGET_DEVICE_NAME };
    } catch (err: any) {
      return { success: false, error: err.message || 'Bluetooth connection canceled or failed.' };
    }
  }

  // Process incoming ESP32 BLE JSON stream {"qber": float, "attack": bool} with TensorFlow.js Edge AI
  public processIncomingQBERStream(
    qber: number,
    attack: boolean,
    targetNodeId?: string,
    source: 'BLE_HARDWARE' | 'UI_SWITCH' = 'UI_SWITCH',
    rawPayload?: string
  ) {
    // If Strict GATT Sanitization is enabled on firewall and source is UI_SWITCH, log inspection
    const aiVerdict = evaluateQBERWithEdgeAI(qber, attack);
    this.hardwareSwitchActive = aiVerdict.isCompromised;
    this.lastHardwareQber = aiVerdict.qber;

    const nodeToUpdate =
      (targetNodeId && this.nodes.find((n) => n.id === targetNodeId)) ||
      this.nodes.find((n) => n.id.startsWith('real-ble')) ||
      this.nodes[0];

    if (nodeToUpdate) {
      this.nodes = this.nodes.map((n) => {
        if (n.id === nodeToUpdate.id) {
          const wasCompromised = n.activeAttack !== 'NONE' || (n.qber || 0) > QBER_CRITICAL_THRESHOLD;
          let updatedHistory = n.eventHistory || [];
          if (aiVerdict.isCompromised && !wasCompromised) {
            updatedHistory = this.appendNodeEvent(
              n,
              'ALERT',
              source === 'BLE_HARDWARE' ? 'ESP32 BLE Eavesdropping Alert' : 'QBER Threshold Breach Detected',
              `QBER spiked to ${aiVerdict.qber.toFixed(2)}% (> ${QBER_CRITICAL_THRESHOLD.toFixed(1)}%). Latency elevated.`
            );
          } else if (!aiVerdict.isCompromised && wasCompromised) {
            updatedHistory = this.appendNodeEvent(
              n,
              'MITIGATION',
              'Quantum Channel Restored',
              `QBER returned to nominal ${aiVerdict.qber.toFixed(2)}%.`
            );
          } else if (source === 'BLE_HARDWARE') {
            updatedHistory = this.appendNodeEvent(
              n,
              'CONNECTION',
              'BLE GATT Packet Synced',
              `Received payload ${rawPayload || ''} (QBER ${aiVerdict.qber.toFixed(2)}%).`
            );
          }

          return {
            ...n,
            qber: aiVerdict.qber,
            thd: aiVerdict.isCompromised ? Math.max(n.thd, 6.8) : 1.2,
            frequency: aiVerdict.isCompromised ? 52.4 : this.firewallConfig.pllFrequencyLock,
            latencyMs: aiVerdict.isCompromised ? Math.round(135 + aiVerdict.qber * 2.5) : 18,
            activeAttack: aiVerdict.isCompromised ? 'QUANTUM_PROBE' : 'NONE',
            status: aiVerdict.isCompromised ? 'CRITICAL' : (n.isolated ? 'ISOLATED' : 'NOMINAL'),
            pqcKeyStatus: aiVerdict.isCompromised ? 'COMPROMISED' : (this.firewallConfig.enablePqcKyber ? 'KYBER_1024_SYNCED' : 'KEY_ROTATION_PENDING'),
            lastPacketTime: Date.now(),
            packetsReceived: n.packetsReceived + 1,
            eventHistory: updatedHistory,
          };
        }
        // When clearing attack (attack === false and qber <= 11%), also clear QUANTUM_PROBE on other nodes so alert resets cleanly
        if (!aiVerdict.isCompromised && n.activeAttack !== 'NONE') {
          return {
            ...n,
            qber: 1.15,
            thd: 1.2,
            frequency: this.firewallConfig.pllFrequencyLock,
            latencyMs: 20,
            activeAttack: 'NONE',
            status: n.isolated ? 'ISOLATED' : 'NOMINAL',
            pqcKeyStatus: this.firewallConfig.enablePqcKyber ? 'KYBER_1024_SYNCED' : 'KEY_ROTATION_PENDING',
            eventHistory: this.appendNodeEvent(
              n,
              'MITIGATION',
              'Grid Threat Cleared',
              'Node returned to nominal post-quantum operation.'
            ),
          };
        }
        return n;
      });
      this.notifyListeners();
    }

    const streamEvent: QBERStreamEvent = {
      qber: aiVerdict.qber,
      attack: aiVerdict.isCompromised,
      rawPayload: rawPayload || JSON.stringify({ qber: aiVerdict.qber, attack }),
      source,
      timestamp: Date.now(),
    };
    this.qberStreamListeners.forEach((cb) => cb(streamEvent));

    if (this.firewallConfig.automatedMitigation && aiVerdict.qber > QBER_CRITICAL_THRESHOLD) {
      this.checkAndTriggerAutoMitigation(850);
    }

    return aiVerdict;
  }

  // Toggle ESP32 / Eve Interception Switch directly from any UI switch
  public toggleAttackSwitch(enableAttack: boolean, targetNodeId?: string) {
    if (enableAttack) {
      return this.processIncomingQBERStream(18.6, true, targetNodeId, 'UI_SWITCH');
    } else {
      this.hardwareSwitchActive = false;
      this.lastHardwareQber = 1.15;
      return this.processIncomingQBERStream(1.15, false, targetNodeId, 'UI_SWITCH');
    }
  }

  /**
   * Checks all nodes for QBER exceeding QBER_CRITICAL_THRESHOLD (11.0%) when Automated Mitigation is enabled,
   * and automatically triggers Post-Quantum Kyber-1024 key rotation for those nodes.
   */
  private checkAndTriggerAutoMitigation(delayMs: number = 850) {
    if (!this.firewallConfig.automatedMitigation) {
      this.autoMitigationTimers.forEach((timer) => clearTimeout(timer));
      this.autoMitigationTimers.clear();
      return;
    }

    this.nodes.forEach((node) => {
      if (node.isolated) return;
      const exceedsThreshold = (node.qber || 0) > QBER_CRITICAL_THRESHOLD || node.activeAttack !== 'NONE';
      if (!exceedsThreshold) return;

      if (delayMs <= 0) {
        if (this.autoMitigationTimers.has(node.id)) {
          clearTimeout(this.autoMitigationTimers.get(node.id));
          this.autoMitigationTimers.delete(node.id);
        }
        this.rotateQuantumKeys(node.id, true);
      } else if (!this.autoMitigationTimers.has(node.id)) {
        const timerId = setTimeout(() => {
          this.autoMitigationTimers.delete(node.id);
          if (!this.firewallConfig.automatedMitigation) return;
          const currentNode = this.nodes.find((n) => n.id === node.id);
          if (
            currentNode &&
            !currentNode.isolated &&
            ((currentNode.qber || 0) > QBER_CRITICAL_THRESHOLD || currentNode.activeAttack !== 'NONE')
          ) {
            this.rotateQuantumKeys(node.id, true);
          }
        }, delayMs);
        this.autoMitigationTimers.set(node.id, timerId);
      }
    });
  }

  // Update SCADA Firewall Switches & Rules with immediate effect on grid nodes
  public updateFirewallRules(partial: Partial<FirewallConfig>) {
    this.firewallConfig = { ...this.firewallConfig, ...partial };
    this.notifyFirewallListeners();

    this.nodes = this.nodes.map((node) => {
      let updatedStatus = node.status;
      let updatedAttack = node.activeAttack;
      let updatedQber = node.qber;
      let updatedPqc = node.pqcKeyStatus;
      let updatedHistory = node.eventHistory || [];

      if (partial.automatedMitigation !== undefined) {
        updatedHistory = this.appendNodeEvent(
          node,
          'MITIGATION',
          `Automated Mitigation ${partial.automatedMitigation ? 'Enabled' : 'Disabled'}`,
          partial.automatedMitigation
            ? `Auto key rotation armed for QBER > ${QBER_CRITICAL_THRESHOLD.toFixed(1)}%.`
            : 'Switched to manual operator key rotation.'
        );
      }

      if (partial.enablePqcKyber !== undefined) {
        updatedPqc = partial.enablePqcKyber
          ? (node.activeAttack === 'QUANTUM_PROBE' ? 'KYBER_1024_SYNCED' : node.pqcKeyStatus === 'KEY_ROTATION_PENDING' ? 'KYBER_1024_SYNCED' : node.pqcKeyStatus)
          : 'KEY_ROTATION_PENDING';
        if (partial.enablePqcKyber && node.activeAttack === 'QUANTUM_PROBE') {
          updatedAttack = 'NONE';
          updatedStatus = node.isolated ? 'ISOLATED' : 'NOMINAL';
          updatedQber = 1.15;
          updatedHistory = this.appendNodeEvent(
            { ...node, eventHistory: updatedHistory },
            'MITIGATION',
            'Kyber-1024 Enforcement Neutralized Probe',
            'Mandatory KEM handshake blocked active quantum probe.'
          );
        }
      }

      if (partial.enforceStrictGatt && (node.activeAttack === 'MITM_SPOOFING' || node.activeAttack === 'REPLAY_ATTACK')) {
        updatedAttack = 'NONE';
        updatedStatus = node.isolated ? 'ISOLATED' : 'NOMINAL';
        updatedQber = 1.15;
        updatedHistory = this.appendNodeEvent(
          { ...node, eventHistory: updatedHistory },
          'MITIGATION',
          'Strict GATT Sanitization Mitigated Attack',
          `Dropped unauthenticated ${node.activeAttack} packets.`
        );
      }

      const updatedFreq = !node.isolated && updatedAttack === 'NONE'
        ? this.firewallConfig.pllFrequencyLock
        : node.frequency;

      return {
        ...node,
        frequency: updatedFreq,
        qber: updatedQber,
        activeAttack: updatedAttack,
        status: updatedStatus,
        pqcKeyStatus: updatedPqc,
        eventHistory: updatedHistory,
      };
    });

    this.emitPacketLog({
      id: `fw-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      sourceMac: 'SCADA_FIREWALL',
      targetNodeId: 'ALL_SUBSTATIONS',
      protocol: 'IEC_61850',
      type: 'COMMAND',
      payloadSummary: `FIREWALL SWITCH UPDATED: AutoMitigation=${this.firewallConfig.automatedMitigation ? 'ON' : 'OFF'}, Kyber1024=${this.firewallConfig.enablePqcKyber ? 'ON' : 'OFF'}, StrictGATT=${this.firewallConfig.enforceStrictGatt ? 'ON' : 'OFF'}, PLL=${this.firewallConfig.pllFrequencyLock.toFixed(2)}Hz`,
      status: 'ACCEPTED',
    });

    this.notifyListeners();

    // If Automated Mitigation was just enabled, immediately rotate keys on any node exceeding QBER threshold
    if (this.firewallConfig.automatedMitigation) {
      this.checkAndTriggerAutoMitigation(0);
    } else {
      this.checkAndTriggerAutoMitigation(0);
    }
  }

  // Inject Simulated Cyber Attack on Node
  public injectAttack(nodeId: string, attackType: AttackType) {
    let targetQber = 1.15;

    this.nodes = this.nodes.map((node) => {
      if (node.id === nodeId) {
        let newStatus = node.status;
        let newPqcStatus = node.pqcKeyStatus;
        let newQber = node.qber;
        let newLatency = node.latencyMs ?? 20;

        if (attackType === 'NONE') {
          newStatus = node.isolated ? 'ISOLATED' : 'NOMINAL';
          newPqcStatus = 'KYBER_1024_SYNCED';
          newQber = 1.15;
          newLatency = 18;
        } else if (attackType === 'MITM_SPOOFING' || attackType === 'REPLAY_ATTACK') {
          newStatus = 'WARNING';
          newPqcStatus = 'KEY_ROTATION_PENDING';
          newQber = 14.6;
          newLatency = 128;
        } else if (attackType === 'STUXNET_HARMONIC_DRIFT' || attackType === 'QUANTUM_PROBE') {
          newStatus = 'CRITICAL';
          newPqcStatus = 'COMPROMISED';
          newQber = 18.4;
          newLatency = 165;
        } else if (attackType === 'DDOS_SYNC_FLOOD') {
          newStatus = 'CRITICAL';
          newQber = 12.8;
          newLatency = 198;
        }

        targetQber = newQber;

        const updatedHistory =
          attackType === 'NONE'
            ? this.appendNodeEvent(
                node,
                'MITIGATION',
                'Attack Cleared & Link Stabilized',
                `Substation restored to nominal QBER (${newQber}%).`
              )
            : this.appendNodeEvent(
                node,
                'ALERT',
                `Intrusion Detected: ${attackType}`,
                `QBER surged to ${newQber}% | BLE RTT spiked to ${newLatency}ms.`
              );

        const updated: GridNode = {
          ...node,
          qber: newQber,
          latencyMs: newLatency,
          activeAttack: attackType,
          status: newStatus,
          pqcKeyStatus: newPqcStatus,
          eventHistory: updatedHistory,
        };

        this.emitPacketLog({
          id: `pkt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toLocaleTimeString(),
          sourceMac: node.macAddress,
          targetNodeId: node.id,
          protocol: attackType === 'QUANTUM_PROBE' ? 'PQC_KYBER_1024' : 'BLE_GATT_SCADA',
          type: attackType === 'NONE' ? 'TELEMETRY' : 'MALICIOUS_PAYLOAD',
          payloadSummary: `ATTACK SWITCH: [${attackType}] QBER=${newQber}% targeting GATT characteristic ${QGRID_CHARACTERISTIC_UUID.substring(0, 8)}.`,
          status: attackType === 'NONE' ? 'ACCEPTED' : 'FLAGGED'
        });

        return updated;
      }
      return node;
    });

    const anyStillAttacking = this.nodes.some((n) => n.activeAttack !== 'NONE');
    this.hardwareSwitchActive = anyStillAttacking;
    this.lastHardwareQber = anyStillAttacking ? targetQber : 1.15;

    evaluateQBERWithEdgeAI(this.lastHardwareQber, anyStillAttacking);
    this.qberStreamListeners.forEach((cb) =>
      cb({
        qber: this.lastHardwareQber || 1.15,
        attack: anyStillAttacking,
        rawPayload: JSON.stringify({ qber: this.lastHardwareQber || 1.15, attack: anyStillAttacking }),
        source: 'UI_SWITCH',
        timestamp: Date.now(),
      })
    );

    this.notifyListeners();

    if (this.firewallConfig.automatedMitigation && anyStillAttacking) {
      this.checkAndTriggerAutoMitigation(850);
    }
  }

  // Toggle Isolation / Firewall Rule for Node
  public toggleIsolation(nodeId: string) {
    this.nodes = this.nodes.map((node) => {
      if (node.id === nodeId) {
        const isNowIsolated = !node.isolated;
        const updatedHistory = this.appendNodeEvent(
          node,
          isNowIsolated ? 'MITIGATION' : 'CONNECTION',
          isNowIsolated ? 'Substation Breaker Isolated (OPEN)' : 'Substation Reconnected to Grid (CLOSED)',
          isNowIsolated
            ? 'Microgrid islanding engaged; BLE telemetry link paused.'
            : `BLE link re-synchronized at ${node.rssi} dBm.`
        );

        const updated: GridNode = {
          ...node,
          isolated: isNowIsolated,
          activeAttack: isNowIsolated ? 'NONE' : node.activeAttack,
          qber: isNowIsolated ? 0.5 : node.qber,
          latencyMs: isNowIsolated ? 0 : 19,
          status: isNowIsolated ? 'ISOLATED' : (node.activeAttack !== 'NONE' ? 'CRITICAL' : 'NOMINAL'),
          eventHistory: updatedHistory,
        };

        this.emitPacketLog({
          id: `pkt-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          sourceMac: 'FIREWALL_SENTINEL',
          targetNodeId: node.id,
          protocol: 'IEC_61850',
          type: 'COMMAND',
          payloadSummary: isNowIsolated 
            ? `BREAKER SWITCH OPEN: Node ${node.name} isolated from grid backbone.`
            : `BREAKER SWITCH CLOSED: Node ${node.name} rejoined post-quantum SCADA mesh.`,
          status: 'ACCEPTED'
        });

        return updated;
      }
      return node;
    });

    this.notifyListeners();
  }

  // Rotate Post-Quantum Keys for all or specific node
  public rotateQuantumKeys(nodeId?: string, isAutomated: boolean = false) {
    this.nodes = this.nodes.map((node) => {
      if (!nodeId || node.id === nodeId) {
        const prevQber = (node.qber || 1.15).toFixed(2);
        this.emitPacketLog({
          id: `pqc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: new Date().toLocaleTimeString(),
          sourceMac: isAutomated ? 'AUTO_MITIGATION_SENTINEL' : node.macAddress,
          targetNodeId: node.id,
          protocol: 'PQC_KYBER_1024',
          type: 'KEY_EXCHANGE',
          payloadSummary: isAutomated
            ? `AUTOMATED MITIGATION: Node ${node.name} QBER (${prevQber}%) > ${QBER_CRITICAL_THRESHOLD}% threshold -> Auto-triggered Kyber-1024 key rotation.`
            : `PQC KEY ROTATED: Kyber-1024 KEM handshake complete. Dilithium-5 signed.`,
          status: 'ACCEPTED'
        });

        const updatedHistory = this.appendNodeEvent(
          node,
          'MITIGATION',
          isAutomated
            ? 'Automated Mitigation: Kyber-1024 Key Rotated'
            : 'Manual Mitigation: Kyber-1024 Key Rotated',
          isAutomated
            ? `Auto-triggered at QBER=${prevQber}% (> ${QBER_CRITICAL_THRESHOLD.toFixed(1)}%). Fresh KEM key synced.`
            : `Operator rotated PQC session key (prev QBER ${prevQber}% -> 1.10%).`
        );

        return {
          ...node,
          qber: 1.10,
          thd: 1.2,
          latencyMs: 16,
          frequency: this.firewallConfig.pllFrequencyLock,
          pqcKeyStatus: 'KYBER_1024_SYNCED',
          status: node.isolated ? 'ISOLATED' : 'NOMINAL',
          activeAttack: 'NONE',
          eventHistory: updatedHistory,
        };
      }
      return node;
    });

    const anyRemainingAttack = this.nodes.some(
      (n) => !n.isolated && (n.activeAttack !== 'NONE' || (n.qber || 0) > QBER_CRITICAL_THRESHOLD)
    );

    if (!nodeId || !anyRemainingAttack) {
      this.hardwareSwitchActive = false;
      this.lastHardwareQber = 1.10;
      evaluateQBERWithEdgeAI(1.10, false);
      this.qberStreamListeners.forEach((cb) =>
        cb({
          qber: 1.10,
          attack: false,
          rawPayload: JSON.stringify({ qber: 1.10, attack: false, autoMitigated: isAutomated }),
          source: 'UI_SWITCH',
          timestamp: Date.now(),
        })
      );
    }

    this.notifyListeners();
  }

  private startSimulationLoop() {
    this.timer = setInterval(() => {
      let anyNodeExceededQber = false;

      this.nodes = this.nodes.map((node) => {
        if (node.isolated) {
          return { ...node, latencyMs: 0 };
        }

        // Do not overwrite real BLE hardware node telemetry if connected
        if (node.id.startsWith('real-ble') && this.isDeviceConnected()) {
          if ((node.qber || 0) > QBER_CRITICAL_THRESHOLD) {
            anyNodeExceededQber = true;
          }
          const bleRtt = Math.max(8, Math.min(220, Math.round(14 + Math.random() * 6 + ((node.qber || 1) > 11 ? 95 : 0))));
          return { ...node, latencyMs: bleRtt };
        }

        let freqDelta = (Math.random() - 0.5) * 0.04;
        let thdDelta = (Math.random() - 0.5) * 0.08;
        let qberJitter = (Math.random() - 0.5) * 0.08;
        let rssiJitter = Math.floor((Math.random() - 0.5) * 3);

        let currentQber = node.qber || 1.2;

        if (node.activeAttack === 'STUXNET_HARMONIC_DRIFT') {
          freqDelta = (Math.random() - 0.3) * 0.4;
          thdDelta = Math.random() * 2.5 + 4.0;
          currentQber = 13.5 + Math.random() * 2.5;
        } else if (node.activeAttack === 'QUANTUM_PROBE' || node.activeAttack === 'MITM_SPOOFING') {
          currentQber = (this.lastHardwareQber && this.lastHardwareQber > 11 ? this.lastHardwareQber : 16.8) + (Math.random() - 0.5) * 0.6;
        } else if (node.activeAttack === 'DDOS_SYNC_FLOOD') {
          rssiJitter -= 15;
          currentQber = 12.4 + Math.random() * 1.5;
        } else if (node.activeAttack === 'REPLAY_ATTACK') {
          currentQber = 13.2 + Math.random() * 1.2;
        } else {
          currentQber = Math.max(0.5, Math.min(2.4, currentQber + qberJitter));
        }

        const baseFreq = node.activeAttack === 'NONE' ? this.firewallConfig.pllFrequencyLock : node.frequency;
        const newFrequency = parseFloat(Math.max(47.0, Math.min(53.5, baseFreq + freqDelta)).toFixed(2));
        const newThd = parseFloat(
          Math.max(0.4, Math.min(15.0, (node.activeAttack === 'NONE' ? 1.2 : node.thd) + thdDelta)).toFixed(2)
        );
        const newQber = parseFloat(currentQber.toFixed(2));
        const newRssi = Math.max(-95, Math.min(-30, node.rssi + rssiJitter));

        // Calculate realistic BLE packet round-trip latency (ms) from RSSI, QBER & attack congestion
        const signalPenalty = Math.max(0, (-newRssi - 40) * 0.55);
        const attackPenalty =
          node.activeAttack === 'DDOS_SYNC_FLOOD'
            ? 145 + Math.random() * 35
            : node.activeAttack !== 'NONE' || newQber > QBER_CRITICAL_THRESHOLD
            ? 95 + Math.random() * 30
            : 0;
        const newLatencyMs = Math.max(
          9,
          Math.min(240, Math.round(11 + signalPenalty + attackPenalty + (Math.random() - 0.5) * 5))
        );

        if (newQber > QBER_CRITICAL_THRESHOLD) {
          anyNodeExceededQber = true;
        }

        if (Math.random() > 0.65) {
          const isAttacking = node.activeAttack !== 'NONE';
          this.emitPacketLog({
            id: `pkt-${Date.now()}-${Math.floor(Math.random() * 100)}`,
            timestamp: new Date().toLocaleTimeString(),
            sourceMac: node.macAddress,
            targetNodeId: node.id,
            protocol: 'BLE_GATT_SCADA',
            type: isAttacking ? 'MALICIOUS_PAYLOAD' : 'TELEMETRY',
            payloadSummary: JSON.stringify({ qber: newQber, attack: isAttacking, rttMs: newLatencyMs }),
            status: isAttacking ? 'FLAGGED' : 'ACCEPTED'
          });
        }

        return {
          ...node,
          frequency: newFrequency,
          thd: newThd,
          qber: newQber,
          rssi: newRssi,
          latencyMs: newLatencyMs,
          lastPacketTime: Date.now(),
          packetsReceived: node.packetsReceived + 1
        };
      });

      this.notifyListeners();

      if (this.firewallConfig.automatedMitigation && anyNodeExceededQber) {
        this.checkAndTriggerAutoMitigation(650);
      }
    }, 1000);
  }

  public subscribe(callback: (nodes: GridNode[]) => void) {
    this.listeners.push(callback);
    callback(this.nodes);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public subscribePackets(callback: (packet: PacketLog) => void) {
    this.packetListeners.push(callback);
    return () => {
      this.packetListeners = this.packetListeners.filter((l) => l !== callback);
    };
  }

  public subscribeQBERStream(callback: (event: QBERStreamEvent) => void) {
    this.qberStreamListeners.push(callback);
    return () => {
      this.qberStreamListeners = this.qberStreamListeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb(this.nodes));
  }

  private emitPacketLog(packet: PacketLog) {
    this.packetListeners.forEach((cb) => cb(packet));
  }

  public updateNodePosition(nodeId: string, x: number, y: number) {
    const clampedX = Math.max(8, Math.min(92, x));
    const clampedY = Math.max(10, Math.min(88, y));
    this.nodes = this.nodes.map((node) =>
      node.id === nodeId ? { ...node, x: clampedX, y: clampedY } : node
    );
    this.notifyListeners();
  }

  public getNodes(): GridNode[] {
    return this.nodes;
  }
}

export const bluetoothService = new WebBluetoothGridService();
