import { getFieldSpec } from './fields.ts';
import {
  computeSegmentArcLengthMeters,
  doSegmentsIntersect,
  evaluateSegmentPoint,
  evaluateSegmentTangent,
  getTransitionWindow
} from './interpolation.ts';
import {
  AcousticReport,
  CanonicalPoint,
  CollisionIssue,
  DrillShow,
  ShowIntelligenceReport,
  StrideAlert,
  TransitionSummaryMetrics,
  WhiplashAlert
} from './types.ts';

export const DEFAULT_FOCAL_LISTENER: CanonicalPoint = {
  xMeters: 0,
  yMeters: -4.0
};

export const DEFAULT_PIT_REFERENCE: CanonicalPoint = {
  xMeters: 0,
  yMeters: -2.0
};

export function speedOfSoundMps(tempCelsius: number): number {
  const clampedTemp = Math.min(50, Math.max(-30, tempCelsius));
  return 331.3 * Math.sqrt(1 + clampedTemp / 273.15);
}

export function computeAcousticDelayMs(
  point: CanonicalPoint,
  tempCelsius: number,
  focalListener: CanonicalPoint = DEFAULT_FOCAL_LISTENER,
  pitReference: CanonicalPoint = DEFAULT_PIT_REFERENCE
): number {
  const c = speedOfSoundMps(tempCelsius);
  const distPerformer = Math.hypot(
    point.xMeters - focalListener.xMeters,
    point.yMeters - focalListener.yMeters
  );
  const distPitRef = Math.hypot(
    pitReference.xMeters - focalListener.xMeters,
    pitReference.yMeters - focalListener.yMeters
  );
  return ((distPerformer - distPitRef) / c) * 1000;
}

export function countTransitionCrossings(
  show: DrillShow,
  fromSetIndex: number
): number {
  const window = getTransitionWindow(show, fromSetIndex);
  if (!window || window.counts <= 0) {
    return 0;
  }
  let crossings = 0;
  const performers = show.performers;
  for (let i = 0; i < performers.length; i++) {
    const idA = performers[i]!.id;
    const a0 = window.fromSet.positions[idA];
    const a1 = window.toSet.positions[idA];
    if (!a0 || !a1) continue;
    for (let j = i + 1; j < performers.length; j++) {
      const idB = performers[j]!.id;
      const b0 = window.fromSet.positions[idB];
      const b1 = window.toSet.positions[idB];
      if (!b0 || !b1) continue;
      if (doSegmentsIntersect(a0, a1, b0, b1)) {
        crossings++;
      }
    }
  }
  return crossings;
}

