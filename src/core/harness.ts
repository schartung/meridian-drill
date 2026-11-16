import {
  formatEquipmentCoaching,
  orderPerformersForRipple,
  POSTURE_SPECS
} from './choreography.ts';
import { getFieldSpec } from './fields.ts';
import { clampPointToFieldEnvelope, generateFormByShape } from './forms.ts';
import { solveMinCostAssignment } from './hungarian.ts';
import {
  analyzeTransitionCollisions,
  DEFAULT_FOCAL_LISTENER,
  DEFAULT_PIT_REFERENCE,
  speedOfSoundMps,
  summarizeTransitionMetrics
} from './intelligence.ts';
import { getTransitionWindow } from './interpolation.ts';
import {
  BodyCue,
  BodyPostureId,
  CanonicalPoint,
  DrillLensSpec,
  DrillSet,
  DrillShow,
  FieldSpec,
  FormShape,
  HarnessRunReceipt,
  HornCarriageId,
  PerformerDot,
  RippleOrderMode,
  SectionId,
  UpperFacingMode
} from './types.ts';

export type HarnessResult =
  | { ok: true; updatedShow: DrillShow; receipt: HarnessRunReceipt }
  | { ok: false; code: 'PRECONDITION_FAILED'; error: string };

export type IntentParseResult =
  | { ok: true; lens: DrillLensSpec; explanation: string }
  | { ok: false; reason: string; suggestions: string[] };

function cloneSets(sets: DrillSet[]): DrillSet[] {
  return sets.map((set) => ({
    ...set,
    positions: Object.fromEntries(
      Object.entries(set.positions).map(([k, v]) => [k, { ...v }])
    ),
    bodyCues: set.bodyCues
      ? set.bodyCues.map((cue) => ({
          ...cue,
          targetPerformerIds: [...cue.targetPerformerIds]
        }))
      : undefined
  }));
}

