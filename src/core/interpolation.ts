import { resolvePerformerBodyState } from './choreography.ts';
import {
  CanonicalPoint,
  DrillSet,
  DrillShow,
  FieldSpec,
  InterpolatedPerformerState,
  PerformerDot
} from './types.ts';

const GEOM_EPSILON = 1e-6;

export interface TransitionWindow {
  fromSetIndex: number;
  toSetIndex: number;
  fromSet: DrillSet;
  toSet: DrillSet;
  counts: number;
  tempoBpm: number;
}

export function getTransitionWindow(
  show: DrillShow,
  fromSetIndex: number
): TransitionWindow | null {
  if (fromSetIndex < 0 || fromSetIndex >= show.sets.length - 1) {
    return null;
  }
  const fromSet = show.sets[fromSetIndex];
  const toSet = show.sets[fromSetIndex + 1];
  if (!fromSet || !toSet) {
    return null;
  }
  return {
    fromSetIndex,
    toSetIndex: fromSetIndex + 1,
    fromSet,
    toSet,
    counts: Math.max(0, toSet.counts),
    tempoBpm: toSet.tempoBpm > 0 ? toSet.tempoBpm : fromSet.tempoBpm
  };
}

export function getTotalShowCounts(show: DrillShow): number {
  let total = 0;
  for (let i = 1; i < show.sets.length; i++) {
    total += Math.max(0, show.sets[i]?.counts ?? 0);
  }
  return total;
}

export function getSetStartGlobalCount(show: DrillShow, setIndex: number): number {
  let sum = 0;
  const limit = Math.min(setIndex, show.sets.length - 1);
  for (let i = 1; i <= limit; i++) {
    sum += Math.max(0, show.sets[i]?.counts ?? 0);
  }
  return sum;
}

export function globalCountToSetPosition(
  show: DrillShow,
  globalCount: number
): { setIndex: number; countOffset: number } {
  if (show.sets.length <= 1 || globalCount <= 0) {
    return { setIndex: 0, countOffset: 0 };
  }
  let acc = 0;
  for (let i = 1; i < show.sets.length; i++) {
    const dur = Math.max(0, show.sets[i]?.counts ?? 0);
    if (globalCount <= acc + dur) {
      return {
        setIndex: i - 1,
        countOffset: globalCount - acc
      };
    }
    acc += dur;
  }
  return {
    setIndex: show.sets.length - 1,
    countOffset: 0
  };
}

function getQuadraticControlPoint(
  p0: PerformerDot,
  p1: PerformerDot
): CanonicalPoint | null {
  const b = p1.curveOffsetMeters ?? 0;
  if (Math.abs(b) < GEOM_EPSILON) {
    return null;
  }
  const dx = p1.xMeters - p0.xMeters;
  const dy = p1.yMeters - p0.yMeters;
  const len = Math.hypot(dx, dy);
  if (len < GEOM_EPSILON) {
    return null;
  }
  const nx = -dy / len;
  const ny = dx / len;
  return {
    xMeters: 0.5 * (p0.xMeters + p1.xMeters) + 2 * b * nx,
    yMeters: 0.5 * (p0.yMeters + p1.yMeters) + 2 * b * ny
  };
}

export function evaluateSegmentPoint(
  p0: PerformerDot,
  p1: PerformerDot,
  tRaw: number
): CanonicalPoint {
  const t = Math.min(1, Math.max(0, tRaw));
  const ctrl = getQuadraticControlPoint(p0, p1);
  if (!ctrl) {
    return {
      xMeters: p0.xMeters + (p1.xMeters - p0.xMeters) * t,
      yMeters: p0.yMeters + (p1.yMeters - p0.yMeters) * t
    };
  }
  const u = 1 - t;
  return {
    xMeters: u * u * p0.xMeters + 2 * u * t * ctrl.xMeters + t * t * p1.xMeters,
    yMeters: u * u * p0.yMeters + 2 * u * t * ctrl.yMeters + t * t * p1.yMeters
  };
}

export function evaluateSegmentTangent(
  p0: PerformerDot,
  p1: PerformerDot,
  tRaw: number
): CanonicalPoint {
  const t = Math.min(1, Math.max(0, tRaw));
  const ctrl = getQuadraticControlPoint(p0, p1);
  if (!ctrl) {
    return {
      xMeters: p1.xMeters - p0.xMeters,
      yMeters: p1.yMeters - p0.yMeters
    };
  }
  const u = 1 - t;
  return {
    xMeters: 2 * u * (ctrl.xMeters - p0.xMeters) + 2 * t * (p1.xMeters - ctrl.xMeters),
    yMeters: 2 * u * (ctrl.yMeters - p0.yMeters) + 2 * t * (p1.yMeters - ctrl.yMeters)
  };
}

