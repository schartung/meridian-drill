import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildShowTimeMap,
  formatTimeMmSs,
  getTotalShowDurationSeconds,
  globalCountToSeconds,
  secondsToGlobalCount
} from '../core/audioSync.ts';
import { getPerformerPhraseBlocks, POSTURE_SPECS } from '../core/choreography.ts';
import { getSetStartGlobalCount, getTotalShowCounts } from '../core/interpolation.ts';
import { DrillShow } from '../core/types.ts';

interface TimelineBarProps {
  show: DrillShow;
  activeSetIndex: number;
  countOffset: number;
  isPlaying: boolean;
  playbackSpeed: number;
  audioEnabled: boolean;
  waveformPeaks: Float32Array | null;
  audioTrackLabel: string | null;
  audioTrackMuted: boolean;
  focusedPerformerId: string;
  onTogglePlay: () => void;
  onStepCount: (delta: number) => void;
  onSelectSet: (setIndex: number) => void;
  onJumpToCountOffset: (countOffset: number) => void;
  onScrubGlobalCount: (globalCount: number) => void;
  onChangeSpeed: (speed: number) => void;
  onToggleAudio: () => void;
  onSynthDemoAudio: () => void;
  onToggleMuteTrack: () => void;
  onOpenImportModal: () => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  show,
  activeSetIndex,
  countOffset,
  isPlaying,
  playbackSpeed,
  audioEnabled,
  waveformPeaks,
  audioTrackLabel,
  audioTrackMuted,
  focusedPerformerId,
  onTogglePlay,
  onStepCount,
  onSelectSet,
  onJumpToCountOffset,
  onScrubGlobalCount,
  onChangeSpeed,
  onToggleAudio,
  onSynthDemoAudio,
  onToggleMuteTrack,
  onOpenImportModal
}) => {
  const totalCounts = Math.max(1, getTotalShowCounts(show));
  const currentGlobal = Math.min(
    totalCounts,
    getSetStartGlobalCount(show, activeSetIndex) + countOffset
  );
  const currentSet = show.sets[activeSetIndex]!;
  const nextSet = show.sets[activeSetIndex + 1];
  const transitionCounts = nextSet ? nextSet.counts : 0;
  const focusedPerf =
    show.performers.find((p) => p.id === focusedPerformerId) ?? show.performers[0]!;
  const phraseBlocks = getPerformerPhraseBlocks(
    focusedPerf,
    currentSet,
    transitionCounts
  );

  const timeSegments = useMemo(() => buildShowTimeMap(show), [show]);
  const totalDurationSec = useMemo(
    () => Math.max(0.5, getTotalShowDurationSeconds(show)),
    [show]
  );
  const currentSeconds = useMemo(
    () => globalCountToSeconds(show, currentGlobal),
    [show, currentGlobal]
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 420,
    h: 36
  });
  const isScrubbingRef = useRef<boolean>(false);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(160, Math.round(entry.contentRect.width));
        const h = Math.max(30, Math.round(entry.contentRect.height));
        setCanvasSize({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { w, h } = canvasSize;
    const midY = h * 0.5;
    const playFrac = Math.min(1, Math.max(0, currentSeconds / totalDurationSec));
    const playX = playFrac * w;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, w, h);

    // Highlight active transition window under the waveform
    const activeSeg = timeSegments[activeSetIndex];
    if (activeSeg) {
      const segX0 = (activeSeg.startSeconds / totalDurationSec) * w;
      const segX1 = (activeSeg.endSeconds / totalDurationSec) * w;
      ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
      ctx.fillRect(segX0, 0, Math.max(2, segX1 - segX0), h);
    }

    // Center axis baseline
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Waveform amplitude bars (or beat-grid ticks when no audio track is armed yet)
    if (waveformPeaks && waveformPeaks.length > 0) {
      const n = waveformPeaks.length;
      const barStep = w / n;
      const barWidth = Math.max(1.2, barStep - 0.6);
      for (let i = 0; i < n; i++) {
        const x = i * barStep;
        const amp = Math.max(0.06, waveformPeaks[i]!) * (h * 0.42);
        ctx.fillStyle =
          x <= playX
            ? 'rgba(34, 211, 238, 0.88)'
            : 'rgba(99, 102, 241, 0.45)';
        ctx.fillRect(x, midY - amp, barWidth, amp * 2);
      }
    } else {
      // Render count-proportional variable-tempo pulse bars along the seconds timeline
      for (const seg of timeSegments) {
        for (let c = 0; c < seg.counts; c += 2) {
          const sec = seg.startSeconds + (c * 60) / seg.tempoBpm;
          const x = (sec / totalDurationSec) * w;
          const isMeasure = c % 4 === 0;
          const tickH = isMeasure ? h * 0.24 : h * 0.13;
          ctx.fillStyle =
            x <= playX ? 'rgba(34, 211, 238, 0.7)' : 'rgba(108, 127, 153, 0.4)';
          ctx.fillRect(x, midY - tickH, 1.5, tickH * 2);
        }
      }
    }

    // Set arrival markers synced linearly in variable-tempo seconds
    for (let sIdx = 0; sIdx < show.sets.length; sIdx++) {
      const sec = globalCountToSeconds(show, getSetStartGlobalCount(show, sIdx));
      const x = (sec / totalDurationSec) * w;
      ctx.strokeStyle =
        sIdx === activeSetIndex
          ? 'rgba(254, 240, 138, 0.8)'
          : 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = sIdx === activeSetIndex ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      if (sIdx > 0 && x > 14 && x < w - 16) {
        ctx.font = '600 9px "SF Mono", monospace';
        ctx.fillStyle =
          sIdx === activeSetIndex ? '#fef08a' : 'rgba(159, 176, 199, 0.75)';
        ctx.textAlign = 'left';
        ctx.fillText(show.sets[sIdx]!.rehearsalMark || `S${sIdx + 1}`, x + 3, 10);
      }
    }

    // Playhead indicator
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();
  }, [
    canvasSize,
    currentSeconds,
    totalDurationSec,
    waveformPeaks,
    timeSegments,
    show,
    activeSetIndex
  ]);

  const scrubFromClientX = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const frac = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))
      );
      const targetSec = frac * totalDurationSec;
      const nextGlobal = secondsToGlobalCount(show, targetSec);
      onScrubGlobalCount(Math.round(nextGlobal * 4) / 4);
    },
    [show, totalDurationSec, onScrubGlobalCount]
  );

  return (
    <footer className="timeline-bar">
      <div className="transport-row">
        <div className="transport-btns">
          <button
            type="button"
            className="action-btn"
            onClick={() => onSelectSet(Math.max(0, activeSetIndex - 1))}
            title="Previous Set ([)"
          >
            &laquo; Set
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => onStepCount(-1)}
          >
            -1 Ct
          </button>
          <button
            type="button"
            className="action-btn primary"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => onStepCount(1)}
          >
            +1 Ct
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => onSelectSet(Math.min(show.sets.length - 1, activeSetIndex + 1))}
            title="Next Set (])"
          >
            Set &raquo;
          </button>
        </div>

        <div className="scrubber-wrap">
          <canvas
            ref={canvasRef}
            className="waveform-canvas"
            role="slider"
            tabIndex={0}
            aria-label="Variable-Tempo Audio Waveform Scrubber"
            aria-valuemin={0}
            aria-valuemax={totalCounts}
            aria-valuenow={Math.round(currentGlobal * 10) / 10}
            title={
              audioTrackLabel
                ? `Synced Track: ${audioTrackLabel} — click or drag to scrub`
                : 'Variable-tempo timeline — click Synth Audio or Import Audio to display waveform'
            }
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              isScrubbingRef.current = true;
              scrubFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!isScrubbingRef.current) return;
              scrubFromClientX(e.clientX);
            }}
            onPointerUp={() => {
              isScrubbingRef.current = false;
            }}
            onPointerCancel={() => {
              isScrubbingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onStepCount(-1);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onStepCount(1);
              }
            }}
          />
          <div className="count-readout">
            {formatTimeMmSs(currentSeconds)} / {formatTimeMmSs(totalDurationSec)} · Set{' '}
            {activeSetIndex + 1}/{show.sets.length} · ct {countOffset.toFixed(1)}/
            {transitionCounts} · {nextSet ? nextSet.tempoBpm : currentSet.tempoBpm} BPM
          </div>
        </div>

        <div className="transport-btns">
          {!audioTrackLabel ? (
            <>
              <button
                type="button"
                className="seg-btn"
                style={{
                  border: '1px solid var(--border-strong)',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#e0e7ff'
                }}
                onClick={onSynthDemoAudio}
                title="Synthesize a multi-tempo Brass + Battery audio stem synced to every set BPM"
              >
                Synth Audio
              </button>
              <button
                type="button"
                className="seg-btn"
                style={{ border: '1px solid var(--border-subtle)' }}
                onClick={onOpenImportModal}
                title="Load MP3, WAV, .3dz, or MusicXML"
              >
                Audio File
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="seg-btn"
                style={{
                  border: '1px solid var(--border-subtle)',
                  background: !audioTrackMuted ? 'rgba(16,185,129,0.18)' : 'transparent',
                  color: !audioTrackMuted ? '#34d399' : 'var(--text-secondary)'
                }}
                onClick={onToggleMuteTrack}
                title={`Active track: ${audioTrackLabel}`}
              >
                Track: {audioTrackMuted ? 'MUTE' : 'ON'}
              </button>
              <button
                type="button"
                className="seg-btn"
                style={{ border: '1px solid var(--border-subtle)' }}
                onClick={onSynthDemoAudio}
                title="Re-synthesize ensemble stem to match updated set tempos"
              >
                Re-Synth
              </button>
            </>
          )}
          <button
            type="button"
            className="seg-btn"
            style={{
              border: '1px solid var(--border-subtle)',
              background: audioEnabled ? 'rgba(34,211,238,0.18)' : 'transparent',
              color: audioEnabled ? '#22d3ee' : 'var(--text-secondary)'
            }}
            onClick={onToggleAudio}
          >
            Click: {audioEnabled ? 'ON' : 'OFF'}
          </button>
          <select
            className="studio-select"
            value={playbackSpeed}
            onChange={(e) => onChangeSpeed(Number(e.target.value))}
            aria-label="Playback Speed"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </div>
      </div>

      <div className="phrase-strip" aria-label="Performer Movement Phrase Strip">
        <span className="phrase-owner mono">{focusedPerf.label} Body:</span>
        {phraseBlocks.map((b, i) => {
          const isActive =
            countOffset >= b.startCount - 1e-4 &&
            (countOffset < b.endCount - 1e-4 ||
              transitionCounts <= 0 ||
              Math.abs(countOffset - b.endCount) < 1e-4);
          return (
            <button
              key={`${b.cueId ?? 'base'}-${i}`}
              type="button"
              className={`phrase-pill ${isActive ? 'active' : ''}`}
              onClick={() => onJumpToCountOffset(b.triggerCount)}
              title="Jump timeline to this movement phrase"
            >
              <span className="mono">
                {transitionCounts > 0
                  ? `${b.startCount.toFixed(1)}-${b.endCount.toFixed(1)}ct`
                  : 'Anchor'}
              </span>
              <span>{POSTURE_SPECS[b.posture].shortCode}</span>
              <span>· {b.label}</span>
            </button>
          );
        })}
      </div>

      <div className="set-pills-track">
        {show.sets.map((set, idx) => {
          const isCurrent = idx === activeSetIndex;
          return (
            <button
              key={set.id}
              type="button"
              className={`set-pill ${isCurrent ? 'active' : ''}`}
              style={{ flexGrow: Math.max(1, set.counts || 8) }}
              onClick={() => onSelectSet(idx)}
            >
              <div className="set-pill-top">
                <span>
                  Set {idx + 1} ({set.rehearsalMark})
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent-cyan)' }}>
                  {set.counts > 0 ? `${set.counts}ct · ${set.tempoBpm}` : `Anchor · ${set.tempoBpm}`}
                </span>
              </div>
              <div className="set-pill-sub">{set.name.replace(/^Set \d+:\s*/, '')}</div>
            </button>
          );
        })}
      </div>
    </footer>
  );
};