function fnv1aDigest(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isWithinPlayableEnvelope(pt: CanonicalPoint, field: FieldSpec): boolean {
  const maxX = field.widthMeters / 2 + field.endzoneDepthMeters + 0.5;
  const minY = -field.pitDepthMeters - 0.5;
  const maxY = field.depthMeters + 2.5;
  return (
    Number.isFinite(pt.xMeters) &&
    Number.isFinite(pt.yMeters) &&
    Math.abs(pt.xMeters) <= maxX &&
    pt.yMeters >= minY &&
    pt.yMeters <= maxY
  );
}

function describeLens(show: DrillShow, lens: DrillLensSpec): string {
  switch (lens.kind) {
    case 'OPTIMIZE_ASSIGNMENT': {
      const fromName = show.sets[lens.fromSetIndex]?.name ?? `Set ${lens.fromSetIndex + 1}`;
      const toName = show.sets[lens.fromSetIndex + 1]?.name ?? `Set ${lens.fromSetIndex + 2}`;
      const lockStr = lens.lockSections ? 'section-locked' : 'global';
      return `Optimize ${lockStr} dot assignment (${fromName} -> ${toName})`;
    }
    case 'DEFLECT_COLLISIONS': {
      const fromName = show.sets[lens.fromSetIndex]?.name ?? `Set ${lens.fromSetIndex + 1}`;
      const toName = show.sets[lens.fromSetIndex + 1]?.name ?? `Set ${lens.fromSetIndex + 2}`;
      return `Deflect mid-set pass-through collisions (${fromName} -> ${toName})`;
    }
    case 'STAGE_FORM': {
      const setName = show.sets[lens.setIndex]?.name ?? `Set ${lens.setIndex + 1}`;
      return `Stage ${lens.shape} for ${lens.performerIds.length} performers on ${setName}`;
    }
    case 'COMPACT_ACOUSTIC': {
      const setName = show.sets[lens.setIndex]?.name ?? `Set ${lens.setIndex + 1}`;
      return `Compact ${lens.targetSections.join('/')} under ${lens.maxDelayMs}ms on ${setName}`;
    }
    case 'STAMP_BODY_CUE': {
      const setName = show.sets[lens.setIndex]?.name ?? `Set ${lens.setIndex + 1}`;
      const postureName = POSTURE_SPECS[lens.posture].label;
      const rippleNote =
        lens.rippleDelayCounts > 0
          ? ` (+${lens.rippleDelayCounts}ct ripple)`
          : '';
      return `Stamp ${postureName}${rippleNote} for ${lens.performerIds.length} performers on ${setName}`;
    }
  }
}

export function executeHarnessLens(
  show: DrillShow,
  lens: DrillLensSpec
): HarnessResult {
  const field = getFieldSpec(show.fieldStandardId);
  const workingSets = cloneSets(show.sets);
  const previousSetsSnapshot = cloneSets(show.sets);

  let anchorSetIndex = 0;
  let targetSetIndex: number | undefined;
  let affectedPerformerIds: string[] = [];

  if (lens.kind === 'OPTIMIZE_ASSIGNMENT') {
    const window = getTransitionWindow(show, lens.fromSetIndex);
    if (!window || window.counts <= 0) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: `Transition ${lens.fromSetIndex} -> ${lens.fromSetIndex + 1} is unavailable or has zero counts.`
      };
    }
    anchorSetIndex = lens.fromSetIndex;
    targetSetIndex = window.toSetIndex;
    const stridePower = lens.stridePower ?? 2.2;
    const fromSet = workingSets[window.fromSetIndex]!;
    const toSet = workingSets[window.toSetIndex]!;

    const groups: SectionId[][] = lens.lockSections
      ? [['BRASS'], ['BATTERY'], ['GUARD'], ['PIT']]
      : [['BRASS', 'BATTERY', 'GUARD', 'PIT']];

    const updatedPositions: Record<string, PerformerDot> = { ...toSet.positions };

    for (const allowedSections of groups) {
      const groupPerformers = show.performers.filter((p) =>
        allowedSections.includes(p.section)
      );
      if (groupPerformers.length === 0) continue;

      const sourceDots = groupPerformers.map((p) => fromSet.positions[p.id]);
      const targetSlots = groupPerformers.map((p) => toSet.positions[p.id]);
      if (sourceDots.some((d) => !d) || targetSlots.some((d) => !d)) {
        return {
          ok: false,
          code: 'PRECONDITION_FAILED',
          error: 'Missing performer coordinates in source or target set.'
        };
      }

      const costMatrix = sourceDots.map((src) =>
        targetSlots.map((slot) => {
          const dist = Math.hypot(
            slot!.xMeters - src!.xMeters,
            slot!.yMeters - src!.yMeters
          );
          return Math.pow(dist, stridePower);
        })
      );

      const { assignment } = solveMinCostAssignment(costMatrix);
      for (let i = 0; i < groupPerformers.length; i++) {
        const perf = groupPerformers[i]!;
        const slotDot = targetSlots[assignment[i]!]!;
        const origDot = toSet.positions[perf.id]!;
        if (
          Math.hypot(
            slotDot.xMeters - origDot.xMeters,
            slotDot.yMeters - origDot.yMeters
          ) > 1e-6
        ) {
          affectedPerformerIds.push(perf.id);
        }
        updatedPositions[perf.id] = {
          xMeters: slotDot.xMeters,
          yMeters: slotDot.yMeters,
          curveOffsetMeters: 0,
          focusTarget: slotDot.focusTarget
        };
      }
    }
    toSet.positions = updatedPositions;
  } else if (lens.kind === 'DEFLECT_COLLISIONS') {
    const window = getTransitionWindow(show, lens.fromSetIndex);
    if (!window || window.counts <= 0 || lens.minClearanceMeters <= 0) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: `Collision deflection requires a valid transition with positive counts and clearance.`
      };
    }
    anchorSetIndex = lens.fromSetIndex;
    targetSetIndex = window.toSetIndex;
    const toSet = workingSets[window.toSetIndex]!;
    const affectedSet = new Set<string>();

    const candidateOffsets: Array<[number, number]> = [
      [1.1, 1.1],
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.7, 0],
      [-1.7, 0],
      [0, 1.7],
      [0, -1.7],
      [1.8, 1.8],
      [-1.8, -1.8],
      [2.2, -2.2],
      [-2.2, 2.2],
      [2.6, 2.6],
      [-2.6, -2.6]
    ];

    for (let pass = 0; pass < 6; pass++) {
      const trialShow: DrillShow = { ...show, sets: workingSets };
      const issues = analyzeTransitionCollisions(trialShow, lens.fromSetIndex);
      if (issues.length === 0) break;

      let improved = false;
      for (const issue of issues) {
        const idA = issue.performerAId;
        const idB = issue.performerBId;
        const dotA = toSet.positions[idA];
        const dotB = toSet.positions[idB];
        if (!dotA || !dotB) continue;

        const baseOffA = dotA.curveOffsetMeters ?? 0;
        const baseOffB = dotB.curveOffsetMeters ?? 0;
        let bestScore = issues.length * 1000 - issue.minDistanceMeters;
        let bestPair: [number, number] | null = null;

        for (const [dA, dB] of candidateOffsets) {
          toSet.positions[idA] = { ...dotA, curveOffsetMeters: baseOffA + dA };
          toSet.positions[idB] = { ...dotB, curveOffsetMeters: baseOffB + dB };
          const nextIssues = analyzeTransitionCollisions(
            { ...show, sets: workingSets },
            lens.fromSetIndex
          );
          const pairStillColliding = nextIssues.find(
            (n) =>
              (n.performerAId === idA && n.performerBId === idB) ||
              (n.performerAId === idB && n.performerBId === idA)
          );
          const score =
            nextIssues.length * 1000 -
            (pairStillColliding ? pairStillColliding.minDistanceMeters : 50);
          if (score < bestScore) {
            bestScore = score;
            bestPair = [baseOffA + dA, baseOffB + dB];
          }
        }

        if (bestPair) {
          toSet.positions[idA] = { ...dotA, curveOffsetMeters: bestPair[0] };
          toSet.positions[idB] = { ...dotB, curveOffsetMeters: bestPair[1] };
          affectedSet.add(idA);
          affectedSet.add(idB);
          improved = true;
        } else {
          toSet.positions[idA] = dotA;
          toSet.positions[idB] = dotB;
        }
      }
      if (!improved) break;
    }

    affectedPerformerIds = [...affectedSet];
  } else if (lens.kind === 'STAGE_FORM') {
    if (lens.setIndex < 0 || lens.setIndex >= workingSets.length) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: `Set index ${lens.setIndex} is out of range.`
      };
    }
    if (lens.performerIds.length === 0 || lens.spanMeters < 0) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: 'Form staging requires at least one valid performer and non-negative span.'
      };
    }
    const validIds = new Set(show.performers.map((p) => p.id));
    for (const id of lens.performerIds) {
      if (!validIds.has(id)) {
        return {
          ok: false,
          code: 'PRECONDITION_FAILED',
          error: `Unknown performer ID in lens: ${id}`
        };
      }
    }

    const generated = generateFormByShape(
      lens.shape,
      lens.performerIds.length,
      lens.centerXMeters,
      lens.baseYMeters,
      lens.spanMeters,
      lens.depthMeters
    );

    for (const pt of generated) {
      if (!isWithinPlayableEnvelope(pt, field)) {
        return {
          ok: false,
          code: 'PRECONDITION_FAILED',
          error: `Generated form point (${pt.xMeters.toFixed(1)}m, ${pt.yMeters.toFixed(1)}m) exceeds ${field.shortName} stadium bounds.`
        };
      }
    }

    anchorSetIndex = Math.max(0, lens.setIndex - 1);
    targetSetIndex = lens.setIndex;
    const targetSet = workingSets[lens.setIndex]!;
    const prevSet = lens.setIndex > 0 ? workingSets[lens.setIndex - 1] : undefined;

    if (lens.assignOptimallyFromPrev && prevSet) {
      const costMatrix = lens.performerIds.map((id) => {
        const src = prevSet.positions[id] ?? targetSet.positions[id] ?? { xMeters: 0, yMeters: 0 };
        return generated.map((slot) => {
          const dist = Math.hypot(
            slot.xMeters - src.xMeters,
            slot.yMeters - src.yMeters
          );
          return Math.pow(dist, 2.2);
        });
      });
      const { assignment } = solveMinCostAssignment(costMatrix);
      for (let i = 0; i < lens.performerIds.length; i++) {
        const id = lens.performerIds[i]!;
        const pt = generated[assignment[i]!]!;
        targetSet.positions[id] = {
          ...(targetSet.positions[id] ?? {}),
          xMeters: pt.xMeters,
          yMeters: pt.yMeters,
          curveOffsetMeters: 0
        };
      }
    } else {
      for (let i = 0; i < lens.performerIds.length; i++) {
        const id = lens.performerIds[i]!;
        const pt = generated[i]!;
        targetSet.positions[id] = {
          ...(targetSet.positions[id] ?? {}),
          xMeters: pt.xMeters,
          yMeters: pt.yMeters,
          curveOffsetMeters: 0
        };
      }
    }
    affectedPerformerIds = [...lens.performerIds];
  } else if (lens.kind === 'COMPACT_ACOUSTIC') {
    if (lens.setIndex < 0 || lens.setIndex >= workingSets.length) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: `Set index ${lens.setIndex} is out of range.`
      };
    }
    if (lens.maxDelayMs < 15 || lens.targetSections.length === 0) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: 'Acoustic compaction requires maxDelayMs >= 15 and at least one target section.'
      };
    }

    anchorSetIndex = Math.max(0, lens.setIndex - 1);
    targetSetIndex = lens.setIndex;
    const targetSet = workingSets[lens.setIndex]!;
    const c = speedOfSoundMps(show.ambientTempCelsius);
    const pitBaseDist = Math.hypot(
      DEFAULT_PIT_REFERENCE.xMeters - DEFAULT_FOCAL_LISTENER.xMeters,
      DEFAULT_PIT_REFERENCE.yMeters - DEFAULT_FOCAL_LISTENER.yMeters
    );
    const maxRadiusFromFocal = pitBaseDist + (lens.maxDelayMs / 1000) * c - 0.15;

    for (const perf of show.performers) {
      if (!lens.targetSections.includes(perf.section)) continue;
      const dot = targetSet.positions[perf.id];
      if (!dot) continue;
      const vx = dot.xMeters - DEFAULT_FOCAL_LISTENER.xMeters;
      const vy = dot.yMeters - DEFAULT_FOCAL_LISTENER.yMeters;
      const r = Math.hypot(vx, vy);
      if (r > maxRadiusFromFocal && r > 1e-6) {
        const scale = maxRadiusFromFocal / r;
        const clamped = clampPointToFieldEnvelope(
          {
            xMeters: DEFAULT_FOCAL_LISTENER.xMeters + vx * scale,
            yMeters: DEFAULT_FOCAL_LISTENER.yMeters + vy * scale
          },
          field
        );
        targetSet.positions[perf.id] = {
          ...dot,
          xMeters: clamped.xMeters,
          yMeters: clamped.yMeters
        };
        affectedPerformerIds.push(perf.id);
      }
    }
  } else if (lens.kind === 'STAMP_BODY_CUE') {
    if (lens.setIndex < 0 || lens.setIndex >= workingSets.length) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: `Set index ${lens.setIndex} is out of range.`
      };
    }
    if (lens.performerIds.length === 0) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: 'Body cue requires at least one performer.'
      };
    }
    if (lens.startCount < 0 || lens.endCount < lens.startCount) {
      return {
        ok: false,
        code: 'PRECONDITION_FAILED',
        error: `Invalid count window [${lens.startCount}, ${lens.endCount}] for body cue.`
      };
    }

    const validIds = new Set(show.performers.map((p) => p.id));
    for (const id of lens.performerIds) {
      if (!validIds.has(id)) {
        return {
          ok: false,
          code: 'PRECONDITION_FAILED',
          error: `Unknown performer ID in body cue: ${id}`
        };
      }
    }

    anchorSetIndex = lens.setIndex;
    targetSetIndex =
      lens.setIndex < workingSets.length - 1 ? lens.setIndex + 1 : lens.setIndex;
    const targetSet = workingSets[lens.setIndex]!;
    const orderedIds = orderPerformersForRipple(
      lens.performerIds,
      targetSet.positions,
      lens.rippleOrder
    );

    const firstPerf = show.performers.find((p) => p.id === orderedIds[0]);
    const eq = formatEquipmentCoaching(
      firstPerf?.section ?? 'BRASS',
      lens.hornCarriage,
      lens.upperFacing
    );
    const postureSpec = POSTURE_SPECS[lens.posture];
    const cueLabel =
      lens.label?.trim() ||
      `${postureSpec.label}${lens.rippleDelayCounts > 0 ? ' Ripple' : ''}`;

    const newCue: BodyCue = {
      id: `cue-${Date.now().toString(36)}-${orderedIds.length}`,
      label: cueLabel,
      targetPerformerIds: orderedIds,
      startCount: lens.startCount,
      endCount: lens.endCount,
      rippleDelayCounts: Math.max(0, lens.rippleDelayCounts),
      posture: lens.posture,
      hornCarriage: lens.hornCarriage,
      upperFacing: lens.upperFacing,
      instruction: `${postureSpec.lowerBodyCoaching} ${eq.upperBodyCoaching}`,
      videoRefUrl: lens.videoRefUrl?.trim() || undefined
    };

    const existing = targetSet.bodyCues ?? [];
    const orderedSet = new Set(orderedIds);
    // Replace exact overlapping cues targeting the exact same count range and performers.
    const filtered = existing.filter((c) => {
      const sameWindow =
        Math.abs(c.startCount - newCue.startCount) < 1e-6 &&
        Math.abs(c.endCount - newCue.endCount) < 1e-6;
      if (!sameWindow) return true;
      const overlap = c.targetPerformerIds.some((id) => orderedSet.has(id));
      return !overlap;
    });

    targetSet.bodyCues = [...filtered, newCue];
    affectedPerformerIds = orderedIds;
  }

  const beforeMetrics = summarizeTransitionMetrics(
    show,
    anchorSetIndex,
    targetSetIndex
  );
  const updatedBaseShow: DrillShow = {
    ...show,
    sets: workingSets
  };
  const afterMetrics = summarizeTransitionMetrics(
    updatedBaseShow,
    anchorSetIndex,
    targetSetIndex
  );

  const materializedInputDigest = fnv1aDigest(
    JSON.stringify({
      lens,
      anchorPositions: previousSetsSnapshot[anchorSetIndex]?.positions ?? {},
      targetPositions:
        targetSetIndex !== undefined
          ? previousSetsSnapshot[targetSetIndex]?.positions ?? {}
          : {}
    })
  );

  const receipt: HarnessRunReceipt = {
    id: `rcpt-${Date.now().toString(36)}-${materializedInputDigest.slice(0, 4)}`,
    timestampIso: new Date().toISOString(),
    lensSummary: describeLens(show, lens),
    lensType: lens.kind,
    setId: show.sets[anchorSetIndex]!.id,
    targetSetId: targetSetIndex !== undefined ? show.sets[targetSetIndex]?.id : undefined,
    affectedPerformerIds,
    beforeMetrics,
    afterMetrics,
    materializedInputDigest,
    previousSetsSnapshot
  };

  return {
    ok: true,
    updatedShow: {
      ...updatedBaseShow,
      harnessLedger: [...show.harnessLedger, receipt]
    },
    receipt
  };
}

