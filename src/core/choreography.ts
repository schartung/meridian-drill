import {
  BodyCue,
  BodyPostureId,
  CanonicalPoint,
  DrillSet,
  HornCarriageId,
  Performer,
  PerformerDot,
  ResolvedBodyState,
  RippleOrderMode,
  SectionId,
  UpperFacingMode
} from './types.ts';

export interface PostureSpec {
  id: BodyPostureId;
  label: string;
  shortCode: string;
  markerShape2d: 'CIRCLE' | 'CAPSULE' | 'DIAMOND' | 'CHEVRON';
  elevationMeters: number;
  leanXMeters: number;
  leanYMeters: number;
  lowerBodyCoaching: string;
}

export interface HornCarriageSpec {
  id: HornCarriageId;
  label: string;
  angleDeg: number;
}

export const POSTURE_SPECS: Record<BodyPostureId, PostureSpec> = {
  UPRIGHT_GLIDE: {
    id: 'UPRIGHT_GLIDE',
    label: 'Upright Glide',
    shortCode: 'GLD',
    markerShape2d: 'CIRCLE',
    elevationMeters: 1.72,
    leanXMeters: 0,
    leanYMeters: 0,
    lowerBodyCoaching: 'Roll heel-to-toe with straight knees and lifted ribcage; keep center of gravity steady.'
  },
  JAZZ_RUN: {
    id: 'JAZZ_RUN',
    label: 'Jazz Run',
    shortCode: 'JZZ',
    markerShape2d: 'CHEVRON',
    elevationMeters: 1.62,
    leanXMeters: 0,
    leanYMeters: -0.14,
    lowerBodyCoaching: 'Low-impact athletic knee drive, soft toe-ball-heel foot strike, slight forward chest angle.'
  },
  HALF_TIME_PLIE: {
    id: 'HALF_TIME_PLIE',
    label: 'Half-Time Plie',
    shortCode: 'PLI',
    markerShape2d: 'CAPSULE',
    elevationMeters: 1.48,
    leanXMeters: 0,
    leanYMeters: 0,
    lowerBodyCoaching: 'Wide 2nd-position turnout, track knees directly over second toes, sink hips evenly.'
  },
  LUNGE_LEFT: {
    id: 'LUNGE_LEFT',
    label: 'Lunge Left',
    shortCode: 'LN-L',
    markerShape2d: 'CAPSULE',
    elevationMeters: 1.44,
    leanXMeters: -0.34,
    leanYMeters: 0,
    lowerBodyCoaching: 'Plant wide left foot and bend left knee 45 deg; extend right leg straight and keep spine stacked.'
  },
  LUNGE_RIGHT: {
    id: 'LUNGE_RIGHT',
    label: 'Lunge Right',
    shortCode: 'LN-R',
    markerShape2d: 'CAPSULE',
    elevationMeters: 1.44,
    leanXMeters: 0.34,
    leanYMeters: 0,
    lowerBodyCoaching: 'Plant wide right foot and bend right knee 45 deg; extend left leg straight and anchor back heel.'
  },
  CONTRAPPOSTO_LEAN: {
    id: 'CONTRAPPOSTO_LEAN',
    label: 'Contrapposto Lean',
    shortCode: 'CTRP',
    markerShape2d: 'CAPSULE',
    elevationMeters: 1.64,
    leanXMeters: 0.24,
    leanYMeters: -0.1,
    lowerBodyCoaching: 'Shift 80% weight onto weighted leg, release free heel, and counter-tilt shoulders diagonally.'
  },
  KNEEL_RIGHT: {
    id: 'KNEEL_RIGHT',
    label: 'Kneel (Right Knee)',
    shortCode: 'KNL',
    markerShape2d: 'DIAMOND',
    elevationMeters: 1.05,
    leanXMeters: 0,
    leanYMeters: -0.08,
    lowerBodyCoaching: 'Lower softly onto right shin and tucked toe; keep left knee stacked above left ankle at 90 deg.'
  },
  BOW_DROP: {
    id: 'BOW_DROP',
    label: 'Forward Bow Drop',
    shortCode: 'BOW',
    markerShape2d: 'DIAMOND',
    elevationMeters: 1.22,
    leanXMeters: 0,
    leanYMeters: -0.32,
    lowerBodyCoaching: 'Hinge cleanly from hips with softened knees and flat lower back; recover smoothly before next step.'
  }
};

