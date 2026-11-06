/**
 * Web Audio API High-Frequency Digital Alarm Synthesizer
 * Plays a looping high-frequency digital cyber alarm ONLY while #alert-container
 * is in its expanded 'Alert' state, with real-time GainNode volume control.
 */
export class DigitalAlarmService {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private loopTimer: any = null;
  private isPlayingLoop: boolean = false;
  private volume: number = 0.35; // 0.0 to 1.0 default 35%
  private stepIndex: number = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioCtx) {
      try {
        this.audioCtx = new AudioCtx();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.audioCtx.destination);
      } catch {
        return null;
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        // Ignore if user gesture not yet registered
      });
    }

    return this.audioCtx;
  }

  private triggerDigitalBeep() {
    if (!this.isPlayingLoop || this.volume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const pulseGain = ctx.createGain();

      // High-frequency digital dual-tone SCADA cyber alarm (alternating 1880 Hz & 2640 Hz)
      const frequencies = [1880, 2640, 2120, 2880];
      const freq = frequencies[this.stepIndex % frequencies.length];
      this.stepIndex = (this.stepIndex + 1) % frequencies.length;

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.06, now + 0.11);

      pulseGain.gain.setValueAtTime(0.001, now);
      pulseGain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(pulseGain);
      pulseGain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignore transient Web Audio API scheduling errors
    }
  }

  public startLoop() {
    if (this.isPlayingLoop) return;
    this.isPlayingLoop = true;
    this.stepIndex = 0;
    this.ensureContext();
    this.triggerDigitalBeep();

    this.loopTimer = setInterval(() => {
      if (!this.isPlayingLoop) return;
      this.triggerDigitalBeep();
    }, 240);
  }

  public stopLoop() {
    this.isPlayingLoop = false;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public setVolume(normalizedVolume: number) {
    this.volume = Math.max(0, Math.min(1, normalizedVolume));
    if (this.masterGain && this.audioCtx) {
      try {
        this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
      } catch {
        this.masterGain.gain.value = this.volume;
      }
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isRunning(): boolean {
    return this.isPlayingLoop;
  }
}

export const digitalAlarmService = new DigitalAlarmService();
