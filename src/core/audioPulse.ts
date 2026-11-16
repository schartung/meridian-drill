export class AudioPulseEngine {
  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    if (!this.ctx) {
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public triggerBeat(beatIndex: number, isSetArrival: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const isDownbeat = beatIndex % 4 === 0;

      osc.type = isSetArrival ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(
        isSetArrival ? 1480 : isDownbeat ? 1120 : 780,
        now
      );

      const peak = isSetArrival ? 0.24 : isDownbeat ? 0.18 : 0.09;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (isSetArrival ? 0.11 : 0.055));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // Audio playback can be blocked by browser policy prior to user interaction.
    }
  }
}
