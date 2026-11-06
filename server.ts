import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Gemini API Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// API Route: AI Cybersecurity Anomaly & Threat Analysis
app.post('/api/analyze-threat', async (req, res) => {
  try {
    const { nodeName, nodeType, attackType, thd, frequency, voltage, macAddress, quantumKeyStatus } = req.body;

    const ai = getGeminiClient();

    if (!ai) {
      // Rule-based fallback response if no API key present
      return res.json({
        severity: attackType ? 'HIGH' : 'LOW',
        summary: attackType 
          ? `Detected potential ${attackType} anomaly on smart grid node ${nodeName} (${macAddress}). Harmonic distortion elevated to ${thd}%.`
          : `Smart grid node ${nodeName} operational within nominal parameters. Frequency: ${frequency}Hz, THD: ${thd}%.`,
        impactAnalysis: attackType
          ? `Unauthorized frequency phase drift detected. Risk of sub-station cascade tripping or SCADA bus desynchronization.`
          : `Power quality factors stable. Post-quantum cryptographic session keys verified.`,
        recommendedActions: [
          attackType ? `Isolate BLE MAC Address ${macAddress}` : `Maintain normal telemetry monitoring`,
          `Trigger immediate Post-Quantum Kyber-1024 key re-negotiation`,
          `Engage phase-lock loop (PLL) active dampening on substation bus`,
          `Log incident to SCADA SIEM auditor`
        ],
        defensePlaybook: `PROTOCOL Q-${Math.floor(Math.random() * 900 + 100)}: Execute automated quantum key rotation and enforce strict IEEE 1547.2 smart grid islanding rule.`,
        confidenceScore: 0.94
      });
    }

    const prompt = `You are Q-GRID SENTINEL, a post-quantum smart grid cybersecurity AI defense advisor. 
Analyze the following telemetry parameters from a smart grid edge substation during a live exhibition monitoring scenario:

- Substation Node Name: ${nodeName || 'Alpha-1 Substation'}
- Node Type: ${nodeType || 'High-Voltage Transformer'}
- Active Cyber Attack Vector: ${attackType || 'None (Nominal State)'}
- Total Harmonic Distortion (THD): ${thd}%
- Grid Frequency: ${frequency} Hz
- Voltage Level: ${voltage} kV
- Edge BLE MAC Address: ${macAddress || '4A:8B:12:FE:90:01'}
- Quantum Key Status: ${quantumKeyStatus || 'Kyber-1024 Synchronized'}

Provide a structured JSON response with:
1. "severity": ("CRITICAL", "HIGH", "MEDIUM", "LOW")
2. "summary": Short 1-2 sentence cyber incident analysis summary.
3. "impactAnalysis": Potential cascading power grid impact description.
4. "recommendedActions": Array of 3-4 concrete mitigation commands (e.g., isolate MAC, rotate PQC key, adjust PLL).
5. "defensePlaybook": 1 sentence technical mitigation directive.
6. "confidenceScore": Number between 0.85 and 0.99.

Respond strictly in raw valid JSON format without markdown ticks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanText);
      return res.json(parsed);
    } catch {
      return res.json({
        severity: attackType ? 'HIGH' : 'LOW',
        summary: text || `Telemetry analysis complete for node ${nodeName}.`,
        impactAnalysis: `Calculated THD of ${thd}% requires continuous monitoring.`,
        recommendedActions: [
          `Rotate Kyber-1024 PQC Key`,
          `Verify BLE Edge GATT Authenticity`,
          `Monitor Grid Frequency Harmonics`
        ],
        defensePlaybook: `Enforce Q-GRID PQC Shielding and verify MAC ${macAddress}.`,
        confidenceScore: 0.91
      });
    }
  } catch (err: any) {
    console.error('Gemini Threat Analysis Error:', err);
    res.status(500).json({ error: 'Failed to process AI threat analysis', details: err.message });
  }
});

// Start Express + Vite Server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const htmlFilePath = path.resolve('index.html');
        const rawHtml = fs.readFileSync(htmlFilePath, 'utf-8');
        const template = await vite.transformIndexHtml(url, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Q-GRID SENTINEL] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
