import React, { useState, useEffect } from 'react';
import {
  SentinelSettings,
  SensitivityPreset,
  DEFAULT_SENTINEL_SETTINGS,
  SENTINEL_SETTINGS_STORAGE_KEY,
  getSentinelSettings,
  updateSentinelSettings,
  resetSentinelSettings,
  evaluateQBERWithEdgeAI,
} from '../services/edgeAI';
import { Settings, X, Save, RotateCcw, CheckCircle2, ShieldAlert, Sliders } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQber: number;
  onSettingsUpdated?: (settings: SentinelSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentQber,
  onSettingsUpdated,
}) => {
  const [draft, setDraft] = useState<SentinelSettings>(() => getSentinelSettings());
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(getSentinelSettings());
      setSavedNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const applyPreset = (preset: SensitivityPreset) => {
    if (preset === 'CONSERVATIVE') {
      setDraft((prev) => ({
        ...prev,
        sensitivityPreset: 'CONSERVATIVE',
        anomalySensitivity: 0.55,
        anomalyTriggerCutoff: 0.65,
      }));
    } else if (preset === 'BALANCED') {
      setDraft((prev) => ({
        ...prev,
        sensitivityPreset: 'BALANCED',
        anomalySensitivity: 0.85,
        anomalyTriggerCutoff: 0.50,
      }));
    } else if (preset === 'AGGRESSIVE') {
      setDraft((prev) => ({
        ...prev,
        sensitivityPreset: 'AGGRESSIVE',
        anomalySensitivity: 1.45,
        anomalyTriggerCutoff: 0.35,
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        sensitivityPreset: 'CUSTOM',
      }));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = updateSentinelSettings(draft);
    evaluateQBERWithEdgeAI(currentQber, currentQber > updated.qberCriticalThreshold);
    if (onSettingsUpdated) {
      onSettingsUpdated(updated);
    }
    setSavedNotice(
      `Saved to localStorage (${SENTINEL_SETTINGS_STORAGE_KEY}): QBER_CRITICAL_THRESHOLD = ${updated.qberCriticalThreshold.toFixed(
        1
      )}%, Sensitivity = ${updated.anomalySensitivity.toFixed(2)}x`
    );
  };

  const handleReset = () => {
    const resetVal = resetSentinelSettings();
    setDraft(resetVal);
    evaluateQBERWithEdgeAI(currentQber, currentQber > resetVal.qberCriticalThreshold);
    if (onSettingsUpdated) {
      onSettingsUpdated(resetVal);
    }
    setSavedNotice('Restored default BB84/Kyber-1024 threshold (11.0%) and Balanced AI sensitivity (0.85x).');
  };

  // Compute live preview of how currentQber is scored under the draft parameters
  const previewLogit = (currentQber - draft.qberCriticalThreshold) * draft.anomalySensitivity;
  const previewProb = 1 / (1 + Math.exp(-previewLogit));
  const previewTriggered =
    currentQber > draft.qberCriticalThreshold || previewProb >= draft.anomalyTriggerCutoff;

  return (
    <div
      id="sentinel-settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sentinel-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <div className="relative w-full max-w-2xl rounded-xl border border-[#00ff88]/50 bg-[#070b14] p-6 shadow-[0_0_40px_rgba(0,255,136,0.2)] font-mono text-xs text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/25 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#00ff88]/50 bg-emerald-950/50 text-[#00ff88]">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="sentinel-settings-title"
                className="text-base font-bold tracking-wider text-[#00ff88] glow-green font-display"
              >
                AI SENTINEL &amp; GLOBAL QBER THRESHOLD SETTINGS
              </h2>
              <p className="text-[11px] text-slate-400">
                Persisted to browser <code className="text-cyan-300">localStorage</code> ({SENTINEL_SETTINGS_STORAGE_KEY})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:border-cyan-400 hover:text-white cursor-pointer"
            title="Close Settings Modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {savedNotice && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2.5 text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00ff88]" />
              <span>{savedNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setSavedNotice(null)}
              className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* 1. Global QBER_CRITICAL_THRESHOLD Control */}
          <div className="rounded-lg border border-cyan-500/25 bg-slate-900/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label
                  htmlFor="global-qber-threshold-slider"
                  className="font-bold text-cyan-300 text-xs sm:text-sm flex items-center gap-2"
                >
                  <ShieldAlert className="h-4 w-4 text-[#00ff88]" />
                  <span>Global QBER_CRITICAL_THRESHOLD (%)</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sets the quantum bit error rate limit that triggers Eve interception alerts and Automated Mitigation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="global-qber-threshold-number"
                  type="number"
                  min="3.0"
                  max="22.0"
                  step="0.5"
                  value={draft.qberCriticalThreshold}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) {
                      setDraft((prev) => ({
                        ...prev,
                        qberCriticalThreshold: Math.max(3.0, Math.min(22.0, val)),
                      }));
                    }
                  }}
                  className="w-20 rounded border border-cyan-500/40 bg-[#04060a] px-2.5 py-1 text-right text-sm font-bold text-[#00ff88] tabular-nums outline-none focus:border-[#00ff88]"
                />
                <span className="text-sm font-bold text-[#00ff88]">%</span>
              </div>
            </div>

            <input
              id="global-qber-threshold-slider"
              type="range"
              min="3.0"
              max="22.0"
              step="0.5"
              value={draft.qberCriticalThreshold}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  qberCriticalThreshold: parseFloat(e.target.value),
                }))
              }
              className="w-full cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-slate-400">
              <span>3.0% (Ultra-Strict)</span>
              <span className="text-cyan-400">
                11.0% (Standard BB84 / Kyber Limit)
              </span>
              <span>22.0% (Relaxed)</span>
            </div>
          </div>

          {/* 2. AI Sentinel Anomaly Sensitivity Levels */}
          <div className="rounded-lg border border-cyan-500/25 bg-slate-900/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-cyan-300 text-xs sm:text-sm flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-purple-400" />
                  <span>AI Sentinel Anomaly Sensitivity Profile</span>
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Controls TensorFlow.js Edge AI logistic slope gain and anomaly trigger probability cutoff.
                </p>
              </div>
              <span className="rounded border border-purple-500/40 bg-purple-950/50 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                PROFILE: {draft.sensitivityPreset}
              </span>
            </div>

            {/* Sensitivity Preset Selector Buttons */}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'CONSERVATIVE',
                    label: 'CONSERVATIVE',
                    sub: '0.55x Gain · 0.65 Cutoff',
                  },
                  {
                    id: 'BALANCED',
                    label: 'BALANCED (DEFAULT)',
                    sub: '0.85x Gain · 0.50 Cutoff',
                  },
                  {
                    id: 'AGGRESSIVE',
                    label: 'AGGRESSIVE',
                    sub: '1.45x Gain · 0.35 Cutoff',
                  },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-lg border p-2.5 text-left transition cursor-pointer ${
                    draft.sensitivityPreset === preset.id
                      ? 'border-[#00ff88] bg-emerald-950/40 text-[#00ff88]'
                      : 'border-slate-800 bg-[#05070c] text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="font-bold text-[11px]">{preset.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{preset.sub}</div>
                </button>
              ))}
            </div>

            {/* Fine-Grained Sliders: Neural Sensitivity Gain & Anomaly Cutoff */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="rounded border border-slate-800 bg-[#05070c] p-3 space-y-1.5">
                <div className="flex justify-between">
                  <label htmlFor="anomaly-sensitivity-slider" className="text-slate-300">
                    Neural Sensitivity Gain:
                  </label>
                  <span className="font-bold text-cyan-300 tabular-nums">
                    {draft.anomalySensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="anomaly-sensitivity-slider"
                  type="range"
                  min="0.30"
                  max="2.00"
                  step="0.05"
                  value={draft.anomalySensitivity}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      sensitivityPreset: 'CUSTOM',
                      anomalySensitivity: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  Higher gain steepens anomaly probability rise near threshold.
                </span>
              </div>

              <div className="rounded border border-slate-800 bg-[#05070c] p-3 space-y-1.5">
                <div className="flex justify-between">
                  <label htmlFor="anomaly-cutoff-slider" className="text-slate-300">
                    Anomaly Alert Cutoff:
                  </label>
                  <span className="font-bold text-purple-300 tabular-nums">
                    {draft.anomalyTriggerCutoff.toFixed(2)} ({Math.round(draft.anomalyTriggerCutoff * 100)}%)
                  </span>
                </div>
                <input
                  id="anomaly-cutoff-slider"
                  type="range"
                  min="0.25"
                  max="0.85"
                  step="0.05"
                  value={draft.anomalyTriggerCutoff}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      sensitivityPreset: 'CUSTOM',
                      anomalyTriggerCutoff: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  Minimum neural anomaly score required to flag an intrusion.
                </span>
              </div>
            </div>
          </div>

          {/* Live Telemetry Evaluation Preview */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#04060a] px-4 py-2.5 text-[11px]">
            <div>
              <span className="text-slate-400">Live Telemetry Preview (@ QBER {currentQber.toFixed(2)}%): </span>
              <strong className="text-cyan-300 tabular-nums">
                Score {previewProb.toFixed(4)} ({(previewProb * 100).toFixed(1)}%)
              </strong>
            </div>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                previewTriggered
                  ? 'bg-rose-950 text-[#ff0055] border border-[#ff0055]/50'
                  : 'bg-emerald-950 text-[#00ff88] border border-[#00ff88]/50'
              }`}
            >
              {previewTriggered ? '✖ WOULD TRIGGER ALERT' : '● NOMINAL UNDER DRAFT'}
            </span>
          </div>

          {/* Modal Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-slate-300 hover:border-cyan-400 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restore Defaults ({DEFAULT_SENTINEL_SETTINGS.qberCriticalThreshold}%)</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Close
              </button>
              <button
                id="save-sentinel-settings-btn"
                type="submit"
                className="cyber-btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save to localStorage</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
