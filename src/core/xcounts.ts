import { formatSteps } from './coordinates.ts';
import {
  computeSegmentArcLengthMeters,
  evaluateSegmentPoint
} from './interpolation.ts';
import { FieldSpec, PerformerDot, YardLineCrossing } from './types.ts';

export function formatMajorLineCrossLabel(field: FieldSpec, kIndex: number): string {
  if (field.gridType === 'YARD_LINES') {
    if (kIndex === 0) {
      return '50';
    }
    const sidePrefix = kIndex < 0 ? 'S1' : 'S2';
    const absK = Math.abs(kIndex);
    if (absK >= 10) {
      return `${sidePrefix} Goal`;
    }
    const yardVal = 50 - 5 * absK;
    return `${sidePrefix} ${yardVal}`;
  }

  if (kIndex === 0) {
    return '0m';
  }
  const sidePrefix = kIndex < 0 ? 'S1' : 'S2';
  const metricVal = 5 * Math.abs(kIndex);
  return `${sidePrefix} ${metricVal}m`;
}

/**
 * Computes exact interior yard-line (or 5m metric grid) crossing counts (`xCounts`)
 * across a single transition segment (linear or quadratic Bezier).
 *
 * Boundary convention: reports strict interior transverse crossings (`0 < countOffset < counts`)
 * on `t` in `(1e-4, 1 - 1e-4)` across major grid lines `x = k * field.majorLineSpacingMeters`
 * for `k` in `[-maxK, maxK]`, excluding start and arrival dots so set coordinates never duplicate.
 */
export function computeTransitionXCounts(
  p0: PerformerDot,
  p1: PerformerDot,
  counts: number,
  field: FieldSpec
): YardLineCrossing[] {
  if (counts <= 0 || computeSegmentArcLengthMeters(p0, p1) < 0.05) {
    return [];
  }

  const maxK = Math.round(field.widthMeters / 2 / field.majorLineSpacingMeters);
  const steps = Math.max(64, Math.ceil(counts * 8));
  const samplesX = new Float64Array(steps + 1);

  let minX = Infinity;
  let maxX = -Infinity;
  for (let j = 0; j <= steps; j++) {
    const x = evaluateSegmentPoint(p0, p1, j / steps).xMeters;
    samplesX[j] = x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  const minCandidateK = Math.max(
    -maxK,
    Math.floor(minX / field.majorLineSpacingMeters) - 1
  );
  const maxCandidateK = Math.min(
    maxK,
    Math.ceil(maxX / field.majorLineSpacingMeters) + 1
  );

  const rawCrossings: YardLineCrossing[] = [];

  for (let k = minCandidateK; k <= maxCandidateK; k++) {
    const lineX = k * field.majorLineSpacingMeters;
    const lineLabel = formatMajorLineCrossLabel(field, k);

    for (let j = 0; j < steps; j++) {
      const t0 = j / steps;
      const t1 = (j + 1) / steps;
      const d0 = samplesX[j]! - lineX;
      const d1 = samplesX[j + 1]! - lineX;

      // Half-open interval sign test: an exact node hit at d1 === 0 binds once to [t0, t1].
      const crossesUp = d0 < 0 && d1 >= 0;
      const crossesDown = d0 > 0 && d1 <= 0;
      if (!crossesUp && !crossesDown) {
        continue;
      }

      let lo = t0;
      let hi = t1;
      let loDiff = d0;
      for (let iter = 0; iter < 24; iter++) {
        const mid = 0.5 * (lo + hi);
        const midDiff = evaluateSegmentPoint(p0, p1, mid).xMeters - lineX;
        if ((loDiff < 0 && midDiff <= 0) || (loDiff > 0 && midDiff >= 0)) {
          lo = mid;
          loDiff = midDiff;
        } else {
          hi = mid;
        }
      }

      const tStar = 0.5 * (lo + hi);
      if (tStar <= 1e-4 || tStar >= 1 - 1e-4) {
        continue;
      }

      // Exclude tangential grazing without transverse side change.
      const eps = Math.min(1e-3, tStar * 0.25, (1 - tStar) * 0.25);
      const xBefore = evaluateSegmentPoint(p0, p1, tStar - eps).xMeters;
      const xAfter = evaluateSegmentPoint(p0, p1, tStar + eps).xMeters;
      if (Math.abs(xAfter - xBefore) <= 1e-5) {
        continue;
      }
      if ((xBefore - lineX) * (xAfter - lineX) >= 0) {
        continue;
      }

      const countOffset = tStar * counts;
      const direction: YardLineCrossing['direction'] =
        xAfter > xBefore ? 'TO_SIDE_2' : 'TO_SIDE_1';
      rawCrossings.push({
        countOffset,
        xMeters: lineX,
        kIndex: k,
        lineLabel,
        direction,
        compactText: `ct ${formatSteps(countOffset)}: ${lineLabel}`
      });
    }
  }

  rawCrossings.sort((a, b) => a.countOffset - b.countOffset);

  const deduped: YardLineCrossing[] = [];
  for (const item of rawCrossings) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.kIndex === item.kIndex &&
      Math.abs(item.countOffset - prev.countOffset) < 0.02
    ) {
      continue;
    }
    deduped.push(item);
  }

  return deduped;
}

export function formatXCountsSummary(
  crossings: YardLineCrossing[],
  emptyLabel = 'In-corridor'
): string {
  if (crossings.length === 0) {
    return emptyLabel;
  }
  return crossings.map((c) => c.compactText).join(' · ');
}
