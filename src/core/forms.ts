import { CanonicalPoint, FieldSpec, FormShape, PerformerDot } from './types.ts';

export function clampPointToFieldEnvelope(
  pt: CanonicalPoint,
  field: FieldSpec
): CanonicalPoint {
  const maxX = field.widthMeters / 2 + field.endzoneDepthMeters;
  const minY = -field.pitDepthMeters;
  const maxY = field.depthMeters + 2.0;
  return {
    xMeters: Math.min(maxX, Math.max(-maxX, pt.xMeters)),
    yMeters: Math.min(maxY, Math.max(minY, pt.yMeters))
  };
}

export function generateLineForm(
  count: number,
  start: CanonicalPoint,
  end: CanonicalPoint
): CanonicalPoint[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [
      {
        xMeters: 0.5 * (start.xMeters + end.xMeters),
        yMeters: 0.5 * (start.yMeters + end.yMeters)
      }
    ];
  }
  const points: CanonicalPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    points.push({
      xMeters: start.xMeters + (end.xMeters - start.xMeters) * t,
      yMeters: start.yMeters + (end.yMeters - start.yMeters) * t
    });
  }
  return points;
}

export function generateCompanyFrontForm(
  count: number,
  centerX: number,
  baseY: number,
  spanMeters: number
): CanonicalPoint[] {
  return generateLineForm(
    count,
    { xMeters: centerX - spanMeters / 2, yMeters: baseY },
    { xMeters: centerX + spanMeters / 2, yMeters: baseY }
  );
}

export function generateArcForm(
  count: number,
  startX: number,
  endX: number,
  baseY: number,
  archDepthMeters: number
): CanonicalPoint[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ xMeters: 0.5 * (startX + endX), yMeters: baseY + archDepthMeters }];
  }
  const points: CanonicalPoint[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const xMeters = startX + (endX - startX) * u;
    const normalized = 2 * u - 1; // [-1, +1]
    const yMeters = baseY + archDepthMeters * (1 - normalized * normalized);
    points.push({ xMeters, yMeters });
  }
  return points;
}

export function generateWedgeForm(
  count: number,
  apexPoint: CanonicalPoint,
  wingSpanMeters: number,
  depthMeters: number
): CanonicalPoint[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ ...apexPoint }];
  }
  const halfSpan = wingSpanMeters / 2;
  const points: CanonicalPoint[] = [{ ...apexPoint }];
  const remaining = count - 1;
  const leftCount = Math.ceil(remaining / 2);
  const rightCount = Math.floor(remaining / 2);

  for (let i = 1; i <= leftCount; i++) {
    const t = i / Math.max(1, leftCount);
    points.push({
      xMeters: apexPoint.xMeters - halfSpan * t,
      yMeters: apexPoint.yMeters + depthMeters * t
    });
  }
  for (let i = 1; i <= rightCount; i++) {
    const t = i / Math.max(1, rightCount);
    points.push({
      xMeters: apexPoint.xMeters + halfSpan * t,
      yMeters: apexPoint.yMeters + depthMeters * t
    });
  }
  return points;
}

export function generateBlockForm(
  count: number,
  center: CanonicalPoint,
  rows: number,
  stepIntervalMeters: number
): CanonicalPoint[] {
  if (count <= 0) return [];
  const safeRows = Math.max(1, Math.min(count, Math.round(rows)));
  const cols = Math.ceil(count / safeRows);
  const totalWidth = (cols - 1) * stepIntervalMeters;
  const totalDepth = (safeRows - 1) * stepIntervalMeters;
  const points: CanonicalPoint[] = [];

  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < cols; c++) {
      if (points.length >= count) break;
      points.push({
        xMeters: center.xMeters - totalWidth / 2 + c * stepIntervalMeters,
        yMeters: center.yMeters - totalDepth / 2 + r * stepIntervalMeters
      });
    }
  }
  return points;
}

export function generateSpiralForm(
  count: number,
  center: CanonicalPoint,
  innerRadiusMeters: number,
  outerRadiusMeters: number,
  turns = 1.65
): CanonicalPoint[] {
  if (count <= 0) return [];
  if (count === 1) return [{ ...center }];
  const points: CanonicalPoint[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const radius = innerRadiusMeters + (outerRadiusMeters - innerRadiusMeters) * u;
    const angle = u * turns * Math.PI * 2 - Math.PI / 2;
    points.push({
      xMeters: center.xMeters + radius * Math.cos(angle),
      yMeters: center.yMeters + radius * 0.72 * Math.sin(angle)
    });
  }
  return points;
}

