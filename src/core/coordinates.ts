import {
  CanonicalPoint,
  CoordinateReadout,
  FieldSpec,
  HashTranslationDelta,
  HorizontalRelation,
  HorizontalSide,
  ReferenceLineSpec,
  VerticalRelation
} from './types.ts';

const CENTER_EPSILON_METERS = 1e-7;
const TIE_EPSILON = 1e-12;

function getMaxLineIndex(field: FieldSpec): number {
  return Math.round(field.widthMeters / 2 / field.majorLineSpacingMeters);
}

function getLineValueFromIndex(field: FieldSpec, lineIndex: number): number {
  if (field.gridType === 'YARD_LINES') {
    return 50 - 5 * lineIndex;
  }
  return 5 * lineIndex;
}

function formatLineLabel(field: FieldSpec, lineIndex: number): string {
  const val = getLineValueFromIndex(field, lineIndex);
  if (field.gridType === 'YARD_LINES') {
    return String(val);
  }
  return `${val}m`;
}

function selectVerticalReference(
  yMeters: number,
  refs: ReferenceLineSpec[]
): ReferenceLineSpec {
  const first = refs[0];
  if (!first) {
    throw new Error('FieldSpec.referenceLines cannot be empty.');
  }
  for (let i = 0; i < refs.length - 1; i++) {
    const curr = refs[i]!;
    const next = refs[i + 1]!;
    const mid = 0.5 * (curr.yMeters + next.yMeters);
    // Boundary ownership: exact midpoints bind to the frontward reference line.
    if (yMeters <= mid + TIE_EPSILON) {
      return curr;
    }
  }
  return refs[refs.length - 1]!;
}