export function revertHarnessReceipt(
  show: DrillShow,
  receiptId: string
): { ok: true; updatedShow: DrillShow } | { ok: false; error: string } {
  const idx = show.harnessLedger.findIndex((r) => r.id === receiptId);
  if (idx < 0) {
    return { ok: false, error: `Harness receipt ${receiptId} not found.` };
  }
  const receipt = show.harnessLedger[idx]!;
  return {
    ok: true,
    updatedShow: {
      ...show,
      sets: cloneSets(receipt.previousSetsSnapshot),
      harnessLedger: show.harnessLedger.slice(0, idx)
    }
  };
}

export function parseNaturalLanguageIntent(
  promptRaw: string,
  show: DrillShow,
  activeSetIndex: number,
  selectedIds: string[]
): IntentParseResult {
  const prompt = promptRaw.trim().toLowerCase();
  if (!prompt) {
    return {
      ok: false,
      reason: 'Enter a staging, path, or acoustic instruction.',
      suggestions: [
        'Optimize dot assignment',
        'Curve pass-through collisions',
        'Stage brass arc on front hash',
        'Compact acoustic delay under 55ms'
      ]
    };
  }

  const field = getFieldSpec(show.fieldStandardId);
  const transitionIndex = Math.min(
    Math.max(0, activeSetIndex),
    Math.max(0, show.sets.length - 2)
  );

  // 1. Collision deflection / path smoothing
  if (
    prompt.includes('collision') ||
    prompt.includes('curve') ||
    prompt.includes('deflect') ||
    prompt.includes('pass-through') ||
    prompt.includes('pinch')
  ) {
    return {
      ok: true,
      lens: {
        kind: 'DEFLECT_COLLISIONS',
        fromSetIndex: transitionIndex,
        minClearanceMeters: 1.25
      },
      explanation: `Parsed DEFLECT_COLLISIONS lens for Set ${transitionIndex + 1} -> Set ${transitionIndex + 2}.`
    };
  }

  // 2. Assignment / Crossing / Stride Optimization
  if (
    prompt.includes('optim') ||
    prompt.includes('cross') ||
    prompt.includes('assign') ||
    prompt.includes('stride') ||
    prompt.includes('swap')
  ) {
    const unlockSections =
      prompt.includes('unlock') || prompt.includes('global') || prompt.includes('ignore section');
    return {
      ok: true,
      lens: {
        kind: 'OPTIMIZE_ASSIGNMENT',
        fromSetIndex: transitionIndex,
        lockSections: !unlockSections,
        stridePower: 2.2
      },
      explanation: `Parsed OPTIMIZE_ASSIGNMENT (${unlockSections ? 'global' : 'section-locked'}) for Set ${transitionIndex + 1} -> Set ${transitionIndex + 2}.`
    };
  }

  // 3. Acoustic phasing compaction
  if (
    prompt.includes('acoustic') ||
    prompt.includes('phasing') ||
    prompt.includes('delay') ||
    prompt.includes('compact') ||
    prompt.includes('tear')
  ) {
    const msMatch = prompt.match(/(\d{2,3})\s*ms/);
    const maxDelayMs = msMatch ? Math.min(120, Math.max(25, Number(msMatch[1]))) : 55;
    const sections: SectionId[] = prompt.includes('battery')
      ? ['BATTERY']
      : prompt.includes('brass')
        ? ['BRASS']
        : ['BRASS', 'BATTERY', 'GUARD'];
    return {
      ok: true,
      lens: {
        kind: 'COMPACT_ACOUSTIC',
        setIndex: activeSetIndex,
        maxDelayMs,
        targetSections: sections
      },
      explanation: `Parsed COMPACT_ACOUSTIC (<= ${maxDelayMs}ms) on Set ${activeSetIndex + 1}.`
    };
  }

  // 3.5 Body Choreography & Ripple Cues
  const bodyKeywordRegex =
    /(ripple|kneel|lunge|jazz\s*run|plie|contrapposto|bow\s*drop|horns?\s*up|horns?\s*snap|horns?\s*down|horns?\s*box|high\s*bell)/;
  if (bodyKeywordRegex.test(prompt)) {
    let targetIds = selectedIds;
    if (targetIds.length === 0) {
      if (prompt.includes('brass')) {
        targetIds = show.performers.filter((p) => p.section === 'BRASS').map((p) => p.id);
      } else if (prompt.includes('battery') || prompt.includes('percussion')) {
        targetIds = show.performers.filter((p) => p.section === 'BATTERY').map((p) => p.id);
      } else if (prompt.includes('guard')) {
        targetIds = show.performers.filter((p) => p.section === 'GUARD').map((p) => p.id);
      } else {
        targetIds = show.performers.filter((p) => p.section === 'BRASS').map((p) => p.id);
      }
    }

    let posture: BodyPostureId = 'UPRIGHT_GLIDE';
    if (prompt.includes('kneel')) posture = 'KNEEL_RIGHT';
    else if (prompt.includes('lunge right') || prompt.includes('right lunge'))
      posture = 'LUNGE_RIGHT';
    else if (prompt.includes('lunge')) posture = 'LUNGE_LEFT';
    else if (/jazz\s*run/.test(prompt)) posture = 'JAZZ_RUN';
    else if (prompt.includes('plie')) posture = 'HALF_TIME_PLIE';
    else if (prompt.includes('contrapposto') || prompt.includes('lean'))
      posture = 'CONTRAPPOSTO_LEAN';
    else if (prompt.includes('bow')) posture = 'BOW_DROP';

    let hornCarriage: HornCarriageId = 'HORNS_BOX';
    if (prompt.includes('high bell')) hornCarriage = 'HIGH_BELL_EXTENSION';
    else if (prompt.includes('snap') || prompt.includes('horns up'))
      hornCarriage = 'HORNS_SNAP_UP';
    else if (prompt.includes('horns down') || prompt.includes('down'))
      hornCarriage = 'HORNS_DOWN';
    else if (prompt.includes('carry')) hornCarriage = 'HORNS_CARRY';

    let upperFacing: UpperFacingMode = 'PRESS_BOX';
    if (prompt.includes('backfield')) upperFacing = 'BACKFIELD';
    else if (prompt.includes('podium')) upperFacing = 'PODIUM_50';
    else if (prompt.includes('travel')) upperFacing = 'TRAVEL';
    else if (prompt.includes('side 1')) upperFacing = 'SIDE_1';
    else if (prompt.includes('side 2')) upperFacing = 'SIDE_2';

    let rippleOrder: RippleOrderMode = 'LEFT_TO_RIGHT';
    if (prompt.includes('right to left') || prompt.includes('side 2 to side 1')) {
      rippleOrder = 'RIGHT_TO_LEFT';
    } else if (prompt.includes('center out')) {
      rippleOrder = 'CENTER_OUT';
    }

    const nextWin = getTransitionWindow(show, activeSetIndex);
    const maxCts = nextWin && nextWin.counts > 0 ? nextWin.counts : 16;
    const rippleDelayCounts = prompt.includes('ripple') ? 0.4 : 0;

    return {
      ok: true,
      lens: {
        kind: 'STAMP_BODY_CUE',
        setIndex: activeSetIndex,
        performerIds: targetIds,
        startCount: 0,
        endCount: maxCts,
        rippleDelayCounts,
        rippleOrder,
        posture,
        hornCarriage,
        upperFacing
      },
      explanation: `Parsed STAMP_BODY_CUE (${POSTURE_SPECS[posture].label}) for ${targetIds.length} performers on Set ${activeSetIndex + 1}.`
    };
  }

  // 4. Parametric Form Staging
  const shapeMap: Array<[RegExp, FormShape]> = [
    [/company\s*front/, 'COMPANY_FRONT'],
    [/wedge|chevron/, 'WEDGE'],
    [/spiral/, 'SPIRAL'],
    [/block/, 'BLOCK'],
    [/arc|bow|curve/, 'ARC'],
    [/line/, 'LINE']
  ];
  const matchedShape = shapeMap.find(([re]) => re.test(prompt))?.[1];
  if (matchedShape) {
    let targetIds = selectedIds;
    if (targetIds.length === 0) {
      if (prompt.includes('brass')) {
        targetIds = show.performers.filter((p) => p.section === 'BRASS').map((p) => p.id);
      } else if (prompt.includes('battery') || prompt.includes('percussion')) {
        targetIds = show.performers.filter((p) => p.section === 'BATTERY').map((p) => p.id);
      } else if (prompt.includes('guard')) {
        targetIds = show.performers.filter((p) => p.section === 'GUARD').map((p) => p.id);
      } else {
        targetIds = show.performers.filter((p) => p.section !== 'PIT').map((p) => p.id);
      }
    }

    let baseY = field.frontHashYMeters ?? field.depthMeters * 0.4;
    if (prompt.includes('back hash') || prompt.includes('bh')) {
      baseY = field.backHashYMeters ?? field.depthMeters * 0.65;
    } else if (prompt.includes('front sideline') || prompt.includes('fsl')) {
      baseY = 5.0;
    }

    const spanMeters =
      field.id === 'JMBA_30M' ? 20.0 : matchedShape === 'COMPANY_FRONT' ? 36.576 : 27.432;
    const depthMeters = matchedShape === 'ARC' ? -5.0 : 7.0;

    return {
      ok: true,
      lens: {
        kind: 'STAGE_FORM',
        setIndex: activeSetIndex,
        performerIds: targetIds,
        shape: matchedShape,
        centerXMeters: 0,
        baseYMeters: baseY,
        spanMeters,
        depthMeters,
        assignOptimallyFromPrev: true
      },
      explanation: `Parsed STAGE_FORM (${matchedShape}) for ${targetIds.length} performers on Set ${activeSetIndex + 1}.`
    };
  }

  return {
    ok: false,
    reason: `Could not map "${promptRaw}" to a bounded spatial lens.`,
    suggestions: [
      'Optimize dot assignment',
      'Curve pass-through collisions',
      'Stage brass arc on front hash',
      'Stage company front on front hash',
      'Compact acoustic delay under 55ms'
    ]
  };
}