export const HORN_CARRIAGE_SPECS: Record<HornCarriageId, HornCarriageSpec> = {
  HORNS_DOWN: {
    id: 'HORNS_DOWN',
    label: 'Horns Down / Rest',
    angleDeg: -45
  },
  HORNS_CARRY: {
    id: 'HORNS_CARRY',
    label: 'Trail / Ready Carry',
    angleDeg: 0
  },
  HORNS_BOX: {
    id: 'HORNS_BOX',
    label: 'Horns Box (+10 deg)',
    angleDeg: 10
  },
  HORNS_SNAP_UP: {
    id: 'HORNS_SNAP_UP',
    label: 'Snap to Box (+14 deg)',
    angleDeg: 14
  },
  HIGH_BELL_EXTENSION: {
    id: 'HIGH_BELL_EXTENSION',
    label: 'High Bell (+35 deg)',
    angleDeg: 35
  }
};

export const UPPER_FACING_LABELS: Record<UpperFacingMode, string> = {
  PRESS_BOX: 'Press Box (Front)',
  TRAVEL: 'Line of Travel',
  PODIUM_50: '50-Yd Podium',
  BACKFIELD: 'Backfield',
  SIDE_1: 'Side 1 (Left)',
  SIDE_2: 'Side 2 (Right)'
};

export const POSTURE_LIST: PostureSpec[] = Object.values(POSTURE_SPECS);
export const HORN_CARRIAGE_LIST: HornCarriageSpec[] = Object.values(HORN_CARRIAGE_SPECS);

export function formatEquipmentCoaching(
  section: SectionId,
  hornCarriage: HornCarriageId,
  upperFacing: UpperFacingMode
): { hornLabel: string; upperBodyCoaching: string } {
  const facingLabel = UPPER_FACING_LABELS[upperFacing];

  if (section === 'GUARD') {
    const guardLabels: Record<HornCarriageId, { label: string; tip: string }> = {
      HORNS_DOWN: {
        label: 'Equipment Grounded / Trail',
        tip: `Hold silk or rifle tucked low at side; open chest cleanly toward ${facingLabel}.`
      },
      HORNS_CARRY: {
        label: 'Right-Shoulder Carry',
        tip: `Keep equipment vertical at right shoulder; rotate torso toward ${facingLabel}.`
      },
      HORNS_BOX: {
        label: 'Present to Box',
        tip: `Extend arms cleanly on 45-deg front plane presenting equipment toward ${facingLabel}.`
      },
      HORNS_SNAP_UP: {
        label: 'Crisp Toss / Catch Prep',
        tip: `Snap release point vertically with eyes locked on ${facingLabel} and quiet shoulders.`
      },
      HIGH_BELL_EXTENSION: {
        label: 'Full Overhead Extension',
        tip: `Reach through upper back to full overhead extension angled toward ${facingLabel}.`
      }
    };
    const item = guardLabels[hornCarriage];
    return { hornLabel: item.label, upperBodyCoaching: item.tip };
  }

  if (section === 'BATTERY' || section === 'PIT') {
    const percLabels: Record<HornCarriageId, { label: string; tip: string }> = {
      HORNS_DOWN: {
        label: 'Sticks In / Tacit',
        tip: `Keep sticks at rested set angle and shoulders aligned to ${facingLabel}.`
      },
      HORNS_CARRY: {
        label: 'Ready Playing Height',
        tip: `Float sticks 1 inch off head with level carrier and shoulders toward ${facingLabel}.`
      },
      HORNS_BOX: {
        label: 'Playing Position (Box)',
        tip: `Project snare/tenor bead height cleanly with chest squared toward ${facingLabel}.`
      },
      HORNS_SNAP_UP: {
        label: 'Stick Visual / Prep Lift',
        tip: `Execute unified prep lift to eye level while locking shoulders to ${facingLabel}.`
      },
      HIGH_BELL_EXTENSION: {
        label: 'High Stick Visual / Stick-Out',
        tip: `Full upper-body lift with sticks extended high facing ${facingLabel}.`
      }
    };
    const item = percLabels[hornCarriage];
    return { hornLabel: item.label, upperBodyCoaching: item.tip };
  }

  // BRASS
  const brassLabels: Record<HornCarriageId, { label: string; tip: string }> = {
    HORNS_DOWN: {
      label: 'Horns Down (-45 deg)',
      tip: `Hold horn cleanly at attention/rest angle with head lifted toward ${facingLabel}.`
    },
    HORNS_CARRY: {
      label: 'Set / Trail Carry (0 deg)',
      tip: `Lock elbows away from ribs at ready set height; square shoulders to ${facingLabel}.`
    },
    HORNS_BOX: {
      label: 'Horns Box (+10 deg)',
      tip: `Direct bell cleanly +10 deg above horizontal toward ${facingLabel}; keep shoulders relaxed.`
    },
    HORNS_SNAP_UP: {
      label: 'Horn Snap to Box (+14 deg)',
      tip: `Crisp 1-count snap straight to +14 deg playing angle aimed at ${facingLabel} with zero bounce.`
    },
    HIGH_BELL_EXTENSION: {
      label: 'High Bell (+35 deg)',
      tip: `Lift sternum and project bell +35 deg toward upper press box (${facingLabel}) without pinching throat.`
    }
  };
  const item = brassLabels[hornCarriage];
  return { hornLabel: item.label, upperBodyCoaching: item.tip };
}

