import React from 'react';
import { DrillLensSpec, HarnessRunReceipt } from '../core/types.ts';

interface IntentCommandBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  lockSections: boolean;
  onToggleLockSections: (val: boolean) => void;
  onSubmitPrompt: () => void;
  onRunQuickLens: (
    preset:
      | 'OPTIMIZE'
      | 'DEFLECT'
      | 'ARC'
      | 'COMPANY_FRONT'
      | 'ACOUSTIC'
      | 'RIPPLE_SNAP'
  ) => void;
  lastFeedback: { ok: boolean; text: string; receipt?: HarnessRunReceipt } | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  canEdit: boolean;
  activeLensKind?: DrillLensSpec['kind'];
}

export const IntentCommandBar: React.FC<IntentCommandBarProps> = ({
  prompt,
  onPromptChange,
  lockSections,
  onToggleLockSections,
  onSubmitPrompt,
  onRunQuickLens,
  lastFeedback,
  inputRef,
  canEdit
}) => {
  return (
    <div className="intent-bar">
      <div className="intent-row">
        <div className="intent-input-wrap">
          <span className="intent-badge">AI LENS (⌘K)</span>
          <input
            ref={inputRef}
            className="intent-input"
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmitPrompt();
              }
            }}
            placeholder='Describe a bounded drill operation, e.g. "curve pass-through collisions", "optimize dot assignment", "stage brass arc on front hash"...'
          />
        </div>
        <label className="toggle-item" style={{ whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={lockSections}
            onChange={(e) => onToggleLockSections(e.target.checked)}
          />
          Lock Section Voicing
        </label>
        <button
          type="button"
          className="action-btn primary"
          onClick={onSubmitPrompt}
          disabled={!canEdit}
          title={canEdit ? 'Run AI Intent Harness' : 'Switch to Designer role to apply edits'}
        >
          Run Lens
        </button>
      </div>

      <div className="intent-chips">
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Quick Lenses:</span>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onRunQuickLens('OPTIMIZE')}
          disabled={!canEdit}
        >
          Optimize Dot Assignment
        </button>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onRunQuickLens('DEFLECT')}
          disabled={!canEdit}
        >
          Curve Pass-Through Collisions
        </button>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onRunQuickLens('ARC')}
          disabled={!canEdit}
        >
          Stage Brass Arc (Front Hash)
        </button>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onRunQuickLens('COMPANY_FRONT')}
          disabled={!canEdit}
        >
          Company Front Hit
        </button>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onRunQuickLens('ACOUSTIC')}
          disabled={!canEdit}
        >
          Compact Acoustic Delay &lt;55ms
        </button>
        <button
          type="button"
          className="chip-btn"
          onClick={() => onRunQuickLens('RIPPLE_SNAP')}
          disabled={!canEdit}
        >
          Ripple Brass Horn-Snap
        </button>
      </div>

      {lastFeedback && (
        <div className={`intent-feedback ${lastFeedback.ok ? 'ok' : 'err'}`}>
          <span>{lastFeedback.text}</span>
          {lastFeedback.receipt && (
            <span className="mono" style={{ fontSize: 10.5 }}>
              digest #{lastFeedback.receipt.materializedInputDigest}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
