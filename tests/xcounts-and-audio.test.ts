import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildShowTimeMap,
  computeWaveformPeaks,
  formatTimeMmSs,
  getTotalShowDurationSeconds,
  globalCountToSeconds,
  secondsToGlobalCount,
  synthesizeShowEnsemblePcm
} from '../src/core/audioSync.ts';
import { generatePerformerDotBook } from '../src/core/collaboration.ts';
import { createDemoShow } from '../src/core/demoShow.ts';
import { FIELD_SPECS } from '../src/core/fields.ts';
import { getTotalShowCounts } from '../src/core/interpolation.ts';
import { DrillShow } from '../src/core/types.ts';
import { computeTransitionXCounts, formatXCountsSummary } from '../src/core/xcounts.ts';

test('linear NCAA move from Side 1 40 to Side 2 45 in 24 counts crosses S1 45 at ct 8 and 50 at ct 16', () => {
  const field = FIELD_SPECS.NCAA_DCI;
  const p0 = { xMeters: -2 * field.majorLineSpacingMeters, yMeters: 18.288 };
  const p1 = { xMeters: 1 * field.majorLineSpacingMeters, yMeters: 18.288 };

  const crossings = computeTransitionXCounts(p0, p1, 24, field);
  assert.equal(crossings.length, 2);

  assert.equal(crossings[0]!.lineLabel, 'S1 45');
  assert.equal(crossings[0]!.direction, 'TO_SIDE_2');
  assert.ok(Math.abs(crossings[0]!.countOffset - 8.0) < 1e-4);

  assert.equal(crossings[1]!.lineLabel, '50');
  assert.equal(crossings[1]!.direction, 'TO_SIDE_2');
  assert.ok(Math.abs(crossings[1]!.countOffset - 16.0) < 1e-4);

  assert.equal(formatXCountsSummary(crossings), 'ct 8: S1 45 · ct 16: 50');

  // Adjacent exact endpoints (starting on S1 45, ending on 50) exclude both boundaries.
  const adjacent = computeTransitionXCounts(
    { xMeters: -field.majorLineSpacingMeters, yMeters: 18.288 },
    { xMeters: 0, yMeters: 18.288 },
    8,
    field
  );
  assert.equal(adjacent.length, 0);
});

test('curved Bezier path across 50 yard line captures both crossings missed by straight chord', () => {
  const field = FIELD_SPECS.NCAA_DCI;
  const p0 = { xMeters: -1.0, yMeters: 10.0 };
  const straightP1 = { xMeters: -1.0, yMeters: 26.0, curveOffsetMeters: 0 };
  const curvedP1 = { xMeters: -1.0, yMeters: 26.0, curveOffsetMeters: -3.0 };

  assert.equal(computeTransitionXCounts(p0, straightP1, 16, field).length, 0);

  const curved = computeTransitionXCounts(p0, curvedP1, 16, field);
  assert.equal(curved.length, 2);
  assert.equal(curved[0]!.lineLabel, '50');
  assert.equal(curved[0]!.direction, 'TO_SIDE_2');
  assert.equal(curved[1]!.lineLabel, '50');
  assert.equal(curved[1]!.direction, 'TO_SIDE_1');
  assert.ok(curved[0]!.countOffset < curved[1]!.countOffset);
});

test('JMBA 30m metric 5m grid crossing labels format metric lines accurately', () => {
  const jmba = FIELD_SPECS.JMBA_30M;
  const crossings = computeTransitionXCounts(
    { xMeters: -6.0, yMeters: 15.0 },
    { xMeters: 6.0, yMeters: 15.0 },
    24,
    jmba
  );
  assert.deepEqual(
    crossings.map((c) => c.lineLabel),
    ['S1 5m', '0m', 'S2 5m']
  );
  assert.ok(Math.abs(crossings[1]!.countOffset - 12.0) < 1e-4);
});

test('DotBook integrates xCounts crossings cleanly for moving sets', () => {
  const field = FIELD_SPECS.NCAA_DCI;
  const miniShow: DrillShow = {
    id: 'xct-mini',
    title: 'xCounts Verification Show',
    organization: 'Meridian Test',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers: [
      {
        id: 'B1',
        label: 'B1',
        name: 'Lead Trumpet',
        section: 'BRASS',
        instrument: 'Trumpet',
        clearanceRadiusMeters: 0.65,
        weightFactor: 1.0
      }
    ],
    sets: [
      {
        id: 's1',
        name: 'Set 1',
        rehearsalMark: 'A',
        counts: 0,
        tempoBpm: 120,
        notes: '',
        positions: { B1: { xMeters: -2 * field.majorLineSpacingMeters, yMeters: 18.288 } }
      },
      {
        id: 's2',
        name: 'Set 2',
        rehearsalMark: 'B',
        counts: 24,
        tempoBpm: 120,
        notes: '',
        positions: { B1: { xMeters: field.majorLineSpacingMeters, yMeters: 18.288 } }
      }
    ],
    pins: [],
    harnessLedger: []
  };

  const book = generatePerformerDotBook(miniShow, 'B1');
  assert.equal(book.entries[0]!.xCountsText, 'Anchor');
  assert.equal(book.entries[1]!.xCountsText, 'ct 8: S1 45 · ct 16: 50');
});

test('variable-tempo count-to-seconds mapping is an exact bijection across demo show BPM shifts', () => {
  const show = createDemoShow();
  const timeMap = buildShowTimeMap(show);
  assert.ok(timeMap.length >= 6);

  // Confirm variable BPMs exist in the demo show (152 -> 156 -> 160 -> 116 -> 112)
  const bpms = new Set(timeMap.map((s) => s.tempoBpm));
  assert.ok(bpms.size >= 4);

  const totalCounts = getTotalShowCounts(show);
  for (let c = 0; c <= totalCounts; c += 0.25) {
    const sec = globalCountToSeconds(show, c);
    const recovered = secondsToGlobalCount(show, sec);
    assert.ok(
      Math.abs(recovered - c) < 1e-9,
      `Bijection failed at count ${c}: sec=${sec}, recovered=${recovered}`
    );
  }

  // Test non-zero audio lead-in offset
  const offsetShow: DrillShow = {
    ...show,
    audioMeta: {
      trackLabel: 'Lead-in Track',
      durationSeconds: getTotalShowDurationSeconds(show) + 2.5,
      beatOffsetSeconds: 2.5,
      sourceKind: 'UPLOADED_FILE'
    }
  };
  assert.equal(globalCountToSeconds(offsetShow, 0), 2.5);
  assert.equal(secondsToGlobalCount(offsetShow, 1.0), 0);
  assert.ok(Math.abs(secondsToGlobalCount(offsetShow, 2.5) - 0) < 1e-9);
  assert.equal(formatTimeMmSs(65.4), '01:05.4');
});

test('procedural ensemble stem synthesizer and waveform peak normalizer stay bounded and finite', () => {
  const show = createDemoShow();
  const stem = synthesizeShowEnsemblePcm(show, 11025);
  assert.ok(stem.samples.length > 0);

  let peak = 0;
  for (let i = 0; i < stem.samples.length; i++) {
    const val = stem.samples[i]!;
    assert.ok(Number.isFinite(val));
    const absVal = Math.abs(val);
    if (absVal > peak) peak = absVal;
  }
  assert.ok(peak >= 0.5 && peak <= 0.86);

  const peaks = computeWaveformPeaks(stem.samples, 180);
  assert.equal(peaks.length, 180);
  for (let i = 0; i < peaks.length; i++) {
    assert.ok(peaks[i]! >= 0 && peaks[i]! <= 1.0 + 1e-6);
  }
});
