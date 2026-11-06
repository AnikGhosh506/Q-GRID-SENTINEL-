/* ==========================================================================
   Q-GRID SENTINEL - Edge AI & Smart Grid Cryptographic Logic (logic.js)
   TensorFlow.js Edge AI QBER Anomaly Detector with Offline Threshold Fallback
   ========================================================================== */

import { triggerEveAlert } from './scene.js';

// Critical Quantum Bit Error Rate (QBER) threshold (%) for BB84 / Kyber-1024
export const QBER_CRITICAL_THRESHOLD = 11.0;

/**
 * Lightweight TensorFlow.js Edge AI function (with basic threshold fallback
 * if TF.js fails to load offline) that monitors incoming QBER & attack flags.
 *
 * If `attack` is true or `qber` spikes past 11%, unhides the HTML red alert
 * container (#alert-container) and calls triggerEveAlert(true) to sync the
 * 3D graphics with the physical ESP32 button press.
 *
 * @param {number} qber - Quantum Bit Error Rate percentage (e.g. 1.25 to 25.0)
 * @param {boolean} attack - Hardware/ESP32 physical attack trigger boolean
 * @returns {{ isCompromised: boolean, anomalyScore: number, engine: string }}
 */
export function evaluateQBERWithEdgeAI(qber, attack) {
  const numericQber = typeof qber === 'number' && !Number.isNaN(qber) ? qber : 0;
  const isHardwareAttack = Boolean(attack);

  let isCompromised = false;
  let anomalyScore = 0;
  let engine = 'THRESHOLD_FALLBACK';

  try {
    // Use TensorFlow.js tensor operations if TF.js is loaded in the browser
    const tf = typeof window !== 'undefined' ? window.tf : undefined;
    if (tf && typeof tf.tidy === 'function') {
      engine = 'TENSORFLOW_JS_EDGE';
      const result = tf.tidy(() => {
        // 1D feature tensor: [normalized QBER relative to 11% threshold, attack flag]
        const qberTensor = tf.scalar(numericQber);
        const thresholdTensor = tf.scalar(QBER_CRITICAL_THRESHOLD);
        const attackTensor = tf.scalar(isHardwareAttack ? 1.0 : 0.0);

        // Compute logistic-style neural activation around the 11% QBER boundary
        // z = (qber - 11.0) * 0.85 + attack * 10.0
        const diff = tf.sub(qberTensor, thresholdTensor);
        const weightedDiff = tf.mul(diff, tf.scalar(0.85));
        const attackBoost = tf.mul(attackTensor, tf.scalar(10.0));
        const logits = tf.add(weightedDiff, attackBoost);
        const probability = tf.sigmoid(logits);

        // Hard condition: attack === true OR qber > 11% OR neural probability > 0.5
        const qberExceeded = tf.greater(qberTensor, thresholdTensor);
        return {
          prob: probability.dataSync()[0],
          exceeded: Boolean(qberExceeded.dataSync()[0]),
        };
      });

      anomalyScore = Number(result.prob.toFixed(4));
      isCompromised = isHardwareAttack || result.exceeded || anomalyScore > 0.5;
    } else {
      // Offline / No-TF.js Fallback: Basic deterministic threshold logic
      anomalyScore = isHardwareAttack
        ? 0.99
        : Math.min(0.99, Math.max(0.01, numericQber / (QBER_CRITICAL_THRESHOLD * 1.5)));
      isCompromised = isHardwareAttack || numericQber > QBER_CRITICAL_THRESHOLD;
    }
  } catch (err) {
    // Resilient fallback if TF.js throws or WebGL backend is unavailable
    engine = 'THRESHOLD_FALLBACK';
    anomalyScore = isHardwareAttack ? 0.99 : Math.min(0.99, numericQber / 15.0);
    isCompromised = isHardwareAttack || numericQber > QBER_CRITICAL_THRESHOLD;
  }

  // 1. Update HTML QBER Readout (#qber-readout) in real-time if present in DOM
  if (typeof document !== 'undefined') {
    const qberReadoutEl = document.getElementById('qber-readout');
    if (qberReadoutEl) {
      qberReadoutEl.textContent = `${numericQber.toFixed(2)}%`;
    }

    // 2. Unhide or hide the HTML red alert container (#alert-container)
    const alertContainerEl = document.getElementById('alert-container');
    if (alertContainerEl) {
      if (isCompromised) {
        alertContainerEl.classList.remove('hidden');
        alertContainerEl.setAttribute('aria-hidden', 'false');
      } else {
        alertContainerEl.classList.add('hidden');
        alertContainerEl.setAttribute('aria-hidden', 'true');
      }
    }
  }

  // 3. Sync 3D Three.js Eve Node graphics with the physical ESP32 button press
  try {
    if (typeof triggerEveAlert === 'function') {
      triggerEveAlert(isCompromised);
    } else if (typeof window !== 'undefined' && typeof window.triggerEveAlert === 'function') {
      window.triggerEveAlert(isCompromised);
    }
  } catch (e) {
    console.warn('[Q-GRID Edge AI] Failed to sync 3D Eve alert state:', e);
  }

  // 4. Trigger Web Speech API Audio Alert when QBER > 11% or attack === true
  try {
    if (typeof window !== 'undefined' && window.speechAlertService) {
      window.speechAlertService.evaluateAndAnnounceQBER(numericQber, isCompromised);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && isCompromised && !window.__qgridSpeechActive) {
      window.__qgridSpeechActive = true;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `Critical Alert. Quantum Bit Error Rate spiked to ${numericQber.toFixed(1)} percent. Eve quantum interception detected.`
      );
      window.speechSynthesis.speak(utterance);
    } else if (typeof window !== 'undefined' && !isCompromised) {
      window.__qgridSpeechActive = false;
    }
  } catch {
    // Ignore speech synthesis errors
  }

  return {
    isCompromised,
    anomalyScore,
    engine,
    qber: numericQber,
    attack: isHardwareAttack,
  };
}

