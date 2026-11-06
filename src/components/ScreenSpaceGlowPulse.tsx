import React, { useEffect, useRef } from 'react';

interface ScreenSpaceGlowPulseProps {
  /** Overall grid-wide average QBER percentage across substation nodes */
  averageQber: number;
  /** Global critical threshold (default 11.0%) */
  criticalThreshold: number;
  /** Whether an active attack override is engaged */
  isAttackActive?: boolean;
}

/**
 * Smoothly interpolates RGB color warmth from cool emerald-cyan (0.0)
 * -> warm amber-gold (0.5) -> hot thermal orange-crimson (1.0).
 */
function interpolateWarmthRGB(warmth: number): {
  primary: [number, number, number];
  secondary: [number, number, number];
} {
  const w = Math.min(1, Math.max(0, warmth));

  if (w < 0.45) {
    // Cool Emerald/Cyan (0, 255, 136) -> Warm Amber (245, 165, 20)
    const t = w / 0.45;
    return {
      primary: [
        Math.round(0 + t * 245),
        Math.round(255 - t * 90),
        Math.round(136 - t * 116),
      ],
      secondary: [
        Math.round(0 + t * 255),
        Math.round(240 - t * 120),
        Math.round(255 - t * 235),
      ],
    };
  } else {
    // Warm Amber (245, 165, 20) -> Hot Thermal Orange-Crimson (255, 28, 68)
    const t = (w - 0.45) / 0.55;
    return {
      primary: [
        Math.round(245 + t * 10),
        Math.round(165 - t * 137),
        Math.round(20 + t * 48),
      ],
      secondary: [
        255,
        Math.round(120 - t * 55),
        Math.round(20 + t * 15),
      ],
    };
  }
}

export const ScreenSpaceGlowPulse: React.FC<ScreenSpaceGlowPulseProps> = ({
  averageQber,
  criticalThreshold,
  isAttackActive = false,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const edgeFrameRef = useRef<HTMLDivElement | null>(null);

  // Store latest telemetry props in refs so the requestAnimationFrame loop
  // smoothly integrates phase without restarting on every state tick.
  const telemetryRef = useRef({
    averageQber,
    criticalThreshold,
    isAttackActive,
  });

  useEffect(() => {
    telemetryRef.current = {
      averageQber,
      criticalThreshold,
      isAttackActive,
    };
  }, [averageQber, criticalThreshold, isAttackActive]);

  useEffect(() => {
    let rafId: number;
    let lastTimeMs = performance.now();
    let phaseRad = 0;
    let smoothedWarmth = 0;
    let smoothedFreqHz = 0.32;
    let smoothedIntensity = 0.05;

    const animateFrame = (nowMs: number) => {
      const dtSec = Math.min(0.1, Math.max(0.001, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;

      const {
        averageQber: qber,
        criticalThreshold: threshold,
        isAttackActive: attack,
      } = telemetryRef.current;

      const safeThreshold = Math.max(1.0, threshold);
      const isExceedingThreshold = qber > safeThreshold || attack;
      const ratioToThreshold = qber / safeThreshold;

      // Target Color Warmth [0.0 = Cool Nominal .. 1.0 = Critical Thermal Red/Orange]
      const targetWarmth = isExceedingThreshold
        ? Math.min(1.0, 0.68 + Math.max(0, (qber - safeThreshold) / 10) * 0.32)
        : Math.min(0.55, Math.max(0, (ratioToThreshold - 0.15) * 0.6));

      // Target Pulse Frequency (Hz):
      // Nominal (< threshold): gentle 0.28Hz - 0.65Hz breathing
      // Exceeding threshold: intensifies from 1.25Hz up to 2.90Hz based on excess QBER
      const targetFreqHz = isExceedingThreshold
        ? Math.min(2.9, 1.25 + Math.max(0, qber - safeThreshold) * 0.16)
        : Math.min(0.68, 0.28 + Math.max(0, ratioToThreshold) * 0.35);

      // Target Screen-Space Vignette Alpha Intensity (kept subtle so UI legibility is untouched)
      const targetIntensity = isExceedingThreshold
        ? Math.min(0.24, 0.11 + Math.max(0, qber - safeThreshold) * 0.011)
        : Math.min(0.065, 0.02 + Math.max(0, ratioToThreshold) * 0.035);

      // Smooth frame-rate independent exponential interpolation
      const lerpFactor = Math.min(1, dtSec * 5.5);
      smoothedWarmth += (targetWarmth - smoothedWarmth) * lerpFactor;
      smoothedFreqHz += (targetFreqHz - smoothedFreqHz) * lerpFactor;
      smoothedIntensity += (targetIntensity - smoothedIntensity) * lerpFactor;

      // Advance continuous oscillator phase
      phaseRad = (phaseRad + dtSec * smoothedFreqHz * Math.PI * 2) % (Math.PI * 2);

      // Harmonic pulse waveform [0.0 .. 1.0] with slightly sharper systolic peak when critical
      const rawSine = 0.5 + 0.5 * Math.sin(phaseRad);
      const pulseWave = isExceedingThreshold
        ? Math.pow(rawSine, 1.35)
        : rawSine;

      const { primary, secondary } = interpolateWarmthRGB(smoothedWarmth);
      const [r1, g1, b1] = primary;
      const [r2, g2, b2] = secondary;

      const minAlpha = smoothedIntensity * 0.35;
      const maxAlpha = smoothedIntensity * (0.85 + pulseWave * 0.55);
      const currentEdgeAlpha = minAlpha + (maxAlpha - minAlpha) * pulseWave;
      const currentCornerAlpha = currentEdgeAlpha * 1.25;
      const insetSpreadPx = Math.round(
        28 + smoothedWarmth * 48 + pulseWave * (isExceedingThreshold ? 42 : 14)
      );
      const insetBlurPx = Math.round(
        60 + smoothedWarmth * 90 + pulseWave * (isExceedingThreshold ? 65 : 22)
      );

      if (overlayRef.current) {
        overlayRef.current.style.background = `radial-gradient(circle at 50% 50%, rgba(${r1}, ${g1}, ${b1}, 0) 56%, rgba(${r2}, ${g2}, ${b2}, ${(currentEdgeAlpha * 0.45).toFixed(4)}) 84%, rgba(${r1}, ${g1}, ${b1}, ${currentCornerAlpha.toFixed(4)}) 100%)`;
        overlayRef.current.dataset.pulseFreqHz = smoothedFreqHz.toFixed(2);
        overlayRef.current.dataset.warmth = smoothedWarmth.toFixed(2);
        overlayRef.current.dataset.critical = String(isExceedingThreshold);
      }

      if (edgeFrameRef.current) {
        edgeFrameRef.current.style.boxShadow = `inset 0 0 ${insetBlurPx}px ${insetSpreadPx}px rgba(${r1}, ${g1}, ${b1}, ${currentEdgeAlpha.toFixed(4)}), inset 0 0 ${Math.round(insetBlurPx * 0.35)}px 2px rgba(${r2}, ${g2}, ${b2}, ${(currentEdgeAlpha * 0.75).toFixed(4)})`;
        edgeFrameRef.current.style.borderColor = `rgba(${r1}, ${g1}, ${b1}, ${Math.min(0.55, currentEdgeAlpha * 1.8).toFixed(3)})`;
      }

      rafId = requestAnimationFrame(animateFrame);
    };

    rafId = requestAnimationFrame(animateFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      id="screen-space-glow-pulse"
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden transition-none"
    >
      <div
        ref={edgeFrameRef}
        className="pointer-events-none absolute inset-0 border border-transparent"
      />
    </div>
  );
};
