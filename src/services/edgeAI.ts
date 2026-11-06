import { triggerEveAlert } from '../scene';
import { speechAlertService } from './speechAlert';

export const SENTINEL_SETTINGS_STORAGE_KEY = 'qgrid_sentinel_settings_v1';

export type SensitivityPreset = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'CUSTOM';

export interface SentinelSettings {
  qberCriticalThreshold: number; // Global QBER threshold (%) e.g. 11.0
  anomalySensitivity: number;    // Neural activation gain multiplier e.g. 0.85
  anomalyTriggerCutoff: number;  // Anomaly score threshold (0.25 .. 0.85) e.g. 0.50
  sensitivityPreset: SensitivityPreset;
}

export const DEFAULT_SENTINEL_SETTINGS: SentinelSettings = {
  qberCriticalThreshold: 11.0,
  anomalySensitivity: 0.85,
  anomalyTriggerCutoff: 0.50,
  sensitivityPreset: 'BALANCED',
};

function loadInitialSettings(): SentinelSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_SENTINEL_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(SENTINEL_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const qberCriticalThreshold = Number(parsed.qberCriticalThreshold);
      const anomalySensitivity = Number(parsed.anomalySensitivity);
      const anomalyTriggerCutoff = Number(parsed.anomalyTriggerCutoff);
      return {
        qberCriticalThreshold:
          !Number.isNaN(qberCriticalThreshold) && qberCriticalThreshold >= 2 && qberCriticalThreshold <= 25
            ? qberCriticalThreshold
            : DEFAULT_SENTINEL_SETTINGS.qberCriticalThreshold,
        anomalySensitivity:
          !Number.isNaN(anomalySensitivity) && anomalySensitivity >= 0.2 && anomalySensitivity <= 3.0
            ? anomalySensitivity
            : DEFAULT_SENTINEL_SETTINGS.anomalySensitivity,
        anomalyTriggerCutoff:
          !Number.isNaN(anomalyTriggerCutoff) && anomalyTriggerCutoff >= 0.2 && anomalyTriggerCutoff <= 0.9
            ? anomalyTriggerCutoff
            : DEFAULT_SENTINEL_SETTINGS.anomalyTriggerCutoff,
        sensitivityPreset: parsed.sensitivityPreset || 'BALANCED',
      };
    }
  } catch {
    // Fallback to defaults if localStorage is unavailable or corrupted
  }
  return { ...DEFAULT_SENTINEL_SETTINGS };
}

let currentSentinelSettings: SentinelSettings = loadInitialSettings();
const settingsListeners: ((settings: SentinelSettings) => void)[] = [];

// Live exported binding for QBER_CRITICAL_THRESHOLD updated whenever settings change
export let QBER_CRITICAL_THRESHOLD: number = currentSentinelSettings.qberCriticalThreshold;

export function getSentinelSettings(): SentinelSettings {
  return { ...currentSentinelSettings };
}