export function orderPerformersForRipple(
  performerIds: string[],
  positions: Record<string, PerformerDot>,
  mode: RippleOrderMode
): string[] {
  if (mode === 'SELECTION_ORDER') {
    return [...performerIds];
  }
  const copy = [...performerIds];
  copy.sort((a, b) => {
    const xA = positions[a]?.xMeters ?? 0;
    const xB = positions[b]?.xMeters ?? 0;
    if (mode === 'LEFT_TO_RIGHT') {
      return xA - xB;
    }
    if (mode === 'RIGHT_TO_LEFT') {
      return xB - xA;
    }
    // CENTER_OUT
    const diff = Math.abs(xA) - Math.abs(xB);
    return Math.abs(diff) > 1e-6 ? diff : xA - xB;
  });
  return copy;
}

export function resolveUpperFacingRad(
  mode: UpperFacingMode,
  point: CanonicalPoint,
  travelHeadingRad: number,
  isMoving: boolean
): number {
  switch (mode) {
    case 'PRESS_BOX':
      return -Math.PI / 2;
    case 'BACKFIELD':
      return Math.PI / 2;
    case 'SIDE_1':
      return Math.PI;
    case 'SIDE_2':
      return 0;
    case 'PODIUM_50':
      return Math.atan2(-4.0 - point.yMeters, 0 - point.xMeters);
    case 'TRAVEL':
      return isMoving ? travelHeadingRad : -Math.PI / 2;
  }
}

function isCueActiveAtCount(
  triggerCount: number,
  endCount: number,
  countOffset: number,
  maxTransitionCounts: number
): boolean {
  const effectiveEnd = Math.max(triggerCount, endCount);
  if (maxTransitionCounts <= 0 || Math.abs(effectiveEnd - triggerCount) < 1e-6) {
    return countOffset >= triggerCount - 1e-6;
  }
  const atTerminalEdge =
    Math.abs(effectiveEnd - maxTransitionCounts) < 1e-6 &&
    Math.abs(countOffset - maxTransitionCounts) < 1e-6;
  return (
    countOffset >= triggerCount - 1e-6 &&
    (countOffset < effectiveEnd - 1e-6 || atTerminalEdge)
  );
}