export function computeSegmentArcLengthMeters(
  p0: PerformerDot,
  p1: PerformerDot,
  subdivisions = 32
): number {
  const ctrl = getQuadraticControlPoint(p0, p1);
  if (!ctrl) {
    return Math.hypot(p1.xMeters - p0.xMeters, p1.yMeters - p0.yMeters);
  }
  const steps = Math.max(4, subdivisions);
  let total = 0;
  let prev = evaluateSegmentPoint(p0, p1, 0);
  for (let i = 1; i <= steps; i++) {
    const curr = evaluateSegmentPoint(p0, p1, i / steps);
    total += Math.hypot(curr.xMeters - prev.xMeters, curr.yMeters - prev.yMeters);
    prev = curr;
  }
  return total;
}

export function computeSegmentControlPointForMidpoint(
  p0: PerformerDot,
  p1: PerformerDot
): CanonicalPoint {
  const b = p1.curveOffsetMeters ?? 0;
  const dx = p1.xMeters - p0.xMeters;
  const dy = p1.yMeters - p0.yMeters;
  const len = Math.hypot(dx, dy);
  if (len < GEOM_EPSILON) {
    return { xMeters: p0.xMeters, yMeters: p0.yMeters };
  }
  const nx = -dy / len;
  const ny = dx / len;
  return {
    xMeters: 0.5 * (p0.xMeters + p1.xMeters) + b * nx,
    yMeters: 0.5 * (p0.yMeters + p1.yMeters) + b * ny
  };
}

export function doSegmentsIntersect(
  a0: CanonicalPoint,
  a1: CanonicalPoint,
  b0: CanonicalPoint,
  b1: CanonicalPoint
): boolean {
  const d1x = a1.xMeters - a0.xMeters;
  const d1y = a1.yMeters - a0.yMeters;
  const d2x = b1.xMeters - b0.xMeters;
  const d2y = b1.yMeters - b0.yMeters;
  if (Math.hypot(d1x, d1y) < 0.05 || Math.hypot(d2x, d2y) < 0.05) {
    return false;
  }
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) {
    return false;
  }
  const rx = b0.xMeters - a0.xMeters;
  const ry = b0.yMeters - a0.yMeters;
  const t = (rx * d2y - ry * d2x) / denom;
  const u = (rx * d1y - ry * d1x) / denom;
  // Require strict interior crossing so shared endpoints or tiny grazing tangents are excluded.
  return t > 0.04 && t < 0.96 && u > 0.04 && u < 0.96;
}

export function interpolateShowAtPosition(
  show: DrillShow,
  setIndex: number,
  countOffset: number,
  field: FieldSpec
): Record<string, InterpolatedPerformerState> {
  const result: Record<string, InterpolatedPerformerState> = {};
  if (show.sets.length === 0) {
    return result;
  }

  const clampedSetIndex = Math.min(Math.max(0, setIndex), show.sets.length - 1);
  const window = getTransitionWindow(show, clampedSetIndex);

  if (!window || window.counts <= 0) {
    const activeSet = show.sets[clampedSetIndex]!;
    for (const perf of show.performers) {
      const dot = activeSet.positions[perf.id] ?? { xMeters: 0, yMeters: 0 };
      const bodyState = resolvePerformerBodyState(
        perf,
        activeSet,
        0,
        0,
        { xMeters: dot.xMeters, yMeters: dot.yMeters },
        -Math.PI / 2,
        false
      );
      result[perf.id] = {
        performerId: perf.id,
        xMeters: dot.xMeters,
        yMeters: dot.yMeters,
        headingRad: -Math.PI / 2, // Facing front sideline (audience) by default.
        speedMps: 0,
        stepsPerFive: Infinity,
        stepLengthMeters: 0,
        isMoving: false,
        bodyState
      };
    }
    return result;
  }

  const t = Math.min(1, Math.max(0, countOffset / window.counts));
  const durationSec = (window.counts * 60) / window.tempoBpm;

  for (const perf of show.performers) {
    const p0 = window.fromSet.positions[perf.id] ?? { xMeters: 0, yMeters: 0 };
    const p1 = window.toSet.positions[perf.id] ?? p0;
    const pos = evaluateSegmentPoint(p0, p1, t);
    const tangent = evaluateSegmentTangent(p0, p1, t);
    const tangentMag = Math.hypot(tangent.xMeters, tangent.yMeters);
    const arcLen = computeSegmentArcLengthMeters(p0, p1);
    const isMoving = arcLen >= 0.05;
    const speedMps = isMoving ? tangentMag / durationSec : 0;
    const stepLengthMeters = isMoving ? arcLen / window.counts : 0;
    const stepsPerFive = isMoving
      ? field.majorLineSpacingMeters / stepLengthMeters
      : Infinity;

    const headingRad =
      tangentMag >= GEOM_EPSILON
        ? Math.atan2(tangent.yMeters, tangent.xMeters)
        : -Math.PI / 2;

    const bodyState = resolvePerformerBodyState(
      perf,
      window.fromSet,
      countOffset,
      window.counts,
      pos,
      headingRad,
      isMoving
    );

    result[perf.id] = {
      performerId: perf.id,
      xMeters: pos.xMeters,
      yMeters: pos.yMeters,
      headingRad,
      speedMps,
      stepsPerFive,
      stepLengthMeters,
      isMoving,
      bodyState
    };
  }

  return result;
}
