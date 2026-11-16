import React from 'react';
import { getSetStartGlobalCount, getTotalShowCounts } from '../core/interpolation.ts';
import { DrillShow } from '../core/types.ts';

interface TimelineBarProps {
  show: DrillShow;
  activeSetIndex: number;
  countOffset: number;
  isPlaying: boolean;
  playbackSpeed: number;
  audioEnabled: boolean;
  onTogglePlay: () => void;
  onStepCount: (delta: number) => void;
  onSelectSet: (setIndex: number) => void;
  onScrubGlobalCount: (globalCount: number) => void;
  onChangeSpeed: (speed: number) => void;
  onToggleAudio: () => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  show,
  activeSetIndex,
  countOffset,
  isPlaying,
  playbackSpeed,
  audioEnabled,
  onTogglePlay,
  onStepCount,
  onSelectSet,
  onScrubGlobalCount,
  onChangeSpeed,
  onToggleAudio
}) => {
  const totalCounts = Math.max(1, getTotalShowCounts(show));
  const currentGlobal = Math.min(
    totalCounts,
    getSetStartGlobalCount(show, activeSetIndex) + countOffset
  );
  const currentSet = show.sets[activeSetIndex]!;
  const nextSet = show.sets[activeSetIndex + 1];
  const transitionCounts = nextSet ? nextSet.counts : 0;

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
          <input
            className="scrubber-slider"
            type="range"
            min={0}
            max={totalCounts}
            step={0.25}
            value={currentGlobal}
            onChange={(e) => onScrubGlobalCount(Number(e.target.value))}
          />
          <div className="count-readout">
            Set {activeSetIndex + 1}/{show.sets.length} · ct{' '}
            {countOffset.toFixed(1)}/{transitionCounts} ·{' '}
            {nextSet ? nextSet.tempoBpm : currentSet.tempoBpm} BPM
          </div>
        </div>

        <div className="transport-btns">
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
                  {set.counts > 0 ? `${set.counts}ct` : 'Anchor'}
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
