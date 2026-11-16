import { getSetStartGlobalCount, getTotalShowCounts } from './interpolation.ts';
import { DrillShow, ShowAudioMeta } from './types.ts';

export interface SetTimeSegment {
  transitionIndex: number;
  fromSetIndex: number;
  toSetIndex: number;
  startCount: number;
  endCount: number;
  counts: number;
  tempoBpm: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export function buildShowTimeMap(show: DrillShow): SetTimeSegment[] {
  const segments: SetTimeSegment[] = [];
  let currentSec = Math.max(0, show.audioMeta?.beatOffsetSeconds ?? 0);
  let currentCount = 0;

  for (let i = 0; i < show.sets.length - 1; i++) {
    const fromSet = show.sets[i]!;
    const toSet = show.sets[i + 1]!;
    const counts = Math.max(0, toSet.counts);
    const tempoBpm =
      toSet.tempoBpm > 0
        ? toSet.tempoBpm
        : fromSet.tempoBpm > 0
          ? fromSet.tempoBpm
          : 120;
    const durationSeconds = (counts * 60) / tempoBpm;

    segments.push({
      transitionIndex: i,
      fromSetIndex: i,
      toSetIndex: i + 1,
      startCount: currentCount,
      endCount: currentCount + counts,
      counts,
      tempoBpm,
      startSeconds: currentSec,
      endSeconds: currentSec + durationSeconds,
      durationSeconds
    });

    currentCount += counts;
    currentSec += durationSeconds;
  }

  return segments;
}

export function getTotalShowDurationSeconds(show: DrillShow): number {
  const segments = buildShowTimeMap(show);
  if (segments.length === 0) {
    return Math.max(0, show.audioMeta?.beatOffsetSeconds ?? 0);
  }
  return segments[segments.length - 1]!.endSeconds;
}

export function globalCountToSeconds(show: DrillShow, globalCount: number): number {
  const segments = buildShowTimeMap(show);
  const beatOffset = Math.max(0, show.audioMeta?.beatOffsetSeconds ?? 0);
  if (segments.length === 0 || globalCount <= 0) {
    return beatOffset;
  }

  const totalCounts = getTotalShowCounts(show);
  const clampedCount = Math.min(totalCounts, Math.max(0, globalCount));

  for (const seg of segments) {
    if (clampedCount <= seg.endCount + 1e-12 && seg.counts > 0) {
      return seg.startSeconds + ((clampedCount - seg.startCount) * 60) / seg.tempoBpm;
    }
  }

  return segments[segments.length - 1]!.endSeconds;
}

export function secondsToGlobalCount(show: DrillShow, seconds: number): number {
  const segments = buildShowTimeMap(show);
  if (segments.length === 0) {
    return 0;
  }
  const firstStart = segments[0]!.startSeconds;
  if (seconds <= firstStart) {
    return 0;
  }
  const lastSeg = segments[segments.length - 1]!;
  if (seconds >= lastSeg.endSeconds) {
    return lastSeg.endCount;
  }

  for (const seg of segments) {
    if (seg.durationSeconds > 0 && seconds <= seg.endSeconds + 1e-12) {
      return seg.startCount + ((seconds - seg.startSeconds) * seg.tempoBpm) / 60;
    }
  }

  return lastSeg.endCount;
}

export function formatTimeMmSs(seconds: number): string {
  const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(clamped / 60);
  const secs = clamped - mins * 60;
  const minStr = String(mins).padStart(2, '0');
  const secStr = secs.toFixed(1).padStart(4, '0');
  return `${minStr}:${secStr}`;
}

export function computeWaveformPeaks(
  samples: Float32Array,
  bucketCount: number
): Float32Array {
  const count = Math.max(1, Math.floor(bucketCount));
  const peaks = new Float32Array(count);
  if (samples.length === 0) {
    return peaks;
  }

  const samplesPerBucket = samples.length / count;
  let globalMax = 0;

  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * samplesPerBucket);
    const end = Math.min(
      samples.length,
      Math.max(start + 1, Math.floor((b + 1) * samplesPerBucket))
    );
    let bucketPeak = 0;
    for (let i = start; i < end; i++) {
      const mag = Math.abs(samples[i]!);
      if (mag > bucketPeak) {
        bucketPeak = mag;
      }
    }
    peaks[b] = bucketPeak;
    if (bucketPeak > globalMax) {
      globalMax = bucketPeak;
    }
  }

  if (globalMax > 1e-6) {
    for (let b = 0; b < count; b++) {
      peaks[b] = peaks[b]! / globalMax;
    }
  }

  return peaks;
}

