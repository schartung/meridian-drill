import React, { useMemo, useState } from 'react';
import {
  exportDotBookMarkdown,
  generatePerformerDotBook,
  parseShowBundle,
  serializeShowBundle
} from '../core/collaboration.ts';
import { getFieldSpec } from '../core/fields.ts';
import {
  getTransitionWindow,
  interpolateShowAtPosition
} from '../core/interpolation.ts';
import { DrillShow } from '../core/types.ts';
import { MannequinPoseCard } from './MannequinPoseCard.tsx';

interface DotBookModalProps {
  show: DrillShow;
  initialPerformerId: string;
  onClose: () => void;
  onImportShowBundle: (show: DrillShow) => void;
}

function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const DotBookModal: React.FC<DotBookModalProps> = ({
  show,
  initialPerformerId,
  onClose,
  onImportShowBundle
}) => {
  const [performerId, setPerformerId] = useState(
    show.performers.some((p) => p.id === initialPerformerId)
      ? initialPerformerId
      : show.performers[0]!.id
  );
  const [previewSetIndex, setPreviewSetIndex] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const dotBook = useMemo(
    () => generatePerformerDotBook(show, performerId),
    [show, performerId]
  );

  const field = useMemo(() => getFieldSpec(show.fieldStandardId), [show.fieldStandardId]);
  const previewWin = getTransitionWindow(show, previewSetIndex);
  const previewMaxCounts = previewWin ? previewWin.counts : 0;
  const previewCount = previewMaxCounts > 0 ? Math.min(2, previewMaxCounts * 0.25) : 0;
  const previewState = useMemo(
    () =>
      interpolateShowAtPosition(show, previewSetIndex, previewCount, field)[
        dotBook.performer.id
      ],
    [show, previewSetIndex, previewCount, field, dotBook.performer.id]
  );

  const handleCopyMarkdown = async () => {
    const md = exportDotBookMarkdown(dotBook);
    try {
      await navigator.clipboard.writeText(md);
      setStatusMsg(`Copied Markdown Dot-Book for ${dotBook.performer.label} to clipboard.`);
    } catch {
      downloadTextFile(`${dotBook.performer.label}-dotbook.md`, md, 'text/markdown');
      setStatusMsg(`Downloaded ${dotBook.performer.label}-dotbook.md.`);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = parseShowBundle(text);
    if (res.ok) {
      onImportShowBundle(res.show);
      setStatusMsg(`Loaded show bundle "${res.show.title}" cleanly.`);
    } else {
      setStatusMsg(`Import failed: ${res.error}`);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 15 }}>Performer Coordinate Dot-Book &amp; Bundles</strong>
            <select
              className="studio-select"
              value={performerId}
              onChange={(e) => setPerformerId(e.target.value)}
            >
              {show.performers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.name} ({p.section})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="mini-btn accent" onClick={handleCopyMarkdown}>
              Copy Markdown
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={() =>
                downloadTextFile(
                  `${dotBook.performer.label}-dotbook.md`,
                  exportDotBookMarkdown(dotBook),
                  'text/markdown'
                )
              }
            >
              Download .md
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={() =>
                downloadTextFile(
                  `${show.id}.meridian.json`,
                  serializeShowBundle(show),
                  'application/json'
                )
              }
            >
              Export Show .json
            </button>
            <label className="mini-btn" style={{ cursor: 'pointer' }}>
              Import .json
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleFileImport}
              />
            </label>
            <button type="button" className="action-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>
              <strong>Performer:</strong> {dotBook.performer.name} ({dotBook.performer.instrument})
            </span>
            <span>
              <strong>Active Standard:</strong> {dotBook.fieldName}
            </span>
            {dotBook.venueComparisonName && (
              <span style={{ color: '#22d3ee' }}>
                <strong>Venue Overlay:</strong> {dotBook.venueComparisonName}
              </span>
            )}
          </div>

          {statusMsg && (
            <div className="intent-feedback ok">
              <span>{statusMsg}</span>
            </div>
          )}

          {previewState && (
            <div className="dotbook-pose-preview">
              <div className="dotbook-pose-sets">
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>
                  Pose Preview:
                </span>
                {show.sets.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`mini-btn ${previewSetIndex === idx ? 'accent' : ''}`}
                    onClick={() => setPreviewSetIndex(idx)}
                  >
                    Set {idx + 1} ({s.rehearsalMark})
                  </button>
                ))}
              </div>
              <MannequinPoseCard
                performer={dotBook.performer}
                state={previewState}
                setName={show.sets[previewSetIndex]?.name ?? 'Set 1'}
                countOffset={previewCount}
                maxCounts={previewMaxCounts}
              />
            </div>
          )}

          <table className="dotbook-table">
            <thead>
              <tr>
                <th>Set</th>
                <th>Mark</th>
                <th>Counts</th>
                <th>Horizontal (Side / Yard)</th>
                <th>Front-to-Back</th>
                <th>Stride &amp; Path</th>
                <th>xCounts</th>
                <th>Body &amp; Horn Visuals</th>
                <th>Dress Neighbors</th>
                <th>Sound Lag</th>
              </tr>
            </thead>
            <tbody>
              {dotBook.entries.map((entry) => (
                <tr key={entry.setId}>
                  <td>
                    <strong>{entry.setName}</strong>
                  </td>
                  <td className="mono">{entry.rehearsalMark}</td>
                  <td className="mono">
                    {entry.countsFromPrev} @ {entry.tempoBpm}
                  </td>
                  <td className="mono">{entry.horizontalText}</td>
                  <td className="mono">
                    <div>{entry.verticalText}</div>
                    {entry.venueTranslationNote && (
                      <div style={{ fontSize: 10.5, color: '#22d3ee' }}>
                        {entry.venueTranslationNote}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>{entry.stepSizeText}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      {entry.pathTypeText}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: '#67e8f9' }}>
                    {entry.xCountsText}
                  </td>
                  <td style={{ fontSize: 11.5, color: '#e2e8f0' }}>
                    {entry.bodySummaryText}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {[
                      entry.leftNeighborLabel ? `L: ${entry.leftNeighborLabel}` : null,
                      entry.rightNeighborLabel ? `R: ${entry.rightNeighborLabel}` : null
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Open'}
                  </td>
                  <td className="mono">{entry.acousticDelayMs.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>

          {dotBook.pins.length > 0 && (
            <div className="card">
              <div className="card-title">
                <span>Attached Staff &amp; Rehearsal Pins</span>
              </div>
              {dotBook.pins.map((pin) => (
                <div key={pin.id} className="issue-body">
                  <strong>
                    [{pin.status}] {pin.category}
                  </strong>{' '}
                  ({pin.authorName}, {pin.authorRole}): {pin.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