export function formatSteps(steps: number): string {
  const rounded = Math.round(steps * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

export function toCoordinateReadout(
  point: CanonicalPoint,
  field: FieldSpec
): CoordinateReadout {
  const { xMeters, yMeters } = point;
  const maxK = getMaxLineIndex(field);
  const absX = Math.abs(xMeters);

  let side: HorizontalSide;
  let lineIndex: number;
  let horizRelation: HorizontalRelation;
  let horizSteps: number;
  let horizExactMetersOffset: number;

  if (absX < CENTER_EPSILON_METERS) {
    side = 'ON_CENTER';
    lineIndex = 0;
    horizRelation = 'ON';
    horizSteps = 0;
    horizExactMetersOffset = 0;
  } else {
    side = xMeters < 0 ? 'SIDE_1' : 'SIDE_2';
    const rawIndex = absX / field.majorLineSpacingMeters;
    // Exact half-interval splits (4.0 steps) deterministically bind inward toward center.
    lineIndex = Math.min(
      maxK,
      Math.max(0, Math.ceil(rawIndex - 0.5 - TIE_EPSILON))
    );
    const lineDist = lineIndex * field.majorLineSpacingMeters;
    const diff = absX - lineDist;
    if (Math.abs(diff) < CENTER_EPSILON_METERS) {
      horizRelation = 'ON';
      horizSteps = 0;
      horizExactMetersOffset = 0;
    } else if (diff > 0) {
      horizRelation = 'OUTSIDE';
      horizSteps = diff / field.stepSizeMeters;
      horizExactMetersOffset = diff;
    } else {
      horizRelation = 'INSIDE';
      horizSteps = -diff / field.stepSizeMeters;
      horizExactMetersOffset = diff;
    }
  }

  const ref = selectVerticalReference(yMeters, field.referenceLines);
  const vDiff = yMeters - ref.yMeters;
  let vertRelation: VerticalRelation;
  let vertSteps: number;
  let vertExactMetersOffset: number;

  if (Math.abs(vDiff) < CENTER_EPSILON_METERS) {
    vertRelation = 'ON';
    vertSteps = 0;
    vertExactMetersOffset = 0;
  } else if (vDiff > 0) {
    vertRelation = 'BEHIND';
    vertSteps = vDiff / field.stepSizeMeters;
    vertExactMetersOffset = vDiff;
  } else {
    vertRelation = 'IN_FRONT';
    vertSteps = -vDiff / field.stepSizeMeters;
    vertExactMetersOffset = vDiff;
  }

  return {
    fieldId: field.id,
    side,
    lineIndex,
    lineValue: getLineValueFromIndex(field, lineIndex),
    lineLabel: formatLineLabel(field, lineIndex),
    horizRelation,
    horizSteps,
    horizExactMetersOffset,
    vertReferenceId: ref.id,
    vertReferenceLabel: ref.label,
    vertReferenceShortLabel: ref.shortLabel,
    vertRelation,
    vertSteps,
    vertReferenceYMeters: ref.yMeters,
    vertExactMetersOffset
  };
}

export function fromCoordinateReadout(
  readout: CoordinateReadout,
  field: FieldSpec
): CanonicalPoint {
  let xMeters = 0;
  if (readout.side !== 'ON_CENTER') {
    const sign = readout.side === 'SIDE_1' ? -1 : 1;
    const lineDist = readout.lineIndex * field.majorLineSpacingMeters;
    const stepMeters = readout.horizSteps * field.stepSizeMeters;
    let distFromCenter = lineDist;
    if (readout.horizRelation === 'OUTSIDE') {
      distFromCenter = lineDist + stepMeters;
    } else if (readout.horizRelation === 'INSIDE') {
      distFromCenter = lineDist - stepMeters;
    }
    xMeters = sign * distFromCenter;
  }

  const matchedRef = field.referenceLines.find(
    (r) => r.id === readout.vertReferenceId
  );
  const baseY = matchedRef ? matchedRef.yMeters : readout.vertReferenceYMeters;
  const vStepMeters = readout.vertSteps * field.stepSizeMeters;
  let yMeters = baseY;
  if (readout.vertRelation === 'BEHIND') {
    yMeters = baseY + vStepMeters;
  } else if (readout.vertRelation === 'IN_FRONT') {
    yMeters = baseY - vStepMeters;
  }

  return { xMeters, yMeters };
}

export function formatCoordinateSheetText(
  readout: CoordinateReadout,
  field: FieldSpec
): { horizontalText: string; verticalText: string; compactText: string } {
  let horizontalText: string;
  let horizontalShort: string;

  if (readout.side === 'ON_CENTER') {
    const centerName = field.gridType === 'YARD_LINES' ? 'On 50 yd line' : 'On 0m center';
    horizontalText = centerName;
    horizontalShort = field.gridType === 'YARD_LINES' ? 'On 50' : 'On 0m';
  } else {
    const sideLabel = readout.side === 'SIDE_1' ? 'Side 1' : 'Side 2';
    const sideShort = readout.side === 'SIDE_1' ? 'S1' : 'S2';
    const lineSuffix = field.gridType === 'YARD_LINES' ? ' yd ln' : ' line';
    if (readout.horizRelation === 'ON') {
      horizontalText = `${sideLabel}: On ${readout.lineLabel}${lineSuffix}`;
      horizontalShort = `${sideShort} On ${readout.lineLabel}`;
    } else {
      const relWord = readout.horizRelation === 'INSIDE' ? 'inside' : 'outside';
      const relShort = readout.horizRelation === 'INSIDE' ? 'in' : 'out';
      const stepStr = formatSteps(readout.horizSteps);
      horizontalText = `${sideLabel}: ${stepStr} st ${relWord} ${readout.lineLabel}${lineSuffix}`;
      horizontalShort = `${sideShort} ${stepStr} ${relShort} ${readout.lineLabel}`;
    }
  }

  let verticalText: string;
  let verticalShort: string;
  if (readout.vertRelation === 'ON') {
    verticalText = `On ${readout.vertReferenceLabel}`;
    verticalShort = `On ${readout.vertReferenceShortLabel}`;
  } else {
    const vRelWord = readout.vertRelation === 'BEHIND' ? 'behind' : 'in front of';
    const vRelShort = readout.vertRelation === 'BEHIND' ? 'bhd' : 'frt';
    const vStepStr = formatSteps(readout.vertSteps);
    verticalText = `${vStepStr} st ${vRelWord} ${readout.vertReferenceShortLabel}`;
    verticalShort = `${vStepStr} ${vRelShort} ${readout.vertReferenceShortLabel}`;
  }

  return {
    horizontalText,
    verticalText,
    compactText: `${horizontalShort} | ${verticalShort}`
  };
}

export function computeHashTranslationDelta(
  point: CanonicalPoint,
  primaryField: FieldSpec,
  venueField: FieldSpec
): HashTranslationDelta {
  const primaryReadout = toCoordinateReadout(point, primaryField);
  const venueReadout = toCoordinateReadout(point, venueField);
  const primaryText = formatCoordinateSheetText(primaryReadout, primaryField);
  const venueText = formatCoordinateSheetText(venueReadout, venueField);

  const sameRef = primaryReadout.vertReferenceId === venueReadout.vertReferenceId;
  const signedPrimarySteps =
    primaryReadout.vertRelation === 'IN_FRONT'
      ? -primaryReadout.vertSteps
      : primaryReadout.vertSteps;
  const signedVenueSteps =
    venueReadout.vertRelation === 'IN_FRONT'
      ? -venueReadout.vertSteps
      : venueReadout.vertSteps;

  const verticalStepShift = signedVenueSteps - signedPrimarySteps;
  const verticalMetersShift =
    venueReadout.vertReferenceYMeters - primaryReadout.vertReferenceYMeters;

  let warningMessage: string | null = null;
  if (Math.abs(verticalMetersShift) > 0.05) {
    const absSteps = formatSteps(Math.abs(verticalMetersShift / venueField.stepSizeMeters));
    const direction = verticalMetersShift > 0 ? 'backfield' : 'frontfield';
    warningMessage = sameRef
      ? `Venue ${venueReadout.vertReferenceShortLabel} sits ${absSteps} steps ${direction} vs ${primaryField.shortName}. March ${venueText.verticalText} to stay on physical spot.`
      : `Venue reference switches from ${primaryReadout.vertReferenceShortLabel} to ${venueReadout.vertReferenceShortLabel} (${venueText.verticalText}).`;
  }

  return {
    primaryHorizontal: primaryText.horizontalText,
    primaryVertical: primaryText.verticalText,
    venueHorizontal: venueText.horizontalText,
    venueVertical: venueText.verticalText,
    verticalStepShift,
    verticalMetersShift,
    warningMessage
  };
}

export function snapMetersToHalfStep(
  point: CanonicalPoint,
  field: FieldSpec
): CanonicalPoint {
  const halfStep = field.stepSizeMeters * 0.5;
  return {
    xMeters: Math.round(point.xMeters / halfStep) * halfStep,
    yMeters: Math.round(point.yMeters / halfStep) * halfStep
  };
}
