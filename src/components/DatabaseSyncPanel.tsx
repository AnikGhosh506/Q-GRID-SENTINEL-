import React, { useEffect, useState } from 'react';
import {
  databaseLogger,
  DatabaseStateSnapshot,
} from '../services/databaseLogger';
import { FIREBASE_PROJECT_INFO } from '../firebase';
import {
  Database,
  Smartphone,
  LogIn,
  LogOut,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Activity,
  AlertTriangle,
  Server,
} from 'lucide-react';

interface DatabaseSyncPanelProps {
  onCaptureConditionNow: () => void;
}

export const DatabaseSyncPanel: React.FC<DatabaseSyncPanelProps> = ({
  onCaptureConditionNow,
}) => {
  const [dbState, setDbState] = useState<DatabaseStateSnapshot>(() =>
    databaseLogger.getSnapshot()
  );
  const [selectedCollection, setSelectedCollection] = useState<
    'activityLogs' | 'triggerEvents' | 'systemConditions'
  >('triggerEvents');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const unsub = databaseLogger.subscribe((snap) => {
      setDbState({ ...snap });
    });
    return unsub;
  }, []);

  const handleCopy = (label: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      await databaseLogger.signInWithGoogle();
    } catch {
      // Handled via auth state / logger
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await databaseLogger.signOutUser();
    } finally {
      setAuthBusy(false);
    }
  };

  const isSignedIn = Boolean(dbState.currentUser);

  return (
    <div className="space-y-6">
      {/* Top Status & Authentication Card */}
      <div className="rounded-xl border border-emerald-500/35 bg-[#080d18] p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#00ff88]/60 bg-emerald-950/60 text-[#00ff88]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-wider text-[#00ff88] glow-green">
                CLOUD FIRESTORE DATABASE &amp; FIRELOG MOBILE TELEMETRY SYNC
              </h2>
              <p className="text-xs font-mono text-slate-400">
                Persists all Q-GRID SENTINEL website activities, QBER triggers, and system conditions to Cloud Firestore
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
            <button
              type="button"
              onClick={onCaptureConditionNow}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/50 px-3 py-2 text-cyan-300 hover:bg-cyan-900/60 font-bold transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Snapshot Condition Now</span>
            </button>

            {isSignedIn ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-lg border border-[#00ff88]/50 bg-emerald-950/60 px-3 py-2 text-[#00ff88] font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>SYNCED: {dbState.currentUser?.email}</span>
                </span>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/50 px-3 py-2 text-rose-300 hover:bg-rose-900/60 font-bold transition cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                id="google-signin-db-btn"
                type="button"
                disabled={authBusy}
                onClick={handleSignIn}
                className="cyber-btn-primary px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                <span>
                  {authBusy
                    ? 'Connecting Google Auth...'
                    : `Sign In with Google to Sync Cloud (${dbState.pendingQueueCount} Buffered)`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Metric Bar */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="rounded-lg border border-slate-800 bg-[#050811] p-3">
            <span className="text-slate-400 block">CLOUD SYNC STATUS</span>
            <span
              className={`text-sm font-bold ${
                isSignedIn ? 'text-[#00ff88]' : 'text-amber-400'
              }`}
            >
              {isSignedIn
                ? '● LIVE FIRESTORE STREAM'
                : `◐ BUFFERING LOCALLY (${dbState.pendingQueueCount} QUEUED)`}
            </span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#050811] p-3">
            <span className="text-slate-400 block">COLLECTION: activityLogs</span>
            <span className="text-sm font-bold text-cyan-300 tabular-nums">
              {dbState.activityLogs.length} Records
            </span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#050811] p-3">
            <span className="text-slate-400 block">COLLECTION: triggerEvents</span>
            <span className="text-sm font-bold text-[#ff0055] tabular-nums">
              {dbState.triggerEvents.length} Triggers
            </span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#050811] p-3">
            <span className="text-slate-400 block">COLLECTION: systemConditions</span>
            <span className="text-sm font-bold text-[#00ff88] tabular-nums">
              {dbState.systemConditions.length} Snapshots
            </span>
          </div>
        </div>
      </div>

      {/* Firelog Mobile App Connection Instructions & Credentials */}
      <div className="rounded-xl border border-cyan-500/35 bg-[#080d18] p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-2.5 border-b border-cyan-500/20 pb-3">
          <Smartphone className="h-5 w-5 text-cyan-400" />
          <h3 className="text-sm sm:text-base font-bold tracking-wider text-cyan-300">
            HOW TO ACCESS THIS DATABASE ON YOUR PHONE VIA FIRELOG MOBILE
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-mono text-xs">
          {/* Left: Connection Parameters with Copy Buttons */}
          <div className="lg:col-span-6 space-y-2.5">
            <p className="text-slate-300 leading-relaxed">
              Use the credentials below inside the <strong>Firelog</strong> mobile client (iOS / Android) to inspect and monitor live Firestore collections:
            </p>

            {[
              {
                key: 'projectId',
                label: 'Firebase Project ID',
                value: FIREBASE_PROJECT_INFO.projectId,
              },
              {
                key: 'databaseId',
                label: 'Firestore Database ID',
                value: FIREBASE_PROJECT_INFO.firestoreDatabaseId,
              },
              {
                key: 'collections',
                label: 'Root Collections',
                value: 'activityLogs, triggerEvents, systemConditions',
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#050811] px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 uppercase block">
                    {item.label}
                  </span>
                  <code className="text-xs text-[#00ff88] font-bold break-all">
                    {item.value}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(item.key, item.value)}
                  className="shrink-0 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-200 hover:border-[#00ff88] hover:text-[#00ff88] flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === item.key ? (
                    <>
                      <Check className="h-3 w-3 text-[#00ff88]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Right: Step-by-Step Firelog Mobile Walkthrough */}
          <div className="lg:col-span-6 rounded-lg border border-cyan-500/25 bg-[#050811] p-4 space-y-2.5 text-slate-300">
            <div className="font-bold text-cyan-300 uppercase tracking-wider">
              STEP-BY-STEP FIRELOG MOBILE SETUP:
            </div>
            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
              <li>
                <strong>Sign In on This Web Dashboard First:</strong> Click{' '}
                <span className="text-[#00ff88] font-bold">Sign In with Google</span> above so all buffered and live events stream into your Cloud Firestore instance under your verified UID.
              </li>
              <li>
                <strong>Open Firelog Mobile on iOS or Android:</strong> Sign in to Firelog using the <strong>same Google account</strong> associated with your AI Studio project.
              </li>
              <li>
                <strong>Select Project &amp; Database:</strong> Choose project{' '}
                <code className="text-cyan-300">{FIREBASE_PROJECT_INFO.projectId}</code> and select database{' '}
                <code className="text-cyan-300">{FIREBASE_PROJECT_INFO.firestoreDatabaseId}</code>.
              </li>
              <li>
                <strong>Inspect Live Collections:</strong> Open{' '}
                <code className="text-[#00ff88]">activityLogs</code>,{' '}
                <code className="text-[#ff0055]">triggerEvents</code>, or{' '}
                <code className="text-cyan-300">systemConditions</code> in Firelog to watch real-time documents arrive whenever QBER spikes, switches toggle, or settings change.
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Live Database Explorer Tabs */}
      <div className="rounded-xl border border-emerald-500/30 bg-[#080d18] p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => setSelectedCollection('triggerEvents')}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 font-bold transition cursor-pointer ${
                selectedCollection === 'triggerEvents'
                  ? 'border-[#ff0055] bg-rose-950/60 text-[#ff0055]'
                  : 'border-slate-800 bg-[#050811] text-slate-300 hover:text-white'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>triggerEvents ({dbState.triggerEvents.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCollection('activityLogs')}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 font-bold transition cursor-pointer ${
                selectedCollection === 'activityLogs'
                  ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                  : 'border-slate-800 bg-[#050811] text-slate-300 hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>activityLogs ({dbState.activityLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCollection('systemConditions')}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 font-bold transition cursor-pointer ${
                selectedCollection === 'systemConditions'
                  ? 'border-[#00ff88] bg-emerald-950/60 text-[#00ff88]'
                  : 'border-slate-800 bg-[#050811] text-slate-300 hover:text-white'
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>systemConditions ({dbState.systemConditions.length})</span>
            </button>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Showing latest 30 documents · Real-Time Firestore Listener
          </span>
        </div>

        {/* Collection Table View */}
        <div className="max-h-[420px] overflow-y-auto space-y-2 font-mono text-xs pr-1">
          {selectedCollection === 'triggerEvents' &&
            (dbState.triggerEvents.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No trigger events recorded yet. Toggle the Eve Attack Switch or scrub QBER above the threshold to log a trigger.
              </div>
            ) : (
              dbState.triggerEvents.map((trig) => (
                <div
                  key={trig.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-[#050811] p-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[#ff0055]">{trig.triggerType}</span>
                      <span>·</span>
                      <span className="text-cyan-300">{trig.nodeName}</span>
                      <span>·</span>
                      <span className="text-slate-400">Source: {trig.source}</span>
                      <span>·</span>
                      <span className="text-slate-500">
                        {trig.syncedToCloud ? 'Synced to Firestore' : 'Local Buffer'}
                      </span>
                    </div>
                    <div className="text-slate-300">
                      Peak QBER: <strong className="text-[#00ff88]">{trig.peakQber.toFixed(2)}%</strong> (Threshold: {trig.thresholdValue.toFixed(1)}%) · Edge AI Score:{' '}
                      <strong>{(trig.anomalyScore * 100).toFixed(1)}%</strong> · Auto-Mitigated:{' '}
                      <strong>{trig.autoMitigated ? 'YES' : 'NO'}</strong>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {new Date(trig.clientTimestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            ))}

          {selectedCollection === 'activityLogs' &&
            (dbState.activityLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No website activity logs recorded yet.
              </div>
            ) : (
              dbState.activityLogs.map((act) => (
                <div
                  key={act.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-cyan-500/25 bg-[#050811] p-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-cyan-300">{act.action}</span>
                      <span>·</span>
                      <span className="text-[#00ff88]">{act.category}</span>
                      <span>·</span>
                      <span className="text-slate-400">Node: {act.nodeId}</span>
                      <span>·</span>
                      <span className="text-slate-400">QBER: {act.qberAtEvent.toFixed(2)}%</span>
                    </div>
                    <p className="text-slate-300">{act.details}</p>
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {new Date(act.clientTimestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            ))}

          {selectedCollection === 'systemConditions' &&
            (dbState.systemConditions.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No system condition snapshots recorded yet. Click "Snapshot Condition Now" above to record one.
              </div>
            ) : (
              dbState.systemConditions.map((cond) => (
                <div
                  key={cond.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-[#050811] p-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-bold ${
                          cond.conditionStatus === 'COMPROMISED'
                            ? 'text-[#ff0055]'
                            : 'text-[#00ff88]'
                        }`}
                      >
                        STATUS: {cond.conditionStatus}
                      </span>
                      <span>·</span>
                      <span className="text-slate-300">
                        Grid Avg QBER: <strong>{cond.gridWideAvgQber.toFixed(2)}%</strong>
                      </span>
                      <span>·</span>
                      <span className="text-slate-300">
                        Peak QBER: <strong>{cond.peakQber.toFixed(2)}%</strong>
                      </span>
                      <span>·</span>
                      <span className="text-cyan-300">
                        Preset: {cond.sensitivityPreset}
                      </span>
                    </div>
                    <p className="text-slate-300">{cond.summaryNote}</p>
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {new Date(cond.clientTimestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            ))}
        </div>
      </div>
    </div>
  );
};
