import React, { useEffect, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { GridNode, AttackType } from '../types/grid';
import { bluetoothService } from '../services/bluetooth';
import { QBER_CRITICAL_THRESHOLD } from '../services/edgeAI';
import { AlertTriangle, Activity, Move, RotateCcw, Flame, Clock, Maximize2, Gauge } from 'lucide-react';

/**
 * d3-scale linear color scale mapping node QBER values (%) to a continuous
 * color gradient ranging from neon-green (#00ff88, safe) -> amber (#eab308) ->
 * bright crimson (#ff0055) -> deep-red (#8b001d, critical).
 */
const d3QberThreatColorScale = scaleLinear<string>()
  .domain([0.5, 5.5, 11.0, 20.0])
  .range(['#00ff88', '#eab308', '#ff0055', '#8b001d'])
  .clamp(true);

const d3QberOuterHaloColorScale = scaleLinear<string>()
  .domain([0.5, 5.5, 11.0, 20.0])
  .range(['#00ff88', '#f59e0b', '#dc2626', '#670010'])
  .clamp(true);

const d3QberRadiusScale = scaleLinear<number>()
  .domain([0.5, 6.0, 11.0, 20.0])
  .range([68, 96, 132, 168])
  .clamp(true);

const d3QberOpacityScale = scaleLinear<number>()
  .domain([0.5, 6.0, 11.0, 20.0])
  .range([0.34, 0.52, 0.74, 0.88])
  .clamp(true);

interface GridTopologyCanvasProps {
  nodes: GridNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: GridNode) => void;
  onToggleIsolation: (nodeId: string) => void;
  onRotateKey: (nodeId: string) => void;
  onInjectAttack?: (nodeId: string, attackType: AttackType) => void;
}

/**
 * Computes a normalized node vulnerability level [0.0 .. 1.0] from real-time local QBER telemetry.
 * 0.0 = Nominal (~0.5% - 1.5% QBER, pure green)
 * 0.5 = Elevated (~6.5% QBER, yellow/amber)
 * 1.0 = Critical (>= 11.0% QBER or active attack, deep red)
 */
function calculateNodeVulnerability(node: GridNode): number {
  if (node.isolated) return 0.0;
  const qberVal = node.qber ?? 1.15;
  const normalized = Math.min(1.0, Math.max(0.0, (qberVal - 0.8) / 13.5));
  if (node.activeAttack !== 'NONE' || qberVal > QBER_CRITICAL_THRESHOLD) {
    return Math.min(1.0, Math.max(0.82, normalized));
  }
  return normalized;
}

/**
 * Smoothly interpolates RGB Quantum Noise glow colors shifting from Soft Green -> Amber -> Alert Red
 * as normalized QBER intensity t increases from 0.0 to 1.0.
 */
