import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCameraState, projectWorldToScreen } from '../src/core/camera3d.ts';
import {
  orderPerformersForRipple,
  POSTURE_SPECS,
  resolvePerformerBodyState
} from '../src/core/choreography.ts';
import { FIELD_SPECS } from '../src/core/fields.ts';
import {
  executeHarnessLens,
  parseNaturalLanguageIntent,
  revertHarnessReceipt
} from '../src/core/harness.ts';
import { analyzeShowIntelligence } from '../src/core/intelligence.ts';
import { DrillSet, DrillShow, Performer } from '../src/core/types.ts';

function makePerf(id: string, weightFactor = 1.0): Performer {
  return {
    id,
    label: id,
    name: `Player ${id}`,
    section: 'BRASS',
    instrument: 'Trumpet',
    clearanceRadiusMeters: 0.65,
    weightFactor
  };
}

test('half-open [startCount, endCount) cue ownership holds across boundary seams and terminal beat', () => {
  const perf = makePerf('B1');
  const set: DrillSet = {
    id: 's1',
    name: 'Set 1',
    rehearsalMark: 'A',
    counts: 0,
    tempoBpm: 160,
    notes: '',
    positions: { B1: { xMeters: 0, yMeters: 18 } },
    bodyCues: [
      {
        id: 'c1',
        label: 'Kneel Phase',
        targetPerformerIds: ['B1'],
        startCount: 0,
        endCount: 8,
        rippleDelayCounts: 0,
        posture: 'KNEEL_RIGHT',
        hornCarriage: 'HORNS_DOWN',
        upperFacing: 'PRESS_BOX',
        instruction: 'Kneel 0-8'
      },
      {
        id: 'c2',
        label: 'Lunge Phase',
        targetPerformerIds: ['B1'],
        startCount: 8,
        endCount: 16,
        rippleDelayCounts: 0,
        posture: 'LUNGE_LEFT',
        hornCarriage: 'HIGH_BELL_EXTENSION',
        upperFacing: 'PRESS_BOX',
        instruction: 'Lunge 8-16'
      }
    ]
  };

  const at0 = resolvePerformerBodyState(perf, set, 0, 16, { xMeters: 0, yMeters: 18 }, 0, false);
  const at799 = resolvePerformerBodyState(perf, set, 7.99, 16, { xMeters: 0, yMeters: 18 }, 0, false);
  const at80 = resolvePerformerBodyState(perf, set, 8.0, 16, { xMeters: 0, yMeters: 18 }, 0, false);
  const at16 = resolvePerformerBodyState(perf, set, 16.0, 16, { xMeters: 0, yMeters: 18 }, 0, false);

  assert.equal(at0.posture, 'KNEEL_RIGHT');
  assert.equal(at799.posture, 'KNEEL_RIGHT');
  assert.equal(at80.posture, 'LUNGE_LEFT');
  assert.equal(at16.posture, 'LUNGE_LEFT');
});

test('ripple trigger schedule, CENTER_OUT sorting, and pulse window behave deterministically', () => {
  const positions = {
    A: { xMeters: -10, yMeters: 18 },
    B: { xMeters: -2, yMeters: 18 },
    C: { xMeters: 3, yMeters: 18 },
    D: { xMeters: 12, yMeters: 18 }
  };
  const centerOut = orderPerformersForRipple(['A', 'B', 'C', 'D'], positions, 'CENTER_OUT');
  assert.deepEqual(centerOut, ['B', 'C', 'A', 'D']);

  const perfC = makePerf('C');
  const set: DrillSet = {
    id: 's1',
    name: 'Set 1',
    rehearsalMark: 'A',
    counts: 0,
    tempoBpm: 160,
    notes: '',
    positions,
    bodyCues: [
      {
        id: 'rip',
        label: 'Wave Snap',
        targetPerformerIds: centerOut,
        startCount: 4,
        endCount: 16,
        rippleDelayCounts: 1.5, // B@4.0, C@5.5, A@7.0, D@8.5
        posture: 'LUNGE_RIGHT',
        hornCarriage: 'HORNS_SNAP_UP',
        upperFacing: 'PRESS_BOX',
        instruction: 'Ripple snap'
      }
    ]
  };

  // Performer C triggers at 4 + 1 * 1.5 = 5.5, pulse active in [5.5, 7.0)
  const beforeC = resolvePerformerBodyState(perfC, set, 5.4, 16, positions.C, 0, false);
  const onTriggerC = resolvePerformerBodyState(perfC, set, 5.6, 16, positions.C, 0, false);
  const afterPulseC = resolvePerformerBodyState(perfC, set, 7.2, 16, positions.C, 0, false);

  assert.equal(beforeC.posture, 'UPRIGHT_GLIDE');
  assert.equal(beforeC.isPulseActive, false);
  assert.equal(onTriggerC.posture, 'LUNGE_RIGHT');
  assert.equal(onTriggerC.triggerCount, 5.5);
  assert.equal(onTriggerC.isPulseActive, true);
  assert.equal(afterPulseC.posture, 'LUNGE_RIGHT');
  assert.equal(afterPulseC.isPulseActive, false);
});