export function resolvePerformerBodyState(
  performer: Performer,
  set: DrillSet,
  countOffset: number,
  maxTransitionCounts: number,
  point: CanonicalPoint,
  travelHeadingRad: number,
  isMoving: boolean
): ResolvedBodyState {
  let activeCue: BodyCue | null = null;
  let activeTriggerCount = 0;

  for (const cue of set.bodyCues ?? []) {
    const idx = cue.targetPerformerIds.indexOf(performer.id);
    if (idx < 0) continue;
    const triggerCount = cue.startCount + idx * Math.max(0, cue.rippleDelayCounts);
    if (
      isCueActiveAtCount(
        triggerCount,
        cue.endCount,
        countOffset,
        maxTransitionCounts
      )
    ) {
      activeCue = cue;
      activeTriggerCount = triggerCount;
    }
  }

  const posture: BodyPostureId = activeCue?.posture ?? 'UPRIGHT_GLIDE';
  const defaultCarriage: HornCarriageId =
    performer.section === 'PIT' ? 'HORNS_BOX' : 'HORNS_CARRY';
  const hornCarriage: HornCarriageId = activeCue?.hornCarriage ?? defaultCarriage;
  const upperFacing: UpperFacingMode = activeCue?.upperFacing ?? 'PRESS_BOX';

  const postureSpec = POSTURE_SPECS[posture];
  const carriageSpec = HORN_CARRIAGE_SPECS[hornCarriage];
  const eqCoaching = formatEquipmentCoaching(
    performer.section,
    hornCarriage,
    upperFacing
  );

  const pulseDuration = 1.5;
  const deltaFromTrigger = countOffset - activeTriggerCount;
  const hasCuePulse =
    activeCue !== null &&
    (activeCue.rippleDelayCounts > 0 ||
      posture !== 'UPRIGHT_GLIDE' ||
      hornCarriage === 'HORNS_SNAP_UP' ||
      hornCarriage === 'HIGH_BELL_EXTENSION');
  const isPulseActive =
    hasCuePulse &&
    maxTransitionCounts > 0 &&
    deltaFromTrigger >= -1e-6 &&
    deltaFromTrigger < pulseDuration;

  const upperFacingRad = resolveUpperFacingRad(
    upperFacing,
    point,
    travelHeadingRad,
    isMoving
  );

  return {
    cueId: activeCue?.id ?? null,
    cueLabel: activeCue?.label ?? 'Baseline March & Carry',
    posture,
    postureLabel: postureSpec.label,
    postureShortCode: postureSpec.shortCode,
    markerShape2d: postureSpec.markerShape2d,
    hornCarriage,
    hornLabel: eqCoaching.hornLabel,
    upperFacing,
    upperFacingRad,
    elevationMeters: postureSpec.elevationMeters,
    leanXMeters: postureSpec.leanXMeters,
    leanYMeters: postureSpec.leanYMeters,
    hornAngleDeg: carriageSpec.angleDeg,
    isPulseActive,
    pulseProgress: isPulseActive
      ? Math.min(1, Math.max(0, deltaFromTrigger / pulseDuration))
      : 0,
    triggerCount: activeCue ? activeTriggerCount : 0,
    lowerBodyCoaching: activeCue?.instruction
      ? `${postureSpec.lowerBodyCoaching} Note: ${activeCue.instruction}`
      : postureSpec.lowerBodyCoaching,
    upperBodyCoaching: eqCoaching.upperBodyCoaching,
    videoRefUrl: activeCue?.videoRefUrl
  };
}

export interface PerformerPhraseBlock {
  cueId: string | null;
  label: string;
  startCount: number;
  endCount: number;
  triggerCount: number;
  posture: BodyPostureId;
  hornCarriage: HornCarriageId;
  upperFacing: UpperFacingMode;
  rippleDelayCounts: number;
}