function getGreenToDeepRedRGBA(t: number, alpha: number): string {
  const clamped = Math.min(1.0, Math.max(0.0, t));
  let r = 0;
  let g = 255;
  let b = 136;

  if (clamped < 0.4) {
    // 0.0 -> 0.40: Soft Green (0, 255, 136) to Warm Chartreuse/Amber (235, 220, 30)
    const localT = clamped / 0.4;
    r = Math.round(0 + localT * 235);
    g = Math.round(255 - localT * 35);
    b = Math.round(136 - localT * 106);
  } else if (clamped < 0.75) {
    // 0.40 -> 0.75: Warm Amber (235, 220, 30) to Bright Alert Red (255, 30, 65)
    const localT = (clamped - 0.4) / 0.35;
    r = Math.round(235 + localT * 20);
    g = Math.round(220 - localT * 190);
    b = Math.round(30 + localT * 35);
  } else {
    // 0.75 -> 1.00: Intense Alert Red (255, 0, 85) to Deep Alert Crimson (210, 0, 45)
    const localT = (clamped - 0.75) / 0.25;
    r = Math.round(255 - localT * 45);
    g = Math.round(30 - localT * 30);
    b = Math.round(65 - localT * 20);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns stroke color for BLE round-trip Network Latency (ms) circular SVG gauge.
 */
function getLatencyGaugeColor(latencyMs: number, isolated: boolean): string {
  if (isolated) return '#64748b';
  if (latencyMs > 95) return '#ff0055';
  if (latencyMs > 45) return '#ffaa00';
  return '#00f0ff';
}

export const GridTopologyCanvas: React.FC<GridTopologyCanvasProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onToggleIsolation,
  onRotateKey,
  onInjectAttack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inspectorPanelRef = useRef<HTMLDivElement | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [eventFilter, setEventFilter] = useState<'ALL' | 'CONNECTION' | 'MITIGATION'>('ALL');

  // Draggable & Resizable state for the Selected Node Quick Inspector Overlay Panel (div:nth-of-type(3))
  const [panelOffset, setPanelOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number | null }>({
    width: 400,
    height: null,
  });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number }>({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origOffsetX: number;
    origOffsetY: number;
  }>({
    startX: 0,
    startY: 0,
    origW: 400,
    origH: 480,
    origOffsetX: 0,
    origOffsetY: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particleProgress = 0;
    let pulsePhase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      pulsePhase += 0.06;

      ctx.clearRect(0, 0, width, height);

      // Draw Base Technical Grid Mesh Background
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Convert Node Percentages to Pixel Positions
      const nodePosMap = new Map<string, { x: number; y: number }>();
      nodes.forEach((node) => {
        const px = (node.x / 100) * width;
        const py = (node.y / 100) * height;
        nodePosMap.set(node.id, { x: px, y: py });
      });

      const connections: [string, string][] = [
        ['node-alpha-1', 'node-gamma-9'],
        ['node-beta-3', 'node-gamma-9'],
        ['node-gamma-9', 'node-delta-4'],
        ['node-gamma-9', 'node-epsilon-7'],
      ];

      // ========================================================================
      // REAL-TIME 2D QBER VULNERABILITY HEATMAP OVERLAY (GREEN -> DEEP RED)
      // ========================================================================
      if (showHeatmap) {
        ctx.save();

        // 1. Spatial Inverse-Distance Weighted (IDW) Thermal Grid Cells
        const cellSize = 36;
        for (let gx = 0; gx < width; gx += cellSize) {
          for (let gy = 0; gy < height; gy += cellSize) {
            const cx = gx + cellSize / 2;
            const cy = gy + cellSize / 2;

            let weightedVuln = 0;
            let weightSum = 0;
            let minDistance = Infinity;

            nodes.forEach((node) => {
              if (node.isolated) return;
              const pos = nodePosMap.get(node.id);
              if (!pos) return;
              const dist = Math.hypot(cx - pos.x, cy - pos.y);
              if (dist < minDistance) minDistance = dist;

              if (dist < 220) {
                const w = 1 / Math.pow(Math.max(dist, 24), 1.8);
                weightedVuln += calculateNodeVulnerability(node) * w;
                weightSum += w;
              }
            });

            if (weightSum > 0 && minDistance < 190) {
              const localVuln = weightedVuln / weightSum;
              const falloff = Math.max(0, 1 - minDistance / 190);
              const cellAlpha = falloff * (0.08 + localVuln * 0.18);
              ctx.fillStyle = getGreenToDeepRedRGBA(localVuln, cellAlpha);
              ctx.fillRect(gx + 1, gy + 1, cellSize - 2, cellSize - 2);
            }
          }
        }

        // 2. Corridor Thermal Diffusion along Transmission Lines
        connections.forEach(([idA, idB]) => {
          const posA = nodePosMap.get(idA);
          const posB = nodePosMap.get(idB);
          const nodeA = nodes.find((n) => n.id === idA);
          const nodeB = nodes.find((n) => n.id === idB);

          if (posA && posB && nodeA && nodeB && !nodeA.isolated && !nodeB.isolated) {
            const vulnA = calculateNodeVulnerability(nodeA);
            const vulnB = calculateNodeVulnerability(nodeB);
            const maxCorridorVuln = Math.max(vulnA, vulnB);

            const lineGrad = ctx.createLinearGradient(posA.x, posA.y, posB.x, posB.y);
            lineGrad.addColorStop(0, getGreenToDeepRedRGBA(vulnA, 0.28 + vulnA * 0.25));
            lineGrad.addColorStop(1, getGreenToDeepRedRGBA(vulnB, 0.28 + vulnB * 0.25));

            ctx.beginPath();
            ctx.moveTo(posA.x, posA.y);
            ctx.lineTo(posB.x, posB.y);
            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = 24 + maxCorridorVuln * 24;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        });

        // 3. Per-Node 'Quantum Noise' Radial Heat Layer (Soft Green -> Alert Red linked to individual QBER)
        nodes.forEach((node, nodeIdx) => {
          const pos = nodePosMap.get(node.id);
          if (!pos) return;

          const vuln = calculateNodeVulnerability(node);
          const qber = node.qber ?? 1.15;
          const isCritical = qber > QBER_CRITICAL_THRESHOLD || node.activeAttack !== 'NONE';

          // Dynamic radial glow radius & intensity linked directly to the node's individual QBER
          const baseRadius = 78 + vuln * 115;
          const noiseJitter = Math.sin(pulsePhase * (1.5 + vuln * 2.5) + nodeIdx * 1.7) * (4 + vuln * 14);
          const outerRadius = Math.max(65, baseRadius + noiseJitter);

          const radialGrad = ctx.createRadialGradient(
            pos.x,
            pos.y,
            2,
            pos.x,
            pos.y,
            outerRadius
          );

          if (node.isolated) {
            radialGrad.addColorStop(0, 'rgba(100, 116, 139, 0.20)');
            radialGrad.addColorStop(0.5, 'rgba(71, 85, 105, 0.08)');
            radialGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
          } else {
            // Soft Green at low QBER (0.28 core alpha) ramping up to intense Alert Red (0.82 core alpha)
            const coreAlpha = 0.28 + vuln * 0.54;
            const midAlpha = 0.14 + vuln * 0.34;
            const outerAlpha = 0.05 + vuln * 0.15;

            radialGrad.addColorStop(0, getGreenToDeepRedRGBA(vuln, coreAlpha));
            radialGrad.addColorStop(0.35, getGreenToDeepRedRGBA(vuln, midAlpha));
            radialGrad.addColorStop(0.7, getGreenToDeepRedRGBA(Math.min(1, vuln * 1.08), outerAlpha));
            radialGrad.addColorStop(1, getGreenToDeepRedRGBA(vuln, 0));
          }

          ctx.fillStyle = radialGrad;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, outerRadius, 0, Math.PI * 2);
          ctx.fill();

          // Quantum Noise Interference Rings & Fluctuating Wavefront around each node
          if (!node.isolated) {
            const ringCount = isCritical ? 2 : 1;
            for (let rIdx = 0; rIdx < ringCount; rIdx++) {
              const ringFraction = rIdx === 0 ? 0.52 : 0.78;
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, outerRadius * ringFraction, 0, Math.PI * 2);
              ctx.strokeStyle = getGreenToDeepRedRGBA(vuln, 0.22 + vuln * 0.35);
              ctx.lineWidth = isCritical ? 1.8 : 1.1;
              ctx.setLineDash(isCritical ? [6, 4] : [3, 5]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        });

        ctx.restore();
      }

      // Draw Interconnecting Transmission Lines
      particleProgress = (particleProgress + 0.012) % 1;

      connections.forEach(([idA, idB]) => {
        const posA = nodePosMap.get(idA);
        const posB = nodePosMap.get(idB);
        const nodeA = nodes.find((n) => n.id === idA);
        const nodeB = nodes.find((n) => n.id === idB);

        if (posA && posB) {
          const vulnA = nodeA ? calculateNodeVulnerability(nodeA) : 0;
          const vulnB = nodeB ? calculateNodeVulnerability(nodeB) : 0;
          const maxLineVuln = Math.max(vulnA, vulnB);
          const isIsolated = (nodeA && nodeA.isolated) || (nodeB && nodeB.isolated);

          ctx.beginPath();
          ctx.moveTo(posA.x, posA.y);
          ctx.lineTo(posB.x, posB.y);

          if (isIsolated) {
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
            ctx.setLineDash([6, 6]);
          } else {
            ctx.strokeStyle = getGreenToDeepRedRGBA(maxLineVuln, 0.65);
            ctx.setLineDash([]);
          }
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw Power Flow Particles colored by local QBER vulnerability
          if (!isIsolated) {
            const px = posA.x + (posB.x - posA.x) * particleProgress;
            const py = posA.y + (posB.y - posA.y) * particleProgress;
            const particleColor = getGreenToDeepRedRGBA(maxLineVuln, 1.0);

            ctx.beginPath();
            ctx.arc(px, py, maxLineVuln > 0.7 ? 5.5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = particleColor;
            ctx.shadowColor = particleColor;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      });

      // Draw Nodes, BLE Packet Heartbeat Indicators & Vulnerability Telemetry Badges
      const nowMs = Date.now();
      nodes.forEach((node) => {
        const pos = nodePosMap.get(node.id);
        if (!pos) return;

        const isSelected = selectedNodeId === node.id;
        const qber = node.qber ?? 1.15;
        const vuln = calculateNodeVulnerability(node);
        const vulnPct = Math.round(vuln * 100);
        const isIsolated = node.isolated;
        const dynamicNodeColor = getGreenToDeepRedRGBA(vuln, 0.95);

        // ====================================================================
        // REAL-TIME BLE PACKET HEARTBEAT INDICATOR (Opacity from lastPacketTime)
        // ====================================================================
        const msSincePacket = Math.max(0, nowMs - (node.lastPacketTime || nowMs));
        // Fresh packet (< 1100ms) triggers high-opacity pulse that decays smoothly with age
        const freshnessDecay = isIsolated ? 0.08 : Math.exp(-msSincePacket / 650);
        const cardiacRipple = isIsolated
          ? 0
          : Math.max(0, Math.sin(((msSincePacket % 1000) / 1000) * Math.PI));
        const heartbeatOpacity = isIsolated
          ? 0.12
          : Math.min(1.0, Math.max(0.18, freshnessDecay * 0.85 + cardiacRipple * 0.25));
        const heartbeatProgress = Math.min(1.0, (msSincePacket % 1000) / 1000);

        // 1. Expanding Concentric Heartbeat Ripple Ring
        if (!isIsolated && msSincePacket < 2200) {
          const rippleRadius = 22 + heartbeatProgress * 22;
          const rippleAlpha = (1 - heartbeatProgress) * heartbeatOpacity * 0.85;
          ctx.save();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle =
            vuln > 0.7
              ? `rgba(255, 0, 85, ${rippleAlpha})`
              : `rgba(0, 255, 136, ${rippleAlpha})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        // Outer Selection / Status Ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isSelected ? 34 : 26, 0, Math.PI * 2);
        if (isIsolated) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = dynamicNodeColor;
          ctx.lineWidth = vuln > 0.7 ? 3 : 2;
        }
        ctx.stroke();

        // Node Central Circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);

        if (isIsolated) {
          ctx.fillStyle = '#1e293b';
        } else {
          ctx.fillStyle = getGreenToDeepRedRGBA(vuln, 0.35);
        }

        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : dynamicNodeColor;
        ctx.lineWidth = isSelected ? 3 : 2.2;
        ctx.stroke();

        // 2. Node Top-Right BLE Heartbeat Beacon Pip & Halo (Pulses opacity via heartbeatOpacity)
        const hbX = pos.x + 15;
        const hbY = pos.y - 15;
        ctx.save();
        ctx.globalAlpha = heartbeatOpacity;

        // Outer Heartbeat Glow Halo
        ctx.beginPath();
        ctx.arc(hbX, hbY, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = isIsolated
          ? '#64748b'
          : vuln > 0.7
          ? 'rgba(255, 0, 85, 0.45)'
          : 'rgba(0, 255, 136, 0.45)';
        ctx.fill();

        // Inner Heartbeat Pip
        ctx.beginPath();
        ctx.arc(hbX, hbY, 4, 0, Math.PI * 2);
        ctx.fillStyle = isIsolated ? '#64748b' : vuln > 0.7 ? '#ff0055' : '#00ff88';
        ctx.shadowColor = isIsolated ? 'transparent' : vuln > 0.7 ? '#ff0055' : '#00ff88';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();

        // Node Text Label
        ctx.font = '600 12px "Rajdhani", sans-serif';
        ctx.fillStyle = vuln > 0.7 ? '#fecdd3' : '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, pos.x, pos.y + 38);

        // Subtext Telemetry + Local QBER, Vulnerability & BLE Heartbeat Age
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = isIsolated ? '#64748b' : dynamicNodeColor;
        const hbLabel = isIsolated
          ? 'HB:OFFLINE'
          : `HB:${msSincePacket < 999 ? `${msSincePacket}ms` : `${(msSincePacket / 1000).toFixed(1)}s`}`;
        ctx.fillText(
          `QBER:${qber.toFixed(1)}% | VULN:${vulnPct}% | ${hbLabel}`,
          pos.x,
          pos.y + 52
        );
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, selectedNodeId, showHeatmap]);

  // Canvas Node Drag & Click Handlers
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, width: 900, height: 500 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      width: canvas.width,
      height: canvas.height,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y, width, height } = getCanvasCoords(e);
    for (const node of nodes) {
      const px = (node.x / 100) * width;
      const py = (node.y / 100) * height;
      if (Math.hypot(x - px, y - py) <= 35) {
        onSelectNode(node);
        draggingNodeIdRef.current = node.id;
        e.currentTarget.setPointerCapture(e.pointerId);
        break;
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingNodeIdRef.current) return;
    const { x, y, width, height } = getCanvasCoords(e);
    const pctX = (x / width) * 100;
    const pctY = (y / height) * 100;
    bluetoothService.updateNodePosition(draggingNodeIdRef.current, pctX, pctY);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingNodeIdRef.current) {
      draggingNodeIdRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  // Inspector Panel Drag Handlers (ignores interactive buttons/switches and resize handles inside the panel)
  const handlePanelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a, label, [data-resize-handle="true"]')) return;
    setIsDraggingPanel(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: panelOffset.x,
      origY: panelOffset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeDirection) {
      const dx = e.clientX - resizeStartRef.current.startX;
      const dy = e.clientY - resizeStartRef.current.startY;
      let nextW = resizeStartRef.current.origW;
      let nextH = resizeStartRef.current.origH;
      let nextOffsetX = resizeStartRef.current.origOffsetX;
      let nextOffsetY = resizeStartRef.current.origOffsetY;

      if (resizeDirection.includes('e')) {
        nextW = Math.max(310, Math.min(780, resizeStartRef.current.origW + dx));
      }
      if (resizeDirection.includes('w')) {
        const clampedW = Math.max(310, Math.min(780, resizeStartRef.current.origW - dx));
        nextOffsetX = resizeStartRef.current.origOffsetX + (resizeStartRef.current.origW - clampedW);
        nextW = clampedW;
      }
      if (resizeDirection.includes('s')) {
        nextH = Math.max(260, Math.min(780, resizeStartRef.current.origH + dy));
      }
      if (resizeDirection.includes('n')) {
        const clampedH = Math.max(260, Math.min(780, resizeStartRef.current.origH - dy));
        nextOffsetY = resizeStartRef.current.origOffsetY + (resizeStartRef.current.origH - clampedH);
        nextH = clampedH;
      }

      setPanelSize({ width: nextW, height: nextH });
      setPanelOffset({ x: nextOffsetX, y: nextOffsetY });
      return;
    }

    if (!isDraggingPanel) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setPanelOffset({
      x: dragStartRef.current.origX + dx,
      y: dragStartRef.current.origY + dy,
    });
  };

  const handlePanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeDirection) {
      setResizeDirection(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
    if (isDraggingPanel) {
      setIsDraggingPanel(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const handleStartResize = (dir: string, e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    const currentRect = inspectorPanelRef.current?.getBoundingClientRect();
    const currentW = panelSize.width || currentRect?.width || 400;
    const currentH = panelSize.height || currentRect?.height || 500;
    setResizeDirection(dir);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: currentW,
      origH: currentH,
      origOffsetX: panelOffset.x,
      origOffsetY: panelOffset.y,
    };
    if (inspectorPanelRef.current) {
      try {
        inspectorPanelRef.current.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-cyan-500/20 bg-[#090e18] shadow-2xl">
      {/* Top Bar Header inside Canvas overlay with Toggleable d3-scale Threat Heatmap & Neon-Green to Deep-Red Scale */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 px-4 py-2.5 bg-cyan-950/30 text-xs font-mono">
        <div className="flex items-center gap-2 text-cyan-400">
          <Activity className="h-4 w-4 animate-pulse" />
          <span className="font-bold tracking-wider">
            SMART GRID MESH TOPOLOGY &amp; D3-SCALE SVG THREAT HEATMAP
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Neon-Green -> Deep-Red d3-scale Threat Heatmap Legend Bar */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-300">
            <Flame className="h-3.5 w-3.5 text-amber-400" />
            <span>D3-SCALE QBER GRADIENT:</span>
            <span className="text-[#00ff88] font-bold">NEON GREEN (SAFE)</span>
            <div
              className="h-2.5 w-32 rounded-full border border-white/20"
              style={{
                background: `linear-gradient(90deg, ${d3QberThreatColorScale(0.8)} 0%, ${d3QberThreatColorScale(5.5)} 45%, ${d3QberThreatColorScale(11.5)} 78%, ${d3QberThreatColorScale(19.0)} 100%)`,
              }}
            />
            <span className="text-[#ff0055] font-bold">DEEP RED (CRITICAL)</span>
          </div>

          {/* Toggleable 'Threat Heatmap' SVG Overlay Switch */}
          <div className="flex items-center gap-2 rounded border border-cyan-500/30 bg-[#05070c] px-2.5 py-1">
            <span className="text-[11px] text-slate-300 font-semibold">THREAT HEATMAP:</span>
            <button
              id="toggle-threat-heatmap-btn"
              type="button"
              role="switch"
              aria-checked={showHeatmap}
              onClick={() => setShowHeatmap((prev) => !prev)}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                showHeatmap
                  ? 'bg-emerald-500/30 border-[#00ff88]'
                  : 'bg-slate-800 border-slate-600'
              }`}
              title="Toggle SVG d3-scale Threat Heatmap overlay on top of grid nodes"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                  showHeatmap ? 'translate-x-5 bg-[#00ff88]' : 'translate-x-1 bg-slate-400'
                }`}
              />
            </button>
            <span
              className={`text-[10px] font-bold ${
                showHeatmap ? 'text-[#00ff88]' : 'text-slate-500'
              }`}
            >
              {showHeatmap ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* HTML5 Canvas + Toggleable SVG d3-scale Threat Heatmap Overlay + Tailwind Arbitrary Keyframe Heartbeat + Circular SVG Latency Gauge */}
      <div className="relative h-[380px] sm:h-[480px] w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          className="h-full w-full cursor-grab active:cursor-grabbing cyber-grid-bg touch-none"
        />

        {/* Toggleable 'Threat Heatmap' SVG Layer rendered ON TOP of the grid nodes using d3-scale */}
        {showHeatmap && (
          <svg
            id="d3-threat-heatmap-svg-layer"
            viewBox="0 0 900 500"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
          >
            <defs>
              <filter id="d3-threat-heatmap-blur" x="-35%" y="-35%" width="170%" height="170%">
                <feGaussianBlur stdDeviation="16" result="blurredHeat" />
              </filter>

              {nodes.map((node) => {
                const effectiveQber =
                  node.activeAttack !== 'NONE'
                    ? Math.max(node.qber ?? 1.15, QBER_CRITICAL_THRESHOLD + 3.5)
                    : node.qber ?? 1.15;
                const coreColor = node.isolated
                  ? '#475569'
                  : d3QberThreatColorScale(effectiveQber);
                const midColor = node.isolated
                  ? '#334155'
                  : d3QberOuterHaloColorScale(effectiveQber);
                const peakAlpha = node.isolated
                  ? 0.16
                  : d3QberOpacityScale(effectiveQber);

                return (
                  <radialGradient
                    key={`d3-svg-grad-${node.id}`}
                    id={`d3-threat-grad-${node.id}`}
                    cx="50%"
                    cy="50%"
                    r="50%"
                  >
                    <stop offset="0%" stopColor={coreColor} stopOpacity={peakAlpha} />
                    <stop offset="42%" stopColor={midColor} stopOpacity={peakAlpha * 0.55} />
                    <stop offset="76%" stopColor={midColor} stopOpacity={peakAlpha * 0.2} />
                    <stop offset="100%" stopColor={midColor} stopOpacity={0} />
                  </radialGradient>
                );
              })}

              {/* Transmission Corridor Gradient Definitions */}
              {[
                ['node-alpha-1', 'node-gamma-9'],
                ['node-beta-3', 'node-gamma-9'],
                ['node-gamma-9', 'node-delta-4'],
                ['node-gamma-9', 'node-epsilon-7'],
              ].map(([idA, idB]) => {
                const nodeA = nodes.find((n) => n.id === idA);
                const nodeB = nodes.find((n) => n.id === idB);
                if (!nodeA || !nodeB) return null;
                const qberA =
                  nodeA.activeAttack !== 'NONE'
                    ? Math.max(nodeA.qber ?? 1.15, QBER_CRITICAL_THRESHOLD + 3.5)
                    : nodeA.qber ?? 1.15;
                const qberB =
                  nodeB.activeAttack !== 'NONE'
                    ? Math.max(nodeB.qber ?? 1.15, QBER_CRITICAL_THRESHOLD + 3.5)
                    : nodeB.qber ?? 1.15;
                return (
                  <linearGradient
                    key={`d3-corridor-grad-${idA}-${idB}`}
                    id={`d3-corridor-grad-${idA}-${idB}`}
                    x1={`${nodeA.x}%`}
                    y1={`${nodeA.y}%`}
                    x2={`${nodeB.x}%`}
                    y2={`${nodeB.y}%`}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop
                      offset="0%"
                      stopColor={d3QberThreatColorScale(qberA)}
                      stopOpacity={nodeA.isolated ? 0.08 : 0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={d3QberThreatColorScale(qberB)}
                      stopOpacity={nodeB.isolated ? 0.08 : 0.35}
                    />
                  </linearGradient>
                );
              })}
            </defs>

            {/* 1. SVG Thermal Transmission Corridors mapped via d3-scale */}
            {[
              ['node-alpha-1', 'node-gamma-9'],
              ['node-beta-3', 'node-gamma-9'],
              ['node-gamma-9', 'node-delta-4'],
              ['node-gamma-9', 'node-epsilon-7'],
            ].map(([idA, idB]) => {
              const nodeA = nodes.find((n) => n.id === idA);
              const nodeB = nodes.find((n) => n.id === idB);
              if (!nodeA || !nodeB || nodeA.isolated || nodeB.isolated) return null;
              const x1 = (nodeA.x / 100) * 900;
              const y1 = (nodeA.y / 100) * 500;
              const x2 = (nodeB.x / 100) * 900;
              const y2 = (nodeB.y / 100) * 500;
              return (
                <line
                  key={`svg-corridor-${idA}-${idB}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={`url(#d3-corridor-grad-${idA}-${idB})`}
                  strokeWidth={28}
                  strokeLinecap="round"
                  filter="url(#d3-threat-heatmap-blur)"
                />
              );
            })}

            {/* 2. Per-Node SVG Threat Heatmap Plumes & Isothermal Contour Rings on top of grid nodes */}
            {nodes.map((node) => {
              const cx = (node.x / 100) * 900;
              const cy = (node.y / 100) * 500;
              const effectiveQber =
                node.activeAttack !== 'NONE'
                  ? Math.max(node.qber ?? 1.15, QBER_CRITICAL_THRESHOLD + 3.5)
                  : node.qber ?? 1.15;
              const heatRadius = node.isolated ? 56 : d3QberRadiusScale(effectiveQber);
              const strokeColor = node.isolated
                ? '#64748b'
                : d3QberThreatColorScale(effectiveQber);
              const isCritical =
                !node.isolated &&
                (effectiveQber > QBER_CRITICAL_THRESHOLD || node.activeAttack !== 'NONE');

              return (
                <g
                  key={`svg-heat-node-${node.id}`}
                  data-heatmap-node={node.id}
                  data-d3-color={strokeColor}
                  data-node-qber={effectiveQber.toFixed(2)}
                >
                  {/* Diffused Radial Heat Plume */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={heatRadius}
                    fill={`url(#d3-threat-grad-${node.id})`}
                    filter="url(#d3-threat-heatmap-blur)"
                  />

                  {/* Crisp Isothermal Threat Contour Ring */}
                  {!node.isolated && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={heatRadius * 0.56}
                      fill="none"
                      stroke={strokeColor}
                      strokeOpacity={isCritical ? 0.65 : 0.35}
                      strokeWidth={isCritical ? 1.8 : 1.1}
                      strokeDasharray={isCritical ? '6 4' : '3 5'}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* CSS Glowing Pulse Heartbeat Layer (using Tailwind arbitrary keyframe values with frequency proportional to QBER) & Circular SVG Network Latency Gauge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
          {nodes.map((node) => {
            const qberVal = node.qber ?? 1.15;
            const vuln = calculateNodeVulnerability(node);
            const isCritical =
              qberVal > QBER_CRITICAL_THRESHOLD || node.activeAttack !== 'NONE';
            const isElevated = !isCritical && qberVal > 4.5;

            // Pulse frequency (Hz) is directly proportional to the node's current QBER value:
            // f(QBER) = 0.45 Hz + 0.22 * QBER  --> Period T = 1 / f(QBER) seconds
            const pulseFrequencyHz = Number((0.45 + qberVal * 0.22).toFixed(2));
            const pulseDurationSec = Number((1 / pulseFrequencyHz).toFixed(3));
            const pulseScale = (1.14 + vuln * 0.38).toFixed(2);
            const glowBlurPx = Math.round(12 + vuln * 28);
            const glowSpreadPx = Math.round(2 + vuln * 9);
            const minOpacity = (0.26 + vuln * 0.32).toFixed(2);
            const maxOpacity = (0.62 + vuln * 0.38).toFixed(2);
            const d3Color = d3QberThreatColorScale(qberVal);
            const pulseColor = getGreenToDeepRedRGBA(vuln, 0.7 + vuln * 0.28);
            const pulseCore = getGreenToDeepRedRGBA(vuln, 0.25 + vuln * 0.32);

            const tierClass = isCritical
              ? 'substation-qber-critical'
              : isElevated
              ? 'substation-qber-elevated'
              : 'substation-qber-nominal';

            // Real-time BLE Round-Trip Network Latency circular SVG path metrics (0ms .. 220ms scale)
            const latencyMs = node.isolated ? 0 : (node.latencyMs ?? 18);
            const latencyRatio = node.isolated
              ? 0
              : Math.min(1, Math.max(0.08, latencyMs / 220));
            const svgRadius = 31;
            const svgCircumference = Number((2 * Math.PI * svgRadius).toFixed(2));
            const svgDashOffset = Number(
              (svgCircumference * (1 - latencyRatio)).toFixed(2)
            );
            const latencyColor = getLatencyGaugeColor(latencyMs, node.isolated);

            return (
              <React.Fragment key={`overlay-node-${node.id}`}>
                {/* 1. CSS Glowing Pulse Heartbeat Ring using Tailwind arbitrary values for keyframes */}
                {!node.isolated && (
                  <div
                    data-node-id={node.id}
                    data-qber={qberVal.toFixed(2)}
                    data-pulse-frequency-hz={pulseFrequencyHz}
                    data-d3-threat-color={d3Color}
                    className={`substation-qber-pulse-node ${tierClass} animate-[qberNodeHeartbeat_var(--qber-pulse-duration)_cubic-bezier(0.4,0,0.6,1)_infinite]`}
                    style={
                      {
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                        '--qber-pulse-duration': `${pulseDurationSec}s`,
                        '--qber-pulse-scale': pulseScale,
                        '--qber-glow-blur': `${glowBlurPx}px`,
                        '--qber-glow-spread': `${glowSpreadPx}px`,
                        '--qber-pulse-min-opacity': minOpacity,
                        '--qber-pulse-max-opacity': maxOpacity,
                        '--qber-pulse-color': pulseColor,
                        '--qber-pulse-core': pulseCore,
                      } as React.CSSProperties
                    }
                  />
                )}

                {/* 2. Real-Time Circular SVG Path 'Network Latency' Gauge + Pulse Frequency Badge for each Node */}
                <div
                  data-latency-node={node.id}
                  data-latency-ms={latencyMs}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="pointer-events-none absolute flex flex-col items-center justify-center"
                >
                  <svg
                    width="74"
                    height="74"
                    viewBox="0 0 74 74"
                    className="overflow-visible -rotate-90"
                  >
                    {/* Background Circular SVG Path Track */}
                    <path
                      d="M 37, 6 A 31, 31 0 1, 1 36.99, 6"
                      fill="none"
                      stroke="rgba(15, 23, 42, 0.78)"
                      strokeWidth="3.5"
                    />
                    {/* Foreground Circular SVG Path Latency Gauge */}
                    <path
                      d="M 37, 6 A 31, 31 0 1, 1 36.99, 6"
                      fill="none"
                      stroke={latencyColor}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={svgCircumference}
                      strokeDashoffset={svgDashOffset}
                      style={{
                        transition: 'stroke-dashoffset 320ms ease, stroke 250ms ease',
                        filter: node.isolated ? 'none' : `drop-shadow(0 0 5px ${latencyColor})`,
                      }}
                    />
                  </svg>

                  {/* Top BLE Round-Trip Latency & Heartbeat Pulse Frequency Badge */}
                  <span
                    style={{
                      borderColor: latencyColor,
                      color: latencyColor,
                    }}
                    className=" -mt-[82px] rounded bg-[#04060a]/90 px-1.5 py-0.2 border text-[9px] font-mono font-bold tracking-tight whitespace-nowrap shadow"
                  >
                    {node.isolated
                      ? 'RTT: OFFLINE'
                      : `RTT: ${latencyMs}ms · ${pulseFrequencyHz.toFixed(2)}Hz`}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected Node Quick Inspector Overlay Panel (Movable / Draggable & Resizable div) */}
      {selectedNodeId && (
        <div
          ref={inspectorPanelRef}
          onPointerDown={handlePanelPointerDown}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
          style={{
            transform: `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)`,
            width: `${panelSize.width}px`,
            height: panelSize.height ? `${panelSize.height}px` : undefined,
            maxWidth: 'calc(100% - 1.5rem)',
            maxHeight: 'calc(100% - 1.5rem)',
            resize: 'both',
          }}
          className={`absolute bottom-4 right-4 z-20 overflow-y-auto overflow-x-hidden rounded-lg border border-cyan-500/40 bg-[#05070c]/95 p-4 backdrop-blur-xl shadow-2xl select-none ${
            isDraggingPanel || resizeDirection
              ? 'cursor-grabbing ring-2 ring-[#00ff88]/60'
              : 'cursor-grab'
          }`}
        >
          {/* Interactive Multi-Edge & Corner Resize Handles for Inspector Panel Div */}
          <div
            data-resize-handle="true"
            title="Drag left edge to resize width"
            onPointerDown={(e) => handleStartResize('w', e)}
            className="absolute left-0 top-3 bottom-3 w-2 cursor-ew-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            data-resize-handle="true"
            title="Drag right edge to resize width"
            onPointerDown={(e) => handleStartResize('e', e)}
            className="absolute right-0 top-3 bottom-3 w-2 cursor-ew-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            data-resize-handle="true"
            title="Drag top edge to resize height"
            onPointerDown={(e) => handleStartResize('n', e)}
            className="absolute top-0 left-3 right-3 h-2 cursor-ns-resize hover:bg-cyan-400/30 transition-colors"
          />
          <div
            data-resize-handle="true"
            title="Drag bottom edge to resize height"
            onPointerDown={(e) => handleStartResize('s', e)}
            className="absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize hover:bg-cyan-400/30 transition-colors"
          />
          {/* Top-Left Corner Resize Grip */}
          <div
            data-resize-handle="true"
            title="Drag corner to resize panel"
            onPointerDown={(e) => handleStartResize('nw', e)}
            className="absolute top-0 left-0 h-4 w-4 cursor-nwse-resize border-t-2 border-l-2 border-cyan-400/70 hover:border-[#00ff88] rounded-tl"
          />
          {/* Bottom-Right Corner Resize Grip */}
          <div
            data-resize-handle="true"
            title="Drag corner to resize panel"
            onPointerDown={(e) => handleStartResize('se', e)}
            className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize flex items-end justify-end p-0.5 text-cyan-400 hover:text-[#00ff88]"
          >
            <Maximize2 className="h-3 w-3 rotate-90" />
          </div>

          {(() => {
            const selected = nodes.find((n) => n.id === selectedNodeId);
            if (!selected) return null;
            const isNodeAttacked =
              selected.activeAttack !== 'NONE' || (selected.qber || 0) > QBER_CRITICAL_THRESHOLD;
            const vuln = calculateNodeVulnerability(selected);
            const vulnPercent = Math.round(vuln * 100);
            const selectedLatencyMs = selected.isolated ? 0 : (selected.latencyMs ?? 18);
            const selectedLatencyRatio = selected.isolated
              ? 0
              : Math.min(1, Math.max(0.06, selectedLatencyMs / 220));
            const gaugeR = 22;
            const gaugeCirc = Number((2 * Math.PI * gaugeR).toFixed(2));
            const gaugeOffset = Number((gaugeCirc * (1 - selectedLatencyRatio)).toFixed(2));
            const gaugeStroke = getLatencyGaugeColor(selectedLatencyMs, selected.isolated);

            const allEvents = selected.eventHistory || [];
            const filteredEvents =
              eventFilter === 'ALL'
                ? allEvents
                : allEvents.filter((ev) => ev.category === eventFilter);

            return (
              <div className="space-y-3">
                {/* Drag & Resize Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5 text-[10px] font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <Move className="h-3.5 w-3.5" />
                    <span>DRAG TO MOVE · EDGES TO RESIZE ({Math.round(panelSize.width)}px)</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPanelSize((prev) => ({
                          width: prev.width >= 520 ? 360 : prev.width + 80,
                          height: prev.height,
                        }))
                      }
                      className="rounded border border-cyan-500/30 bg-slate-900 px-1.5 py-0.5 text-[10px] text-cyan-300 hover:border-cyan-400 cursor-pointer"
                      title="Cycle panel width"
                    >
                      {panelSize.width >= 520 ? 'Compact' : 'Expand'}
                    </button>
                    {(panelOffset.x !== 0 ||
                      panelOffset.y !== 0 ||
                      panelSize.width !== 400 ||
                      panelSize.height !== null) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPanelOffset({ x: 0, y: 0 });
                          setPanelSize({ width: 400, height: null });
                        }}
                        className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                  <div>
                    <h4 className="font-bold tracking-wider text-cyan-400">{selected.name}</h4>
                    <span className="text-xs font-mono text-slate-400">{selected.macAddress}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded ${
                      selected.isolated
                        ? 'bg-slate-800 text-slate-400'
                        : isNodeAttacked
                        ? 'bg-rose-950 text-rose-400 border border-rose-600'
                        : 'bg-emerald-950 text-emerald-400'
                    }`}
                  >
                    {selected.status}
                  </span>
                </div>

                {/* Circular SVG Network Latency Gauge Card inside Inspector */}
                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/80 p-2.5 border border-cyan-500/25 font-mono text-xs">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                      <svg
                        width="56"
                        height="56"
                        viewBox="0 0 56 56"
                        className="-rotate-90 overflow-visible"
                      >
                        <path
                          d="M 28, 6 A 22, 22 0 1, 1 27.99, 6"
                          fill="none"
                          stroke="rgba(30, 41, 59, 0.9)"
                          strokeWidth="4.5"
                        />
                        <path
                          d="M 28, 6 A 22, 22 0 1, 1 27.99, 6"
                          fill="none"
                          stroke={gaugeStroke}
                          strokeWidth="4.5"
                          strokeLinecap="round"
                          strokeDasharray={gaugeCirc}
                          strokeDashoffset={gaugeOffset}
                          style={{
                            transition: 'stroke-dashoffset 300ms ease, stroke 250ms ease',
                            filter: selected.isolated
                              ? 'none'
                              : `drop-shadow(0 0 6px ${gaugeStroke})`,
                          }}
                        />
                      </svg>
                      <span
                        style={{ color: gaugeStroke }}
                        className="absolute text-[10px] font-bold tabular-nums"
                      >
                        {selected.isolated ? 'OFF' : `${selectedLatencyMs}ms`}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                        <Gauge className="h-3.5 w-3.5" />
                        <span>NETWORK LATENCY (BLE RTT)</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Edge-to-Dashboard packet round-trip:{' '}
                        <strong style={{ color: gaugeStroke }}>
                          {selected.isolated
                            ? 'LINK ISOLATED'
                            : selectedLatencyMs > 95
                            ? 'CONGESTED / UNDER ATTACK'
                            : selectedLatencyMs > 45
                            ? 'MODERATE JITTER'
                            : 'LOW-LATENCY NOMINAL'}
                        </strong>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Node Vulnerability Thermal Bar (Green to Deep Red) */}
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Local QBER Vulnerability:</span>
                    <span
                      style={{ color: getGreenToDeepRedRGBA(vuln, 1) }}
                      className="font-bold tabular-nums"
                    >
                      {vulnPercent}% ({vulnPercent >= 75 ? 'DEEP RED / CRITICAL' : vulnPercent >= 35 ? 'ELEVATED' : 'NOMINAL GREEN'})
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${Math.max(4, vulnPercent)}%`,
                        backgroundColor: getGreenToDeepRedRGBA(vuln, 1),
                      }}
                    />
                  </div>
                </div>

                {/* Interactive Substation Breaker & Attack Toggle Switches */}
                <div className="space-y-2 rounded bg-slate-900/75 p-2.5 border border-slate-800 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Substation Grid Breaker Switch:</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!selected.isolated}
                      onClick={() => onToggleIsolation(selected.id)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                        !selected.isolated
                          ? 'bg-emerald-500/30 border-emerald-400'
                          : 'bg-slate-800 border-slate-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                          !selected.isolated ? 'translate-x-5 bg-[#00ff88]' : 'translate-x-1 bg-slate-400'
                        }`}
                      />
                    </button>
                  </div>

                  {onInjectAttack && (
                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
                      <span className="text-slate-300">Simulate Node Attack Switch:</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isNodeAttacked}
                        onClick={() =>
                          onInjectAttack(
                            selected.id,
                            isNodeAttacked ? 'NONE' : 'QUANTUM_PROBE'
                          )
                        }
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                          isNodeAttacked
                            ? 'bg-rose-500/30 border-rose-500'
                            : 'bg-slate-800 border-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                            isNodeAttacked ? 'translate-x-5 bg-[#ff0055]' : 'translate-x-1 bg-slate-400'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="rounded bg-slate-900/60 p-2 border border-slate-800">
                    <span className="text-slate-400">Frequency:</span>
                    <p className="text-sm font-bold text-cyan-300 tabular-nums">
                      {selected.frequency} Hz
                    </p>
                  </div>
                  <div className="rounded bg-slate-900/60 p-2 border border-slate-800">
                    <span className="text-slate-400">Harmonics (THD):</span>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        selected.thd > 3.0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {selected.thd}%
                    </p>
                  </div>
                  <div className="rounded bg-slate-900/60 p-2 border border-slate-800">
                    <span className="text-slate-400">Local QBER:</span>
                    <p
                      style={{ color: getGreenToDeepRedRGBA(vuln, 1) }}
                      className="text-sm font-bold tabular-nums"
                    >
                      {(selected.qber || 1.15).toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded bg-slate-900/60 p-2 border border-slate-800">
                    <span className="text-slate-400">BLE Signal (RSSI):</span>
                    <p className="text-sm font-bold text-slate-200 tabular-nums">
                      {selected.rssi} dBm
                    </p>
                  </div>
                </div>

                {/* Live BLE Packet Heartbeat Verification Bar */}
                {(() => {
                  const ageMs = Math.max(0, Date.now() - (selected.lastPacketTime || Date.now()));
                  const hbOpacity = selected.isolated
                    ? 0.15
                    : Math.min(1.0, Math.max(0.25, Math.exp(-ageMs / 650)));
                  return (
                    <div className="flex items-center justify-between rounded bg-slate-900/75 px-2.5 py-2 border border-slate-800 text-[11px] font-mono">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span
                          style={{ opacity: hbOpacity }}
                          className={`inline-block h-2.5 w-2.5 rounded-full transition-opacity duration-150 ${
                            selected.isolated
                              ? 'bg-slate-500'
                              : isNodeAttacked
                              ? 'bg-[#ff0055] shadow-[0_0_8px_#ff0055]'
                              : 'bg-[#00ff88] shadow-[0_0_8px_#00ff88]'
                          }`}
                        />
                        <span>BLE PACKET HEARTBEAT:</span>
                      </span>
                      <span className={selected.isolated ? 'text-slate-500' : 'text-[#00ff88] font-bold tabular-nums'}>
                        {selected.isolated
                          ? 'DISCONNECTED'
                          : `${new Date(selected.lastPacketTime).toLocaleTimeString()} (${ageMs}ms ago)`}
                      </span>
                    </div>
                  );
                })()}

                {/* Per-Node 'Event History' Log Section (Connection Timestamps & Mitigation Actions) */}
                <div
                  id="node-event-history-section"
                  className="rounded-lg border border-cyan-500/30 bg-slate-950/90 p-2.5 font-mono text-xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5 text-cyan-300 font-bold text-[11px]">
                      <Clock className="h-3.5 w-3.5 text-[#00ff88]" />
                      <span>EVENT HISTORY ({filteredEvents.length})</span>
                    </span>
                    <div className="flex items-center gap-1 text-[10px]">
                      {(['ALL', 'CONNECTION', 'MITIGATION'] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEventFilter(cat)}
                          className={`px-1.5 py-0.5 rounded border cursor-pointer transition ${
                            eventFilter === cat
                              ? 'border-[#00ff88] bg-emerald-950/60 text-[#00ff88] font-bold'
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {cat === 'ALL' ? 'ALL' : cat === 'CONNECTION' ? 'CONN' : 'MITIGATE'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {filteredEvents.length === 0 ? (
                      <p className="text-[11px] text-slate-500 py-2 text-center">
                        No {eventFilter.toLowerCase()} events recorded for {selected.name}.
                      </p>
                    ) : (
                      filteredEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded border border-slate-800/90 bg-slate-900/70 p-2 text-[11px] space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                ev.category === 'MITIGATION'
                                  ? 'bg-emerald-950 text-[#00ff88] border border-emerald-500/40'
                                  : ev.category === 'CONNECTION'
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {ev.category}
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {ev.timestamp}
                            </span>
                          </div>
                          <p className="font-bold text-slate-200">{ev.action}</p>
                          <p className="text-[10px] text-slate-400 leading-snug">{ev.details}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {isNodeAttacked && (
                  <div className="rounded bg-rose-950/60 p-2 text-xs text-rose-300 border border-rose-500/40 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 animate-pulse" />
                    <span>
                      ATTACK VECTOR: <strong>{selected.activeAttack}</strong>
                    </span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleIsolation(selected.id)}
                    className={`flex-1 py-1.5 px-3 text-xs font-bold rounded border transition cursor-pointer ${
                      selected.isolated
                        ? 'border-emerald-500 text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60'
                        : 'border-rose-500 text-rose-400 bg-rose-950/40 hover:bg-rose-900/60'
                    }`}
                  >
                    {selected.isolated ? 'RECONNECT GRID' : 'ISOLATE NODE'}
                  </button>

                  <button
                    type="button"
                    onClick={() => onRotateKey(selected.id)}
                    className="flex-1 py-1.5 px-3 text-xs font-bold rounded border border-purple-500 text-purple-300 bg-purple-950/40 hover:bg-purple-900/60 transition cursor-pointer"
                  >
                    ROTATE PQC KEY
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
