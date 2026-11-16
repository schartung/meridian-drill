import assert from 'node:assert/strict';
import test from 'node:test';
import { FIELD_SPECS } from '../src/core/fields.ts';
import {
  analyzeShowIntelligence,
  computeAcousticDelayMs,
  speedOfSoundMps
} from '../src/core/intelligence.ts';
import {
  computeSegmentArcLengthMeters,
  evaluateSegmentPoint,
  interpolateShowAtPosition
} from '../src/core/interpolation.ts';
import { DrillShow, Performer } from '../src/core/types.ts';

function makePerformer(id: string, weightFactor = 1.0): Performer {
  return {
    id,
    label: id,
    name: `Performer ${id}`,
    section: 'BRASS',
    instrument: 'Trumpet',
    clearanceRadiusMeters: 0.7,
    weightFactor
  };
}

test('linear 5-yard move over 8 counts produces exact 8.0-to-5 stride and exact sub-segment sum', () => {
  const show: DrillShow = {
    id: 'test-linear',
    title: 'Linear Stride Check',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [makePerformer('B1')],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 160,
        notes: '',
        positions: { B1: { xMeters: 0, yMeters: 10 } }
      },
      {
        id: 's2',
        name: 'Set 2',
        rehearsalMark: 'B',
        counts: 8,
        tempoBpm: 160,
        notes: '',
        positions: { B1: { xMeters: 4.572, yMeters: 10 } }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const midState = interpolateShowAtPosition(show, 0, 4, FIELD_SPECS.NCAA_DCI).B1!;
  assert.ok(Math.abs(midState.xMeters - 2.286) < 1e-12);
  assert.ok(Math.abs(midState.stepsPerFive - 8.0) < 1e-9);
  assert.ok(Math.abs(midState.stepLengthMeters - 0.5715) < 1e-12);

  let sumDist = 0;
  let prev = interpolateShowAtPosition(show, 0, 0, FIELD_SPECS.NCAA_DCI).B1!;
  for (let c = 1; c <= 8; c++) {
    const curr = interpolateShowAtPosition(show, 0, c, FIELD_SPECS.NCAA_DCI).B1!;
    sumDist += Math.hypot(curr.xMeters - prev.xMeters, curr.yMeters - prev.yMeters);
    prev = curr;
  }
  assert.ok(Math.abs(sumDist - 4.572) < 1e-12);
});

test('quadratic Bezier curve passes through exact offset midpoint and respects triangle inequality', () => {
  const p0 = { xMeters: 0, yMeters: 10 };
  const p1 = { xMeters: 10, yMeters: 10, curveOffsetMeters: 2.0 };
  const mid = evaluateSegmentPoint(p0, p1, 0.5);
  assert.ok(Math.abs(mid.xMeters - 5.0) < 1e-12);
  assert.ok(Math.abs(mid.yMeters - 12.0) < 1e-12);

  const arcLen = computeSegmentArcLengthMeters(p0, p1, 64);
  const ctrl = { xMeters: 5, yMeters: 14 };
  const polygonUpperBound =
    Math.hypot(ctrl.xMeters - p0.xMeters, ctrl.yMeters - p0.yMeters) +
    Math.hypot(p1.xMeters - ctrl.xMeters, p1.yMeters - ctrl.yMeters);

  assert.ok(arcLen > 10.0, 'Curved arc length must exceed straight chord');
  assert.ok(arcLen <= polygonUpperBound + 1e-9);
});

test('sub-count collision scanner catches mid-set crossing collision despite safe endpoint spacing', () => {
  const show: DrillShow = {
    id: 'test-crossing',
    title: 'Crossing Test',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [makePerformer('B1'), makePerformer('B2')],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 160,
        notes: '',
        positions: {
          B1: { xMeters: -5, yMeters: 20 },
          B2: { xMeters: 5, yMeters: 20 }
        }
      },
      {
        id: 's2',
        name: 'Set 2',
        rehearsalMark: 'B',
        counts: 8,
        tempoBpm: 160,
        notes: '',
        positions: {
          B1: { xMeters: 5, yMeters: 20 },
          B2: { xMeters: -5, yMeters: 20 }
        }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const report = analyzeShowIntelligence(show);
  assert.equal(report.collisions.length, 1);
  const col = report.collisions[0]!;
  assert.equal(col.severity, 'CRITICAL');
  assert.ok(Math.abs(col.countOffset - 4.0) < 1e-9);
  assert.ok(col.minDistanceMeters < 1e-9);
  assert.equal(report.crossingCountsByTransition[0], 0); // Collinear opposing swap has zero interior transverse cross, handled by sub-count collision scanner.
});

test('direction-reversal whiplash triggers on 180-deg sprint reversal and skips gentle turns', () => {
  const show: DrillShow = {
    id: 'test-whiplash',
    title: 'Whiplash Test',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [makePerformer('REV', 1.4), makePerformer('SMOOTH', 1.0)],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 168,
        notes: '',
        positions: {
          REV: { xMeters: 0, yMeters: 10 },
          SMOOTH: { xMeters: -15, yMeters: 10 }
        }
      },
      {
        id: 's2',
        name: 'Set 2',
        rehearsalMark: 'B',
        counts: 8,
        tempoBpm: 168,
        notes: '',
        positions: {
          REV: { xMeters: 6.5, yMeters: 10 },
          SMOOTH: { xMeters: -10, yMeters: 10 }
        }
      },
      {
        id: 's3',
        name: 'Set 3',
        rehearsalMark: 'C',
        counts: 8,
        tempoBpm: 168,
        notes: '',
        positions: {
          REV: { xMeters: 0, yMeters: 10 },
          SMOOTH: { xMeters: -5, yMeters: 11 }
        }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const report = analyzeShowIntelligence(show);
  assert.equal(report.whiplashAlerts.length, 1);
  assert.equal(report.whiplashAlerts[0]!.performerId, 'REV');
  assert.ok(Math.abs(report.whiplashAlerts[0]!.turnAngleDeg - 180) < 1e-6);
});

test('acoustic delay increases monotonically backfield and reflects ambient temperature', () => {
  const c20 = speedOfSoundMps(20);
  assert.ok(Math.abs(c20 - 343.21) < 0.05);

  const dFront = computeAcousticDelayMs({ xMeters: 0, yMeters: 0 }, 20);
  const dHash = computeAcousticDelayMs({ xMeters: 0, yMeters: 18.288 }, 20);
  const dBack = computeAcousticDelayMs({ xMeters: 0, yMeters: 40 }, 20);
  assert.ok(dFront < dHash && dHash < dBack);

  const dCold = computeAcousticDelayMs({ xMeters: 0, yMeters: 40 }, 5);
  const dHot = computeAcousticDelayMs({ xMeters: 0, yMeters: 40 }, 35);
  assert.ok(dCold > dHot, 'Colder air has lower speed of sound and greater arrival lag');
});