export function getPerformerPhraseBlocks(
  performer: Performer,
  set: DrillSet,
  maxCounts: number
): PerformerPhraseBlock[] {
  const effectiveMax = Math.max(0, maxCounts);
  const matching = (set.bodyCues ?? [])
    .map((cue): PerformerPhraseBlock | null => {
      const idx = cue.targetPerformerIds.indexOf(performer.id);
      if (idx < 0) return null;
      const triggerCount = cue.startCount + idx * Math.max(0, cue.rippleDelayCounts);
      const endCount =
        effectiveMax > 0
          ? Math.min(effectiveMax, Math.max(triggerCount, cue.endCount))
          : Math.max(triggerCount, cue.endCount);
      return {
        cueId: cue.id,
        label: cue.label,
        startCount: triggerCount,
        endCount,
        triggerCount,
        posture: cue.posture,
        hornCarriage: cue.hornCarriage,
        upperFacing: cue.upperFacing,
        rippleDelayCounts: cue.rippleDelayCounts
      };
    })
    .filter((b): b is PerformerPhraseBlock => b !== null)
    .sort((a, b) => a.startCount - b.startCount);

  if (matching.length === 0) {
    const defaultCarriage: HornCarriageId =
      performer.section === 'PIT' ? 'HORNS_BOX' : 'HORNS_CARRY';
    return [
      {
        cueId: null,
        label: `${POSTURE_SPECS.UPRIGHT_GLIDE.label} (${HORN_CARRIAGE_SPECS[defaultCarriage].label})`,
        startCount: 0,
        endCount: effectiveMax,
        triggerCount: 0,
        posture: 'UPRIGHT_GLIDE',
        hornCarriage: defaultCarriage,
        upperFacing: 'PRESS_BOX',
        rippleDelayCounts: 0
      }
    ];
  }

  // Fill any leading gap from 0 to first cue with baseline carry.
  const blocks: PerformerPhraseBlock[] = [];
  if (matching[0]!.startCount > 0.1) {
    const defaultCarriage: HornCarriageId =
      performer.section === 'PIT' ? 'HORNS_BOX' : 'HORNS_CARRY';
    blocks.push({
      cueId: null,
      label: 'Baseline March & Carry',
      startCount: 0,
      endCount: matching[0]!.startCount,
      triggerCount: 0,
      posture: 'UPRIGHT_GLIDE',
      hornCarriage: defaultCarriage,
      upperFacing: 'PRESS_BOX',
      rippleDelayCounts: 0
    });
  }
  blocks.push(...matching);
  return blocks;
}

export function getPerformerSetPhraseSummary(
  performer: Performer,
  set: DrillSet,
  maxCounts: number
): string {
  const blocks = getPerformerPhraseBlocks(performer, set, maxCounts);
  const eqDefault = formatEquipmentCoaching(
    performer.section,
    performer.section === 'PIT' ? 'HORNS_BOX' : 'HORNS_CARRY',
    'PRESS_BOX'
  );
  if (blocks.length === 1 && blocks[0]!.cueId === null) {
    return `${POSTURE_SPECS.UPRIGHT_GLIDE.label} · ${eqDefault.hornLabel}`;
  }
  return blocks
    .map((b) => {
      const pLabel = POSTURE_SPECS[b.posture].label;
      const eq = formatEquipmentCoaching(
        performer.section,
        b.hornCarriage,
        b.upperFacing
      );
      const rippleNote =
        b.rippleDelayCounts > 0
          ? ` [triggers ct ${b.triggerCount.toFixed(1)}]`
          : '';
      const rangeStr =
        maxCounts > 0
          ? `Cts ${b.startCount.toFixed(1)}-${b.endCount.toFixed(1)}`
          : 'Anchor';
      return `${rangeStr}: ${pLabel}, ${eq.hornLabel}${rippleNote}`;
    })
    .join(' | ');
}
