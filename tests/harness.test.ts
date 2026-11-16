import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeHarnessLens,
  parseNaturalLanguageIntent,
  revertHarnessReceipt
} from '../src/core/harness.ts';
import { solveMinCostAssignment } from '../src/core/hungarian.ts';
import { analyzeShowIntelligence } from '../src/core/intelligence.ts';
import { DrillShow, Performer, SectionId } from '../src/core/types.ts';

function bruteForceMinAssignmentCost(matrix: number[][]): number {
  const n = matrix.length;
  const used = new Array<boolean>(matrix[0]!.length).fill(false);
  let best = Infinity;

  function dfs(row: number, acc: number): void {
    if (acc >= best) return;
    if (row === n) {
      best = acc;
      return;
    }
    for (let col = 0; col < matrix[0]!.length; col++) {
      if (!used[col]) {
        used[col] = true;
        dfs(row + 1, acc + matrix[row]![col]!);
        used[col] = false;
      }
    }
  }
  dfs(0, 0);
  return best;
}

function makePerf(id: string, section: SectionId = 'BRASS'): Performer {
  return {
    id,
    label: id,
    name: `Player ${id}`,
    section,
    instrument: section === 'BRASS' ? 'Trumpet' : 'Snare',
    clearanceRadiusMeters: 0.7,
    weightFactor: 1.0
  };
}

test('Hungarian solver matches independent N! brute-force optimality across N=5 and N=6 matrices', () => {
  const matrices: number[][][] = [
    [
      [9, 2, 7, 8, 5],
      [6, 4, 3, 7, 9],
      [5, 8, 1, 8, 3],
      [7, 6, 9, 4, 2],
      [4, 4, 4, 4, 4]
    ],
    [
      [12.4, 3.1, 8.8, 19.2, 6.5, 4.0],
      [7.7, 14.2, 2.5, 9.1, 3.8, 11.4],
      [5.5, 5.5, 5.5, 5.5, 5.5, 5.5],
      [2.1, 8.9, 13.4, 6.2, 9.0, 1.5],
      [18.0, 4.3, 7.6, 2.9, 10.2, 8.8],
      [6.1, 9.5, 4.4, 7.3, 2.2, 12.1]
    ]
  ];

  for (const m of matrices) {
    const res = solveMinCostAssignment(m);
    const exact = bruteForceMinAssignmentCost(m);
    assert.ok(Math.abs(res.totalCost - exact) < 1e-9);
    assert.equal(new Set(res.assignment).size, m.length);
  }
});

test('OPTIMIZE_ASSIGNMENT eliminates crossing paths while respecting section locks', () => {
  const show: DrillShow = {
    id: 'crossing-show',
    title: 'Crossing Optimization',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [
      makePerf('B1', 'BRASS'),
      makePerf('B2', 'BRASS'),
      makePerf('P1', 'BATTERY'),
      makePerf('P2', 'BATTERY')
    ],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 160,
        notes: '',
        positions: {
          B1: { xMeters: -6, yMeters: 15 },
          B2: { xMeters: 6, yMeters: 25 },
          P1: { xMeters: -4, yMeters: 28 },
          P2: { xMeters: 4, yMeters: 28 }
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
          // Crossed X assignments inside both BRASS and BATTERY
          B1: { xMeters: 6, yMeters: 25 },
          B2: { xMeters: -6, yMeters: 15 },
          P1: { xMeters: 4, yMeters: 32 },
          P2: { xMeters: -4, yMeters: 32 }
        }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const result = executeHarnessLens(show, {
    kind: 'OPTIMIZE_ASSIGNMENT',
    fromSetIndex: 0,
    lockSections: true,
    stridePower: 2.2
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.ok(result.receipt.beforeMetrics.crossingCount > 0);
  assert.equal(result.receipt.afterMetrics.crossingCount, 0);
  // Section membership preserved: Brass stay on Brass slots, Battery stay on Battery slots.
  assert.equal(result.updatedShow.sets[1]!.positions.B1!.xMeters, -6);
  assert.equal(result.updatedShow.sets[1]!.positions.P1!.xMeters, -4);
});

test('DEFLECT_COLLISIONS resolves head-on pass-through without moving endpoint dots and supports lossless revert', () => {
  const show: DrillShow = {
    id: 'deflect-show',
    title: 'Pass Through Test',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [makePerf('B1'), makePerf('B2')],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 160,
        notes: '',
        positions: {
          B1: { xMeters: -6, yMeters: 20 },
          B2: { xMeters: 6, yMeters: 20 }
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
          B1: { xMeters: 6, yMeters: 20 },
          B2: { xMeters: -6, yMeters: 20 }
        }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const result = executeHarnessLens(show, {
    kind: 'DEFLECT_COLLISIONS',
    fromSetIndex: 0,
    minClearanceMeters: 1.25
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.receipt.beforeMetrics.collisionCount, 1);
  assert.equal(result.receipt.afterMetrics.collisionCount, 0);
  // Endpoints untouched within 1e-12
  assert.ok(
    Math.abs(result.updatedShow.sets[1]!.positions.B1!.xMeters - 6) < 1e-12
  );
  assert.ok(
    Math.abs(result.updatedShow.sets[1]!.positions.B2!.xMeters + 6) < 1e-12
  );

  const reverted = revertHarnessReceipt(result.updatedShow, result.receipt.id);
  assert.equal(reverted.ok, true);
  if (!reverted.ok) return;
  assert.equal(reverted.updatedShow.harnessLedger.length, 0);
  assert.equal(
    reverted.updatedShow.sets[1]!.positions.B1!.curveOffsetMeters ?? 0,
    0
  );
});

test('COMPACT_ACOUSTIC brings backfield performers under delay cap and invalid preconditions fail closed', () => {
  const show: DrillShow = {
    id: 'acoustic-show',
    title: 'Acoustic Compaction',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [makePerf('P1', 'BATTERY')],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 160,
        notes: '',
        positions: {
          P1: { xMeters: 0, yMeters: 42 }
        }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const beforeIntel = analyzeShowIntelligence(show, 0);
  assert.ok(beforeIntel.acoustic.maxEnsembleDelayMs > 100);

  const res = executeHarnessLens(show, {
    kind: 'COMPACT_ACOUSTIC',
    setIndex: 0,
    maxDelayMs: 55,
    targetSections: ['BATTERY']
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.ok(res.receipt.afterMetrics.maxAcousticDelayMs <= 55.0);

  // Fail closed on out-of-range transition or impossible acoustic request
  const badTransition = executeHarnessLens(show, {
    kind: 'OPTIMIZE_ASSIGNMENT',
    fromSetIndex: 4,
    lockSections: true
  });
  assert.equal(badTransition.ok, false);
  if (!badTransition.ok) {
    assert.equal(badTransition.code, 'PRECONDITION_FAILED');
  }

  const parsed = parseNaturalLanguageIntent(
    'Stage brass arc on front hash',
    show,
    0,
    ['P1']
  );
  assert.equal(parsed.ok, true);
});