export function analyzeTransitionCollisions(
  show: DrillShow,
  fromSetIndex: number
): CollisionIssue[] {
  const window = getTransitionWindow(show, fromSetIndex);
  if (!window || window.counts <= 0) {
    return [];
  }

  const samples = Math.max(1, Math.round(window.counts * 4));
  const performers = show.performers;
  const arcLengths = new Map<string, number>();
  for (const perf of performers) {
    const p0 = window.fromSet.positions[perf.id];
    const p1 = window.toSet.positions[perf.id];
    arcLengths.set(perf.id, p0 && p1 ? computeSegmentArcLengthMeters(p0, p1) : 0);
  }

  const issues: CollisionIssue[] = [];
  for (let i = 0; i < performers.length; i++) {
    const perfA = performers[i]!;
    const a0 = window.fromSet.positions[perfA.id];
    const a1 = window.toSet.positions[perfA.id];
    if (!a0 || !a1) continue;
    const movingA = (arcLengths.get(perfA.id) ?? 0) >= 0.05;

    for (let j = i + 1; j < performers.length; j++) {
      const perfB = performers[j]!;
      const b0 = window.fromSet.positions[perfB.id];
      const b1 = window.toSet.positions[perfB.id];
      if (!b0 || !b1) continue;
      const movingB = (arcLengths.get(perfB.id) ?? 0) >= 0.05;

      const combinedClearance =
        perfA.clearanceRadiusMeters + perfB.clearanceRadiusMeters;
      let minDist = Infinity;
      let bestSample = 0;
      let bestMidpoint: CanonicalPoint = { xMeters: 0, yMeters: 0 };

      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const posA = evaluateSegmentPoint(a0, a1, t);
        const posB = evaluateSegmentPoint(b0, b1, t);
        const dist = Math.hypot(
          posA.xMeters - posB.xMeters,
          posA.yMeters - posB.yMeters
        );
        if (dist < minDist) {
          minDist = dist;
          bestSample = s;
          bestMidpoint = {
            xMeters: 0.5 * (posA.xMeters + posB.xMeters),
            yMeters: 0.5 * (posA.yMeters + posB.yMeters)
          };
        }
      }

      const bothStationary = !movingA && !movingB;
      if (bothStationary && minDist >= 0.55) {
        continue;
      }

      if (minDist < 0.55 * combinedClearance) {
        issues.push({
          id: `col-${fromSetIndex}-${perfA.id}-${perfB.id}`,
          severity: 'CRITICAL',
          fromSetIndex,
          toSetIndex: window.toSetIndex,
          countOffset: (bestSample / samples) * window.counts,
          performerAId: perfA.id,
          performerBId: perfB.id,
          minDistanceMeters: minDist,
          requiredClearanceMeters: 0.85 * combinedClearance,
          midpoint: bestMidpoint
        });
      } else if (minDist < 0.85 * combinedClearance) {
        issues.push({
          id: `col-${fromSetIndex}-${perfA.id}-${perfB.id}`,
          severity: 'NEAR_MISS',
          fromSetIndex,
          toSetIndex: window.toSetIndex,
          countOffset: (bestSample / samples) * window.counts,
          performerAId: perfA.id,
          performerBId: perfB.id,
          minDistanceMeters: minDist,
          requiredClearanceMeters: 0.85 * combinedClearance,
          midpoint: bestMidpoint
        });
      }
    }
  }

  return issues.sort((a, b) => a.minDistanceMeters - b.minDistanceMeters);
}

export function analyzeSetAcoustics(
  show: DrillShow,
  setIndex: number
): AcousticReport {
  const clampedSetIdx = Math.min(Math.max(0, setIndex), show.sets.length - 1);
  const set = show.sets[clampedSetIdx];
  const c = speedOfSoundMps(show.ambientTempCelsius);

  let maxDelay = 0;
  let minDelay = Infinity;
  let worstPerformerId: string | null = null;

  if (set) {
    for (const perf of show.performers) {
      const dot = set.positions[perf.id];
      if (!dot) continue;
      const delay = computeAcousticDelayMs(dot, show.ambientTempCelsius);
      if (delay > maxDelay) {
        maxDelay = delay;
        worstPerformerId = perf.id;
      }
      if (delay < minDelay) {
        minDelay = delay;
      }
    }
  }

  if (!Number.isFinite(minDelay)) {
    minDelay = 0;
  }
  const pitToBackSpreadMs = Math.max(0, maxDelay - Math.max(0, minDelay));
  let tearRisk: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';
  if (maxDelay > 85) {
    tearRisk = 'HIGH';
  } else if (maxDelay > 65) {
    tearRisk = 'MODERATE';
  }

  return {
    speedOfSoundMps: c,
    ambientTempCelsius: show.ambientTempCelsius,
    frontReferenceYMeters: DEFAULT_PIT_REFERENCE.yMeters,
    focalListenerPoint: DEFAULT_FOCAL_LISTENER,
    maxEnsembleDelayMs: maxDelay,
    pitToBackSpreadMs,
    tearRisk,
    worstPerformerId
  };
}

