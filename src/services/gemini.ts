import { AIThreatReport, GridNode } from '../types/grid';

export async function analyzeGridNodeThreat(node: GridNode): Promise<AIThreatReport> {
  try {
    const response = await fetch('/api/analyze-threat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nodeName: node.name,
        nodeType: node.type,
        attackType: node.activeAttack,
        thd: node.thd,
        frequency: node.frequency,
        voltage: node.voltage,
        macAddress: node.macAddress,
        quantumKeyStatus: node.pqcKeyStatus
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data: AIThreatReport = await response.json();
    return data;
  } catch (err) {
    console.warn('[Q-GRID AI] Server request failed or offline. Using local deterministic intelligence:', err);
    
    // Deterministic fallback report when offline or server unreachable
    return {
      severity: node.activeAttack === 'STUXNET_HARMONIC_DRIFT' || node.activeAttack === 'QUANTUM_PROBE' 
        ? 'CRITICAL' 
        : node.activeAttack !== 'NONE' ? 'HIGH' : 'LOW',
      summary: node.activeAttack !== 'NONE' 
        ? `OFFLINE SENTINEL: Active ${node.activeAttack} threat detected on MAC ${node.macAddress}. THD elevated to ${node.thd}%.`
        : `OFFLINE SENTINEL: ${node.name} operating under nominal post-quantum security parameters. Frequency stable at ${node.frequency}Hz.`,
      impactAnalysis: node.activeAttack !== 'NONE' 
        ? `Potential grid phase desynchronization or SCADA unauthorized command injection.`
        : `Power factor parameters within safe IEEE 1547 tolerances.`,
      recommendedActions: [
        node.activeAttack !== 'NONE' ? `Isolate MAC Address ${node.macAddress}` : `Maintain routine PQC monitoring`,
        `Execute Kyber-1024 Key Rotation`,
        `Reset Substation Phase Lock Loop (PLL)`
      ],
      defensePlaybook: `OFFLINE PROTOCOL: Enforce Kyber-1024 KEM and verify GATT MAC cryptographic hash.`,
      confidenceScore: 0.95
    };
  }
}