test('3D Judge camera projects kneeling elevation (1.05m) strictly lower on screen than upright (1.72m)', () => {
  const cam = buildCameraState('HIGH_CAM_JUDGE', FIELD_SPECS.NCAA_DCI, 0, 0, 1.0);
  const headUpright = projectWorldToScreen(
    { x: 0, y: 18.288, z: POSTURE_SPECS.UPRIGHT_GLIDE.elevationMeters },
    cam,
    1280,
    720
  )!;
  const headKneel = projectWorldToScreen(
    { x: 0, y: 18.288, z: POSTURE_SPECS.KNEEL_RIGHT.elevationMeters },
    cam,
    1280,
    720
  )!;

  assert.ok(headKneel.v > headUpright.v, 'Kneeling head must project lower on screen (larger v)');
});

test('kneel-to-sprint BodyTransitionAlert fires cleanly and STAMP_BODY_CUE supports lossless revert', () => {
  const show: DrillShow = {
    id: 'kneel-sprint-check',
    title: 'Kneel Sprint Check',
    organization: 'Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [makePerf('B1', 1.4), makePerf('B2', 1.0)],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 160,
        notes: '',
        positions: {
          B1: { xMeters: -2, yMeters: 18 },
          B2: { xMeters: 2, yMeters: 18 }
        },
        bodyCues: [
          {
            id: 'c-kneel-end',
            label: 'End Kneeling',
            targetPerformerIds: ['B1'],
            startCount: 0,
            endCount: 8,
            rippleDelayCounts: 0,
            posture: 'KNEEL_RIGHT',
            hornCarriage: 'HORNS_DOWN',
            upperFacing: 'PRESS_BOX',
            instruction: 'Kneel through ct 8'
          }
        ]
      },
      {
        id: 's2',
        name: 'Set 2',
        rehearsalMark: 'B',
        counts: 8,
        tempoBpm: 160,
        notes: '',
        positions: {
          B1: { xMeters: -2, yMeters: 18 },
          B2: { xMeters: 2, yMeters: 18 }
        }
      },
      {
        id: 's3',
        name: 'Set 3',
        rehearsalMark: 'C',
        counts: 8,
        tempoBpm: 160,
        notes: '',
        positions: {
          // 7.315m in 8 counts => 5.0-to-5 sprint directly out of Set 1->2 kneel!
          B1: { xMeters: -2, yMeters: 10.685 },
          B2: { xMeters: 2, yMeters: 18 }
        }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const intel = analyzeShowIntelligence(show, 0);
  assert.equal(intel.bodyAlerts.length, 1);
  assert.equal(intel.bodyAlerts[0]!.performerId, 'B1');
  assert.equal(intel.bodyAlerts[0]!.severity, 'CRITICAL');

  const stamped = executeHarnessLens(show, {
    kind: 'STAMP_BODY_CUE',
    setIndex: 0,
    performerIds: ['B1', 'B2'],
    startCount: 0,
    endCount: 8,
    rippleDelayCounts: 0,
    rippleOrder: 'LEFT_TO_RIGHT',
    posture: 'UPRIGHT_GLIDE',
    hornCarriage: 'HORNS_SNAP_UP',
    upperFacing: 'PRESS_BOX'
  });
  assert.equal(stamped.ok, true);
  if (!stamped.ok) return;

  const afterIntel = analyzeShowIntelligence(stamped.updatedShow, 0);
  assert.equal(afterIntel.bodyAlerts.length, 0);

  const reverted = revertHarnessReceipt(stamped.updatedShow, stamped.receipt.id);
  assert.equal(reverted.ok, true);
  if (!reverted.ok) return;
  assert.equal(analyzeShowIntelligence(reverted.updatedShow, 0).bodyAlerts.length, 1);

  const parsed = parseNaturalLanguageIntent(
    'Ripple brass lunge left and horns snap up',
    show,
    0,
    []
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.lens.kind, 'STAMP_BODY_CUE');
  }
});