export function analyzeShowIntelligence(
  show: DrillShow,
  inspectedSetIndex = 0
): ShowIntelligenceReport {
  const field = getFieldSpec(show.fieldStandardId);
  const collisions: CollisionIssue[] = [];
  const strideAlerts: StrideAlert[] = [];
  const whiplashAlerts: WhiplashAlert[] = [];
  const crossingCountsByTransition: number[] = [];

  for (let fromIdx = 0; fromIdx < show.sets.length - 1; fromIdx++) {
    const window = getTransitionWindow(show, fromIdx);
    if (!window || window.counts <= 0) {
      crossingCountsByTransition.push(0);
      continue;
    }

    collisions.push(...analyzeTransitionCollisions(show, fromIdx));
    crossingCountsByTransition.push(countTransitionCrossings(show, fromIdx));

    const durationSec = (window.counts * 60) / window.tempoBpm;
    for (const perf of show.performers) {
      const p0 = window.fromSet.positions[perf.id];
      const p1 = window.toSet.positions[perf.id];
      if (!p0 || !p1) continue;
      const arcLen = computeSegmentArcLengthMeters(p0, p1);
      if (arcLen < 0.05) continue;

      const stepLen = arcLen / window.counts;
      const stepsPerFive = field.majorLineSpacingMeters / stepLen;
      const speedMps = arcLen / durationSec;

      if (stepsPerFive < 4.5) {
        strideAlerts.push({
          id: `stride-${fromIdx}-${perf.id}`,
          severity: 'CRITICAL',
          fromSetIndex: fromIdx,
          toSetIndex: window.toSetIndex,
          performerId: perf.id,
          arcLengthMeters: arcLen,
          counts: window.counts,
          stepsPerFive,
          stepLengthMeters: stepLen,
          speedMps
        });
      } else if (stepsPerFive < 6.0) {
        strideAlerts.push({
          id: `stride-${fromIdx}-${perf.id}`,
          severity: 'WARNING',
          fromSetIndex: fromIdx,
          toSetIndex: window.toSetIndex,
          performerId: perf.id,
          arcLengthMeters: arcLen,
          counts: window.counts,
          stepsPerFive,
          stepLengthMeters: stepLen,
          speedMps
        });
      }
    }
  }

  // Direction-change whiplash detection across consecutive active transitions.
  for (let midIdx = 1; midIdx < show.sets.length - 1; midIdx++) {
    const winIn = getTransitionWindow(show, midIdx - 1);
    const winOut = getTransitionWindow(show, midIdx);
    if (!winIn || !winOut || winIn.counts <= 0 || winOut.counts <= 0) {
      continue;
    }
    const durIn = (winIn.counts * 60) / winIn.tempoBpm;
    const durOut = (winOut.counts * 60) / winOut.tempoBpm;

    for (const perf of show.performers) {
      const pPrev = winIn.fromSet.positions[perf.id];
      const pMid = winIn.toSet.positions[perf.id];
      const pNext = winOut.toSet.positions[perf.id];
      if (!pPrev || !pMid || !pNext) continue;

      const arcIn = computeSegmentArcLengthMeters(pPrev, pMid);
      const arcOut = computeSegmentArcLengthMeters(pMid, pNext);
      if (arcIn < 0.5 || arcOut < 0.5) continue;

      const tanIn = evaluateSegmentTangent(pPrev, pMid, 1);
      const tanOut = evaluateSegmentTangent(pMid, pNext, 0);
      const magIn = Math.hypot(tanIn.xMeters, tanIn.yMeters);
      const magOut = Math.hypot(tanOut.xMeters, tanOut.yMeters);
      if (magIn < 1e-6 || magOut < 1e-6) continue;

      const inSpeed = magIn / durIn;
      const outSpeed = magOut / durOut;
      const maxSpeed = Math.max(inSpeed, outSpeed);
      if (maxSpeed <= 1.5 || Math.min(inSpeed, outSpeed) < 0.8) {
        continue;
      }

      const cosTheta = Math.min(
        1,
        Math.max(
          -1,
          (tanIn.xMeters * tanOut.xMeters + tanIn.yMeters * tanOut.yMeters) /
            (magIn * magOut)
        )
      );
      const turnAngleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
      if (turnAngleDeg > 110) {
        whiplashAlerts.push({
          id: `whip-${midIdx}-${perf.id}`,
          fromSetIndex: midIdx - 1,
          setIndex: midIdx,
          toSetIndex: midIdx + 1,
          performerId: perf.id,
          turnAngleDeg,
          incomingSpeedMps: inSpeed,
          outgoingSpeedMps: outSpeed,
          momentumScore: turnAngleDeg * maxSpeed * perf.weightFactor
        });
      }
    }
  }

  collisions.sort((a, b) => a.minDistanceMeters - b.minDistanceMeters);
  strideAlerts.sort((a, b) => a.stepsPerFive - b.stepsPerFive);
  whiplashAlerts.sort((a, b) => b.momentumScore - a.momentumScore);

  const acoustic = analyzeSetAcoustics(show, inspectedSetIndex);

  const criticalCollisions = collisions.filter((c) => c.severity === 'CRITICAL').length;
  const nearMisses = collisions.filter((c) => c.severity === 'NEAR_MISS').length;
  const criticalStrides = strideAlerts.filter((s) => s.severity === 'CRITICAL').length;
  const warningStrides = strideAlerts.filter((s) => s.severity === 'WARNING').length;
  const totalCrossings = crossingCountsByTransition.reduce((a, b) => a + b, 0);

  let rawScore =
    100 -
    12 * criticalCollisions -
    4 * nearMisses -
    5 * criticalStrides -
    2 * warningStrides -
    4 * whiplashAlerts.length -
    0.5 * totalCrossings;
  if (acoustic.tearRisk === 'HIGH') {
    rawScore -= 8;
  } else if (acoustic.tearRisk === 'MODERATE') {
    rawScore -= 3;
  }

  return {
    cleanlinessScore: Math.round(Math.min(100, Math.max(0, rawScore))),
    collisions,
    strideAlerts,
    whiplashAlerts,
    acoustic,
    crossingCountsByTransition
  };
}