const BRASS_CHORDS_HZ: number[][] = [
  [146.83, 220.0, 293.66, 349.23], // D minor impact
  [116.54, 174.61, 233.08, 293.66], // Bb major lift
  [130.81, 196.0, 261.63, 329.63], // C open fifths
  [98.0, 146.83, 233.08, 293.66], // G minor ballad sustain
  [130.81, 196.0, 246.94, 329.63], // Cmaj7 hover
  [146.83, 220.0, 293.66, 369.99], // D major arrival
  [146.83, 220.0, 293.66, 440.0] // Closing octave ring
];

export function synthesizeShowEnsemblePcm(
  show: DrillShow,
  sampleRate = 22050
): {
  samples: Float32Array;
  sampleRate: number;
  drillDurationSeconds: number;
  totalDurationSeconds: number;
} {
  const drillDurationSeconds = Math.max(0.5, getTotalShowDurationSeconds(show));
  const releaseTailSeconds = 1.2;
  const totalDurationSeconds = drillDurationSeconds + releaseTailSeconds;
  const length = Math.max(1, Math.ceil(totalDurationSeconds * sampleRate));
  const samples = new Float32Array(length);

  // Render warm brass pads aligned to each set arrival
  for (let sIdx = 0; sIdx < show.sets.length; sIdx++) {
    const startCount = getSetStartGlobalCount(show, sIdx);
    const startSec = globalCountToSeconds(show, startCount);
    const nextStartSec =
      sIdx < show.sets.length - 1
        ? globalCountToSeconds(show, getSetStartGlobalCount(show, sIdx + 1))
        : startSec + releaseTailSeconds;
    const sustainSec = Math.max(0.4, nextStartSec - startSec);
    const chord = BRASS_CHORDS_HZ[sIdx % BRASS_CHORDS_HZ.length]!;
    const iStart = Math.max(0, Math.floor(startSec * sampleRate));
    const iEnd = Math.min(length, Math.floor((startSec + sustainSec) * sampleRate));

    for (let i = iStart; i < iEnd; i++) {
      const localSec = (i - iStart) / sampleRate;
      const attack = Math.min(1, localSec / 0.06);
      const decay = Math.min(1, Math.max(0, (sustainSec - localSec) / 0.14));
      const env = attack * decay * 0.14;
      let mix = 0;
      for (const f of chord) {
        const fundamental = Math.sin(2 * Math.PI * f * localSec);
        const harmonic2 = 0.35 * Math.sin(2 * Math.PI * 2 * f * localSec);
        const harmonic3 = 0.18 * Math.sin(2 * Math.PI * 3 * f * localSec);
        mix += fundamental + harmonic2 + harmonic3;
      }
      samples[i] = samples[i]! + (mix / chord.length) * env;
    }
  }

  // Render crisp battery snare and woodblock transients on every variable-tempo beat
  const totalCounts = Math.floor(getTotalShowCounts(show));
  const setArrivalBeats = new Set<number>();
  for (let sIdx = 0; sIdx < show.sets.length; sIdx++) {
    setArrivalBeats.add(Math.round(getSetStartGlobalCount(show, sIdx)));
  }

  for (let beat = 0; beat <= totalCounts; beat++) {
    const sec = globalCountToSeconds(show, beat);
    const isArrival = setArrivalBeats.has(beat);
    const isDownbeat = beat % 4 === 0;
    const amp = isArrival ? 0.52 : isDownbeat ? 0.34 : 0.18;
    const freq = isArrival ? 210 : isDownbeat ? 175 : 880;
    const hitLen = Math.floor((isArrival ? 0.14 : 0.06) * sampleRate);
    const iStart = Math.max(0, Math.floor(sec * sampleRate));
    const iEnd = Math.min(length, iStart + hitLen);

    for (let i = iStart; i < iEnd; i++) {
      const t = (i - iStart) / sampleRate;
      const env = Math.exp(-t * (isArrival ? 28 : 48)) * amp;
      const body = Math.sin(2 * Math.PI * freq * t);
      // Deterministic pseudo-noise snare buzz from phase hash
      const buzz = Math.sin(137.5 * (i + 1)) * (isArrival || isDownbeat ? 0.45 : 0.15);
      samples[i] = samples[i]! + (body + buzz) * env;
    }
  }

  // Normalize peak amplitude cleanly to 0.85
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
  }
  if (peak > 1e-6) {
    const scale = 0.85 / peak;
    for (let i = 0; i < samples.length; i++) {
      samples[i] = samples[i]! * scale;
    }
  }

  return {
    samples,
    sampleRate,
    drillDurationSeconds,
    totalDurationSeconds
  };
}

