import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioPulseEngine } from './core/audioPulse.ts';
import {
  AudioTrackController,
  getTotalShowDurationSeconds,
  globalCountToSeconds,
  secondsToGlobalCount,
  synthesizeShowEnsemblePcm
} from './core/audioSync.ts';
import {
  exportRehearsalTriageMarkdown,
  parseShowBundle,
  serializeShowBundle
} from './core/collaboration.ts';
import { formatSteps } from './core/coordinates.ts';
import { createDemoShow } from './core/demoShow.ts';
import { FIELD_STANDARD_LIST, getFieldSpec } from './core/fields.ts';
import {
  computeSelectionCentroid,
  mirrorDotsAcrossCenter,
  rotateDotsAround
} from './core/forms.ts';
import {
  executeHarnessLens,
  parseNaturalLanguageIntent,
  revertHarnessReceipt
} from './core/harness.ts';
import {
  analyzeShowIntelligence,
  computeAcousticDelayMs
} from './core/intelligence.ts';
import {
  getSetStartGlobalCount,
  getTotalShowCounts,
  getTransitionWindow,
  globalCountToSetPosition,
  interpolateShowAtPosition
} from './core/interpolation.ts';
import {
  CameraPresetId,
  CollaboratorRole,
  DrillLensSpec,
  DrillSet,
  DrillShow,
  FieldPin,
  FieldStandardId,
  HarnessRunReceipt,
  PerformerDot,
  PinCategory,
  SectionId,
  ShowAudioMeta
} from './core/types.ts';
import { DotBookModal } from './ui/DotBookModal.tsx';
import {
  FieldViewport,
  ViewportOverlays,
  ViewportToolMode
} from './ui/FieldViewport.tsx';
import { ImportModal } from './ui/ImportModal.tsx';
import { InspectorSidebar, InspectorTabId } from './ui/InspectorSidebar.tsx';
import { IntentCommandBar } from './ui/IntentCommandBar.tsx';
import { TimelineBar } from './ui/TimelineBar.tsx';

const STORAGE_KEY = 'meridian_drill_v1_2_state';

function loadInitialShow(): DrillShow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseShowBundle(raw);
      if (parsed.ok) return parsed.show;
    }
  } catch {
    // Fallback cleanly to built-in flagship demo show.
  }
  return createDemoShow();
}