export function summarizeTransitionMetrics(
  show: DrillShow,
  fromSetIndex: number,
  targetSetIndex?: number
): TransitionSummaryMetrics {
  const field = getFieldSpec(show.fieldStandardId);
  const effectiveTarget =
    targetSetIndex ??
    Math.min(show.sets.length - 1, Math.max(0, fromSetIndex + 1));

  const window = getTransitionWindow(show, fromSetIndex);
  const collisions = window ? analyzeTransitionCollisions(show, fromSetIndex) : [];
  const criticalCount = collisions.filter((c) => c.severity === 'CRITICAL').length;
  const nearMissCount = collisions.filter((c) => c.severity === 'NEAR_MISS').length;
  const crossingCount = window ? countTransitionCrossings(show, fromSetIndex) : 0;

  let minStepsPerFive = Infinity;
  let sumStepsPerFive = 0;
  let movingCount = 0;

  if (window && window.counts > 0) {
    for (const perf of show.performers) {
      const p0 = window.fromSet.positions[perf.id];
      const p1 = window.toSet.positions[perf.id];
      if (!p0 || !p1) continue;
      const arc = computeSegmentArcLengthMeters(p0, p1);
      if (arc < 0.05) continue;
      const stepLen = arc / window.counts;
      const stepsPerFive = field.majorLineSpacingMeters / stepLen;
      if (stepsPerFive < minStepsPerFive) {
        minStepsPerFive = stepsPerFive;
      }
      sumStepsPerFive += stepsPerFive;
      movingCount++;
    }
  }

  const acoustic = analyzeSetAcoustics(show, effectiveTarget);
  const fullReport = analyzeShowIntelligence(show, effectiveTarget);

  return {
    collisionCount: criticalCount,
    nearMissCount,
    crossingCount,
    maxStepsPerFive: Number.isFinite(minStepsPerFive)
      ? Math.round(minStepsPerFive * 100) / 100
      : 0,
    meanStepsPerFive:
      movingCount > 0
        ? Math.round((sumStepsPerFive / movingCount) * 100) / 100
        : 0,
    maxAcousticDelayMs: Math.round(acoustic.maxEnsembleDelayMs * 10) / 10,
    cleanlinessScore: fullReport.cleanlinessScore
  };
}