export const QGridLogic = {
  version: '2.5.0',
  QBER_CRITICAL_THRESHOLD,
  evaluateQBERWithEdgeAI,

  // Post-Quantum Kyber-1024 Simulated Key Generation
  generateKyberKeyPair: function () {
    const publicKey =
      'KYBER1024_PK_' +
      Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const secretKey =
      'KYBER1024_SK_' +
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return { publicKey, secretKey, timestamp: Date.now() };
  },

  // Calculate Total Harmonic Distortion (THD)
  calculateTHD: function (harmonics) {
    if (!harmonics || harmonics.length < 2) return 1.2;
    const h1 = harmonics[0];
    const sumSq = harmonics.slice(1).reduce((acc, h) => acc + h * h, 0);
    return parseFloat(((Math.sqrt(sumSq) / h1) * 100).toFixed(2));
  },

  // Detect SCADA Anomaly Severity
  detectAnomalySeverity: function (frequency, thd, attackType, qber = 1.15) {
    if (qber > QBER_CRITICAL_THRESHOLD) return 'CRITICAL';
    if (attackType && attackType !== 'NONE') {
      return attackType === 'STUXNET_HARMONIC_DRIFT' || attackType === 'QUANTUM_PROBE'
        ? 'CRITICAL'
        : 'HIGH';
    }
    if (frequency < 48.5 || frequency > 51.5 || thd > 5.0) return 'CRITICAL';
    if (frequency < 49.5 || frequency > 50.5 || thd > 3.0) return 'HIGH';
    return 'NOMINAL';
  },
};

if (typeof window !== 'undefined') {
  window.QGridLogic = QGridLogic;
  window.evaluateQBERWithEdgeAI = evaluateQBERWithEdgeAI;
}