export function updateSentinelSettings(partial: Partial<SentinelSettings>): SentinelSettings {
  currentSentinelSettings = {
    ...currentSentinelSettings,
    ...partial,
  };
  QBER_CRITICAL_THRESHOLD = currentSentinelSettings.qberCriticalThreshold;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(
        SENTINEL_SETTINGS_STORAGE_KEY,
        JSON.stringify(currentSentinelSettings)
      );
      window.localStorage.setItem(
        'QBER_CRITICAL_THRESHOLD',
        String(currentSentinelSettings.qberCriticalThreshold)
      );
      window.localStorage.setItem(
        'AI_SENTINEL_ANOMALY_SENSITIVITY',
        String(currentSentinelSettings.anomalySensitivity)
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  const snapshot = getSentinelSettings();
  settingsListeners.forEach((cb) => cb(snapshot));
  return snapshot;
}

export function resetSentinelSettings(): SentinelSettings {
  return updateSentinelSettings({ ...DEFAULT_SENTINEL_SETTINGS });
}

export function subscribeSentinelSettings(
  callback: (settings: SentinelSettings) => void
): () => void {
  settingsListeners.push(callback);
  callback(getSentinelSettings());
  return () => {
    const idx = settingsListeners.indexOf(callback);
    if (idx !== -1) settingsListeners.splice(idx, 1);
  };
}

export interface EdgeAIResult {
  isCompromised: boolean;
  anomalyScore: number;
  engine: 'TENSORFLOW_JS_EDGE' | 'THRESHOLD_FALLBACK';
  qber: number;
  attack: boolean;
}

declare global {
  interface Window {
    tf?: {
      tidy: <T>(fn: () => T) => T;
      scalar: (value: number) => any;
      sub: (a: any, b: any) => any;
      mul: (a: any, b: any) => any;
      add: (a: any, b: any) => any;
      sigmoid: (x: any) => any;
      greater: (a: any, b: any) => any;
    };
    triggerEveAlert?: (isAttacking: boolean) => void;
    evaluateQBERWithEdgeAI?: (qber: number, attack: boolean) => EdgeAIResult;
  }
}

/**
 * Lightweight TensorFlow.js Edge AI function (with basic threshold fallback
 * if TF.js fails to load offline) that monitors the QBER using the user-configured
 * QBER_CRITICAL_THRESHOLD and anomaly sensitivity levels.
 */
export function evaluateQBERWithEdgeAI(qber: number, attack: boolean): EdgeAIResult {
  const numericQber = typeof qber === 'number' && !Number.isNaN(qber) ? qber : 0;
  const isHardwareAttack = Boolean(attack);
  const activeThreshold = currentSentinelSettings.qberCriticalThreshold;
  const sensitivityGain = currentSentinelSettings.anomalySensitivity;
  const scoreCutoff = currentSentinelSettings.anomalyTriggerCutoff;

  let isCompromised = false;
  let anomalyScore = 0;
  let engine: 'TENSORFLOW_JS_EDGE' | 'THRESHOLD_FALLBACK' = 'THRESHOLD_FALLBACK';

  try {
    const tf = typeof window !== 'undefined' ? window.tf : undefined;
    if (tf && typeof tf.tidy === 'function') {
      engine = 'TENSORFLOW_JS_EDGE';
      const result = tf.tidy(() => {
        const qberTensor = tf.scalar(numericQber);
        const thresholdTensor = tf.scalar(activeThreshold);
        const attackTensor = tf.scalar(isHardwareAttack ? 1.0 : 0.0);

        const diff = tf.sub(qberTensor, thresholdTensor);
        const weightedDiff = tf.mul(diff, tf.scalar(sensitivityGain));
        const attackBoost = tf.mul(attackTensor, tf.scalar(10.0));
        const logits = tf.add(weightedDiff, attackBoost);
        const probability = tf.sigmoid(logits);
        const qberExceeded = tf.greater(qberTensor, thresholdTensor);

        return {
          prob: Number(probability.dataSync()[0]),
          exceeded: Boolean(qberExceeded.dataSync()[0]),
        };
      });

      anomalyScore = Number(result.prob.toFixed(4));
      isCompromised = isHardwareAttack || result.exceeded || anomalyScore >= scoreCutoff;
    } else {
      // Offline / No-TF.js Fallback: Basic threshold logic scaled by sensitivityGain
      const scaledRatio =
        (numericQber / Math.max(1, activeThreshold * 1.5)) * (sensitivityGain / 0.85);
      anomalyScore = isHardwareAttack
        ? 0.99
        : Number(Math.min(0.99, Math.max(0.01, scaledRatio)).toFixed(4));
      isCompromised =
        isHardwareAttack || numericQber > activeThreshold || anomalyScore >= scoreCutoff;
    }
  } catch {
    engine = 'THRESHOLD_FALLBACK';
    anomalyScore = isHardwareAttack
      ? 0.99
      : Number(Math.min(0.99, (numericQber / Math.max(1, activeThreshold * 1.35)) * (sensitivityGain / 0.85)).toFixed(4));
    isCompromised =
      isHardwareAttack || numericQber > activeThreshold || anomalyScore >= scoreCutoff;
  }

  // 1. Update HTML QBER Readout (#qber-readout) in real-time
  if (typeof document !== 'undefined') {
    const qberReadoutEl = document.getElementById('qber-readout');
    const formatted = `${numericQber.toFixed(2)}%`;
    if (qberReadoutEl && qberReadoutEl.textContent !== formatted) {
      if (qberReadoutEl.firstChild && qberReadoutEl.firstChild.nodeType === Node.TEXT_NODE) {
        qberReadoutEl.firstChild.nodeValue = formatted;
      } else {
        qberReadoutEl.textContent = formatted;
      }
    }

    // 2. Unhide or hide the HTML red alert container (#alert-container)
    const alertContainerEl = document.getElementById('alert-container');
    if (alertContainerEl) {
      if (isCompromised) {
        alertContainerEl.classList.remove('hidden');
        alertContainerEl.classList.add('block');
        alertContainerEl.setAttribute('aria-hidden', 'false');
      } else {
        alertContainerEl.classList.remove('block');
        alertContainerEl.classList.add('hidden');
        alertContainerEl.setAttribute('aria-hidden', 'true');
      }
    }
  }

  // 3. Call Three.js triggerEveAlert(isCompromised) to sync 3D graphics with ESP32 button press
  try {
    triggerEveAlert(isCompromised);
    if (typeof window !== 'undefined' && typeof window.triggerEveAlert === 'function') {
      window.triggerEveAlert(isCompromised);
    }
  } catch {
    // Ignore if 3D scene not yet mounted
  }

  // 4. Trigger Web Speech API Audio Alert on QBER threshold crossing or Attack detection
  try {
    speechAlertService.evaluateAndAnnounceQBER(numericQber, isCompromised);
  } catch {
    // Ignore if speech synthesis blocked by browser autoplay policy
  }

  return {
    isCompromised,
    anomalyScore,
    engine,
    qber: numericQber,
    attack: isHardwareAttack,
  };
}

if (typeof window !== 'undefined') {
  window.evaluateQBERWithEdgeAI = evaluateQBERWithEdgeAI;
}

