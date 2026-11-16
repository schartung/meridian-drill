import React, { useMemo, useState } from 'react';
import {
  HORN_CARRIAGE_LIST,
  POSTURE_LIST,
  UPPER_FACING_LABELS
} from '../core/choreography.ts';
import { formatSteps } from '../core/coordinates.ts';
import { getFieldSpec } from '../core/fields.ts';
import {
  getTransitionWindow,
  interpolateShowAtPosition
} from '../core/interpolation.ts';
import {
  BodyPostureId,
  CollaboratorRole,
  DrillLensSpec,
  DrillSet,
  DrillShow,
  FormShape,
  HornCarriageId,
  PinCategory,
  PinStatus,
  RippleOrderMode,
  ShowIntelligenceReport,
  UpperFacingMode
} from '../core/types.ts';
import { MannequinPoseCard } from './MannequinPoseCard.tsx';

export type InspectorTabId =
  | 'INTELLIGENCE'
  | 'BODY'
  | 'LEDGER'
  | 'COLLABORATE'
  | 'SET_FORM';

interface InspectorSidebarProps {
  show: DrillShow;
  activeTab: InspectorTabId;
  onTabChange: (tab: InspectorTabId) => void;
  activeSetIndex: number;
  countOffset: number;
  selectedIds: string[];
  collaboratorRole: CollaboratorRole;
  intelligence: ShowIntelligenceReport;
  onTempChange: (tempC: number) => void;
  onJumpToMoment: (
    setIndex: number,
    countOffset: number,
    focusPerformerIds?: string[],
    highlightPinId?: string
  ) => void;
  onRunLens: (lens: DrillLensSpec) => void;
  onRevertReceipt: (receiptId: string) => void;
  onDeleteBodyCue: (setIndex: number, cueId: string) => void;
  onAddPin: (
    category: PinCategory,
    message: string,
    performerId?: string
  ) => void;
  onCyclePinStatus: (pinId: string, nextStatus: PinStatus) => void;
  onExportTriageMarkdown: () => void;
  onUpdateSetMeta: (setIndex: number, patch: Partial<DrillSet>) => void;
  onMirrorSelected: () => void;
  onRotateSelected: (angleDeg: number) => void;
  onDuplicateSet: () => void;
}

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  show,
  activeTab,
  onTabChange,
  activeSetIndex,
  countOffset,
  selectedIds,
  collaboratorRole,
  intelligence,
  onTempChange,
  onJumpToMoment,
  onRunLens,
  onRevertReceipt,
  onDeleteBodyCue,
  onAddPin,
  onCyclePinStatus,
  onExportTriageMarkdown,
  onUpdateSetMeta,
  onMirrorSelected,
  onRotateSelected,
  onDuplicateSet
}) => {
  const field = getFieldSpec(show.fieldStandardId);
  const activeSet = show.sets[activeSetIndex]!;
  const canEditDrill = collaboratorRole === 'DESIGNER';
  const activeWin = getTransitionWindow(show, activeSetIndex);
  const maxTransitionCounts = activeWin ? activeWin.counts : 0;

  // Body & Ripple Stamper local state
  const [bodyTargetGroup, setBodyTargetGroup] = useState<'SELECTED' | 'BRASS' | 'BATTERY' | 'GUARD' | 'PIT'>('BRASS');
  const [cueStartCount, setCueStartCount] = useState<number>(0);
  const [cueEndCount, setCueEndCount] = useState<number>(Math.max(4, maxTransitionCounts || 16));
  const [cuePosture, setCuePosture] = useState<BodyPostureId>('LUNGE_LEFT');
  const [cueHorn, setCueHorn] = useState<HornCarriageId>('HORNS_SNAP_UP');
  const [cueFacing, setCueFacing] = useState<UpperFacingMode>('PRESS_BOX');
  const [cueRippleDelay, setCueRippleDelay] = useState<number>(0.4);
  const [cueRippleOrder, setCueRippleOrder] = useState<RippleOrderMode>('LEFT_TO_RIGHT');
  const [cueVideoUrl, setCueVideoUrl] = useState<string>('');

  const interpolated = useMemo(
    () => interpolateShowAtPosition(show, activeSetIndex, countOffset, field),
    [show, activeSetIndex, countOffset, field]
  );
  const focusedId = selectedIds[0] ?? show.performers[0]!.id;
  const focusedPerformer =
    show.performers.find((p) => p.id === focusedId) ?? show.performers[0]!;
  const focusedState = interpolated[focusedPerformer.id];

  // Collaborate tab local state
  const [pinFilter, setPinFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [newPinCat, setNewPinCat] = useState<PinCategory>('COLLISION');
  const [newPinText, setNewPinText] = useState('');

  // Form builder state
  const [formShape, setFormShape] = useState<FormShape>('ARC');
  const [formTargetGroup, setFormTargetGroup] = useState<'SELECTED' | 'BRASS' | 'BATTERY' | 'GUARD'>('BRASS');
  const [formSpanM, setFormSpanM] = useState(28);
  const [formDepthM, setFormDepthM] = useState(-5);
  const [formBaseY, setFormBaseY] = useState(field.frontHashYMeters ?? 18);
  const [assignOpt, setAssignOpt] = useState(true);

  const performerLabel = (id: string) =>
    show.performers.find((p) => p.id === id)?.label ?? id;

  const filteredPins = show.pins.filter((p) => {
    if (pinFilter === 'OPEN') return p.status !== 'RESOLVED';
    if (pinFilter === 'RESOLVED') return p.status === 'RESOLVED';
    return true;
  });

  const handleStageForm = () => {
    const ids =
      formTargetGroup === 'SELECTED' && selectedIds.length > 0
        ? selectedIds
        : show.performers
            .filter((p) => p.section === (formTargetGroup === 'SELECTED' ? 'BRASS' : formTargetGroup))
            .map((p) => p.id);

    onRunLens({
      kind: 'STAGE_FORM',
      setIndex: activeSetIndex,
      performerIds: ids,
      shape: formShape,
      centerXMeters: 0,
      baseYMeters: formBaseY,
      spanMeters: formSpanM,
      depthMeters: formDepthM,
      assignOptimallyFromPrev: assignOpt
    });
  };

  const handleStampBodyCue = () => {
    const ids =
      bodyTargetGroup === 'SELECTED' && selectedIds.length > 0
        ? selectedIds
        : show.performers
            .filter(
              (p) =>
                p.section ===
                (bodyTargetGroup === 'SELECTED' ? 'BRASS' : bodyTargetGroup)
            )
            .map((p) => p.id);

    onRunLens({
      kind: 'STAMP_BODY_CUE',
      setIndex: activeSetIndex,
      performerIds: ids,
      startCount: Math.max(0, cueStartCount),
      endCount: Math.max(cueStartCount, cueEndCount),
      rippleDelayCounts: cueRippleDelay,
      rippleOrder: cueRippleOrder,
      posture: cuePosture,
      hornCarriage: cueHorn,
      upperFacing: cueFacing,
      videoRefUrl: cueVideoUrl.trim() || undefined
    });
  };

  return (
    <aside className="inspector-drawer">
      <div className="drawer-tabs">
        <button
          type="button"
          className={`drawer-tab ${activeTab === 'INTELLIGENCE' ? 'active' : ''}`}
          onClick={() => onTabChange('INTELLIGENCE')}
        >
          Physics ({intelligence.collisions.length + intelligence.strideAlerts.length + intelligence.bodyAlerts.length})
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === 'BODY' ? 'active' : ''}`}
          onClick={() => onTabChange('BODY')}
        >
          Body ({(activeSet.bodyCues ?? []).length})
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === 'LEDGER' ? 'active' : ''}`}
          onClick={() => onTabChange('LEDGER')}
        >
          Ledger ({show.harnessLedger.length})
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === 'COLLABORATE' ? 'active' : ''}`}
          onClick={() => onTabChange('COLLABORATE')}
        >
          Pins ({show.pins.filter((p) => p.status !== 'RESOLVED').length})
        </button>
        <button
          type="button"
          className={`drawer-tab ${activeTab === 'SET_FORM' ? 'active' : ''}`}
          onClick={() => onTabChange('SET_FORM')}
        >
          Set
        </button>
      </div>

      <div className="drawer-body">
        {activeTab === 'INTELLIGENCE' && (
          <>
            <div className="card">
              <div className="card-title">
                <span>Acoustic Phasing Radar</span>
                <span
                  className="mono"
                  style={{
                    color:
                      intelligence.acoustic.tearRisk === 'HIGH'
                        ? 'var(--accent-rose)'
                        : intelligence.acoustic.tearRisk === 'MODERATE'
                          ? 'var(--accent-amber)'
                          : 'var(--accent-emerald)'
                  }}
                >
                  {intelligence.acoustic.tearRisk} RISK
                </span>
              </div>
              <div className="metric-grid">
                <div className="metric-box">
                  <div className="metric-label">Pit-to-Back Lag</div>
                  <div className="metric-value">
                    {intelligence.acoustic.maxEnsembleDelayMs.toFixed(1)} ms
                  </div>
                </div>
                <div className="metric-box">
                  <div className="metric-label">Sound Velocity</div>
                  <div className="metric-value">
                    {intelligence.acoustic.speedOfSoundMps.toFixed(1)} m/s
                  </div>
                </div>
              </div>
              <div className="field-group">
                <label>
                  Ambient Stadium Temp: <strong className="mono">{show.ambientTempCelsius}°C</strong>{' '}
                  ({Math.round((show.ambientTempCelsius * 9) / 5 + 32)}°F)
                </label>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={show.ambientTempCelsius}
                  onChange={(e) => onTempChange(Number(e.target.value))}
                />
              </div>
              {intelligence.acoustic.maxEnsembleDelayMs > 65 && canEditDrill && (
                <button
                  type="button"
                  className="mini-btn accent"
                  onClick={() =>
                    onRunLens({
                      kind: 'COMPACT_ACOUSTIC',
                      setIndex: activeSetIndex,
                      maxDelayMs: 55,
                      targetSections: ['BRASS', 'BATTERY', 'GUARD']
                    })
                  }
                >
                  Compact Set {activeSetIndex + 1} Under 55 ms
                </button>
              )}
            </div>

            <div className="card">
              <div className="card-title">
                <span>Mid-Set Collision Radar</span>
                <span>{intelligence.collisions.length} found</span>
              </div>
              {intelligence.collisions.length === 0 ? (
                <div className="issue-body">
                  Zero sub-count collisions or equipment pinches across all transitions.
                </div>
              ) : (
                intelligence.collisions.slice(0, 8).map((col) => (
                  <div
                    key={col.id}
                    className={`issue-card ${col.severity === 'CRITICAL' ? 'critical' : 'warning'}`}
                  >
                    <div className="issue-header">
                      <span>
                        {col.severity === 'CRITICAL' ? 'COLLISION' : 'PINCH'}:{' '}
                        {performerLabel(col.performerAId)} &harr; {performerLabel(col.performerBId)}
                      </span>
                      <span className="mono">
                        Set {col.fromSetIndex + 1} ct {col.countOffset.toFixed(1)}
                      </span>
                    </div>
                    <div className="issue-body">
                      Min spacing {col.minDistanceMeters.toFixed(2)} m (clearance target{' '}
                      {col.requiredClearanceMeters.toFixed(2)} m)
                    </div>
                    <div className="issue-actions">
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() =>
                          onJumpToMoment(col.fromSetIndex, col.countOffset, [
                            col.performerAId,
                            col.performerBId
                          ])
                        }
                      >
                        Inspect Count
                      </button>
                      {canEditDrill && (
                        <button
                          type="button"
                          className="mini-btn accent"
                          onClick={() =>
                            onRunLens({
                              kind: 'DEFLECT_COLLISIONS',
                              fromSetIndex: col.fromSetIndex,
                              minClearanceMeters: 1.25
                            })
                          }
                        >
                          Auto-Curve Lane
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <div className="card-title">
                <span>Stride &amp; Whiplash Alerts</span>
                <span>
                  {intelligence.strideAlerts.length + intelligence.whiplashAlerts.length}
                </span>
              </div>
              {intelligence.strideAlerts.length === 0 &&
              intelligence.whiplashAlerts.length === 0 ? (
                <div className="issue-body">
                  All transitions sit comfortably within safe 6-to-5 or smaller stride bounds.
                </div>
              ) : (
                <>
                  {intelligence.strideAlerts.slice(0, 6).map((st) => (
                    <div
                      key={st.id}
                      className={`issue-card ${st.severity === 'CRITICAL' ? 'critical' : 'warning'}`}
                    >
                      <div className="issue-header">
                        <span>
                          {performerLabel(st.performerId)} Stride:{' '}
                          {formatSteps(st.stepsPerFive)}-to-5
                        </span>
                        <span className="mono">
                          Set {st.fromSetIndex + 1}&rarr;{st.toSetIndex + 1}
                        </span>
                      </div>
                      <div className="issue-body">
                        {st.arcLengthMeters.toFixed(1)} m in {st.counts} cts ({st.speedMps.toFixed(2)}{' '}
                        m/s)
                      </div>
                      <div className="issue-actions">
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() =>
                            onJumpToMoment(st.fromSetIndex, st.counts * 0.5, [st.performerId])
                          }
                        >
                          Inspect
                        </button>
                        {canEditDrill && (
                          <button
                            type="button"
                            className="mini-btn accent"
                            onClick={() =>
                              onRunLens({
                                kind: 'OPTIMIZE_ASSIGNMENT',
                                fromSetIndex: st.fromSetIndex,
                                lockSections: true,
                                stridePower: 2.2
                              })
                            }
                          >
                            Optimize Slots
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {intelligence.whiplashAlerts.slice(0, 4).map((w) => (
                    <div key={w.id} className="issue-card warning">
                      <div className="issue-header">
                        <span>
                          {performerLabel(w.performerId)} Whiplash ({w.turnAngleDeg.toFixed(0)}°)
                        </span>
                        <span className="mono">Set {w.setIndex + 1}</span>
                      </div>
                      <div className="issue-body">
                        High-momentum turn: {w.incomingSpeedMps.toFixed(2)} &rarr;{' '}
                        {w.outgoingSpeedMps.toFixed(2)} m/s
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {intelligence.bodyAlerts.length > 0 && (
              <div className="card">
                <div className="card-title">
                  <span>Body Transition Hazards</span>
                  <span>{intelligence.bodyAlerts.length}</span>
                </div>
                {intelligence.bodyAlerts.slice(0, 6).map((ba) => (
                  <div
                    key={ba.id}
                    className={`issue-card ${ba.severity === 'CRITICAL' ? 'critical' : 'warning'}`}
                  >
                    <div className="issue-header">
                      <span>{performerLabel(ba.performerId)} Kneel-to-Move</span>
                      <span className="mono">
                        Set {ba.fromSetIndex + 1}&rarr;{ba.toSetIndex + 1}
                      </span>
                    </div>
                    <div className="issue-body">{ba.message}</div>
                    <div className="issue-actions">
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() =>
                          onJumpToMoment(ba.fromSetIndex, 0, [ba.performerId])
                        }
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'BODY' && (
          <>
            {focusedState && (
              <MannequinPoseCard
                performer={focusedPerformer}
                state={focusedState}
                setName={activeSet.name}
                countOffset={countOffset}
                maxCounts={maxTransitionCounts}
              />
            )}

            <div className="card">
              <div className="card-title">
                <span>Choreography &amp; Ripple Stamper</span>
                <span className="mono">Set {activeSetIndex + 1}</span>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Performers</label>
                  <select
                    className="studio-select"
                    value={bodyTargetGroup}
                    onChange={(e) =>
                      setBodyTargetGroup(
                        e.target.value as 'SELECTED' | 'BRASS' | 'BATTERY' | 'GUARD' | 'PIT'
                      )
                    }
                  >
                    <option value="SELECTED">Selected ({selectedIds.length})</option>
                    <option value="BRASS">All Brass (24)</option>
                    <option value="BATTERY">All Battery (14)</option>
                    <option value="GUARD">All Guard (16)</option>
                    <option value="PIT">Front Pit (10)</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>Posture</label>
                  <select
                    className="studio-select"
                    value={cuePosture}
                    onChange={(e) => setCuePosture(e.target.value as BodyPostureId)}
                  >
                    {POSTURE_LIST.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Horn / Equipment</label>
                  <select
                    className="studio-select"
                    value={cueHorn}
                    onChange={(e) => setCueHorn(e.target.value as HornCarriageId)}
                  >
                    {HORN_CARRIAGE_LIST.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label>Upper-Body Facing</label>
                  <select
                    className="studio-select"
                    value={cueFacing}
                    onChange={(e) => setCueFacing(e.target.value as UpperFacingMode)}
                  >
                    {(Object.keys(UPPER_FACING_LABELS) as UpperFacingMode[]).map((k) => (
                      <option key={k} value={k}>
                        {UPPER_FACING_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Start Count</label>
                  <input
                    type="number"
                    min={0}
                    max={64}
                    step={0.5}
                    className="studio-input"
                    value={cueStartCount}
                    onChange={(e) => setCueStartCount(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="field-group">
                  <label>End Count</label>
                  <input
                    type="number"
                    min={0}
                    max={64}
                    step={0.5}
                    className="studio-input"
                    value={cueEndCount}
                    onChange={(e) => setCueEndCount(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Ripple Delay</label>
                  <select
                    className="studio-select"
                    value={cueRippleDelay}
                    onChange={(e) => setCueRippleDelay(Number(e.target.value))}
                  >
                    <option value={0}>Unison (0 ct)</option>
                    <option value={0.25}>Fast (0.25 ct/dot)</option>
                    <option value={0.4}>Standard (0.4 ct/dot)</option>
                    <option value={0.5}>Wave (0.5 ct/dot)</option>
                    <option value={1}>Slow (1.0 ct/dot)</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>Ripple Direction</label>
                  <select
                    className="studio-select"
                    value={cueRippleOrder}
                    onChange={(e) => setCueRippleOrder(e.target.value as RippleOrderMode)}
                  >
                    <option value="LEFT_TO_RIGHT">Left &rarr; Right (S1 to S2)</option>
                    <option value="RIGHT_TO_LEFT">Right &rarr; Left (S2 to S1)</option>
                    <option value="CENTER_OUT">Center &rarr; Out</option>
                    <option value="SELECTION_ORDER">Selection Order</option>
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label>Optional Rehearsal Video Link</label>
                <input
                  type="url"
                  className="studio-input"
                  placeholder="https://..."
                  value={cueVideoUrl}
                  onChange={(e) => setCueVideoUrl(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="mini-btn accent"
                disabled={!canEditDrill}
                onClick={handleStampBodyCue}
              >
                Stamp Movement Cue onto Set {activeSetIndex + 1}
              </button>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Active Set Body Cues</span>
                <span>{(activeSet.bodyCues ?? []).length}</span>
              </div>
              {(activeSet.bodyCues ?? []).length === 0 ? (
                <div className="issue-body">
                  No custom body cues on this set. Performers use baseline Upright Glide.
                </div>
              ) : (
                (activeSet.bodyCues ?? []).map((cue) => (
                  <div key={cue.id} className="issue-card resolved">
                    <div className="issue-header">
                      <span>{cue.label}</span>
                      <span className="mono">
                        cts {cue.startCount}-{cue.endCount}
                      </span>
                    </div>
                    <div className="issue-body">
                      {cue.targetPerformerIds.length} performers ·{' '}
                      {cue.rippleDelayCounts > 0
                        ? `+${cue.rippleDelayCounts}ct ripple`
                        : 'Unison'}{' '}
                      · {UPPER_FACING_LABELS[cue.upperFacing]}
                    </div>
                    <div className="issue-actions">
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() =>
                          onJumpToMoment(
                            activeSetIndex,
                            cue.startCount,
                            [cue.targetPerformerIds[0]!]
                          )
                        }
                      >
                        Jump to Cue
                      </button>
                      {canEditDrill && (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => onDeleteBodyCue(activeSetIndex, cue.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'LEDGER' && (
          <div className="card">
            <div className="card-title">
              <span>Materialized Harness Receipts</span>
              <span>{show.harnessLedger.length} runs</span>
            </div>
            {show.harnessLedger.length === 0 ? (
              <div className="issue-body">
                No AI Harness runs executed yet. Run any Intent Lens above or click a 1-click physics
                fix to inspect before/after receipts and lossless revert controls.
              </div>
            ) : (
              [...show.harnessLedger].reverse().map((rcpt) => (
                <div key={rcpt.id} className="issue-card resolved">
                  <div className="issue-header">
                    <span>{rcpt.lensSummary}</span>
                  </div>
                  <div className="issue-body mono" style={{ fontSize: 10.5 }}>
                    Digest #{rcpt.materializedInputDigest} · {rcpt.affectedPerformerIds.length}{' '}
                    performers updated
                  </div>
                  <div className="issue-body">
                    Collisions: <strong>{rcpt.beforeMetrics.collisionCount}</strong> &rarr;{' '}
                    <strong>{rcpt.afterMetrics.collisionCount}</strong> · Crossings:{' '}
                    <strong>{rcpt.beforeMetrics.crossingCount}</strong> &rarr;{' '}
                    <strong>{rcpt.afterMetrics.crossingCount}</strong> · Score:{' '}
                    <strong>{rcpt.beforeMetrics.cleanlinessScore}</strong> &rarr;{' '}
                    <strong>{rcpt.afterMetrics.cleanlinessScore}</strong>
                  </div>
                  {canEditDrill && (
                    <div className="issue-actions">
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => onRevertReceipt(rcpt.id)}
                      >
                        Revert to Pre-Run State
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'COLLABORATE' && (
          <>
            <div className="card">
              <div className="card-title">
                <span>Drop Pin on Active Set</span>
                <span className="mono">Set {activeSetIndex + 1}</span>
              </div>
              <div className="field-group">
                <label>Category</label>
                <select
                  className="studio-select"
                  value={newPinCat}
                  onChange={(e) => setNewPinCat(e.target.value as PinCategory)}
                >
                  <option value="COLLISION">Collision / Pinch</option>
                  <option value="STRIDE">Stride / Crossing</option>
                  <option value="SIGHTLINE">Sightline / Dress</option>
                  <option value="ACOUSTIC_PHASING">Acoustic Phasing</option>
                  <option value="HASH_SHIFT">Venue Hash Shift</option>
                </select>
              </div>
              <div className="field-group">
                <label>
                  Note ({selectedIds[0] ? `Attached to ${performerLabel(selectedIds[0])}` : 'Ensemble'}):
                </label>
                <textarea
                  className="studio-input"
                  rows={2}
                  value={newPinText}
                  onChange={(e) => setNewPinText(e.target.value)}
                  placeholder="Write actionable field feedback for rehearsal..."
                />
              </div>
              <div className="issue-actions">
                <button
                  type="button"
                  className="mini-btn accent"
                  onClick={() => {
                    if (!newPinText.trim()) return;
                    onAddPin(newPinCat, newPinText.trim(), selectedIds[0]);
                    setNewPinText('');
                  }}
                >
                  Post Rehearsal Pin
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={onExportTriageMarkdown}
                >
                  Export Triage (.md)
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Field Pin Feed</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['ALL', 'OPEN', 'RESOLVED'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`mini-btn ${pinFilter === f ? 'accent' : ''}`}
                      onClick={() => setPinFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {filteredPins.map((pin) => {
                const sIdx = Math.max(
                  0,
                  show.sets.findIndex((s) => s.id === pin.setId)
                );
                const nextStatus: PinStatus =
                  pin.status === 'OPEN'
                    ? 'TRIAGED'
                    : pin.status === 'TRIAGED'
                      ? 'RESOLVED'
                      : 'OPEN';
                return (
                  <div
                    key={pin.id}
                    className={`issue-card ${
                      pin.status === 'RESOLVED'
                        ? 'resolved'
                        : pin.status === 'TRIAGED'
                          ? 'warning'
                          : 'critical'
                    }`}
                  >
                    <div className="issue-header">
                      <span>
                        [{pin.status}] {pin.category}
                      </span>
                      <span className="mono">
                        Set {sIdx + 1} · ct {pin.countOffset}
                      </span>
                    </div>
                    <div className="issue-body">{pin.message}</div>
                    <div className="issue-body mono" style={{ fontSize: 10 }}>
                      {pin.authorName} ({pin.authorRole}) · {pin.telemetrySnapshot.stepSizeLabel} ·{' '}
                      {pin.telemetrySnapshot.acousticDelayMs}ms
                    </div>
                    <div className="issue-actions">
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() =>
                          onJumpToMoment(
                            sIdx,
                            pin.countOffset,
                            pin.performerId ? [pin.performerId] : undefined,
                            pin.id
                          )
                        }
                      >
                        Jump to Pin
                      </button>
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => onCyclePinStatus(pin.id, nextStatus)}
                      >
                        Mark {nextStatus}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'SET_FORM' && (
          <>
            <div className="card">
              <div className="card-title">
                <span>Active Set Properties</span>
                <span className="mono">#{activeSetIndex + 1}</span>
              </div>
              <div className="field-group">
                <label>Set Name</label>
                <input
                  className="studio-input"
                  value={activeSet.name}
                  disabled={!canEditDrill}
                  onChange={(e) => onUpdateSetMeta(activeSetIndex, { name: e.target.value })}
                />
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Rehearsal Mark</label>
                  <input
                    className="studio-input"
                    value={activeSet.rehearsalMark}
                    disabled={!canEditDrill}
                    onChange={(e) =>
                      onUpdateSetMeta(activeSetIndex, { rehearsalMark: e.target.value })
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Tempo (BPM)</label>
                  <input
                    className="studio-input"
                    type="number"
                    min={40}
                    max={240}
                    value={activeSet.tempoBpm}
                    disabled={!canEditDrill}
                    onChange={(e) =>
                      onUpdateSetMeta(activeSetIndex, {
                        tempoBpm: Math.max(40, Math.min(240, Number(e.target.value) || 120))
                      })
                    }
                  />
                </div>
              </div>
              {activeSetIndex > 0 && (
                <div className="field-group">
                  <label>Counts into Set</label>
                  <input
                    className="studio-input"
                    type="number"
                    min={1}
                    max={128}
                    value={activeSet.counts}
                    disabled={!canEditDrill}
                    onChange={(e) =>
                      onUpdateSetMeta(activeSetIndex, {
                        counts: Math.max(1, Math.min(128, Number(e.target.value) || 8))
                      })
                    }
                  />
                </div>
              )}
              <div className="issue-actions">
                <button
                  type="button"
                  className="mini-btn"
                  disabled={!canEditDrill}
                  onClick={onDuplicateSet}
                >
                  Duplicate Set After Current
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Parametric Form Builder</span>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Shape</label>
                  <select
                    className="studio-select"
                    value={formShape}
                    onChange={(e) => setFormShape(e.target.value as FormShape)}
                  >
                    <option value="ARC">Concert Arc</option>
                    <option value="COMPANY_FRONT">Company Front</option>
                    <option value="LINE">Straight Line</option>
                    <option value="WEDGE">V-Chevron Wedge</option>
                    <option value="BLOCK">Rectangular Block</option>
                    <option value="SPIRAL">Logarithmic Spiral</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>Performers</label>
                  <select
                    className="studio-select"
                    value={formTargetGroup}
                    onChange={(e) =>
                      setFormTargetGroup(
                        e.target.value as 'SELECTED' | 'BRASS' | 'BATTERY' | 'GUARD'
                      )
                    }
                  >
                    <option value="SELECTED">Selected ({selectedIds.length})</option>
                    <option value="BRASS">All Brass (24)</option>
                    <option value="BATTERY">All Battery (14)</option>
                    <option value="GUARD">All Guard (16)</option>
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="field-group">
                  <label>Span: {formSpanM} m</label>
                  <input
                    type="range"
                    min={6}
                    max={Math.round(field.widthMeters * 0.8)}
                    value={formSpanM}
                    onChange={(e) => setFormSpanM(Number(e.target.value))}
                  />
                </div>
                <div className="field-group">
                  <label>Arc / Wedge Depth: {formDepthM} m</label>
                  <input
                    type="range"
                    min={-10}
                    max={14}
                    value={formDepthM}
                    onChange={(e) => setFormDepthM(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="field-group">
                <label>Anchor Y (Backfield): {formBaseY.toFixed(1)} m</label>
                <input
                  type="range"
                  min={4}
                  max={Math.round(field.depthMeters - 4)}
                  step={0.5}
                  value={formBaseY}
                  onChange={(e) => setFormBaseY(Number(e.target.value))}
                />
              </div>
              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={assignOpt}
                  onChange={(e) => setAssignOpt(e.target.checked)}
                />
                Optimal Hungarian assignment from previous set
              </label>
              <button
                type="button"
                className="mini-btn accent"
                disabled={!canEditDrill}
                onClick={handleStageForm}
              >
                Stage Form onto Set {activeSetIndex + 1}
              </button>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Selection Transforms</span>
                <span>{selectedIds.length} selected</span>
              </div>
              <div className="issue-actions">
                <button
                  type="button"
                  className="mini-btn"
                  disabled={!canEditDrill || selectedIds.length === 0}
                  onClick={onMirrorSelected}
                >
                  Mirror Across 50
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={!canEditDrill || selectedIds.length < 2}
                  onClick={() => onRotateSelected(-15)}
                >
                  Rotate -15°
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={!canEditDrill || selectedIds.length < 2}
                  onClick={() => onRotateSelected(15)}
                >
                  Rotate +15°
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
