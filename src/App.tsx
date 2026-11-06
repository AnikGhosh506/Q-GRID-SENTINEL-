import React, { useState, useEffect, useRef } from 'react';
import { GridNode, PacketLog, AttackType } from './types/grid';
import { bluetoothService, QGRID_SERVICE_UUID, QGRID_CHARACTERISTIC_UUID } from './services/bluetooth';
import {
  evaluateQBERWithEdgeAI,
  QBER_CRITICAL_THRESHOLD,
  EdgeAIResult,
  getSentinelSettings,
  subscribeSentinelSettings,
  SentinelSettings,
} from './services/edgeAI';
import { Navbar } from './components/Navbar';
import { GridTopologyCanvas } from './components/GridTopologyCanvas';
import { GridOscilloscope } from './components/GridOscilloscope';
import { QuantumSecurityPanel } from './components/QuantumSecurityPanel';
import { BLETelemetryPanel } from './components/BLETelemetryPanel';
import { AttackSimulatorPanel } from './components/AttackSimulatorPanel';
import { FirewallRulesPanel } from './components/FirewallRulesPanel';
import { AISentinelPanel } from './components/AISentinelPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallModal } from './components/PWAInstallModal';
import { SettingsModal } from './components/SettingsModal';
import { ScreenSpaceGlowPulse } from './components/ScreenSpaceGlowPulse';
import { DatabaseSyncPanel } from './components/DatabaseSyncPanel';
import { ThreeSceneCanvas } from './components/ThreeSceneCanvas';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { speechAlertService } from './services/speechAlert';
import { digitalAlarmService } from './services/digitalAlarm';
import { databaseLogger } from './services/databaseLogger';
import {
  AlertTriangle,
  Smartphone,
  Sliders,
  Power,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  History,
  Settings,
} from 'lucide-react';

interface AlertEventHistoryItem {
  id: string;
  timestamp: string;
  peakQber: number;
  source: string;
}