export function generateFormByShape(
  shape: FormShape,
  count: number,
  centerX: number,
  baseY: number,
  spanMeters: number,
  depthMeters: number
): CanonicalPoint[] {
  switch (shape) {
    case 'COMPANY_FRONT':
    case 'LINE':
      return generateCompanyFrontForm(count, centerX, baseY, spanMeters);
    case 'ARC':
      return generateArcForm(
        count,
        centerX - spanMeters / 2,
        centerX + spanMeters / 2,
        baseY,
        depthMeters
      );
    case 'WEDGE':
      return generateWedgeForm(
        count,
        { xMeters: centerX, yMeters: baseY },
        spanMeters,
        Math.abs(depthMeters) > 0.5 ? depthMeters : 8.0
      );
    case 'BLOCK': {
      const rows = Math.max(2, Math.round(Math.sqrt(count * 0.6)));
      const cols = Math.max(1, Math.ceil(count / rows) - 1);
      const interval = Math.max(1.15, spanMeters / cols);
      return generateBlockForm(count, { xMeters: centerX, yMeters: baseY }, rows, interval);
    }
    case 'SPIRAL':
      return generateSpiralForm(
        count,
        { xMeters: centerX, yMeters: baseY },
        1.5,
        Math.max(4.0, spanMeters * 0.45)
      );
  }
}

export function computeSelectionCentroid(
  positions: Record<string, PerformerDot>,
  performerIds: string[]
): CanonicalPoint {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id of performerIds) {
    const dot = positions[id];
    if (!dot) continue;
    sumX += dot.xMeters;
    sumY += dot.yMeters;
    count++;
  }
  if (count === 0) return { xMeters: 0, yMeters: 0 };
  return { xMeters: sumX / count, yMeters: sumY / count };
}

export function translateDots(
  positions: Record<string, PerformerDot>,
  performerIds: string[],
  dxMeters: number,
  dyMeters: number,
  field: FieldSpec
): Record<string, PerformerDot> {
  const next = { ...positions };
  for (const id of performerIds) {
    const dot = positions[id];
    if (!dot) continue;
    const clamped = clampPointToFieldEnvelope(
      { xMeters: dot.xMeters + dxMeters, yMeters: dot.yMeters + dyMeters },
      field
    );
    next[id] = { ...dot, ...clamped };
  }
  return next;
}

export function rotateDotsAround(
  positions: Record<string, PerformerDot>,
  performerIds: string[],
  pivot: CanonicalPoint,
  angleRad: number,
  field: FieldSpec
): Record<string, PerformerDot> {
  const next = { ...positions };
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  for (const id of performerIds) {
    const dot = positions[id];
    if (!dot) continue;
    const rx = dot.xMeters - pivot.xMeters;
    const ry = dot.yMeters - pivot.yMeters;
    const clamped = clampPointToFieldEnvelope(
      {
        xMeters: pivot.xMeters + rx * cos - ry * sin,
        yMeters: pivot.yMeters + rx * sin + ry * cos
      },
      field
    );
    next[id] = { ...dot, ...clamped };
  }
  return next;
}

export function scaleDotsAround(
  positions: Record<string, PerformerDot>,
  performerIds: string[],
  pivot: CanonicalPoint,
  scaleX: number,
  scaleY: number,
  field: FieldSpec
): Record<string, PerformerDot> {
  const next = { ...positions };
  for (const id of performerIds) {
    const dot = positions[id];
    if (!dot) continue;
    const clamped = clampPointToFieldEnvelope(
      {
        xMeters: pivot.xMeters + (dot.xMeters - pivot.xMeters) * scaleX,
        yMeters: pivot.yMeters + (dot.yMeters - pivot.yMeters) * scaleY
      },
      field
    );
    next[id] = { ...dot, ...clamped };
  }
  return next;
}

export function mirrorDotsAcrossCenter(
  positions: Record<string, PerformerDot>,
  performerIds: string[],
  field: FieldSpec
): Record<string, PerformerDot> {
  const next = { ...positions };
  for (const id of performerIds) {
    const dot = positions[id];
    if (!dot) continue;
    const clamped = clampPointToFieldEnvelope(
      { xMeters: -dot.xMeters, yMeters: dot.yMeters },
      field
    );
    next[id] = {
      ...dot,
      ...clamped,
      curveOffsetMeters: dot.curveOffsetMeters ? -dot.curveOffsetMeters : 0
    };
  }
  return next;
}