export const App: React.FC = () => {
  const [show, setShow] = useState<DrillShow>(loadInitialShow);
  const [activeSetIndex, setActiveSetIndex] = useState<number>(3); // Start on Set 4 -> Set 5 transition to spotlight live physics & AI solve
  const [countOffset, setCountOffset] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);
  const [audioTrackLabel, setAudioTrackLabel] = useState<string | null>(null);
  const [audioTrackMuted, setAudioTrackMuted] = useState<boolean>(false);

  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('TOP_2D');
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>('DESIGNER');
  const [toolMode, setToolMode] = useState<ViewportToolMode>('SELECT');
  const [sectionFilter, setSectionFilter] = useState<SectionId | 'ALL'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>(['B11']);
  const [povPerformerId, setPovPerformerId] = useState<string>('B11');
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>('INTELLIGENCE');
  const [highlightedPinId, setHighlightedPinId] = useState<string | null>(null);
  const [dotBookOpen, setDotBookOpen] = useState<boolean>(false);
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);

  const [overlays, setOverlays] = useState<ViewportOverlays>({
    paths: true,
    acousticRings: true,
    collisions: true,
    bodyVisuals: true,
    labels: false,
    snapHalfStep: false
  });

  const [intentPrompt, setIntentPrompt] = useState<string>('');
  const [lockSections, setLockSections] = useState<boolean>(true);
  const [lastFeedback, setLastFeedback] = useState<{
    ok: boolean;
    text: string;
    receipt?: HarnessRunReceipt;
  } | null>(null);

  const intentInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<AudioPulseEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new AudioPulseEngine();
  }
  const audioTrackRef = useRef<AudioTrackController | null>(null);
  if (!audioTrackRef.current) {
    audioTrackRef.current = new AudioTrackController();
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeShowBundle(show));
    } catch {
      // Ignore storage quota restrictions cleanly.
    }
  }, [show]);

  const field = useMemo(() => getFieldSpec(show.fieldStandardId), [show.fieldStandardId]);
  const intelligence = useMemo(
    () => analyzeShowIntelligence(show, activeSetIndex),
    [show, activeSetIndex]
  );

  // Sync POV performer with first selected performer if chosen
  useEffect(() => {
    if (selectedIds[0]) {
      setPovPerformerId(selectedIds[0]);
    }
  }, [selectedIds]);

  const handleSynthDemoAudio = useCallback(() => {
    const controller = audioTrackRef.current;
    if (!controller) return;
    setIsPlaying(false);
    const stem = synthesizeShowEnsemblePcm(show);
    const trackLabel = 'Synth Brass + Battery Stem';
    const loaded = controller.loadFromPcm(
      stem.samples,
      stem.sampleRate,
      trackLabel,
      'SYNTH_DEMO',
      stem.drillDurationSeconds
    );
    setWaveformPeaks(loaded.peaks);
    setAudioTrackLabel(trackLabel);
    setAudioTrackMuted(false);
    setShow((prev) => ({
      ...prev,
      audioMeta: {
        trackLabel,
        durationSeconds: loaded.durationSeconds,
        beatOffsetSeconds: 0,
        sourceKind: 'SYNTH_DEMO'
      }
    }));
    setLastFeedback({
      ok: true,
      text: `Synthesized variable-tempo Brass + Battery stem (${loaded.durationSeconds.toFixed(1)}s) synced across all sets.`
    });
  }, [show]);

  const handleLoadAudioBytes = useCallback(
    async (
      bytes: ArrayBuffer,
      filename: string,
      sourceKind: ShowAudioMeta['sourceKind']
    ) => {
      const controller = audioTrackRef.current;
      if (!controller) return;
      setIsPlaying(false);
      const drillDuration = getTotalShowDurationSeconds(show);
      const loaded = await controller.loadFromEncodedBytes(
        bytes,
        filename,
        sourceKind,
        drillDuration
      );
      setWaveformPeaks(loaded.peaks);
      setAudioTrackLabel(filename);
      setAudioTrackMuted(false);
      setShow((prev) => ({
        ...prev,
        audioMeta: {
          trackLabel: filename,
          durationSeconds: loaded.durationSeconds,
          beatOffsetSeconds: prev.audioMeta?.beatOffsetSeconds ?? 0,
          sourceKind
        }
      }));
      setLastFeedback({
        ok: true,
        text: `Armed audio track "${filename}" (${loaded.durationSeconds.toFixed(1)}s) onto Timeline waveform.`
      });
    },
    [show]
  );

  // Playback animation loop (hardware-synced to audio clock when track armed)
  const playStateRef = useRef({
    activeSetIndex,
    countOffset,
    playbackSpeed,
    audioEnabled
  });
  playStateRef.current = {
    activeSetIndex,
    countOffset,
    playbackSpeed,
    audioEnabled
  };

  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();
    const totalCounts = getTotalShowCounts(show);
    const initGlobal =
      getSetStartGlobalCount(show, playStateRef.current.activeSetIndex) +
      playStateRef.current.countOffset;
    const startGlobal = initGlobal >= totalCounts - 1e-4 ? 0 : initGlobal;
    if (startGlobal !== initGlobal) {
      setActiveSetIndex(0);
      setCountOffset(0);
    }
    let prevIntBeat = Math.floor(startGlobal);

    const track = audioTrackRef.current;
    const useAudioClock = Boolean(track && track.hasTrack() && !audioTrackMuted);
    if (useAudioClock && track) {
      track.play(globalCountToSeconds(show, startGlobal), playbackSpeed);
    }

    const tick = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 0.08);
      lastTs = now;

      const { activeSetIndex: sIdx, countOffset: cOff, playbackSpeed: spd, audioEnabled: aud } =
        playStateRef.current;
      let nextGlobal: number;
      if (useAudioClock && track && track.isPlaying()) {
        nextGlobal = secondsToGlobalCount(show, track.getCurrentSeconds());
      } else {
        const win = getTransitionWindow(show, sIdx);
        const bpm = win ? win.tempoBpm : show.sets[sIdx]?.tempoBpm ?? 140;
        const deltaCounts = dt * (bpm / 60) * spd;
        const currentGlobal = getSetStartGlobalCount(show, sIdx) + cOff;
        nextGlobal = currentGlobal + deltaCounts;
      }

      if (nextGlobal >= totalCounts) {
        const endPos = globalCountToSetPosition(show, totalCounts);
        setActiveSetIndex(endPos.setIndex);
        setCountOffset(endPos.countOffset);
        setIsPlaying(false);
        return;
      }

      const nextPos = globalCountToSetPosition(show, nextGlobal);
      const nextIntBeat = Math.floor(nextGlobal);
      if (aud && nextIntBeat > prevIntBeat) {
        const isArrival = nextPos.countOffset < 0.35;
        audioRef.current?.triggerBeat(nextIntBeat, isArrival);
        prevIntBeat = nextIntBeat;
      }

      setActiveSetIndex(nextPos.setIndex);
      setCountOffset(nextPos.countOffset);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioTrackRef.current?.stop();
    };
  }, [isPlaying, show, playbackSpeed, audioTrackMuted]);

  const handleRunLens = useCallback(
    (lens: DrillLensSpec) => {
      if (collaboratorRole !== 'DESIGNER') {
        setLastFeedback({
          ok: false,
          text: 'Switch collaborator role to Designer to apply AI Harness edits.'
        });
        return;
      }
      const res = executeHarnessLens(show, lens);
      if (!res.ok) {
        setLastFeedback({ ok: false, text: res.error });
        return;
      }
      const r = res.receipt;
      setShow(res.updatedShow);
      setLastFeedback({
        ok: true,
        text: `${r.lensSummary} — Collisions ${r.beforeMetrics.collisionCount} -> ${r.afterMetrics.collisionCount}, Crossings ${r.beforeMetrics.crossingCount} -> ${r.afterMetrics.crossingCount}, Cleanliness ${r.beforeMetrics.cleanlinessScore} -> ${r.afterMetrics.cleanlinessScore}`,
        receipt: r
      });
    },
    [show, collaboratorRole]
  );

  const handleSubmitIntent = useCallback(() => {
    const parsed = parseNaturalLanguageIntent(
      intentPrompt,
      show,
      activeSetIndex,
      selectedIds
    );
    if (!parsed.ok) {
      setLastFeedback({
        ok: false,
        text: `${parsed.reason} Try: "${parsed.suggestions[0]}"`
      });
      return;
    }
    if (parsed.lens.kind === 'OPTIMIZE_ASSIGNMENT') {
      parsed.lens.lockSections = lockSections;
    }
    handleRunLens(parsed.lens);
  }, [intentPrompt, show, activeSetIndex, selectedIds, lockSections, handleRunLens]);

  const handleQuickLens = useCallback(
    (
      preset:
        | 'OPTIMIZE'
        | 'DEFLECT'
        | 'ARC'
        | 'COMPANY_FRONT'
        | 'ACOUSTIC'
        | 'RIPPLE_SNAP'
    ) => {
      const transitionIdx = Math.min(
        Math.max(0, activeSetIndex),
        Math.max(0, show.sets.length - 2)
      );
      if (preset === 'OPTIMIZE') {
        handleRunLens({
          kind: 'OPTIMIZE_ASSIGNMENT',
          fromSetIndex: transitionIdx,
          lockSections,
          stridePower: 2.2
        });
      } else if (preset === 'DEFLECT') {
        handleRunLens({
          kind: 'DEFLECT_COLLISIONS',
          fromSetIndex: transitionIdx,
          minClearanceMeters: 1.25
        });
      } else if (preset === 'ARC') {
        const brassIds = show.performers
          .filter((p) => p.section === 'BRASS')
          .map((p) => p.id);
        handleRunLens({
          kind: 'STAGE_FORM',
          setIndex: activeSetIndex,
          performerIds: brassIds,
          shape: 'ARC',
          centerXMeters: 0,
          baseYMeters: field.frontHashYMeters ?? 16,
          spanMeters: field.id === 'JMBA_30M' ? 22 : 30,
          depthMeters: -5.5,
          assignOptimallyFromPrev: true
        });
      } else if (preset === 'COMPANY_FRONT') {
        const brassIds = show.performers
          .filter((p) => p.section === 'BRASS')
          .map((p) => p.id);
        handleRunLens({
          kind: 'STAGE_FORM',
          setIndex: activeSetIndex,
          performerIds: brassIds,
          shape: 'COMPANY_FRONT',
          centerXMeters: 0,
          baseYMeters: field.frontHashYMeters ?? 16,
          spanMeters: field.id === 'JMBA_30M' ? 24 : 36.576,
          depthMeters: 0,
          assignOptimallyFromPrev: true
        });
      } else if (preset === 'RIPPLE_SNAP') {
        const brassIds = show.performers
          .filter((p) => p.section === 'BRASS')
          .map((p) => p.id);
        const win = getTransitionWindow(show, activeSetIndex);
        const maxCts = win && win.counts > 0 ? win.counts : 16;
        handleRunLens({
          kind: 'STAMP_BODY_CUE',
          setIndex: activeSetIndex,
          performerIds: brassIds,
          startCount: 0,
          endCount: maxCts,
          rippleDelayCounts: 0.4,
          rippleOrder: 'LEFT_TO_RIGHT',
          posture: 'LUNGE_LEFT',
          hornCarriage: 'HORNS_SNAP_UP',
          upperFacing: 'PRESS_BOX',
          label: 'Brass Lunge + Horn-Snap Ripple'
        });
      } else {
        handleRunLens({
          kind: 'COMPACT_ACOUSTIC',
          setIndex: activeSetIndex,
          maxDelayMs: 55,
          targetSections: ['BRASS', 'BATTERY', 'GUARD']
        });
      }
    },
    [activeSetIndex, show, lockSections, field, handleRunLens]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        intentInputRef.current?.focus();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === '1') {
        setCameraPreset('TOP_2D');
      } else if (e.key === '2') {
        setCameraPreset('HIGH_CAM_JUDGE');
      } else if (e.key === '3') {
        setCameraPreset('BOX_SCAFFOLD');
      } else if (e.key === '4') {
        setCameraPreset('PERFORMER_POV');
      } else if (e.key === '[') {
        setIsPlaying(false);
        setActiveSetIndex((s) => Math.max(0, s - 1));
        setCountOffset(0);
      } else if (e.key === ']') {
        setIsPlaying(false);
        setActiveSetIndex((s) => Math.min(show.sets.length - 1, s + 1));
        setCountOffset(0);
      } else if (e.key === 'Escape') {
        setDotBookOpen(false);
        setImportModalOpen(false);
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show.sets.length]);

  const handleUpdateSetPositions = useCallback(
    (setIndex: number, nextPositions: Record<string, PerformerDot>) => {
      setShow((prev) => ({
        ...prev,
        sets: prev.sets.map((s, idx) =>
          idx === setIndex ? { ...s, positions: nextPositions } : s
        )
      }));
    },
    []
  );

  const handleAddPinAt = useCallback(
    (
      xMeters: number,
      yMeters: number,
      category: PinCategory,
      message: string,
      performerId?: string
    ) => {
      const interp = interpolateShowAtPosition(show, activeSetIndex, countOffset, field);
      const perfState = performerId ? interp[performerId] : undefined;
      const stepLabel =
        perfState && perfState.isMoving
          ? `${formatSteps(perfState.stepsPerFive)}-to-5`
          : 'Hold';

      const newPin: FieldPin = {
        id: `pin-${Date.now().toString(36)}`,
        setId: show.sets[activeSetIndex]!.id,
        countOffset: Math.round(countOffset * 10) / 10,
        performerId,
        xMeters,
        yMeters,
        authorName:
          collaboratorRole === 'DESIGNER'
            ? 'Elena Vance'
            : collaboratorRole === 'TECH'
              ? 'Maya Chen'
              : 'Jordan Reyes',
        authorRole: collaboratorRole,
        category,
        status: 'OPEN',
        message,
        createdAtIso: new Date().toISOString(),
        telemetrySnapshot: {
          stepSizeLabel: stepLabel,
          speedMps: perfState ? Math.round(perfState.speedMps * 100) / 100 : 0,
          acousticDelayMs:
            Math.round(
              computeAcousticDelayMs({ xMeters, yMeters }, show.ambientTempCelsius) * 10
            ) / 10
        }
      };

      setShow((prev) => ({
        ...prev,
        pins: [newPin, ...prev.pins]
      }));
      setHighlightedPinId(newPin.id);
      setInspectorTab('COLLABORATE');
    },
    [show, activeSetIndex, countOffset, field, collaboratorRole]
  );

  const scoreClass =
    intelligence.cleanlinessScore >= 85
      ? 'score-good'
      : intelligence.cleanlinessScore >= 65
        ? 'score-warn'
        : 'score-bad';

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="brand-group">
          <div className="brand-mark">M</div>
          <div className="brand-titles">
            <div className="brand-name">
              <span>MERIDIAN V1</span>
              <span className={`score-pill ${scoreClass}`}>
                Score {intelligence.cleanlinessScore}/100
              </span>
            </div>
            <div className="show-subtitle">{show.title}</div>
          </div>
        </div>

        <div className="header-controls">
          <div className="control-group">
            <span className="control-label">Field</span>
            <select
              className="studio-select"
              aria-label="Primary Field Standard"
              value={show.fieldStandardId}
              onChange={(e) =>
                setShow((prev) => ({
                  ...prev,
                  fieldStandardId: e.target.value as FieldStandardId
                }))
              }
            >
              {FIELD_STANDARD_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.shortName}
                </option>
              ))}
            </select>
            <span className="control-label">Ghost</span>
            <select
              className="studio-select"
              aria-label="Venue Ghost Hash Overlay"
              value={show.comparisonFieldId ?? ''}
              onChange={(e) =>
                setShow((prev) => ({
                  ...prev,
                  comparisonFieldId: e.target.value
                    ? (e.target.value as FieldStandardId)
                    : undefined
                }))
              }
            >
              <option value="">Off</option>
              {FIELD_STANDARD_LIST.filter((f) => f.id !== show.fieldStandardId).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.shortName}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group" role="group" aria-label="Camera Presets">
            {(
              [
                ['TOP_2D', '2D Tactical'],
                ['HIGH_CAM_JUDGE', '3D Judge'],
                ['BOX_SCAFFOLD', '3D Box'],
                ['PERFORMER_POV', 'Performer POV']
              ] as Array<[CameraPresetId, string]>
            ).map(([presetId, label]) => (
              <button
                key={presetId}
                type="button"
                className={`seg-btn ${cameraPreset === presetId ? 'active' : ''}`}
                onClick={() => setCameraPreset(presetId)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="control-group">
            <span className="control-label">Role</span>
            <select
              className="studio-select"
              aria-label="Collaborator Role"
              value={collaboratorRole}
              onChange={(e) => setCollaboratorRole(e.target.value as CollaboratorRole)}
            >
              <option value="DESIGNER">Designer</option>
              <option value="TECH">Field Tech</option>
              <option value="PERFORMER">Performer</option>
            </select>
          </div>

          <button
            type="button"
            className="action-btn"
            onClick={() => setImportModalOpen(true)}
          >
            Import
          </button>
          <button
            type="button"
            className="action-btn primary"
            onClick={() => setDotBookOpen(true)}
          >
            Dot-Book
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => {
              const fresh = createDemoShow();
              audioTrackRef.current?.clear();
              setWaveformPeaks(null);
              setAudioTrackLabel(null);
              setAudioTrackMuted(false);
              setShow(fresh);
              setActiveSetIndex(3);
              setCountOffset(0);
              setSelectedIds(['B11']);
              setPovPerformerId('B11');
              setIsPlaying(false);
              setLastFeedback(null);
            }}
          >
            Reset Demo
          </button>
        </div>
      </header>

      <main className="studio-workspace">
        <div className="stage-column">
          <IntentCommandBar
            prompt={intentPrompt}
            onPromptChange={setIntentPrompt}
            lockSections={lockSections}
            onToggleLockSections={setLockSections}
            onSubmitPrompt={handleSubmitIntent}
            onRunQuickLens={handleQuickLens}
            lastFeedback={lastFeedback}
            inputRef={intentInputRef}
            canEdit={collaboratorRole === 'DESIGNER'}
          />

          <div className="stage-body">
            <aside className="tool-rail">
              <div>
                <div className="rail-section-title">Tools</div>
                <div className="rail-btn-grid">
                  {(
                    [
                      ['SELECT', 'Select / Box'],
                      ['MOVE', 'Drag Dots'],
                      ['CURVE', 'Curve Paths'],
                      ['PIN', 'Drop Pin']
                    ] as Array<[ViewportToolMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={`rail-btn ${toolMode === mode ? 'active' : ''}`}
                      onClick={() => setToolMode(mode)}
                    >
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="rail-section-title">Sections</div>
                <div className="rail-btn-grid">
                  {(
                    [
                      ['ALL', `All (${show.performers.length})`, '#f1f5f9'],
                      [
                        'BRASS',
                        `Brass (${show.performers.filter((p) => p.section === 'BRASS').length})`,
                        '#f59e0b'
                      ],
                      [
                        'BATTERY',
                        `Battery (${show.performers.filter((p) => p.section === 'BATTERY').length})`,
                        '#22d3ee'
                      ],
                      [
                        'PIT',
                        `Front Pit (${show.performers.filter((p) => p.section === 'PIT').length})`,
                        '#a78bfa'
                      ],
                      [
                        'GUARD',
                        `Guard (${show.performers.filter((p) => p.section === 'GUARD').length})`,
                        '#fb7185'
                      ]
                    ] as Array<[SectionId | 'ALL', string, string]>
                  ).map(([sec, label, dotColor]) => (
                    <button
                      key={sec}
                      type="button"
                      className={`rail-btn ${sectionFilter === sec ? 'active' : ''}`}
                      onClick={() => setSectionFilter(sec)}
                    >
                      <span>{label}</span>
                      <span className="section-dot" style={{ background: dotColor }} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="rail-section-title">Overlays</div>
                {(
                  [
                    ['paths', 'Motion Paths'],
                    ['acousticRings', 'Acoustic Rings'],
                    ['collisions', 'Collision Halos'],
                    ['bodyVisuals', 'Body & Horn Cues'],
                    ['labels', 'Performer Labels'],
                    ['snapHalfStep', '0.5-Step Snap']
                  ] as Array<[keyof ViewportOverlays, string]>
                ).map(([key, label]) => (
                  <label key={key} className="toggle-item">
                    <input
                      type="checkbox"
                      checked={overlays[key]}
                      onChange={(e) =>
                        setOverlays((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </aside>

            <FieldViewport
              show={show}
              activeSetIndex={activeSetIndex}
              countOffset={countOffset}
              cameraPreset={cameraPreset}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              toolMode={toolMode}
              sectionFilter={sectionFilter}
              overlays={overlays}
              collaboratorRole={collaboratorRole}
              intelligence={intelligence}
              onUpdateSetPositions={handleUpdateSetPositions}
              onDropPin={(x, y, perfId) => {
                handleAddPinAt(
                  x,
                  y,
                  'SIGHTLINE',
                  `Rehearsal pin placed at (${x.toFixed(1)}m, ${y.toFixed(1)}m).`,
                  perfId
                );
                setToolMode('SELECT');
              }}
              highlightedPinId={highlightedPinId}
              povPerformerId={povPerformerId}
              onCyclePovPerformer={(delta) => {
                const idx = show.performers.findIndex((p) => p.id === povPerformerId);
                const nextIdx =
                  (idx + delta + show.performers.length) % show.performers.length;
                setPovPerformerId(show.performers[nextIdx]!.id);
              }}
            />
          </div>
        </div>

        <InspectorSidebar
          show={show}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          activeSetIndex={activeSetIndex}
          countOffset={countOffset}
          selectedIds={selectedIds}
          collaboratorRole={collaboratorRole}
          intelligence={intelligence}
          onTempChange={(tempC) =>
            setShow((prev) => ({ ...prev, ambientTempCelsius: tempC }))
          }
          onJumpToMoment={(setIdx, cOff, focusIds, pinId) => {
            setIsPlaying(false);
            setActiveSetIndex(setIdx);
            setCountOffset(cOff);
            if (focusIds && focusIds.length > 0) setSelectedIds(focusIds);
            if (pinId) setHighlightedPinId(pinId);
          }}
          onRunLens={handleRunLens}
          onRevertReceipt={(receiptId) => {
            const res = revertHarnessReceipt(show, receiptId);
            if (res.ok) {
              setShow(res.updatedShow);
              setLastFeedback({
                ok: true,
                text: 'Reverted show coordinates cleanly to pre-harness snapshot.'
              });
            }
          }}
          onDeleteBodyCue={(setIdx, cueId) =>
            setShow((prev) => ({
              ...prev,
              sets: prev.sets.map((s, idx) =>
                idx === setIdx
                  ? {
                      ...s,
                      bodyCues: (s.bodyCues ?? []).filter((c) => c.id !== cueId)
                    }
                  : s
              )
            }))
          }
          onAddPin={(cat, msg, perfId) => {
            const setPos = show.sets[activeSetIndex]?.positions;
            const dot = perfId && setPos ? setPos[perfId] : undefined;
            handleAddPinAt(
              dot?.xMeters ?? 0,
              dot?.yMeters ?? field.frontHashYMeters ?? 16,
              cat,
              msg,
              perfId
            );
          }}
          onCyclePinStatus={(pinId, nextStatus) =>
            setShow((prev) => ({
              ...prev,
              pins: prev.pins.map((p) =>
                p.id === pinId ? { ...p, status: nextStatus } : p
              )
            }))
          }
          onExportTriageMarkdown={() => {
            const md = exportRehearsalTriageMarkdown(show, intelligence);
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${show.id}-triage.md`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onUpdateSetMeta={(setIdx, patch) =>
            setShow((prev) => ({
              ...prev,
              sets: prev.sets.map((s, idx) => (idx === setIdx ? { ...s, ...patch } : s))
            }))
          }
          onMirrorSelected={() => {
            if (selectedIds.length === 0) return;
            const cur = show.sets[activeSetIndex]?.positions;
            if (!cur) return;
            handleUpdateSetPositions(
              activeSetIndex,
              mirrorDotsAcrossCenter(cur, selectedIds, field)
            );
          }}
          onRotateSelected={(angleDeg) => {
            if (selectedIds.length < 2) return;
            const cur = show.sets[activeSetIndex]?.positions;
            if (!cur) return;
            const pivot = computeSelectionCentroid(cur, selectedIds);
            handleUpdateSetPositions(
              activeSetIndex,
              rotateDotsAround(
                cur,
                selectedIds,
                pivot,
                (angleDeg * Math.PI) / 180,
                field
              )
            );
          }}
          onDuplicateSet={() => {
            const source = show.sets[activeSetIndex];
            if (!source) return;
            const copy: DrillSet = {
              ...source,
              id: `set-${Date.now().toString(36)}`,
              name: `${source.name} (Hold)`,
              counts: 8,
              positions: Object.fromEntries(
                Object.entries(source.positions).map(([k, v]) => [k, { ...v, curveOffsetMeters: 0 }])
              )
            };
            setShow((prev) => ({
              ...prev,
              sets: [
                ...prev.sets.slice(0, activeSetIndex + 1),
                copy,
                ...prev.sets.slice(activeSetIndex + 1)
              ]
            }));
            setActiveSetIndex(activeSetIndex + 1);
            setCountOffset(0);
          }}
        />
      </main>

      <TimelineBar
        show={show}
        activeSetIndex={activeSetIndex}
        countOffset={countOffset}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        audioEnabled={audioEnabled}
        waveformPeaks={waveformPeaks}
        audioTrackLabel={audioTrackLabel}
        audioTrackMuted={audioTrackMuted}
        focusedPerformerId={selectedIds[0] ?? show.performers[0]!.id}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStepCount={(delta) => {
          setIsPlaying(false);
          const total = getTotalShowCounts(show);
          const cur = getSetStartGlobalCount(show, activeSetIndex) + countOffset;
          const next = Math.min(total, Math.max(0, cur + delta));
          const pos = globalCountToSetPosition(show, next);
          setActiveSetIndex(pos.setIndex);
          setCountOffset(pos.countOffset);
        }}
        onSelectSet={(setIdx) => {
          setIsPlaying(false);
          setActiveSetIndex(setIdx);
          setCountOffset(0);
        }}
        onJumpToCountOffset={(cOff) => {
          setIsPlaying(false);
          setCountOffset(cOff);
        }}
        onScrubGlobalCount={(gCount) => {
          setIsPlaying(false);
          const pos = globalCountToSetPosition(show, gCount);
          setActiveSetIndex(pos.setIndex);
          setCountOffset(pos.countOffset);
        }}
        onChangeSpeed={setPlaybackSpeed}
        onToggleAudio={() => setAudioEnabled((a) => !a)}
        onSynthDemoAudio={handleSynthDemoAudio}
        onToggleMuteTrack={() => setAudioTrackMuted((m) => !m)}
        onOpenImportModal={() => setImportModalOpen(true)}
      />

      {dotBookOpen && (
        <DotBookModal
          show={show}
          initialPerformerId={selectedIds[0] ?? show.performers[0]!.id}
          onClose={() => setDotBookOpen(false)}
          onImportShowBundle={(imported) => {
            setShow(imported);
            setActiveSetIndex(0);
            setCountOffset(0);
            setIsPlaying(false);
          }}
        />
      )}

      {importModalOpen && (
        <ImportModal
          activeShow={show}
          onClose={() => setImportModalOpen(false)}
          onLoadAudioBytes={handleLoadAudioBytes}
          onApplyImportedShow={(imported) => {
            setIsPlaying(false);
            if (audioTrackRef.current?.getSourceKind() === 'SYNTH_DEMO') {
              audioTrackRef.current.clear();
              setWaveformPeaks(null);
              setAudioTrackLabel(null);
            }
            const firstPerfId = imported.performers[0]?.id ?? 'B1';
            const nextSelected = selectedIds.filter((id) =>
              imported.performers.some((p) => p.id === id)
            );
            setSelectedIds(nextSelected.length > 0 ? nextSelected : [firstPerfId]);
            setPovPerformerId(firstPerfId);
            setShow(imported);
            setActiveSetIndex(0);
            setCountOffset(0);
            setLastFeedback({
              ok: true,
              text: `Imported "${imported.title}" (${imported.performers.length} performers across ${imported.sets.length} sets).`
            });
          }}
        />
      )}
    </div>
  );
};
