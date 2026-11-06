import React, { useState, useEffect } from 'react';
import { GridNode, AIThreatReport } from '../types/grid';
import { analyzeGridNodeThreat } from '../services/gemini';
import { speechAlertService } from '../services/speechAlert';
import { exportSecurityReportPDF } from '../services/pdfReportGenerator';
import {
  getSentinelSettings,
  subscribeSentinelSettings,
  SentinelSettings,
} from '../services/edgeAI';
import {
  Sparkles,
  Send,
  Bot,
  RefreshCcw,
  Activity,
  Volume2,
  FileDown,
  Settings,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

export interface ThreatHistoryPoint {
  time: string;
  secondsAgo: number;
  anomalyScore: number;
  qber: number;
  isAttack: boolean;
}

interface AISentinelPanelProps {
  nodes: GridNode[];
  selectedNode: GridNode;
  threatHistory?: ThreatHistoryPoint[];
  currentAnomalyScore?: number;
  onOpenSettings?: () => void;
}

export const AISentinelPanel: React.FC<AISentinelPanelProps> = ({
  nodes,
  selectedNode,
  threatHistory = [],
  currentAnomalyScore = 0.01,
  onOpenSettings,
}) => {
  const [report, setReport] = useState<AIThreatReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfExportNotice, setPdfExportNotice] = useState<string | null>(null);
  const [sentinelSettings, setSentinelSettings] = useState<SentinelSettings>(() =>
    getSentinelSettings()
  );
  const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
    {
      sender: 'ai',
      text: 'Greetings. I am Q-GRID SENTINEL, your Post-Quantum Smart Grid AI Defense Assistant. Select a substation node or ask me any question about smart grid cybersecurity, Web Bluetooth telemetry, or post-quantum cryptography.',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');

  useEffect(() => {
    const unsub = subscribeSentinelSettings((updated) => {
      setSentinelSettings(updated);
    });
    return unsub;
  }, []);

  if (!selectedNode) {
    return (
      <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-6 text-center font-mono text-xs text-slate-400">
        SELECT A NODE TO ENGAGE GEMINI AI THREAT SENTINEL...
      </div>
    );
  }

  const peakScore =
    threatHistory.length > 0
      ? Math.max(...threatHistory.map((pt) => pt.anomalyScore))
      : currentAnomalyScore;
  const avgScore =
    threatHistory.length > 0
      ? threatHistory.reduce((acc, pt) => acc + pt.anomalyScore, 0) / threatHistory.length
      : currentAnomalyScore;
  const isCurrentlyElevated = currentAnomalyScore >= sentinelSettings.anomalyTriggerCutoff;

  const handleRunAnalysis = async () => {
    setIsLoading(true);
    const result = await analyzeGridNodeThreat(selectedNode);
    setReport(result);
    setIsLoading(false);

    // Trigger Web Speech API Audio Alert when AI Sentinel finishes analyzing node threat
    speechAlertService.announceAISentinelReport(
      selectedNode.name,
      result.severity,
      result.summary,
      selectedNode.qber || 1.15
    );
  };

  const handleExportSecurityReport = () => {
    const filename = exportSecurityReportPDF({
      nodes,
      selectedNode,
      threatHistory,
      currentAnomalyScore,
      aiReport: report,
    });
    setPdfExportNotice(`Exported PDF audit report: ${filename}`);
    setTimeout(() => {
      setPdfExportNotice(null);
    }, 5000);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;

    const userText = inputQuery;
    setInputQuery('');

    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);

    setTimeout(() => {
      let aiResponse = `Analyzing smart grid query regarding "${userText}"... `;
      if (userText.toLowerCase().includes('quantum') || userText.toLowerCase().includes('kyber')) {
        aiResponse = `Q-GRID SENTINEL employs CRYSTALS-Kyber-1024 for lattice-based Key Encapsulation (KEM) and Dilithium-5 for digital signatures. This ensures that even quantum computers utilizing Shor's algorithm cannot decrypt SCADA GATT control channels.`;
      } else if (userText.toLowerCase().includes('bluetooth') || userText.toLowerCase().includes('ble')) {
        aiResponse = `Web Bluetooth API allows Q-GRID to stream real-time GATT characteristics (such as Environmental Sensing 0x181A) directly from edge meters into the web dashboard without intermediate server latency. All GATT write operations are signed with Dilithium-5.`;
      } else if (userText.toLowerCase().includes('stuxnet') || userText.toLowerCase().includes('drift')) {
        aiResponse = `SCADA Frequency Drift attacks manipulate sub-station phase lock loops (PLL) to force 50Hz grids up to 53-54Hz. Q-GRID SENTINEL detects elevated Total Harmonic Distortion (THD > 3%) and automatically executes microgrid islanding.`;
      } else {
        aiResponse = `Telemetry parameters across all 5 smart grid nodes are continuously monitored by Q-GRID SENTINEL's neural anomaly detection matrix. Currently, ${selectedNode.name} reports ${selectedNode.frequency}Hz frequency, ${selectedNode.thd}% THD, and an Edge AI anomaly score of ${(currentAnomalyScore * 100).toFixed(1)}%.`;
      }

      setChatMessages((prev) => [...prev, { sender: 'ai', text: aiResponse }]);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Recharts Threat Intensity History (Last 60 Seconds) */}
      <div className="rounded-xl border border-emerald-500/30 bg-[#090e18] p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-emerald-500/20 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <Activity
              className={`h-5 w-5 ${
                isCurrentlyElevated ? 'text-[#ff0055] animate-pulse' : 'text-[#00ff88]'
              }`}
            />
            <div>
              <h3 className="font-bold tracking-wider text-sm sm:text-base text-[#00ff88] glow-green">
                THREAT INTENSITY HISTORY (LAST 60 SECONDS)
              </h3>
              <p className="text-xs font-mono text-slate-400">
                Real-Time Edge AI Anomaly Score Stream · QBER Threshold:{' '}
                <strong className="text-[#00ff88]">
                  {sentinelSettings.qberCriticalThreshold.toFixed(1)}%
                </strong>{' '}
                · Sensitivity:{' '}
                <strong className="text-cyan-300">
                  {sentinelSettings.sensitivityPreset} ({sentinelSettings.anomalySensitivity.toFixed(2)}x)
                </strong>
              </p>
            </div>
          </div>

          {/* Live Summary Readout Badges + Administrative Actions */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="rounded-lg border border-slate-800 bg-[#05070c] px-3 py-1.5">
              <span className="text-slate-400 mr-2">LIVE SCORE:</span>
              <span
                className={`font-bold tabular-nums ${
                  isCurrentlyElevated ? 'text-[#ff0055] glow-red' : 'text-[#00ff88]'
                }`}
              >
                {currentAnomalyScore.toFixed(3)} ({(currentAnomalyScore * 100).toFixed(1)}%)
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#05070c] px-3 py-1.5">
              <span className="text-slate-400 mr-2">60S PEAK:</span>
              <span
                className={`font-bold tabular-nums ${
                  peakScore >= sentinelSettings.anomalyTriggerCutoff
                    ? 'text-[#ff0055]'
                    : 'text-cyan-300'
                }`}
              >
                {peakScore.toFixed(3)}
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#05070c] px-3 py-1.5">
              <span className="text-slate-400 mr-2">60S MEAN:</span>
              <span className="font-bold tabular-nums text-slate-200">
                {avgScore.toFixed(3)}
              </span>
            </div>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 hover:bg-cyan-900/60 transition cursor-pointer"
                title="Adjust global QBER_CRITICAL_THRESHOLD & AI Sentinel sensitivity"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Sentinel Settings</span>
              </button>
            )}

            <button
              id="export-security-report-btn"
              type="button"
              onClick={handleExportSecurityReport}
              className="flex items-center gap-1.5 rounded-lg border border-[#00ff88] bg-emerald-950/60 px-3.5 py-1.5 text-xs font-mono font-bold text-[#00ff88] hover:bg-emerald-900/70 shadow-[0_0_12px_rgba(0,255,136,0.2)] transition cursor-pointer"
              title="Generate and download a formatted PDF summary of current threat history and system status for administrative auditing"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>Export Security Report</span>
            </button>
          </div>
        </div>

        {pdfExportNotice && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-mono text-[#00ff88]">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{pdfExportNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setPdfExportNotice(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Recharts LineChart Container */}
        <div className="h-[260px] w-full rounded-lg border border-slate-800/80 bg-[#05070c] p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={threatHistory}
              margin={{ top: 12, right: 18, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 255, 136, 0.08)" />
              <XAxis
                dataKey="secondsAgo"
                tickFormatter={(val) => (val === 0 ? 'NOW' : `-${val}s`)}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1.0]}
                tickFormatter={(val) => val.toFixed(2)}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#050811',
                  borderColor: isCurrentlyElevated ? '#ff0055' : '#00ff88',
                  borderRadius: '8px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  color: '#e2e8f0',
                }}
                labelFormatter={(label, payload) => {
                  const pt = payload && payload[0] ? (payload[0].payload as ThreatHistoryPoint) : null;
                  const timeStr = pt ? pt.time : '';
                  return `T-${label}s ${timeStr ? `(${timeStr})` : ''}`;
                }}
                formatter={(value: any, name: any) => {
                  const num = Number(value);
                  if (name === 'anomalyScore') {
                    return [`${num.toFixed(4)} (${(num * 100).toFixed(1)}%)`, 'Anomaly Score'];
                  }
                  return [value, name];
                }}
              />
              <ReferenceLine
                y={sentinelSettings.anomalyTriggerCutoff}
                stroke="#ff0055"
                strokeDasharray="5 5"
                label={{
                  value: `CRITICAL CUTOFF (${sentinelSettings.anomalyTriggerCutoff.toFixed(2)})`,
                  position: 'insideTopRight',
                  fill: '#ff4d7d',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <Line
                type="monotone"
                dataKey="anomalyScore"
                name="anomalyScore"
                stroke={isCurrentlyElevated ? '#ff0055' : '#00ff88'}
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 5,
                  fill: isCurrentlyElevated ? '#ff0055' : '#00ff88',
                  stroke: '#04060a',
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>
            Window: Rolling 60-Second Buffer (1Hz Sample Rate) · Source: TensorFlow.js Edge AI / QBER Monitor
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[#00ff88]">
              <span className="h-2 w-2 rounded-full bg-[#00ff88]" /> Nominal (&lt;{' '}
              {sentinelSettings.anomalyTriggerCutoff.toFixed(2)})
            </span>
            <span className="flex items-center gap-1.5 text-[#ff0055]">
              <span className="h-2 w-2 rounded-full bg-[#ff0055]" /> Eavesdropping Alert (≥{' '}
              {sentinelSettings.anomalyTriggerCutoff.toFixed(2)})
            </span>
          </span>
        </div>
      </div>

      {/* Bottom 2-Column Grid: AI Threat Analyzer + Cyber Defense Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Threat Analysis & Incident Report Card */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between border-b border-cyan-500/20 pb-3 mb-4 gap-2">
              <div className="flex items-center gap-2 text-cyan-400">
                <Sparkles className="h-5 w-5 text-cyan-400 animate-pulse" />
                <h3 className="font-bold tracking-wider text-sm sm:text-base">
                  GEMINI AI ANOMALY &amp; THREAT ANALYZER
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportSecurityReport}
                  className="px-2.5 py-1.5 rounded border border-emerald-500/40 bg-emerald-950/40 text-[#00ff88] hover:bg-emerald-900/60 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                  title="Export Security Report PDF"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>EXPORT PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    speechAlertService.speak(
                      report
                        ? `AI Sentinel ${report.severity} report for ${selectedNode.name}. ${report.summary}`
                        : `AI Sentinel monitoring ${selectedNode.name}. Current QBER is ${(
                            selectedNode.qber || 1.15
                          ).toFixed(2)} percent. Anomaly score is ${(
                            currentAnomalyScore * 100
                          ).toFixed(1)} percent.`,
                      true
                    )
                  }
                  className="px-2.5 py-1.5 rounded border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                  title="Speak AI Threat Status via Web Speech API"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>SPEAK ALERT</span>
                </button>
                <button
                  type="button"
                  onClick={handleRunAnalysis}
                  disabled={isLoading}
                  className="cyber-btn-primary px-3 py-1.5 rounded text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'ANALYZING...' : 'ANALYZE NODE'}</span>
                </button>
              </div>
            </div>

            <div className="mb-4 text-xs font-mono text-slate-300">
              <span className="text-slate-400">Target Substation Node:</span>{' '}
              <strong className="text-cyan-400">{selectedNode.name}</strong> ({selectedNode.macAddress})
            </div>

            {report ? (
              <div className="space-y-4 font-mono text-xs">
                <div className="flex items-center justify-between p-3 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-400">THREAT SEVERITY:</span>
                  <span
                    className={`px-2.5 py-1 rounded font-bold ${
                      report.severity === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-400 border border-rose-600'
                        : report.severity === 'HIGH'
                        ? 'bg-amber-950 text-amber-400 border border-amber-600'
                        : 'bg-emerald-950 text-emerald-400'
                    }`}
                  >
                    {report.severity} (CONFIDENCE: {Math.round(report.confidenceScore * 100)}%)
                  </span>
                </div>

                <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-cyan-400 font-bold">INCIDENT SUMMARY:</span>
                  <p className="text-slate-200">{report.summary}</p>
                </div>

                <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-rose-400 font-bold">CASCADING IMPACT ANALYSIS:</span>
                  <p className="text-slate-200">{report.impactAnalysis}</p>
                </div>

                <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <span className="text-purple-300 font-bold">RECOMMENDED MITIGATION ACTIONS:</span>
                  <ul className="list-disc list-inside text-slate-300 space-y-1">
                    {report.recommendedActions.map((act, idx) => (
                      <li key={idx}>{act}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 rounded bg-purple-950/40 border border-purple-500/40 text-purple-200">
                  <span className="font-bold block mb-1">DEFENSE PLAYBOOK DIRECTIVE:</span>
                  <p className="italic">{report.defensePlaybook}</p>
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-lg">
                <Sparkles className="h-10 w-10 text-cyan-400/40 mb-3" />
                <p className="text-xs font-mono text-slate-400">
                  Click "ANALYZE NODE" above to invoke Gemini server-side AI anomaly detection on{' '}
                  {selectedNode.name}.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* AI Cyber Defense Exhibition Q&A Chat */}
        <div className="rounded-xl border border-cyan-500/20 bg-[#090e18] p-5 shadow-xl flex flex-col justify-between h-[520px]">
          <div>
            <div className="flex items-center gap-2 text-purple-400 border-b border-cyan-500/20 pb-3 mb-3">
              <Bot className="h-5 w-5" />
              <h3 className="font-bold tracking-wider text-sm sm:text-base">
                EXHIBITION CYBER DEFENSE AI ASSISTANT
              </h3>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[380px] p-2 pr-3 font-mono text-xs">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 p-3 rounded-lg ${
                    msg.sender === 'user'
                      ? 'bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 ml-6'
                      : 'bg-slate-900/80 border border-slate-800 text-slate-200 mr-6'
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded flex items-center justify-center shrink-0 font-bold ${
                      msg.sender === 'user' ? 'bg-cyan-500 text-black' : 'bg-purple-600 text-white'
                    }`}
                  >
                    {msg.sender === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="leading-relaxed">{msg.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSendChat} className="flex gap-2 pt-3 border-t border-slate-800">
            <input
              type="text"
              placeholder="Ask about quantum security, BLE GATT, or Stuxnet drift..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-cyan-300 outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded bg-cyan-600 text-white font-mono text-xs font-bold hover:bg-cyan-500 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>SEND</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