export class AudioTrackController {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private peaks: Float32Array | null = null;
  private trackLabel: string | null = null;
  private sourceKind: ShowAudioMeta['sourceKind'] | null = null;
  private playing = false;
  private startOffsetSec = 0;
  private ctxStartSec = 0;
  private playbackRate = 1;

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

  public hasTrack(): boolean {
    return this.buffer !== null;
  }

  public getPeaks(): Float32Array | null {
    return this.peaks;
  }

  public getTrackLabel(): string | null {
    return this.trackLabel;
  }

  public getSourceKind(): ShowAudioMeta['sourceKind'] | null {
    return this.sourceKind;
  }

  public getDurationSeconds(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getCurrentSeconds(): number {
    if (!this.playing || !this.ctx) {
      return this.startOffsetSec;
    }
    return this.startOffsetSec + Math.max(0, this.ctx.currentTime - this.ctxStartSec) * this.playbackRate;
  }

  public loadFromPcm(
    samples: Float32Array,
    sampleRate: number,
    label: string,
    sourceKind: ShowAudioMeta['sourceKind'],
    drillDurationSeconds: number,
    bucketCount = 240
  ): { peaks: Float32Array; durationSeconds: number } {
    this.stop();
    const ctx = this.ensureContext();
    const drillSampleCount = Math.min(
      samples.length,
      Math.max(1, Math.round(drillDurationSeconds * sampleRate))
    );
    const peaks = computeWaveformPeaks(samples.subarray(0, drillSampleCount), bucketCount);
    this.peaks = peaks;
    this.trackLabel = label;
    this.sourceKind = sourceKind;

    if (ctx) {
      const audioBuf = ctx.createBuffer(1, samples.length, sampleRate);
      audioBuf.copyToChannel(new Float32Array(samples), 0);
      this.buffer = audioBuf;
      return { peaks, durationSeconds: audioBuf.duration };
    }

    return { peaks, durationSeconds: samples.length / sampleRate };
  }

  public async loadFromEncodedBytes(
    bytes: ArrayBuffer,
    label: string,
    sourceKind: ShowAudioMeta['sourceKind'],
    drillDurationSeconds: number,
    bucketCount = 240
  ): Promise<{ peaks: Float32Array; durationSeconds: number }> {
    this.stop();
    const ctx = this.ensureContext();
    if (!ctx) {
      throw new Error('Web Audio API is unavailable in this runtime.');
    }
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < channels; c++) {
      const chData = decoded.getChannelData(c);
      for (let i = 0; i < decoded.length; i++) {
        mono[i] = mono[i]! + chData[i]! / channels;
      }
    }

    const peakSampleWindow =
      drillDurationSeconds > 0
        ? Math.min(mono.length, Math.max(1, Math.round(drillDurationSeconds * decoded.sampleRate)))
        : mono.length;
    const peaks = computeWaveformPeaks(mono.subarray(0, peakSampleWindow), bucketCount);

    this.buffer = decoded;
    this.peaks = peaks;
    this.trackLabel = label;
    this.sourceKind = sourceKind;

    return { peaks, durationSeconds: decoded.duration };
  }

  public play(startSeconds: number, playbackRate: number, onEnded?: () => void): void {
    this.stop();
    const ctx = this.ensureContext();
    if (!ctx || !this.buffer) {
      return;
    }

    const clampedOffset = Math.max(0, Math.min(this.buffer.duration - 0.02, startSeconds));
    const node = ctx.createBufferSource();
    node.buffer = this.buffer;
    node.playbackRate.value = Math.max(0.25, playbackRate);
    node.connect(ctx.destination);
    node.onended = () => {
      if (this.sourceNode === node) {
        this.playing = false;
        this.sourceNode = null;
        if (onEnded) onEnded();
      }
    };

    this.sourceNode = node;
    this.startOffsetSec = clampedOffset;
    this.playbackRate = Math.max(0.25, playbackRate);
    this.ctxStartSec = ctx.currentTime;
    this.playing = true;
    node.start(0, clampedOffset);
  }

  public stop(): void {
    if (this.playing && this.ctx) {
      this.startOffsetSec = this.getCurrentSeconds();
    }
    this.playing = false;
    if (this.sourceNode) {
      const node = this.sourceNode;
      this.sourceNode = null;
      node.onended = null;
      try {
        node.stop();
      } catch {
        // Ignore nodes already stopped.
      }
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect cleanup errors.
      }
    }
  }

  public clear(): void {
    this.stop();
    this.buffer = null;
    this.peaks = null;
    this.trackLabel = null;
    this.sourceKind = null;
    this.startOffsetSec = 0;
  }
}
