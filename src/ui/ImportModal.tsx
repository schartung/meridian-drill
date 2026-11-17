import React, { useState } from 'react';
import { parseShowBundle } from '../core/collaboration.ts';
import { FIELD_STANDARD_LIST } from '../core/fields.ts';
import {
  importMusicXmlTempoMap,
  importPywareArchiveBytes,
  importPywareCoordinateText,
  ImportDiagnosticReceipt,
  SAMPLE_MUSICXML_SCORE,
  SAMPLE_PYWARE_COORDINATE_CSV
} from '../core/importers.ts';
import {
  buildLibraryPresetImport,
  LibraryShowId,
  REAL_WORLD_SHOW_PRESETS
} from '../core/showLibrary.ts';
import {
  DrillShow,
  FieldStandardId,
  ShowAudioMeta
} from '../core/types.ts';

interface ImportModalProps {
  activeShow: DrillShow;
  onClose: () => void;
  onApplyImportedShow: (show: DrillShow, synthAudioOnApply?: boolean) => void;
  onLoadAudioBytes: (
    bytes: ArrayBuffer,
    filename: string,
    sourceKind: ShowAudioMeta['sourceKind']
  ) => Promise<void>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  activeShow,
  onClose,
  onApplyImportedShow,
  onLoadAudioBytes
}) => {
  const [targetFieldId, setTargetFieldId] = useState<FieldStandardId>(
    activeShow.fieldStandardId
  );
  const [showTitle, setShowTitle] = useState<string>('Imported Production');
  const [rawText, setRawText] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<ImportDiagnosticReceipt | null>(null);
  const [activePresetId, setActivePresetId] = useState<LibraryShowId | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const handlePreviewPreset = (presetId: LibraryShowId) => {
    const { preset, receipt: libReceipt, csvPreview } =
      buildLibraryPresetImport(presetId);
    setActivePresetId(presetId);
    setTargetFieldId(libReceipt.importedShow?.fieldStandardId ?? 'NCAA_DCI');
    setShowTitle(`${preset.ensemble} — ${preset.shortTitle}`);
    setRawText(csvPreview);
    setReceipt(libReceipt);
    setActionMsg(null);
  };

  const handleImportPresetWithAudio = (presetId: LibraryShowId) => {
    const { receipt: libReceipt } = buildLibraryPresetImport(presetId);
    if (!libReceipt.importedShow) return;
    onApplyImportedShow(libReceipt.importedShow, true);
    onClose();
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const lower = file.name.toLowerCase();
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(lower)) {
        await onLoadAudioBytes(buffer, file.name, 'UPLOADED_FILE');
        const audioReceipt = await importPywareArchiveBytes(
          bytes,
          file.name,
          targetFieldId,
          activeShow
        );
        setReceipt(audioReceipt);
        setActionMsg(`Armed audio track "${file.name}" onto the Timeline waveform.`);
        return;
      }

      if (lower.endsWith('.json')) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        const bundle = parseShowBundle(text);
        if (bundle.ok) {
          setReceipt({
            status: 'FULL_SHOW_IMPORTED',
            sourceFilename: file.name,
            detectedFormat: 'Meridian Show Bundle (.meridian.json)',
            provenanceNotes: [
              {
                state: 'stated',
                statement: `Validated bundle "${bundle.show.title}" (${bundle.show.performers.length} performers, ${bundle.show.sets.length} sets).`,
                sourceOrCondition: 'Show JSON bundle'
              }
            ],
            archiveEntries: [],
            importedShow: bundle.show,
            userGuidance: ['Click Apply Imported Show to load this bundle onto the stage.']
          });
        } else {
          setReceipt({
            status: 'VALIDATION_FAILED',
            sourceFilename: file.name,
            detectedFormat: 'Invalid Show JSON',
            provenanceNotes: [
              {
                state: 'gap',
                statement: bundle.error,
                sourceOrCondition: file.name
              }
            ],
            archiveEntries: [],
            userGuidance: ['Verify the file is a valid Meridian .meridian.json export.']
          });
        }
        return;
      }

      const nextReceipt = await importPywareArchiveBytes(
        bytes,
        file.name,
        targetFieldId,
        activeShow
      );
      setReceipt(nextReceipt);
    } catch (err) {
      setReceipt({
        status: 'VALIDATION_FAILED',
        sourceFilename: file.name,
        detectedFormat: 'Import Error',
        provenanceNotes: [
          {
            state: 'gap',
            statement: err instanceof Error ? err.message : 'Unable to read file.',
            sourceOrCondition: file.name
          }
        ],
        archiveEntries: [],
        userGuidance: ['Check file integrity and try again.']
      });
    } finally {
      setBusy(false);
    }
  };

  const handleParseText = (syncToActiveShow: boolean) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    setActionMsg(null);
    if (trimmed.startsWith('<') && trimmed.includes('<measure')) {
      setReceipt(
        importMusicXmlTempoMap(
          trimmed,
          'pasted-score.musicxml',
          syncToActiveShow ? activeShow : undefined
        )
      );
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = parseShowBundle(trimmed);
      if (parsed.ok) {
        setReceipt({
          status: 'FULL_SHOW_IMPORTED',
          sourceFilename: 'pasted-bundle.json',
          detectedFormat: 'Meridian Show Bundle JSON',
          provenanceNotes: [
            {
              state: 'stated',
              statement: `Validated "${parsed.show.title}" (${parsed.show.performers.length} performers, ${parsed.show.sets.length} sets).`,
              sourceOrCondition: 'Pasted JSON'
            }
          ],
          archiveEntries: [],
          importedShow: parsed.show,
          userGuidance: ['Click Apply Imported Show to load onto the field.']
        });
      } else {
        setReceipt({
          status: 'VALIDATION_FAILED',
          sourceFilename: 'pasted-bundle.json',
          detectedFormat: 'Invalid JSON',
          provenanceNotes: [
            { state: 'gap', statement: parsed.error, sourceOrCondition: 'Pasted JSON' }
          ],
          archiveEntries: [],
          userGuidance: ['Check JSON syntax or paste a CSV/TSV coordinate sheet instead.']
        });
      }
    } else {
      setReceipt(
        importPywareCoordinateText(
          trimmed,
          targetFieldId,
          showTitle.trim() || 'Imported Coordinate Show',
          'pasted-coordinates.csv'
        )
      );
    }
  };

  const handleArmExtractedAudio = async () => {
    if (!receipt?.extractedAudio) return;
    setBusy(true);
    try {
      await onLoadAudioBytes(
        toArrayBuffer(receipt.extractedAudio.bytes),
        receipt.extractedAudio.filename,
        receipt.sourceFilename.toLowerCase().endsWith('.3dz')
          ? 'EXTRACTED_3DZ'
          : 'UPLOADED_FILE'
      );
      setActionMsg(
        `Armed "${receipt.extractedAudio.filename}" onto the Timeline waveform.`
      );
    } catch (err) {
      setActionMsg(
        `Browser could not decode "${receipt.extractedAudio.filename}": ${
          err instanceof Error ? err.message : 'unsupported codec'
        }`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleApplyShow = async (synthAudio = false) => {
    if (!receipt?.importedShow) return;
    const nextShow = receipt.importedShow;
    if (receipt.extractedAudio) {
      try {
        await onLoadAudioBytes(
          toArrayBuffer(receipt.extractedAudio.bytes),
          receipt.extractedAudio.filename,
          'EXTRACTED_3DZ'
        );
      } catch {
        // Keep show import proceeding even if extracted audio codec is unsupported by browser.
      }
    }
    onApplyImportedShow(nextShow, synthAudio && !receipt.extractedAudio);
    onClose();
  };

  const looksLikeXml = rawText.trim().startsWith('<');
  const receiptTone =
    receipt?.status === 'FULL_SHOW_IMPORTED' ||
    receipt?.status === 'TEMPO_MAP_IMPORTED' ||
    receipt?.status === 'AUDIO_ONLY_IMPORTED'
      ? 'ok'
      : receipt?.status === 'VALIDATION_FAILED'
        ? 'err'
        : 'warn';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 15 }}>
              Import Drill, Tempo Map &amp; Audio (.3dz / Pyware CSV / MusicXML / Audio)
            </strong>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Epistemic bridge: unpacks .3dz audio &amp; open coordinate sheets cleanly; inspects binary .3dj payloads without fabricating spots.
            </span>
          </div>
          <button type="button" className="action-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="card">
            <div className="card-title">
              <span>Stored Real-Life Show Excerpts (Ready to Import)</span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                Reconstructed from public staging + Coordinate CSV
              </span>
            </div>
            <div className="library-preset-grid">
              {REAL_WORLD_SHOW_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`library-preset-card ${isSelected ? 'active' : ''}`}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div className="library-preset-meta">
                        {preset.ensemble} · {preset.yearLabel}
                      </div>
                      <div className="library-preset-title">{preset.shortTitle}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {preset.metricsLine}
                      </div>
                      <div className="library-preset-desc">{preset.highlightNote}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => handlePreviewPreset(preset.id)}
                      >
                        Preview &amp; CSV
                      </button>
                      <button
                        type="button"
                        className="mini-btn accent"
                        onClick={() => handleImportPresetWithAudio(preset.id)}
                      >
                        Import + Audio
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-grid">
            <div className="field-group">
              <label htmlFor="import-field-std">Target Field Standard (for step phrases)</label>
              <select
                id="import-field-std"
                className="studio-select"
                value={targetFieldId}
                onChange={(e) => setTargetFieldId(e.target.value as FieldStandardId)}
              >
                {FIELD_STANDARD_LIST.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.stepLabel})
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="import-show-title">Show Title (for new CSV / MusicXML import)</label>
              <input
                id="import-show-title"
                className="studio-input"
                type="text"
                value={showTitle}
                onChange={(e) => setShowTitle(e.target.value)}
              />
            </div>
          </div>

          <label
            className={`import-dropzone ${dragActive ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            <input
              type="file"
              accept=".3dz,.3dj,.csv,.tsv,.txt,.musicxml,.xml,.mp3,.wav,.ogg,.m4a,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <strong>{busy ? 'Inspecting file...' : 'Drop a file or click to browse'}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Accepts Pyware .3dz packages, standalone .3dj, Coordinate CSV/Text, MusicXML (.musicxml/.xml), .mp3/.wav audio, or .meridian.json
            </span>
          </label>

          <div className="card">
            <div className="card-title">
              <span>Coordinate Sheet CSV / MusicXML Paste Workbench</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="mini-btn accent"
                  onClick={() => {
                    setRawText(SAMPLE_PYWARE_COORDINATE_CSV);
                    setShowTitle('Pyware Coordinate Import');
                    setReceipt(null);
                    setActionMsg(null);
                  }}
                >
                  Load Sample Pyware CSV
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    setRawText(SAMPLE_MUSICXML_SCORE);
                    setShowTitle('Brass Opener Sketch (MusicXML)');
                    setReceipt(null);
                    setActionMsg(null);
                  }}
                >
                  Load Sample MusicXML
                </button>
              </div>
            </div>

            <textarea
              className="studio-input mono"
              rows={7}
              placeholder="Paste Pyware Coordinate CSV/Tab table or uncompressed MusicXML score text here..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              style={{ fontSize: 11, resize: 'vertical', lineHeight: 1.45 }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="action-btn primary"
                disabled={!rawText.trim()}
                onClick={() => handleParseText(false)}
              >
                Parse &amp; Inspect Text
              </button>
              {looksLikeXml && (
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => handleParseText(true)}
                >
                  Sync MusicXML Tempos to Active Show
                </button>
              )}
            </div>
          </div>

          {actionMsg && (
            <div className="intent-feedback ok">
              <span>{actionMsg}</span>
            </div>
          )}

          {receipt && (
            <div className={`receipt-box ${receiptTone}`}>
              <div className="issue-header">
                <strong>{receipt.detectedFormat}</strong>
                <span className="mono" style={{ fontSize: 11 }}>
                  {receipt.status}
                </span>
              </div>

              {receipt.archiveEntries.length > 0 && (
                <div style={{ fontSize: 11 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Archive Entries Unpacked:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {receipt.archiveEntries.map((ent) => (
                      <span key={ent.name} className="phrase-pill">
                        <span className="mono">{ent.name}</span>
                        <span>({ent.role}, {ent.uncompressedBytes.toLocaleString()} B)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {receipt.provenanceNotes.map((note, idx) => (
                  <div key={idx} className="issue-body" style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span className={`epistemic-badge ${note.state}`}>{note.state}</span>
                    <span>
                      {note.statement}{' '}
                      <span style={{ color: 'var(--text-muted)' }}>
                        ({note.sourceOrCondition})
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {receipt.userGuidance.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text-primary)', marginTop: 2 }}>
                  {receipt.userGuidance.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}

              {(receipt.importedShow || receipt.extractedAudio) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {receipt.importedShow && !receipt.extractedAudio && (
                    <button
                      type="button"
                      className="action-btn primary"
                      onClick={() => void handleApplyShow(true)}
                    >
                      {receipt.status === 'TEMPO_MAP_IMPORTED'
                        ? 'Apply Tempo Sync + Synth Audio'
                        : 'Apply Show & Synth Audio'}
                    </button>
                  )}
                  {receipt.importedShow && (
                    <button
                      type="button"
                      className={receipt.extractedAudio ? 'action-btn primary' : 'action-btn'}
                      onClick={() => void handleApplyShow(false)}
                    >
                      {receipt.status === 'TEMPO_MAP_IMPORTED'
                        ? 'Apply Tempo & Rehearsal Sync'
                        : receipt.extractedAudio
                          ? 'Apply Imported Show & Arm Audio'
                          : 'Apply Imported Show'}
                    </button>
                  )}
                  {receipt.extractedAudio && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => void handleArmExtractedAudio()}
                    >
                      Arm Extracted Audio ({receipt.extractedAudio.filename})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