export default function App() {
  const [nodes, setNodes] = useState<GridNode[]>([]);
  const [packetLogs, setPacketLogs] = useState<PacketLog[]>([]);
  const [activeTab, setActiveTab] = useState<string>('topology');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-alpha-1');
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [sentinelSettings, setSentinelSettings] = useState<SentinelSettings>(() =>
    getSentinelSettings()
  );
  const [manualQberOverride, setManualQberOverride] = useState<number | null>(null);
  const [hardwareAttackFlag, setHardwareAttackFlag] = useState<boolean>(false);
  const [bleNotice, setBleNotice] = useState<string | null>(null);
  const [voiceAlertsEnabled, setVoiceAlertsEnabled] = useState<boolean>(true);

  // #alert-container Auto-Collapse (10s of no new attack data), Restore, Manual Resize, Digital Alarm & Last-5 Alert Event History
  const alertContainerRef = useRef<HTMLDivElement | null>(null);
  const prevAlertTriggeredRef = useRef<boolean>(false);
  const [isAlertMinimized, setIsAlertMinimized] = useState<boolean>(false);
  const [lastAttackDataTimestamp, setLastAttackDataTimestamp] = useState<number>(() => Date.now());
  const [alertAutoCollapseSeconds, setAlertAutoCollapseSeconds] = useState<number>(10);
  const [alarmVolume, setAlarmVolume] = useState<number>(0.35);
  const [alertEventHistory, setAlertEventHistory] = useState<AlertEventHistoryItem[]>([]);
  const [alertSize, setAlertSize] = useState<{ width: number | null; height: number | null }>({
    width: null,
    height: null,
  });
  const [alertResizeDir, setAlertResizeDir] = useState<'e' | 's' | 'se' | null>(null);
  const alertResizeStartRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  }>({
    startX: 0,
    startY: 0,
    origW: 800,
    origH: 130,
  });

  const lastLoggedOccurrenceTimeRef = useRef<number>(0);

  const recordFreshAttackData = (triggeredQber?: number, sourceLabel?: string) => {
    const nowMs = Date.now();
    setLastAttackDataTimestamp(nowMs);
    setIsAlertMinimized(false);
    setAlertAutoCollapseSeconds(10);

    if (triggeredQber !== undefined && triggeredQber > QBER_CRITICAL_THRESHOLD) {
      const nowStamp = new Date(nowMs).toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const roundedPeak = Number(triggeredQber.toFixed(2));
      const elapsedSinceLastLog = nowMs - lastLoggedOccurrenceTimeRef.current;
      lastLoggedOccurrenceTimeRef.current = nowMs;

      setAlertEventHistory((prev) => {
        if (elapsedSinceLastLog < 450 && prev.length > 0) {
          const updatedFirst: AlertEventHistoryItem = {
            ...prev[0],
            peakQber: Math.max(prev[0].peakQber, roundedPeak),
            source: sourceLabel || prev[0].source,
          };
          return [updatedFirst, ...prev.slice(1)].slice(0, 5);
        }
        const entry: AlertEventHistoryItem = {
          id: `alrt-${nowMs}-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowStamp,
          peakQber: roundedPeak,
          source: sourceLabel || 'QUANTUM_INTERCEPTION',
        };
        return [entry, ...prev].slice(0, 5);
      });

      databaseLogger.logTrigger({
        triggerType:
          sourceLabel === 'ESP32_BLE_GATT' || sourceLabel === 'EVE_SWITCH_TRIGGER'
            ? 'EVE_SWITCH_ACTIVATED'
            : 'QBER_THRESHOLD_EXCEEDED',
        severity: roundedPeak > QBER_CRITICAL_THRESHOLD + 4 ? 'CRITICAL' : 'HIGH',
        source: sourceLabel || 'QUANTUM_INTERCEPTION',
        nodeId: selectedNodeId || 'node-alpha-1',
        nodeName: selectedNodeId || 'ALPHA-1 SUBSTATION',
        peakQber: roundedPeak,
        thresholdValue: QBER_CRITICAL_THRESHOLD,
        anomalyScore: Math.min(0.99, roundedPeak / 20),
        autoMitigated: bluetoothService.getFirewallConfig().automatedMitigation,
      });
    }
  };
  const [edgeAIVerdict, setEdgeAIVerdict] = useState<EdgeAIResult>({
    isCompromised: false,
    anomalyScore: 0.01,
    engine: 'THRESHOLD_FALLBACK',
    qber: 1.15,
    attack: false,
  });
  const [threatHistory, setThreatHistory] = useState<
    { time: string; secondsAgo: number; anomalyScore: number; qber: number; isAttack: boolean }[]
  >(() => {
    const now = Date.now();
    return Array.from({ length: 60 }, (_, idx) => {
      const secAgo = 59 - idx;
      const t = new Date(now - secAgo * 1000);
      const baseScore = Number((0.02 + Math.sin(idx * 0.3) * 0.01 + Math.random() * 0.015).toFixed(3));
      return {
        time: t.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
        secondsAgo: secAgo,
        anomalyScore: Math.max(0.01, baseScore),
        qber: Number((1.1 + Math.sin(idx * 0.3) * 0.2).toFixed(2)),
        isAttack: false,
      };
    });
  });

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const unsubNodes = bluetoothService.subscribe((updatedNodes) => {
      setNodes([...updatedNodes]);
      if (!selectedNodeId && updatedNodes.length > 0) {
        setSelectedNodeId(updatedNodes[0].id);
      }
    });

    const unsubPackets = bluetoothService.subscribePackets((packet) => {
      setPacketLogs((prev) => [...prev.slice(-49), packet]);
    });

    // Direct subscription to incoming ESP32 BLE & UI Switch QBER stream
    const unsubQber = bluetoothService.subscribeQBERStream((streamEvt) => {
      setHardwareAttackFlag(streamEvt.attack);
      if (streamEvt.attack || streamEvt.qber > QBER_CRITICAL_THRESHOLD) {
        recordFreshAttackData(
          streamEvt.qber,
          streamEvt.source === 'BLE_HARDWARE' ? 'ESP32_BLE_GATT' : 'EVE_SWITCH_TRIGGER'
        );
      }
      if (streamEvt.source === 'BLE_HARDWARE') {
        setManualQberOverride(streamEvt.qber);
        setBleNotice(
          `ESP32 Switch Event: QBER=${streamEvt.qber.toFixed(2)}% | Attack=${streamEvt.attack ? 'TRUE' : 'FALSE'}`
        );
      } else {
        setManualQberOverride(streamEvt.attack ? streamEvt.qber : null);
        if (!streamEvt.attack && streamEvt.rawPayload.includes('"autoMitigated":true')) {
          setBleNotice(
            `AUTOMATED MITIGATION EXECUTED: QBER exceeded ${QBER_CRITICAL_THRESHOLD.toFixed(1)}% threshold -> Post-Quantum Kyber-1024 keys automatically rotated.`
          );
        }
      }
    });

      return () => {
      unsubNodes();
      unsubPackets();
      unsubQber();
    };
  }, []);

  useEffect(() => {
    const unsubSettings = subscribeSentinelSettings((updated) => {
      setSentinelSettings(updated);
    });
    return unsubSettings;
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0] || {
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
    macAddress: '4A:8B:12:FE:90:01',
    status: 'NOMINAL',
    activeAttack: 'NONE',
    pqcKeyStatus: 'KYBER_1024_SYNCED',
    lastPacketTime: Date.now(),
    packetsReceived: 100,
    isolated: false,
  };

  const handleInjectAttack = (nodeId: string, attackType: AttackType) => {
    if (attackType === 'NONE') {
      setManualQberOverride(null);
      setHardwareAttackFlag(false);
      databaseLogger.logActivity({
        action: 'CLEAR_NODE_ATTACK',
        category: 'NODE_CONTROL',
        details: `Cleared simulated attack on node ${nodeId}`,
        nodeId,
        qberAtEvent: 1.15,
      });
    } else {
      const injectedPeak =
        attackType === 'STUXNET_HARMONIC_DRIFT' || attackType === 'QUANTUM_PROBE'
          ? 18.4
          : attackType === 'MITM_SPOOFING' || attackType === 'REPLAY_ATTACK'
          ? 14.6
          : 12.8;
      recordFreshAttackData(injectedPeak, attackType);
      databaseLogger.logTrigger({
        triggerType: 'ATTACK_VECTOR_INJECTED',
        severity: 'CRITICAL',
        source: attackType,
        nodeId,
        nodeName: nodes.find((n) => n.id === nodeId)?.name || nodeId,
        peakQber: injectedPeak,
        thresholdValue: sentinelSettings.qberCriticalThreshold,
        anomalyScore: 0.92,
        autoMitigated: bluetoothService.getFirewallConfig().automatedMitigation,
      });
    }
    bluetoothService.injectAttack(nodeId, attackType);
  };

  const handleClearAttacks = () => {
    setManualQberOverride(null);
    setHardwareAttackFlag(false);
    setIsAlertMinimized(false);
    bluetoothService.toggleAttackSwitch(false, selectedNode.id);
    databaseLogger.logTrigger({
      triggerType: 'ALERT_CLEARED',
      severity: 'NOMINAL',
      source: 'USER_MITIGATION_CONTROL',
      nodeId: selectedNode.id,
      nodeName: selectedNode.name,
      peakQber: 1.15,
      thresholdValue: sentinelSettings.qberCriticalThreshold,
      anomalyScore: 0.01,
      autoMitigated: false,
    });
    databaseLogger.logActivity({
      action: 'MITIGATE_AND_CLEAR_ATTACKS',
      category: 'PQC_MITIGATION',
      details: `Rotated Kyber-1024 keys and cleared active interception on ${selectedNode.name}`,
      nodeId: selectedNode.id,
      qberAtEvent: 1.15,
    });
  };

  const handleToggleIsolation = (nodeId: string) => {
    bluetoothService.toggleIsolation(nodeId);
    const target = nodes.find((n) => n.id === nodeId);
    databaseLogger.logActivity({
      action: target?.isolated ? 'RECONNECT_SUBSTATION_NODE' : 'ISOLATE_SUBSTATION_NODE',
      category: 'NODE_CONTROL',
      details: `Toggled microgrid breaker isolation for ${target?.name || nodeId}`,
      nodeId,
      qberAtEvent: target?.qber ?? 1.15,
    });
  };

  const handleRotateKey = (nodeId: string) => {
    bluetoothService.rotateQuantumKeys(nodeId);
    const target = nodes.find((n) => n.id === nodeId);
    databaseLogger.logActivity({
      action: 'ROTATE_NODE_KYBER_1024_KEY',
      category: 'PQC_MITIGATION',
      details: `Executed CRYSTALS-Kyber-1024 key encapsulation rotation for ${target?.name || nodeId}`,
      nodeId,
      qberAtEvent: target?.qber ?? 1.15,
    });
  };

  const handleRotateAllKeys = () => {
    setManualQberOverride(null);
    setHardwareAttackFlag(false);
    bluetoothService.rotateQuantumKeys();
    databaseLogger.logActivity({
      action: 'ROTATE_ALL_GRID_KYBER_1024_KEYS',
      category: 'PQC_MITIGATION',
      details: 'Executed global CRYSTALS-Kyber-1024 key rotation across all 5 substation nodes',
      nodeId: 'global',
      qberAtEvent: 1.15,
    });
  };

  const handleConnectBluetooth = async () => {
    setBleNotice('Scanning for Web Bluetooth device Q-GRID_SENTINEL...');
    databaseLogger.logActivity({
      action: 'BLE_GATT_PAIRING_REQUESTED',
      category: 'BLE_CONNECTION',
      details: 'Initiated W3C Web Bluetooth scan for Q-GRID_SENTINEL (Service 4fafc201...)',
      nodeId: selectedNode.id,
      qberAtEvent: selectedNode.qber ?? 1.15,
    });
    const res = await bluetoothService.requestRealBluetoothDevice();
    if (res.success) {
      setBleNotice(`Connected to ${res.deviceName}! Listening on characteristic beb5483e...`);
    } else {
      setBleNotice(res.error || 'Bluetooth pairing cancelled.');
    }
  };

  const isAnyAttacking =
    hardwareAttackFlag || nodes.some((n) => n.activeAttack !== 'NONE');
  const computedPeakQber = nodes.length > 0
    ? Math.max(...nodes.map((n) => n.qber || 1.15))
    : 1.15;
  const computedMeanNodeQber =
    nodes.length > 0
      ? nodes.reduce((sum, n) => sum + (n.qber ?? 1.15), 0) / nodes.length
      : 1.15;
  const effectiveQber = manualQberOverride !== null ? manualQberOverride : computedPeakQber;
  // Overall grid-wide average QBER across substation nodes (responsive to manual scrubber & hardware switch)
  const gridWideAverageQber =
    manualQberOverride !== null
      ? Number(((computedMeanNodeQber + manualQberOverride) / 2).toFixed(2))
      : Number(computedMeanNodeQber.toFixed(2));

  // Evaluate QBER & Attack state with TensorFlow.js Edge AI (with offline threshold fallback)
  useEffect(() => {
    const verdict = evaluateQBERWithEdgeAI(
      effectiveQber,
      isAnyAttacking || effectiveQber > sentinelSettings.qberCriticalThreshold
    );
    setEdgeAIVerdict(verdict);

    const nowTime = new Date().toLocaleTimeString([], {
      hour12: false,
      minute: '2-digit',
      second: '2-digit',
    });

    setThreatHistory((prev) => {
      const next = [
        ...prev.slice(-59),
        {
          time: nowTime,
          secondsAgo: 0,
          anomalyScore: verdict.anomalyScore,
          qber: Number(verdict.qber.toFixed(2)),
          isAttack: verdict.isCompromised,
        },
      ];
      return next.map((pt, idx) => ({
        ...pt,
        secondsAgo: next.length - 1 - idx,
      }));
    });
  }, [
    effectiveQber,
    isAnyAttacking,
    sentinelSettings.qberCriticalThreshold,
    sentinelSettings.anomalySensitivity,
    sentinelSettings.anomalyTriggerCutoff,
  ]);

  const isAlertTriggered =
    edgeAIVerdict.isCompromised ||
    isAnyAttacking ||
    effectiveQber > sentinelSettings.qberCriticalThreshold;

  const handleCaptureSystemCondition = (noteOverride?: string) => {
    const activeCount = nodes.filter((n) => !n.isolated).length;
    const isolatedCount = nodes.filter((n) => n.isolated).length;
    const status = isAlertTriggered
      ? 'COMPROMISED'
      : gridWideAverageQber > sentinelSettings.qberCriticalThreshold * 0.65
      ? 'ELEVATED'
      : 'NOMINAL';
    databaseLogger.logSystemCondition({
      conditionStatus: status,
      gridWideAvgQber: gridWideAverageQber,
      peakQber: effectiveQber,
      qberCriticalThreshold: sentinelSettings.qberCriticalThreshold,
      anomalyScore: edgeAIVerdict.anomalyScore,
      sensitivityPreset: sentinelSettings.sensitivityPreset,
      automatedMitigationEnabled: bluetoothService.getFirewallConfig().automatedMitigation,
      activeNodesCount: activeCount || 5,
      isolatedNodesCount: isolatedCount,
      summaryNote:
        noteOverride ||
        `Grid condition ${status} | Avg QBER: ${gridWideAverageQber.toFixed(2)}% | Peak QBER: ${effectiveQber.toFixed(2)}% | Threshold: ${sentinelSettings.qberCriticalThreshold.toFixed(1)}%`,
    });
  };

  // Reset 10-second timer whenever alert transitions from inactive -> active, and persist condition snapshot
  useEffect(() => {
    if (isAlertTriggered && !prevAlertTriggeredRef.current) {
      setLastAttackDataTimestamp(Date.now());
      setIsAlertMinimized(false);
      setAlertAutoCollapseSeconds(10);
      handleCaptureSystemCondition(
        `CRITICAL ALERT TRIGGERED: Peak QBER=${effectiveQber.toFixed(2)}%, Grid Avg=${gridWideAverageQber.toFixed(2)}%`
      );
    } else if (!isAlertTriggered && prevAlertTriggeredRef.current) {
      setIsAlertMinimized(false);
      setAlertAutoCollapseSeconds(10);
      handleCaptureSystemCondition(
        `GRID RESTORED TO NOMINAL: Peak QBER=${effectiveQber.toFixed(2)}%`
      );
    }
    prevAlertTriggeredRef.current = isAlertTriggered;
  }, [isAlertTriggered]);

  // Keep the most recent triggered attack event's peakQber updated if QBER climbs higher during the active attack
  useEffect(() => {
    if (!isAlertTriggered) return;
    const currentPeak = Number(effectiveQber.toFixed(2));
    setAlertEventHistory((prev) => {
      if (prev.length === 0) return prev;
      if (currentPeak > prev[0].peakQber) {
        const updatedHead = { ...prev[0], peakQber: currentPeak };
        return [updatedHead, ...prev.slice(1)];
      }
      return prev;
    });
  }, [effectiveQber, isAlertTriggered]);

  // Play high-frequency digital alarm loop (Web Audio API) ONLY while #alert-container is in its expanded 'Alert' state
  useEffect(() => {
    if (isAlertTriggered && !isAlertMinimized) {
      digitalAlarmService.startLoop();
    } else {
      digitalAlarmService.stopLoop();
    }
    return () => {
      digitalAlarmService.stopLoop();
    };
  }, [isAlertTriggered, isAlertMinimized]);

  const handleAlarmVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setAlarmVolume(clamped);
    digitalAlarmService.setVolume(clamped);
  };

  // Automatically collapse #alert-container to a minimized state after 10 seconds of no new attack data
  useEffect(() => {
    if (!isAlertTriggered || isAlertMinimized) return;

    const intervalId = setInterval(() => {
      const elapsedMs = Date.now() - lastAttackDataTimestamp;
      const remainingSec = Math.max(0, Math.ceil((10000 - elapsedMs) / 1000));
      setAlertAutoCollapseSeconds(remainingSec);

      if (elapsedMs >= 10000) {
        setIsAlertMinimized(true);
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [isAlertTriggered, isAlertMinimized, lastAttackDataTimestamp]);

  const handleRestoreAlertContainer = () => {
    setIsAlertMinimized(false);
    setLastAttackDataTimestamp(Date.now());
    setAlertAutoCollapseSeconds(10);
  };

  const handleStartAlertResize = (
    dir: 'e' | 's' | 'se',
    e: React.PointerEvent<HTMLElement>
  ) => {
    e.stopPropagation();
    const rect = alertContainerRef.current?.getBoundingClientRect();
    const currentW = alertSize.width || rect?.width || 800;
    const currentH = alertSize.height || rect?.height || 130;
    setAlertResizeDir(dir);
    alertResizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: currentW,
      origH: currentH,
    };
    if (alertContainerRef.current) {
      try {
        alertContainerRef.current.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const handleAlertPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!alertResizeDir) return;
    const dx = e.clientX - alertResizeStartRef.current.startX;
    const dy = e.clientY - alertResizeStartRef.current.startY;
    let nextW = alertSize.width;
    let nextH = alertSize.height;

    if (alertResizeDir === 'e' || alertResizeDir === 'se') {
      nextW = Math.max(300, Math.min(1280, Math.round(alertResizeStartRef.current.origW + dx)));
    }
    if (alertResizeDir === 's' || alertResizeDir === 'se') {
      nextH = Math.max(
        isAlertMinimized ? 54 : 105,
        Math.min(520, Math.round(alertResizeStartRef.current.origH + dy))
      );
    }

    setAlertSize({ width: nextW, height: nextH });
  };

  const handleAlertPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (alertResizeDir) {
      setAlertResizeDir(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const handleTriggerSimulatedAttack = () => {
    recordFreshAttackData();
    setManualQberOverride(18.6);
    setHardwareAttackFlag(true);
    bluetoothService.toggleAttackSwitch(true, selectedNode.id);
  };

  const handleToggleAttackSwitch = () => {
    if (isAlertTriggered) {
      handleClearAttacks();
    } else {
      handleTriggerSimulatedAttack();
    }
  };

  const handleQberSliderChange = (val: number) => {
    setManualQberOverride(val);
    const shouldAttack = val > QBER_CRITICAL_THRESHOLD;
    if (shouldAttack) {
      recordFreshAttackData();
    }
    setHardwareAttackFlag(shouldAttack);
    bluetoothService.processIncomingQBERStream(
      val,
      shouldAttack,
      selectedNode.id,
      'UI_SWITCH'
    );
  };

  return (
    <div className="relative min-h-screen bg-[#04060a] text-[#00ff88] cyber-scanlines pointer-events-auto flex flex-col font-display">
      {/* Frame-Based Screen-Space Glow Pulse Overlay (intensifies in frequency & color warmth when grid-wide average QBER > critical threshold) */}
      <ScreenSpaceGlowPulse
        averageQber={gridWideAverageQber}
        criticalThreshold={sentinelSettings.qberCriticalThreshold}
        isAttackActive={gridWideAverageQber > sentinelSettings.qberCriticalThreshold}
      />

      <div className="relative z-10 flex flex-col min-h-screen pointer-events-auto">
        {/* 3-Zone Top Bar Contract */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onConnectBluetooth={handleConnectBluetooth}
          onRequestIOSGuide={() => setIsIOSModalOpen(true)}
          averageQber={gridWideAverageQber}
        />

        {/* Scientific Telemetry & Interactive Hardware Switch Ribbon */}
        <div className="border-b border-emerald-500/20 bg-[#070b14]/90 px-4 lg:px-8 py-2.5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-xs font-mono">
            {/* Left: Live QBER Readout, Grid-Wide Average QBER & Edge AI Status */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-400 uppercase tracking-wider">QBER READOUT:</span>
                <span
                  id="qber-readout"
                  className={`text-xl font-bold tabular-nums ${
                    isAlertTriggered
                      ? 'text-[#ff0055] glow-red'
                      : effectiveQber > 6
                      ? 'text-amber-400'
                      : 'text-[#00ff88] glow-green'
                  }`}
                >
                  {`${effectiveQber.toFixed(2)}%`}
                </span>
                <span className="text-[11px] text-slate-500">
                  / {sentinelSettings.qberCriticalThreshold.toFixed(1)}% MAX
                </span>
              </div>

              <span className="text-slate-700">·</span>

              <div className="flex items-baseline gap-1.5">
                <span className="text-slate-400">GRID AVG:</span>
                <span
                  id="grid-avg-qber-readout"
                  className={`font-bold tabular-nums ${
                    gridWideAverageQber > sentinelSettings.qberCriticalThreshold
                      ? 'text-[#ff0055] glow-red'
                      : gridWideAverageQber > sentinelSettings.qberCriticalThreshold * 0.65
                      ? 'text-amber-400'
                      : 'text-emerald-300'
                  }`}
                >
                  {gridWideAverageQber.toFixed(2)}%
                </span>
              </div>

              <span className="text-slate-700">|</span>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">EDGE AI:</span>
                <span className="text-cyan-300 font-semibold">
                  {edgeAIVerdict.engine === 'TENSORFLOW_JS_EDGE'
                    ? 'TensorFlow.js Neural'
                    : 'Deterministic Threshold'}
                </span>
                <span className="text-slate-500">·</span>
                <span className={isAlertTriggered ? 'text-[#ff0055] font-bold' : 'text-[#00ff88]'}>
                  {isAlertTriggered ? '✖ INTERCEPTION' : '● NOMINAL'}
                </span>
              </div>
            </div>

            {/* Center: Interactive QBER Scrubber */}
            <div className="flex items-center gap-3 bg-[#04060a] px-3 py-1.5 rounded-lg border border-emerald-500/25">
              <Sliders className="h-3.5 w-3.5 text-[#00ff88]" />
              <label htmlFor="qber-scrubber" className="text-slate-400 whitespace-nowrap">
                Scrub QBER:
              </label>
              <input
                id="qber-scrubber"
                type="range"
                min="0.5"
                max="24.0"
                step="0.2"
                value={effectiveQber}
                onChange={(e) => handleQberSliderChange(parseFloat(e.target.value))}
                className="w-24 sm:w-32 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 tabular-nums w-12 text-right">
                {effectiveQber.toFixed(1)}%
              </span>
            </div>

            {/* Right: Tactile ESP32 / Eve Attack Toggle Switch + PWA Install */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Interactive Toggle Switch */}
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-[#04060a] px-3 py-1.5">
                <Power className={`h-3.5 w-3.5 ${isAlertTriggered ? 'text-[#ff0055]' : 'text-[#00ff88]'}`} />
                <span className="text-slate-300 font-semibold whitespace-nowrap">
                  ESP32 / EVE SWITCH:
                </span>
                <button
                  id="esp32-attack-switch"
                  type="button"
                  role="switch"
                  aria-checked={isAlertTriggered}
                  onClick={handleToggleAttackSwitch}
                  className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 ${
                    isAlertTriggered
                      ? 'bg-[#ff0055]/30 border-[#ff0055] shadow-[0_0_12px_rgba(255,0,85,0.6)]'
                      : 'bg-slate-900 border-emerald-500/50'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ${
                      isAlertTriggered
                        ? 'translate-x-6 bg-[#ff0055] shadow-[0_0_8px_#ff0055]'
                        : 'translate-x-1 bg-[#00ff88] shadow-[0_0_8px_#00ff88]'
                    }`}
                  />
                </button>
                <span
                  className={`text-[11px] font-bold w-14 ${
                    isAlertTriggered ? 'text-[#ff0055] glow-red' : 'text-[#00ff88]'
                  }`}
                >
                  {isAlertTriggered ? 'ATTACK' : 'NORMAL'}
                </span>
              </div>

              {/* Web Speech API Voice Alert Toggle & Test Button */}
              <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-[#04060a] px-2.5 py-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={voiceAlertsEnabled}
                  onClick={() => {
                    const next = !voiceAlertsEnabled;
                    setVoiceAlertsEnabled(next);
                    speechAlertService.setEnabled(next);
                    if (next) {
                      speechAlertService.speak('Web Speech audio alerts enabled.', true);
                    }
                  }}
                  className="flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  title="Toggle Web Speech API Audio Alerts"
                >
                  {voiceAlertsEnabled ? (
                    <Volume2 className="h-3.5 w-3.5 text-[#00ff88]" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  <span className="text-[11px] font-semibold">
                    {voiceAlertsEnabled ? 'VOICE ON' : 'MUTED'}
                  </span>
                </button>
              </div>

              {/* Global QBER_CRITICAL_THRESHOLD & AI Sentinel Settings Modal Trigger */}
              <button
                id="open-settings-modal-btn"
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-[#04060a] px-2.5 py-1.5 text-[11px] font-mono font-semibold text-[#00ff88] hover:bg-emerald-950/50 transition cursor-pointer"
                title="Configure global QBER_CRITICAL_THRESHOLD and AI Sentinel anomaly sensitivity (saved to localStorage)"
              >
                <Settings className="h-3.5 w-3.5 text-cyan-400" />
                <span>SETTINGS ({sentinelSettings.qberCriticalThreshold.toFixed(1)}%)</span>
              </button>

              {!isInstalled && isInstallable && (
                <button
                  onClick={install}
                  className="cyber-btn-primary px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Install PWA</span>
                </button>
              )}

              {!isInstalled && !isInstallable && isIOS && (
                <button
                  onClick={() => setIsIOSModalOpen(true)}
                  className="cyber-btn-primary px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>iOS PWA Guide</span>
                </button>
              )}

              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                {isOnline ? '● Online' : '▲ Offline Cache'}
              </span>
            </div>
          </div>

          {bleNotice && (
            <div className="mx-auto mt-2 max-w-7xl flex items-center justify-between rounded border border-cyan-500/30 bg-cyan-950/30 px-3 py-1 text-[11px] font-mono text-cyan-300">
              <span>{bleNotice}</span>
              <button
                type="button"
                onClick={() => setBleNotice(null)}
                className="text-slate-400 hover:text-white cursor-pointer ml-4"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Main Content Workspace */}
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 lg:px-8 py-6 space-y-6">
          {/* HTML Red Alert Container (#alert-container): Unhidden when attack === true or QBER > 11%, auto-collapses after 10s of no new attack data, and supports manual width/height resizing */}
          <div
            ref={alertContainerRef}
            id="alert-container"
            role="alert"
            aria-hidden={!isAlertTriggered}
            data-minimized={isAlertMinimized}
            onPointerMove={handleAlertPointerMove}
            onPointerUp={handleAlertPointerUp}
            style={{
              width: alertSize.width ? `${alertSize.width}px` : undefined,
              height: alertSize.height ? `${alertSize.height}px` : undefined,
            }}
            className={`${
              isAlertTriggered ? 'block' : 'hidden'
            } ${
              isAlertMinimized ? 'alert-minimized px-4 py-2.5' : 'p-5'
            } cyber-panel-alert animate-flash-red rounded-xl border-2 border-[#ff0055] shadow-2xl transition-all select-none ${
              alertResizeDir ? 'ring-2 ring-[#00ff88]' : ''
            }`}
          >
            {/* Interactive Drag-Handle Overlays for Resizing #alert-container Width & Height */}
            <div
              data-alert-resize="e"
              title="Drag right edge to resize alert width"
              onPointerDown={(e) => handleStartAlertResize('e', e)}
              className="absolute right-0 top-2 bottom-5 w-2.5 cursor-ew-resize hover:bg-rose-400/30 transition-colors"
            />
            <div
              data-alert-resize="s"
              title="Drag bottom edge to resize alert height"
              onPointerDown={(e) => handleStartAlertResize('s', e)}
              className="absolute bottom-0 left-2 right-6 h-2.5 cursor-ns-resize hover:bg-rose-400/30 transition-colors"
            />
            <div
              id="alert-resize-handle"
              data-alert-resize="se"
              title="Drag corner handle to resize #alert-container height and width"
              onPointerDown={(e) => handleStartAlertResize('se', e)}
              className="absolute bottom-0 right-0 z-20 flex items-center gap-1 rounded-tl bg-rose-950/90 border-t border-l border-[#ff0055] px-1.5 py-0.5 text-[9px] font-mono text-rose-200 hover:text-[#00ff88] hover:border-[#00ff88] cursor-nwse-resize"
            >
              <span>RESIZE</span>
              <Maximize2 className="h-3 w-3 rotate-90" />
            </div>

            {isAlertMinimized ? (
              /* Minimized State (Auto-Collapsed after 10s of no new attack data) with 'Restore' Button */
              <div className="flex flex-wrap items-center justify-between gap-3 pr-14">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-rose-950 border border-[#ff0055] text-[#ff0055]">
                    <AlertTriangle className="h-4 w-4 animate-pulse" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-rose-100 truncate">
                    <span className="font-bold text-white glow-red">
                      ✖ QUANTUM ALERT (MINIMIZED)
                    </span>
                    <span>·</span>
                    <span className="font-bold text-white tabular-nums">
                      QBER: {effectiveQber.toFixed(2)}%
                    </span>
                    <span className="hidden sm:inline text-rose-300">
                      (Auto-collapsed after 10s idle)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    id="restore-alert-btn"
                    type="button"
                    onClick={handleRestoreAlertContainer}
                    className="flex items-center gap-1.5 rounded-lg border border-[#00ff88] bg-emerald-950/70 px-3 py-1.5 text-xs font-mono font-bold text-[#00ff88] hover:bg-emerald-900/80 transition cursor-pointer"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAttacks}
                    className="cyber-btn-primary px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer whitespace-nowrap"
                  >
                    Mitigate &amp; Clear
                  </button>
                </div>
              </div>
            ) : (
              /* Expanded State */
              <div className="space-y-4 pr-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-rose-950 border border-[#ff0055] text-[#ff0055]">
                      <AlertTriangle className="h-6 w-6 animate-bounce" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-rose-200">
                        <span className="font-bold tracking-wider uppercase text-white glow-red">
                          ✖ CRITICAL QUANTUM EAVESDROPPING ALERT — EVE NODE INTERCEPTION ACTIVE
                        </span>
                        <span>·</span>
                        <span>ENGINE: {edgeAIVerdict.engine}</span>
                        <span>·</span>
                        <span>ANOMALY PROBABILITY: {(edgeAIVerdict.anomalyScore * 100).toFixed(1)}%</span>
                        <span>·</span>
                        <span className="rounded bg-rose-950/80 border border-rose-400/40 px-1.5 py-0.5 text-[10px] text-rose-200 tabular-nums">
                          Auto-collapse in {alertAutoCollapseSeconds}s
                        </span>
                      </div>
                      <p className="text-sm font-mono text-rose-100 mt-1">
                        Quantum Bit Error Rate spiked to{' '}
                        <strong className="text-white underline tabular-nums">
                          {effectiveQber.toFixed(2)}%
                        </strong>{' '}
                        (exceeding the {QBER_CRITICAL_THRESHOLD.toFixed(1)}% BB84/Kyber safety limit) on GATT Characteristic{' '}
                        <code className="text-rose-200">{QGRID_CHARACTERISTIC_UUID.substring(0, 13)}...</code>.
                        Three.js <code className="text-white">triggerEveAlert(true)</code> engaged.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {(alertSize.width !== null || alertSize.height !== null) && (
                      <button
                        type="button"
                        onClick={() => setAlertSize({ width: null, height: null })}
                        className="flex items-center gap-1 rounded-lg border border-rose-400/50 bg-rose-950/60 px-2.5 py-2 text-xs font-mono text-rose-200 hover:text-white cursor-pointer"
                        title="Reset custom alert container dimensions"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset Size</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsAlertMinimized(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-400/60 bg-rose-950/70 px-3 py-2.5 text-xs font-mono font-bold text-rose-200 hover:bg-rose-900/80 transition cursor-pointer"
                      title="Minimize alert banner (pauses Web Audio digital alarm)"
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                      <span>Minimize</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAttacks}
                      className="cyber-btn-primary px-4 py-2.5 rounded-lg text-xs font-mono font-bold cursor-pointer whitespace-nowrap"
                    >
                      Rotate Kyber-1024 Keys &amp; Isolate Eve
                    </button>
                  </div>
                </div>

                {/* Bottom Grid inside #alert-container: Web Audio API Digital Alarm Volume Slider + Last-5 Scrollable Alert Event History */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-3 border-t border-rose-500/30 font-mono text-xs">
                  {/* Left: Web Audio API High-Frequency Digital Alarm Loop & Volume Slider Control */}
                  <div className="lg:col-span-5 flex flex-col justify-between rounded-lg border border-rose-500/40 bg-black/45 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-rose-200">
                        {alarmVolume > 0.001 ? (
                          <Volume2 className="h-4 w-4 text-[#00ff88] animate-pulse" />
                        ) : (
                          <VolumeX className="h-4 w-4 text-slate-400" />
                        )}
                        <span>WEB AUDIO DIGITAL ALARM</span>
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          alarmVolume > 0.001
                            ? 'bg-rose-950 text-[#00ff88] border border-[#00ff88]/50'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {alarmVolume > 0.001 ? '● LOOPING (1.88–2.88kHz)' : '○ MUTED'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="alert-alarm-volume-slider"
                        className="text-[11px] text-rose-200 whitespace-nowrap"
                      >
                        Alarm Volume:
                      </label>
                      <input
                        id="alert-alarm-volume-slider"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(alarmVolume * 100)}
                        onChange={(e) =>
                          handleAlarmVolumeChange(parseInt(e.target.value, 10) / 100)
                        }
                        className="flex-1 cursor-pointer"
                      />
                      <span className="w-10 text-right text-[11px] font-bold text-white tabular-nums">
                        {Math.round(alarmVolume * 100)}%
                      </span>
                    </div>

                    <p className="text-[10px] text-rose-300/90">
                      High-frequency digital alarm loops while expanded; automatically silences when minimized or cleared.
                    </p>
                  </div>

                  {/* Right: Scrollable 'Alert Event History' List (Last 5 Triggered Attack Occurrences with Timestamp & Peak QBER) */}
                  <div className="lg:col-span-7 rounded-lg border border-rose-500/40 bg-black/45 p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-rose-500/25 pb-1.5">
                      <span className="flex items-center gap-1.5 font-bold text-rose-200">
                        <History className="h-3.5 w-3.5 text-[#00ff88]" />
                        <span>ALERT EVENT HISTORY (LAST 5 OCCURRENCES)</span>
                      </span>
                      <span className="text-[10px] text-rose-300 tabular-nums">
                        {alertEventHistory.length} / 5 LOGGED
                      </span>
                    </div>

                    <div
                      id="alert-event-history-list"
                      className="max-h-24 overflow-y-auto space-y-1.5 pr-1"
                    >
                      {alertEventHistory.length === 0 ? (
                        <div className="py-2 text-center text-[11px] text-rose-300/70">
                          No triggered attack events logged yet.
                        </div>
                      ) : (
                        alertEventHistory.map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-rose-500/30 bg-rose-950/50 px-2.5 py-1.5 text-[11px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-rose-900/90 px-1.5 py-0.2 text-[10px] font-bold text-white">
                                #{idx + 1}
                              </span>
                              <span className="text-rose-200 tabular-nums font-semibold">
                                {item.timestamp}
                              </span>
                              <span className="text-rose-300/80 text-[10px]">
                                [{item.source}]
                              </span>
                            </div>
                            <span className="font-bold text-[#00ff88] tabular-nums">
                              PEAK QBER: {item.peakQber.toFixed(2)}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tab 1: Interactive 3D Alice-Bob-Eve Stage + 2D Smart Grid Topology & Threat Sandbox */}
          {activeTab === 'topology' && (
            <div className="space-y-6">
              {/* Interactive 3D Three.js Quantum Stage (Alice, Bob, Eve with OrbitControls) */}
              <ThreeSceneCanvas
                interactiveStage={true}
                isAttacking={isAlertTriggered}
                qber={effectiveQber}
                onTriggerSimulatedAttack={handleTriggerSimulatedAttack}
                onClearAttack={handleClearAttacks}
              />

              {/* 2D Substation Mesh & Node Telemetry Inspector */}
              <GridTopologyCanvas
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelectNode={(node) => setSelectedNodeId(node.id)}
                onToggleIsolation={handleToggleIsolation}
                onRotateKey={handleRotateKey}
                onInjectAttack={handleInjectAttack}
              />

              {/* Cyber Attack Vector Sandbox */}
              <AttackSimulatorPanel
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelectNodeId={setSelectedNodeId}
                onInjectAttack={handleInjectAttack}
                onClearAttacks={handleClearAttacks}
              />
            </div>
          )}

          {/* Tab 2: 60FPS Harmonic Oscilloscope & Firewall Rules */}
          {activeTab === 'oscilloscope' && (
            <div className="space-y-6">
              <GridOscilloscope selectedNode={selectedNode} />
              <FirewallRulesPanel
                nodes={nodes}
                onToggleIsolation={handleToggleIsolation}
                onRotateAllKeys={handleRotateAllKeys}
              />
            </div>
          )}

          {/* Tab 3: Post-Quantum Cryptography & IDS Packet Stream */}
          {activeTab === 'quantum' && (
            <QuantumSecurityPanel
              nodes={nodes}
              packetLogs={packetLogs}
              onRotateAllKeys={handleRotateAllKeys}
            />
          )}

          {/* Tab 4: W3C Web Bluetooth Controller */}
          {activeTab === 'bluetooth' && (
            <BLETelemetryPanel
              nodes={nodes}
              onConnectRealBLE={handleConnectBluetooth}
            />
          )}

          {/* Tab 5: Gemini AI Threat Sentinel */}
          {activeTab === 'ai-sentinel' && (
            <AISentinelPanel
              nodes={nodes}
              selectedNode={selectedNode}
              threatHistory={threatHistory}
              currentAnomalyScore={edgeAIVerdict.anomalyScore}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
            />
          )}

          {/* Tab 6: Cloud Firestore Database & Firelog Mobile Sync */}
          {activeTab === 'database' && (
            <DatabaseSyncPanel
              onCaptureConditionNow={() =>
                handleCaptureSystemCondition('Manual system condition snapshot requested by operator')
              }
            />
          )}
        </main>

        {/* Quiet Technical Footer */}
        <footer className="border-t border-emerald-500/15 bg-[#04060a] px-4 lg:px-8 py-4 text-xs font-mono text-slate-500">
          <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>Q-GRID SENTINEL · Post-Quantum Smart Grid Exhibition System</span>
            <span>
              BLE Service: {QGRID_SERVICE_UUID.substring(0, 8)}... · Characteristic: {QGRID_CHARACTERISTIC_UUID.substring(0, 8)}... · Offline PWA Ready
            </span>
          </div>
        </footer>

        <OfflineIndicator />

        <PWAInstallModal
          isOpen={isIOSModalOpen}
          onClose={() => setIsIOSModalOpen(false)}
        />

        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          currentQber={effectiveQber}
        />
      </div>
    </div>
  );
}
