import { GridNode, AIThreatReport } from '../types/grid';
import { getSentinelSettings } from './edgeAI';
import { bluetoothService } from './bluetooth';

export interface SecurityReportHistoryPoint {
  time: string;
  secondsAgo: number;
  anomalyScore: number;
  qber: number;
  isAttack: boolean;
}

export interface GenerateSecurityReportParams {
  nodes: GridNode[];
  selectedNode: GridNode;
  threatHistory: SecurityReportHistoryPoint[];
  currentAnomalyScore: number;
  aiReport: AIThreatReport | null;
}

/**
 * Escapes characters for PDF string literals (...)
 */
function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Wraps long text into lines of maxChars for clean PDF layout.
 */
function wrapText(text: string, maxChars: number = 88): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generates a standards-compliant formatted PDF 1.4 document summarizing
 * current threat history, sentinel settings, substation status, and AI audit findings,
 * and triggers a client-side download.
 */
export function exportSecurityReportPDF(params: GenerateSecurityReportParams): string {
  const { nodes, selectedNode, threatHistory, currentAnomalyScore, aiReport } = params;
  const sentinelSettings = getSentinelSettings();
  const firewallConfig = bluetoothService.getFirewallConfig();
  const now = new Date();
  const isoTimestamp = now.toISOString();
  const auditId = `QGRID-AUDIT-${now.getTime().toString(36).toUpperCase()}`;

  const peakScore =
    threatHistory.length > 0
      ? Math.max(...threatHistory.map((pt) => pt.anomalyScore))
      : currentAnomalyScore;
  const meanScore =
    threatHistory.length > 0
      ? threatHistory.reduce((acc, pt) => acc + pt.anomalyScore, 0) / threatHistory.length
      : currentAnomalyScore;
  const peakQber60s =
    threatHistory.length > 0
      ? Math.max(...threatHistory.map((pt) => pt.qber))
      : selectedNode.qber || 1.15;
  const breachCount60s = threatHistory.filter(
    (pt) => pt.isAttack || pt.qber > sentinelSettings.qberCriticalThreshold
  ).length;
  const activeAttacksCount = nodes.filter(
    (n) => n.activeAttack !== 'NONE' || (n.qber || 0) > sentinelSettings.qberCriticalThreshold
  ).length;

  const overallPosture =
    activeAttacksCount > 0 || currentAnomalyScore >= sentinelSettings.anomalyTriggerCutoff
      ? 'CRITICAL ALERT (INTERCEPTION / ANOMALY DETECTED)'
      : 'NOMINAL (POST-QUANTUM MESH SECURE)';

  // Build PDF content stream commands (US Letter: 612 x 792 pt)
  const ops: string[] = [];

  // Dark Header Banner Rectangle
  ops.push('0.03 0.06 0.11 rg');
  ops.push('28 718 556 50 re f');
  ops.push('0.0 0.85 0.55 RG 1.5 w');
  ops.push('28 718 556 50 re S');

  // Header Title Text
  ops.push('BT /F2 14 Tf 0.0 1.0 0.55 rg 40 746 Td');
  ops.push(`(${escapePdfText('Q-GRID SENTINEL - ADMINISTRATIVE SECURITY AUDIT REPORT')}) Tj ET`);

  ops.push('BT /F1 8.5 Tf 0.82 0.90 0.96 rg 40 729 Td');
  ops.push(
    `(${escapePdfText(
      `AUDIT ID: ${auditId}   |   GENERATED: ${isoTimestamp}   |   POSTURE: ${overallPosture}`
    )}) Tj ET`
  );

  let y = 696;

  const drawSectionHeader = (title: string) => {
    ops.push('0.06 0.12 0.20 rg');
    ops.push(`28 ${y - 4} 556 17 re f`);
    ops.push('0.0 0.75 0.95 RG 0.8 w');
    ops.push(`28 ${y - 4} 556 17 re S`);
    ops.push(`BT /F2 9.5 Tf 0.05 0.45 0.65 rg 36 ${y} Td`);
    ops.push(`(${escapePdfText(title)}) Tj ET`);
    y -= 20;
  };

  const drawLine = (text: string, bold: boolean = false, indent: number = 36) => {
    if (y < 42) return;
    ops.push(`BT /${bold ? 'F2' : 'F1'} 8.5 Tf 0.12 0.16 0.22 rg ${indent} ${y} Td`);
    ops.push(`(${escapePdfText(text)}) Tj ET`);
    y -= 12.5;
  };

  // SECTION 1: SYSTEM & AI SENTINEL CONFIGURATION
  drawSectionHeader('1. AI SENTINEL & POST-QUANTUM FIREWALL CONFIGURATION');
  drawLine(
    `Global QBER_CRITICAL_THRESHOLD: ${sentinelSettings.qberCriticalThreshold.toFixed(1)}%   |   Sensitivity Profile: ${sentinelSettings.sensitivityPreset} (${sentinelSettings.anomalySensitivity.toFixed(2)}x Gain)`,
    true
  );
  drawLine(
    `Anomaly Trigger Cutoff: ${sentinelSettings.anomalyTriggerCutoff.toFixed(2)} (${Math.round(sentinelSettings.anomalyTriggerCutoff * 100)}%)   |   Automated Mitigation: ${firewallConfig.automatedMitigation ? 'ENABLED (AUTO KEY ROTATION)' : 'MANUAL MODE'}`
  );
  drawLine(
    `Kyber-1024 KEM Enforcement: ${firewallConfig.enablePqcKyber ? 'ACTIVE' : 'BYPASSED'}   |   Strict GATT Sanitization: ${firewallConfig.enforceStrictGatt ? 'ACTIVE' : 'BYPASSED'}   |   PLL Frequency Lock: ${firewallConfig.pllFrequencyLock.toFixed(2)} Hz`
  );
  y -= 4;

  // SECTION 2: 60-SECOND THREAT INTENSITY HISTORY SUMMARY
  drawSectionHeader('2. THREAT INTENSITY HISTORY SUMMARY (LAST 60 SECONDS)');
  drawLine(
    `Live Anomaly Score: ${currentAnomalyScore.toFixed(4)} (${(currentAnomalyScore * 100).toFixed(1)}%)   |   60s Peak Score: ${peakScore.toFixed(4)}   |   60s Mean Score: ${meanScore.toFixed(4)}`,
    true
  );
  drawLine(
    `60s Peak QBER Recorded: ${peakQber60s.toFixed(2)}%   |   Threshold Breach Samples (60s): ${breachCount60s} / ${threatHistory.length || 60} samples`
  );

  // Recent 6 samples from Threat History
  const recentSamples = threatHistory.slice(-6).reverse();
  if (recentSamples.length > 0) {
    drawLine('Recent Telemetry Samples (Time | QBER % | Anomaly Score | Status):', true);
    recentSamples.forEach((pt) => {
      drawLine(
        `  - ${pt.time} (T-${pt.secondsAgo}s)   |   QBER: ${pt.qber.toFixed(2)}%   |   Score: ${pt.anomalyScore.toFixed(4)}   |   State: ${
          pt.isAttack ? 'COMPROMISED / ALERT' : 'NOMINAL'
        }`,
        false,
        42
      );
    });
  }
  y -= 4;

  // SECTION 3: SMART GRID SUBSTATION TELEMETRY MATRIX
  drawSectionHeader('3. SMART GRID SUBSTATION NODE TELEMETRY & STATUS MATRIX');
  drawLine(
    'NODE NAME                 | MAC ADDRESS       | STATUS    | QBER %  | FREQ Hz | THD % | RTT ms | PQC KEY STATUS',
    true
  );
  nodes.forEach((node) => {
    const namePad = node.name.padEnd(25, ' ').substring(0, 25);
    const macPad = node.macAddress.padEnd(17, ' ').substring(0, 17);
    const statusPad = node.status.padEnd(9, ' ').substring(0, 9);
    const qberPad = `${(node.qber || 1.15).toFixed(2)}%`.padEnd(7, ' ');
    const freqPad = `${node.frequency.toFixed(2)}`.padEnd(7, ' ');
    const thdPad = `${node.thd.toFixed(1)}%`.padEnd(5, ' ');
    const rttPad = `${node.isolated ? 'OFF' : `${node.latencyMs ?? 18}ms`}`.padEnd(6, ' ');
    drawLine(
      `${namePad} | ${macPad} | ${statusPad} | ${qberPad} | ${freqPad} | ${thdPad} | ${rttPad} | ${node.pqcKeyStatus}`
    );
  });
  y -= 4;

  // SECTION 4: AI SENTINEL THREAT ASSESSMENT & AUDIT DIRECTIVES
  drawSectionHeader(`4. AI SENTINEL THREAT ASSESSMENT (${selectedNode.name})`);
  const effectiveReport: AIThreatReport = aiReport || {
    severity:
      (selectedNode.qber || 0) > sentinelSettings.qberCriticalThreshold
        ? 'CRITICAL'
        : currentAnomalyScore >= sentinelSettings.anomalyTriggerCutoff
        ? 'HIGH'
        : 'LOW',
    summary:
      (selectedNode.qber || 0) > sentinelSettings.qberCriticalThreshold
        ? `Substation ${selectedNode.name} experienced QBER elevation (${(selectedNode.qber || 0).toFixed(2)}%) exceeding the ${sentinelSettings.qberCriticalThreshold.toFixed(1)}% threshold.`
        : `Substation ${selectedNode.name} is operating within nominal post-quantum parameters (QBER ${(selectedNode.qber || 1.15).toFixed(2)}%, Freq ${selectedNode.frequency}Hz).`,
    impactAnalysis:
      'Continuous Edge AI telemetry verification active across Web Bluetooth GATT characteristic beb5483e-36e1-4688-b7f5-ea07361b26a8.',
    recommendedActions: [
      'Maintain CRYSTALS-Kyber-1024 session key rotation across all active substation relays.',
      'Enforce strict GATT characteristic write sanitization and Dilithium-5 signature checks.',
      'Monitor 60-second anomaly score trajectory for sub-threshold harmonic drift.',
    ],
    defensePlaybook:
      'NIST FIPS 203 (ML-KEM / Kyber-1024) & IEEE 1547 Smart Grid Cybersecurity Defense Standard.',
    confidenceScore: 0.98,
  };

  drawLine(
    `Assessed Severity: ${effectiveReport.severity} (Confidence: ${Math.round(effectiveReport.confidenceScore * 100)}%)`,
    true
  );
  wrapText(`Executive Summary: ${effectiveReport.summary}`, 92).forEach((ln) =>
    drawLine(ln)
  );
  wrapText(`Impact Analysis: ${effectiveReport.impactAnalysis}`, 92).forEach((ln) =>
    drawLine(ln)
  );
  drawLine('Recommended Administrative Actions:', true);
  effectiveReport.recommendedActions.slice(0, 3).forEach((act, idx) => {
    wrapText(`${idx + 1}. ${act}`, 88).forEach((ln) => drawLine(ln, false, 44));
  });
  wrapText(`Defense Playbook: ${effectiveReport.defensePlaybook}`, 92).forEach((ln) =>
    drawLine(ln, true)
  );

  // Footer
  ops.push('0.75 0.80 0.86 RG 0.6 w 28 30 556 0 re S');
  ops.push('BT /F1 7.5 Tf 0.40 0.45 0.52 rg 28 18 Td');
  ops.push(
    `(${escapePdfText(
      `Q-GRID SENTINEL Post-Quantum Smart Grid Audit System  |  Document ID: ${auditId}  |  Page 1 of 1`
    )}) Tj ET`
  );

  const contentStream = ops.join('\n');

  // Assemble PDF 1.4 objects with exact byte offsets
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdfBody = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdfBody.length);
    pdfBody += obj;
  }

  const xrefOffset = pdfBody.length;
  pdfBody += `xref\n0 ${objects.length + 1}\n`;
  pdfBody += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdfBody += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfBody += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdfBody], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const safeStamp = isoTimestamp.replace(/[:.]/g, '-');
  const filename = `Q-GRID_Security_Report_${safeStamp}.pdf`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return filename;
}
