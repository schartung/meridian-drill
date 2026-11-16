import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeHashTranslationDelta,
  formatCoordinateSheetText,
  fromCoordinateReadout,
  toCoordinateReadout
} from '../src/core/coordinates.ts';
import { FIELD_SPECS, FIELD_STANDARD_LIST } from '../src/core/fields.ts';
import { CanonicalPoint } from '../src/core/types.ts';

test('rulebook constants match exact imperial and metric geometry', () => {
  const ncaa = FIELD_SPECS.NCAA_DCI;
  assert.ok(Math.abs(ncaa.widthMeters - 91.44) < 1e-9);
  assert.ok(Math.abs(ncaa.depthMeters - 48.768) < 1e-9);
  assert.ok(Math.abs((ncaa.frontHashYMeters ?? 0) - 18.288) < 1e-9);
  assert.ok(Math.abs((ncaa.backHashYMeters ?? 0) - 30.48) < 1e-9);
  assert.ok(Math.abs((ncaa.frontHashYMeters ?? 0) / ncaa.stepSizeMeters - 32.0) < 1e-9);
  assert.ok(
    Math.abs((ncaa.depthMeters - (ncaa.backHashYMeters ?? 0)) / ncaa.stepSizeMeters - 32.0) <
      1e-9
  );

  const nfhs = FIELD_SPECS.NFHS_HS;
  assert.ok(Math.abs((nfhs.frontHashYMeters ?? 0) - 16.256) < 1e-9);
  assert.ok(Math.abs((nfhs.backHashYMeters ?? 0) - 32.512) < 1e-9);

  const dcuk = FIELD_SPECS.DCUK_DCE;
  assert.ok(Math.abs(dcuk.depthMeters - 48.8) < 1e-9);
  assert.ok(Math.abs(dcuk.pitDepthMeters - 4.5) < 1e-9);

  const jmba = FIELD_SPECS.JMBA_30M;
  assert.ok(Math.abs(jmba.widthMeters - 30.0) < 1e-9);
  assert.ok(Math.abs(jmba.depthMeters - 30.0) < 1e-9);
  assert.ok(Math.abs(5.0 / jmba.stepSizeMeters - 8.0) < 1e-9);
});

test('coordinate readout round-trip bijection holds across all field standards and boundary seams', () => {
  for (const field of FIELD_STANDARD_LIST) {
    const halfW = field.widthMeters / 2;
    const seamPoints: CanonicalPoint[] = [
      { xMeters: 0, yMeters: 0 },
      { xMeters: 0, yMeters: field.depthMeters },
      { xMeters: 0, yMeters: -2.25 },
      { xMeters: -0.5 * field.majorLineSpacingMeters, yMeters: field.frontHashYMeters ?? 10 },
      { xMeters: 0.5 * field.majorLineSpacingMeters, yMeters: field.backHashYMeters ?? 20 },
      { xMeters: -halfW, yMeters: 0.5 * (field.frontHashYMeters ?? 10) },
      { xMeters: halfW, yMeters: 0.5 * ((field.frontHashYMeters ?? 10) + (field.backHashYMeters ?? 20)) },
      { xMeters: -halfW - 4.0, yMeters: field.depthMeters + 1.5 }
    ];

    for (const pt of seamPoints) {
      const readout = toCoordinateReadout(pt, field);
      const restored = fromCoordinateReadout(readout, field);
      assert.ok(
        Math.hypot(restored.xMeters - pt.xMeters, restored.yMeters - pt.yMeters) < 1e-9,
        `Seam round-trip mismatch on ${field.id} for (${pt.xMeters}, ${pt.yMeters})`
      );
    }

    // Dense interior sweep
    for (let xi = -5; xi <= 5; xi++) {
      for (let yi = -1; yi <= 8; yi++) {
        const pt: CanonicalPoint = {
          xMeters: (xi / 5) * halfW * 0.95 + 0.137,
          yMeters: (yi / 8) * field.depthMeters + 0.211
        };
        const readout = toCoordinateReadout(pt, field);
        const restored = fromCoordinateReadout(readout, field);
        assert.ok(
          Math.hypot(restored.xMeters - pt.xMeters, restored.yMeters - pt.yMeters) < 1e-9,
          `Grid round-trip mismatch on ${field.id} for (${pt.xMeters}, ${pt.yMeters})`
        );
      }
    }
  }
});

test('explicit boundary ownership rules hold for 4-step split and hash midpoints', () => {
  const ncaa = FIELD_SPECS.NCAA_DCI;
  // Exact 4.0 steps between 50 and S1 45 (x = -2.286 m) binds inward to 50-yard line (OUTSIDE 50).
  const split50to45 = toCoordinateReadout({ xMeters: -2.286, yMeters: 18.288 }, ncaa);
  assert.equal(split50to45.side, 'SIDE_1');
  assert.equal(split50to45.lineValue, 50);
  assert.equal(split50to45.horizRelation, 'OUTSIDE');
  assert.ok(Math.abs(split50to45.horizSteps - 4.0) < 1e-9);
  assert.equal(split50to45.vertReferenceId, 'FRONT_HASH');
  assert.equal(split50to45.vertRelation, 'ON');

  // Exact midpoint between Front Sideline (0) and Front Hash (18.288) binds to Front Sideline.
  const midFslFh = toCoordinateReadout({ xMeters: 0, yMeters: 9.144 }, ncaa);
  assert.equal(midFslFh.vertReferenceId, 'FRONT_SIDELINE');
  assert.equal(midFslFh.vertRelation, 'BEHIND');
  assert.ok(Math.abs(midFslFh.vertSteps - 16.0) < 1e-9);

  // Just past midpoint binds to Front Hash (IN_FRONT).
  const pastMidFslFh = toCoordinateReadout({ xMeters: 0, yMeters: 9.145 }, ncaa);
  assert.equal(pastMidFslFh.vertReferenceId, 'FRONT_HASH');
  assert.equal(pastMidFslFh.vertRelation, 'IN_FRONT');

  // JMBA exact 5m point formatting
  const jmba = FIELD_SPECS.JMBA_30M;
  const jmbaReadout = toCoordinateReadout({ xMeters: -5.0, yMeters: 15.0 }, jmba);
  const jmbaText = formatCoordinateSheetText(jmbaReadout, jmba);
  assert.equal(jmbaText.horizontalText, 'Side 1: On 5m line');
  assert.equal(jmbaText.verticalText, 'On Center Point (15m)');
});

test('venue hash translation detects exact NFHS vs NCAA hash shift without moving canonical spot', () => {
  const ncaa = FIELD_SPECS.NCAA_DCI;
  const nfhs = FIELD_SPECS.NFHS_HS;
  // Performer stands physically on NCAA Front Hash (y = 18.288 m) on S2 40.
  const pt: CanonicalPoint = { xMeters: 9.144, yMeters: 18.288 };
  const delta = computeHashTranslationDelta(pt, ncaa, nfhs);
  assert.equal(delta.primaryVertical, 'On Front Hash (NCAA 60 ft)');
  assert.ok(Math.abs(delta.verticalMetersShift - (16.256 - 18.288)) < 1e-9);
  assert.ok(delta.warningMessage !== null);
  assert.ok(delta.venueVertical.includes('3.56 st behind FH'));
});
