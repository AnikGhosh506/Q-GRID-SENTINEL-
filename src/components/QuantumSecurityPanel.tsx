import React, { useState, useEffect, useCallback } from 'react';
import { GridNode, PacketLog } from '../types/grid';
import { Lock, Key, ShieldCheck, RefreshCw, FileText, Sparkles, CheckCircle2, Download } from 'lucide-react';

interface QuantumSecurityPanelProps {
  nodes: GridNode[];
  packetLogs: PacketLog[];
  onRotateAllKeys: () => void;
}

type HandshakeStage = 'IDLE' | 'STAGE_1_KEYGEN' | 'STAGE_2_ENCAPSULATE' | 'STAGE_3_VERIFIED';

export const QuantumSecurityPanel: React.FC<QuantumSecurityPanelProps> = ({
  nodes,
  packetLogs,
  onRotateAllKeys,
}) => {
  const [keyRotationTimer, setKeyRotationTimer] = useState(45);
  const [filterProtocol, setFilterProtocol] = useState<string>('ALL');
  const [handshakeStage, setHandshakeStage] = useState<HandshakeStage>('IDLE');
  const [activeTargetNodeId, setActiveTargetNodeId] = useState<string | null>(null);
  const [sessionHash, setSessionHash] = useState<string>('0x9F4A...82E1');

  const triggerKyberRotationAnimation = useCallback(
    (targetNodeId?: string) => {
      setActiveTargetNodeId(targetNodeId || null);
      setHandshakeStage('STAGE_1_KEYGEN');

      const randomHex = Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 16)
          .toString(16)
          .toUpperCase()
      ).join('');
      setSessionHash(`0x${randomHex.slice(0, 4)}...${randomHex.slice(4)}`);

      const t1 = setTimeout(() => {
        setHandshakeStage('STAGE_2_ENCAPSULATE');
      }, 1100);

      const t2 = setTimeout(() => {
        setHandshakeStage('STAGE_3_VERIFIED');
        onRotateAllKeys();
      }, 2200);

      const t3 = setTimeout(() => {
        setHandshakeStage('IDLE');
        setActiveTargetNodeId(null);
      }, 4200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    },
    [onRotateAllKeys]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setKeyRotationTimer((prev) => {
        if (prev <= 1) {
          triggerKyberRotationAnimation();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [triggerKyberRotationAnimation]);

  const filteredLogs = packetLogs.filter((log) => {
    if (filterProtocol === 'ALL') return true;
    return log.protocol === filterProtocol;
  });

  // Hub node (GAMMA-9 QUANTUM RELAY) + satellite substation nodes for SVG cryptographic mesh
  const relayNode = nodes.find((n) => n.id === 'node-gamma-9') || nodes[0];
  const peerNodes = nodes.filter((n) => n.id !== (relayNode?.id || 'node-gamma-9'));

  // SVG Coordinate Helper (Maps node 0-100% x,y to 800x260 SVG canvas)
  const getSvgCoords = (node: GridNode, index: number, isHub: boolean) => {
    if (isHub) return { cx: 400, cy: 130 };
    const defaultPositions = [
      { cx: 130, cy: 58 },
      { cx: 670, cy: 58 },
      { cx: 670, cy: 205 },
      { cx: 130, cy: 205 },
      { cx: 400, cy: 36 },
    ];
    return defaultPositions[index % defaultPositions.length] || {
      cx: (node.x / 100) * 700 + 50,
      cy: (node.y / 100) * 200 + 30,
    };
  };

  const isAnimating = handshakeStage !== 'IDLE';

  return (
    <div className="space-y-6">
      {/* Top Banner: Quantum Key Exchange Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-purple-500/30 bg-[#090e18] p-4 shadow-xl flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-950/80 text-purple-400 border border-purple-500/40">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400">PQC ALGORITHM</span>
            <h4 className="text-lg font-bold text-purple-300">CRYSTALS-Kyber-1024</h4>
            <span className="text-[11px] font-mono text-emerald-400">NIST FIPS 203 COMPLIANT</span>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-[#090e18] p-4 shadow-xl flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-500/40">
            <Key className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-mono text-slate-400">SIGNATURE SCHEME</span>
            <h4 className="text-lg font-bold text-cyan-300">Dilithium-5 (ML-DSA)</h4>
            <span className="text-[11px] font-mono text-cyan-400">256-bit Post-Quantum Security</span>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-[#090e18] p-4 shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-mono text-slate-400">AUTO-KEY ROTATION</span>
              <h4 className="text-lg font-bold text-emerald-300 tabular-nums">
                {keyRotationTimer}s REMAINING
              </h4>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerKyberRotationAnimation();
              setKeyRotationTimer(60);
            }}
            className="cyber-btn-primary px-3.5 py-2 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer"
            title="Trigger Kyber-1024 Key Rotation Handshake Animation"
          >
            <RefreshCw className={`h-4 w-4 ${isAnimating ? 'animate-spin' : ''}`} />
            <span>{isAnimating ? 'ROTATING...' : 'ROTATE KEYS'}</span>
          </button>
        </div>
      </div>

      {/* ==========================================================================
          SVG ANIMATION OVERLAY: KYBER-1024 CRYPTOGRAPHIC HANDSHAKE VISUALIZER
          ========================================================================== */}
      <div
        className={`relative overflow-hidden rounded-xl border transition-all duration-300 bg-[#060a12] p-5 shadow-2xl ${
          isAnimating
            ? 'border-[#00ff88] shadow-[0_0_30px_rgba(0,255,136,0.25)]'
            : 'border-purple-500/30'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-500/20 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Sparkles
              className={`h-5 w-5 ${
                isAnimating ? 'text-[#00ff88] animate-spin' : 'text-purple-400'
              }`}
            />
            <div>
              <h3 className="font-bold tracking-wider text-sm sm:text-base text-[#00ff88] glow-green">
                KYBER-1024 LATTICE KEM HANDSHAKE &amp; KEY ROTATION OVERLAY
              </h3>
              <p className="text-xs font-mono text-slate-400">
                Visualizes Module-LWE public matrix distribution, ciphertext encapsulation, and Dilithium-5 verification across grid nodes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span
              className={`px-3 py-1 rounded border font-bold ${
                handshakeStage === 'STAGE_1_KEYGEN'
                  ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300 animate-pulse'
                  : handshakeStage === 'STAGE_2_ENCAPSULATE'
                  ? 'border-purple-400 bg-purple-950/60 text-purple-300 animate-pulse'
                  : handshakeStage === 'STAGE_3_VERIFIED'
                  ? 'border-[#00ff88] bg-emerald-950/70 text-[#00ff88]'
                  : 'border-slate-800 bg-slate-900/80 text-slate-400'
              }`}
            >
              {handshakeStage === 'STAGE_1_KEYGEN' && '1/3 · BROADCASTING LATTICE MATRIX (pk)'}
              {handshakeStage === 'STAGE_2_ENCAPSULATE' && '2/3 · ENCAPSULATING CIPHERTEXT (ct)'}
              {handshakeStage === 'STAGE_3_VERIFIED' && '3/3 · SHARED SECRET SYNCED (256-BIT)'}
              {handshakeStage === 'IDLE' && `SYNCED · HASH ${sessionHash}`}
            </span>

            <button
              type="button"
              onClick={() => {
                triggerKyberRotationAnimation();
                setKeyRotationTimer(60);
              }}
              className="cyber-btn-primary px-3 py-1.5 rounded text-xs font-mono cursor-pointer whitespace-nowrap"
            >
              {isAnimating ? 'Handshake Active...' : 'Trigger Kyber-1024 Handshake'}
            </button>
          </div>
        </div>

        {/* Interactive SVG Cryptographic Handshake Canvas */}
        <div className="relative w-full overflow-hidden rounded-lg border border-slate-800/90 bg-[#04070d]">
          <svg
            viewBox="0 0 800 260"
            className="w-full h-[230px] sm:h-[260px] select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Neon Glow Filters for Flowing Handshake Lines */}
              <filter id="kyber-glow-green" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="kyber-glow-cyan" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <linearGradient id="handshake-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="50%" stopColor="#9d00ff" />
                <stop offset="100%" stopColor="#00ff88" />
              </linearGradient>
            </defs>

            {/* Subtle Background Lattice Grid */}
            <g stroke="rgba(0, 255, 136, 0.05)" strokeWidth="1">
              {[80, 160, 240, 320, 400, 480, 560, 640, 720].map((x) => (
                <line key={`vx-${x}`} x1={x} y1={0} x2={x} y2={260} />
              ))}
              {[50, 100, 150, 200].map((y) => (
                <line key={`hy-${y}`} x1={0} y1={y} x2={800} y2={y} />
              ))}
            </g>

            {/* Flowing Glowing Cryptographic Handshake Lines between Hub (400,130) and Peer Substations */}
            {peerNodes.map((peer, idx) => {
              const { cx, cy } = getSvgCoords(peer, idx, false);
              const isTargeted = !activeTargetNodeId || activeTargetNodeId === peer.id;
              const isLineActive = isAnimating && isTargeted;

              // Curved control point for organic lattice wave path
              const midX = (400 + cx) / 2;
              const midY = (130 + cy) / 2 + (cy < 130 ? -24 : 24);
              const pathD = `M 400 130 Q ${midX} ${midY} ${cx} ${cy}`;
              const reversePathD = `M ${cx} ${cy} Q ${midX} ${midY} 400 130`;

              const strokeColor =
                handshakeStage === 'STAGE_1_KEYGEN'
                  ? '#00f0ff'
                  : handshakeStage === 'STAGE_2_ENCAPSULATE'
                  ? '#c084fc'
                  : handshakeStage === 'STAGE_3_VERIFIED'
                  ? '#00ff88'
                  : 'rgba(0, 240, 255, 0.28)';

              return (
                <g key={`handshake-link-${peer.id}`}>
                  {/* Base Conduit Path */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.16)"
                    strokeWidth="2"
                  />

                  {/* Glowing Flowing Handshake Stream */}
                  <path
                    d={handshakeStage === 'STAGE_2_ENCAPSULATE' ? reversePathD : pathD}
                    fill="none"
                    stroke={isLineActive ? strokeColor : 'url(#handshake-line-grad)'}
                    strokeWidth={isLineActive ? 3.5 : 1.8}
                    strokeDasharray={isLineActive ? '12 8' : '6 6'}
                    filter={isLineActive ? 'url(#kyber-glow-cyan)' : undefined}
                    opacity={isLineActive ? 1 : 0.55}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from={isLineActive ? '120' : '40'}
                      to="0"
                      dur={isLineActive ? '0.65s' : '2.8s'}
                      repeatCount="indefinite"
                    />
                  </path>

                  {/* Traveling Key Capsule Particles along the Bezier Path */}
                  <circle
                    r={isLineActive ? 5.5 : 3}
                    fill={isLineActive ? '#00ff88' : '#00f0ff'}
                    filter="url(#kyber-glow-green)"
                  >
                    <animateMotion
                      dur={isLineActive ? '0.75s' : '3.2s'}
                      repeatCount="indefinite"
                      path={handshakeStage === 'STAGE_2_ENCAPSULATE' ? reversePathD : pathD}
                    />
                  </circle>

                  {isLineActive && (
                    <circle r="4" fill="#c084fc" filter="url(#kyber-glow-cyan)">
                      <animateMotion
                        dur="0.9s"
                        begin="0.25s"
                        repeatCount="indefinite"
                        path={reversePathD}
                      />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* Peer Substation Nodes */}
            {peerNodes.map((peer, idx) => {
              const { cx, cy } = getSvgCoords(peer, idx, false);
              const isTargeted = !activeTargetNodeId || activeTargetNodeId === peer.id;
              const isNodePulsing = isAnimating && isTargeted;

              return (
                <g
                  key={`svg-node-${peer.id}`}
                  transform={`translate(${cx}, ${cy})`}
                  onClick={() => {
                    triggerKyberRotationAnimation(peer.id);
                    setKeyRotationTimer(60);
                  }}
                  className="cursor-pointer"
                >
                  {isNodePulsing && (
                    <circle
                      r="28"
                      fill="none"
                      stroke={handshakeStage === 'STAGE_3_VERIFIED' ? '#00ff88' : '#00f0ff'}
                      strokeWidth="2"
                      opacity="0.7"
                    >
                      <animate
                        attributeName="r"
                        from="18"
                        to="36"
                        dur="0.9s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        from="0.85"
                        to="0"
                        dur="0.9s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  <circle
                    r="18"
                    fill="#081526"
                    stroke={
                      isNodePulsing
                        ? '#00ff88'
                        : peer.pqcKeyStatus === 'COMPROMISED'
                        ? '#ff0055'
                        : '#00f0ff'
                    }
                    strokeWidth={isNodePulsing ? '3' : '2'}
                    filter={isNodePulsing ? 'url(#kyber-glow-green)' : undefined}
                  />

                  <text
                    y="4"
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="bold"
                  >
                    PQC
                  </text>

                  <text
                    y="32"
                    textAnchor="middle"
                    fill={isNodePulsing ? '#00ff88' : '#cbd5e1'}
                    fontSize="11"
                    fontFamily="Rajdhani, sans-serif"
                    fontWeight="bold"
                  >
                    {peer.name}
                  </text>
                </g>
              );
            })}

            {/* Central Hub: GAMMA-9 QUANTUM RELAY (Kyber-1024 Key Distribution Center) */}
            <g transform="translate(400, 130)">
              {isAnimating && (
                <circle
                  r="42"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2.5"
                  filter="url(#kyber-glow-cyan)"
                >
                  <animate
                    attributeName="r"
                    from="28"
                    to="58"
                    dur="1.0s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.9"
                    to="0"
                    dur="1.0s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              <circle
                r="28"
                fill="#130924"
                stroke={isAnimating ? '#00ff88' : '#a855f7'}
                strokeWidth="3"
                filter="url(#kyber-glow-green)"
              />

              <text
                y="-2"
                textAnchor="middle"
                fill="#00ff88"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                KYBER-1024
              </text>
              <text
                y="10"
                textAnchor="middle"
                fill="#d8b4fe"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
              >
                KEM HUB
              </text>
              <text
                y="44"
                textAnchor="middle"
                fill="#00ff88"
                fontSize="12"
                fontFamily="Rajdhani, sans-serif"
                fontWeight="bold"
              >
                {relayNode?.name || 'GAMMA-9 QUANTUM RELAY'}
              </text>
            </g>
          </svg>

          {/* Bottom Handshake Step Progress Bar */}
          <div className="grid grid-cols-3 border-t border-slate-800 bg-[#070b14] text-[11px] font-mono">
            <div
              className={`px-3 py-2 flex items-center gap-2 border-r border-slate-800 ${
                handshakeStage === 'STAGE_1_KEYGEN'
                  ? 'bg-cyan-950/50 text-cyan-300 font-bold'
                  : 'text-slate-400'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              <span>STEP 1: ML-KEM-1024 KeyGen (pk)</span>
            </div>
            <div
              className={`px-3 py-2 flex items-center gap-2 border-r border-slate-800 ${
                handshakeStage === 'STAGE_2_ENCAPSULATE'
                  ? 'bg-purple-950/50 text-purple-300 font-bold'
                  : 'text-slate-400'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <span>STEP 2: Lattice Encapsulate (ct)</span>
            </div>
            <div
              className={`px-3 py-2 flex items-center gap-2 ${
                handshakeStage === 'STAGE_3_VERIFIED'
                  ? 'bg-emerald-950/60 text-[#00ff88] font-bold'
                  : 'text-slate-400'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[#00ff88]" />
              <span>STEP 3: Dilithium-5 Signed (ss)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Node Security Matrix Table */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-4">
          <div className="flex items-center gap-2 text-purple-400">
            <Lock className="h-5 w-5" />
            <h3 className="font-bold tracking-wider text-sm sm:text-base">
              EDGE NODE CRYPTOGRAPHIC MATRIX
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {nodes.length} ACTIVE PQC SCADA SESSIONS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">NODE ID &amp; NAME</th>
                <th className="p-3">BLE MAC ADDRESS</th>
                <th className="p-3">KEM ALGORITHM</th>
                <th className="p-3">SESSION STATE</th>
                <th className="p-3">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {nodes.map((node) => (
                <tr key={node.id} className="hover:bg-slate-900/40 transition">
                  <td className="p-3 font-bold text-slate-200">{node.name}</td>
                  <td className="p-3 text-cyan-400">{node.macAddress}</td>
                  <td className="p-3 text-purple-300 font-semibold">Kyber-1024 / Dilithium-5</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        node.pqcKeyStatus === 'KYBER_1024_SYNCED' ||
                        node.pqcKeyStatus === 'DILITHIUM_5_VERIFIED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-600'
                          : node.pqcKeyStatus === 'COMPROMISED'
                          ? 'bg-rose-950 text-rose-400 border border-rose-600'
                          : 'bg-amber-950 text-amber-400'
                      }`}
                    >
                      {node.pqcKeyStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => {
                        triggerKyberRotationAnimation(node.id);
                        setKeyRotationTimer(60);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold rounded border border-purple-500/60 text-purple-300 hover:bg-purple-950/60 transition cursor-pointer"
                    >
                      ROTATE KEY
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Packet Log & Intrusion Detection System (IDS) Table */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3 mb-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <FileText className="h-5 w-5" />
            <h3 className="font-bold tracking-wider text-sm sm:text-base">
              INTRUSION DETECTION SYSTEM (IDS) PACKET STREAM
            </h3>
          </div>

          {/* Protocol Filter + Forensic JSON Download Button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Protocol Filter:</span>
              <select
                value={filterProtocol}
                onChange={(e) => setFilterProtocol(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-cyan-300 outline-none"
              >
                <option value="ALL">ALL PROTOCOLS</option>
                <option value="BLE_GATT_SCADA">BLE GATT SCADA</option>
                <option value="PQC_KYBER_1024">PQC KYBER 1024</option>
                <option value="IEC_61850">IEC 61850 GRID</option>
              </select>
            </div>

            <button
              id="export-forensic-data-btn"
              type="button"
              onClick={() => {
                const exportIsoTime = new Date().toISOString();
                const exportPayload = {
                  forensicReportMetadata: {
                    system: 'Q-GRID SENTINEL - Post-Quantum Smart Grid IDS',
                    generatedAtISO: exportIsoTime,
                    generatedAtLocal: new Date().toLocaleString(),
                    activeProtocolFilter: filterProtocol,
                    totalPacketsInBuffer: packetLogs.length,
                    exportedPacketCount: filteredLogs.length,
                    detectedAttackPacketCount: filteredLogs.filter(
                      (l) => l.status === 'FLAGGED' || l.type === 'MALICIOUS_PAYLOAD'
                    ).length,
                  },
                  substationNodeSnapshot: nodes.map((n) => ({
                    nodeId: n.id,
                    nodeName: n.name,
                    macAddress: n.macAddress,
                    status: n.status,
                    qberPercent: n.qber,
                    attackFlag: n.activeAttack !== 'NONE' || (n.qber || 0) > 11.0,
                    activeAttackVector: n.activeAttack,
                    pqcKeyStatus: n.pqcKeyStatus,
                    lastPacketTimestampMs: n.lastPacketTime,
                    lastPacketTimestampISO: new Date(n.lastPacketTime || Date.now()).toISOString(),
                  })),
                  networkPacketBuffer: filteredLogs.map((log, index) => {
                    const targetNode = nodes.find((n) => n.id === log.targetNodeId);
                    const isAttackFlagged =
                      log.status === 'FLAGGED' || log.type === 'MALICIOUS_PAYLOAD';
                    return {
                      sequenceIndex: index + 1,
                      packetId: log.id,
                      timestamp: log.timestamp,
                      exportedTimestampISO: exportIsoTime,
                      attackFlag: isAttackFlagged,
                      severity: isAttackFlagged ? 'CRITICAL_INTRUSION' : 'NOMINAL_TELEMETRY',
                      protocol: log.protocol,
                      packetType: log.type,
                      sourceMac: log.sourceMac,
                      targetNodeId: log.targetNodeId,
                      targetNodeName: targetNode?.name || log.targetNodeId,
                      nodeQberAtCapture: targetNode?.qber ?? 1.15,
                      inspectionStatus: log.status,
                      payloadSummary: log.payloadSummary,
                    };
                  }),
                };

                const jsonString = JSON.stringify(exportPayload, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `qgrid-forensic-data-${Date.now()}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="cyber-btn-primary px-3.5 py-1.5 rounded text-xs font-mono flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Download Current Network Packet Buffer as Structured JSON with Timestamps and Attack Flags"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Forensic Data</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 sticky top-0 border-b border-slate-800">
              <tr>
                <th className="p-2.5">TIME</th>
                <th className="p-2.5">SOURCE MAC</th>
                <th className="p-2.5">PROTOCOL</th>
                <th className="p-2.5">TYPE</th>
                <th className="p-2.5">PAYLOAD INSPECTION SUMMARY</th>
                <th className="p-2.5">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.slice(-20).reverse().map((log) => (
                <tr key={log.id} className="hover:bg-slate-900/40">
                  <td className="p-2.5 text-slate-400">{log.timestamp}</td>
                  <td className="p-2.5 text-cyan-400">{log.sourceMac}</td>
                  <td className="p-2.5 text-purple-300 font-semibold">{log.protocol}</td>
                  <td className="p-2.5 text-slate-300">{log.type}</td>
                  <td className="p-2.5 text-slate-200">{log.payloadSummary}</td>
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.status === 'ACCEPTED'
                          ? 'bg-emerald-950 text-emerald-400'
                          : log.status === 'FLAGGED'
                          ? 'bg-rose-950 text-rose-400 border border-rose-600'
                          : 'bg-amber-950 text-amber-400'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
