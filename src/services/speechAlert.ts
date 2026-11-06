/**
 * Q-GRID SENTINEL - Web Speech API Audio Alert Service
 * Synthesizes real-time voice alerts whenever the QBER threshold (> 11%) is crossed
 * or an active cyber/quantum attack is detected by the AI Sentinel.
 */

class SpeechAlertService {
  private isEnabled: boolean = true;
  private wasAlertActive: boolean = false;
  private lastSpokenTimestamp: number = 0;
  private minCooldownMs: number = 7000;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled && this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Speaks a message using the W3C Web Speech API (window.speechSynthesis).
   * @param text The alert message to speak
   * @param force If true, bypasses cooldown and cancels any ongoing utterance immediately
   */
  public speak(text: string, force: boolean = false): boolean {
    if (!this.isEnabled || !this.isSupported()) {
      return false;
    }

    const now = Date.now();
    if (!force && now - this.lastSpokenTimestamp < this.minCooldownMs) {
      return false;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.92;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';

      // Select a clear technical voice if available
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel'))
          ) || voices.find((v) => v.lang.startsWith('en'));
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }

      this.lastSpokenTimestamp = now;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (err) {
      console.warn('[Q-GRID Speech API] Audio synthesis warning:', err);
      return false;
    }
  }

  /**
   * Monitors state transitions of QBER threshold (> 11%) and Attack flags.
   * Automatically triggers a voice alert when transitioning into an alert state,
   * or announces restoration when returning to nominal state.
   */
  public evaluateAndAnnounceQBER(
    qber: number,
    isCompromised: boolean,
    nodeName?: string,
    forceAnnounce: boolean = false
  ): void {
    if (isCompromised && (!this.wasAlertActive || forceAnnounce)) {
      this.wasAlertActive = true;
      const targetLabel = nodeName ? ` on ${nodeName}` : '';
      const msg = `Critical Alert. Quantum Bit Error Rate spiked to ${qber.toFixed(
        1
      )} percent${targetLabel}. Eve quantum interception detected by AI Sentinel.`;
      this.speak(msg, true);
    } else if (!isCompromised && this.wasAlertActive) {
      this.wasAlertActive = false;
      this.speak(
        `All clear. Post-quantum Kyber keys synchronized. Quantum Bit Error Rate nominal at ${qber.toFixed(1)} percent.`,
        true
      );
    }
  }

  /**
   * Triggers a voice alert for an AI Sentinel node threat report.
   */
  public announceAISentinelReport(
    nodeName: string,
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    summary: string,
    qber: number
  ): void {
    if (severity === 'CRITICAL' || severity === 'HIGH' || qber > 11.0) {
      this.speak(
        `AI Sentinel ${severity} threat alert for ${nodeName}. Quantum Bit Error Rate at ${qber.toFixed(
          1
        )} percent. ${summary}`,
        true
      );
    } else {
      this.speak(
        `AI Sentinel scan complete for ${nodeName}. Status ${severity}. ${summary}`,
        true
      );
    }
  }
}

export const speechAlertService = new SpeechAlertService();

if (typeof window !== 'undefined') {
  (window as any).speechAlertService = speechAlertService;
}
