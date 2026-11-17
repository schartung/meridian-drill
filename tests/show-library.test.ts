import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePerformerBodyState } from '../src/core/choreography.ts';
import { parseShowBundle, serializeShowBundle } from '../src/core/collaboration.ts';
import { getFieldSpec } from '../src/core/fields.ts';
import { importPywareCoordinateText } from '../src/core/importers.ts';
import {
  buildLibraryPresetImport,
  REAL_WORLD_SHOW_PRESETS
} from '../src/core/showLibrary.ts';

test('all three real-life library presets generate finite in-bounds shows with complete provenance and lossless CSV/JSON round-trip', () => {
  assert.equal(REAL_WORLD_SHOW_PRESETS.length, 3);

  for (const preset of REAL_WORLD_SHOW_PRESETS) {
    const show = preset.buildShow();
    const field = getFieldSpec(show.fieldStandardId);
    const maxX = field.widthMeters / 2 + field.endzoneDepthMeters + 1e-6;
    const minY = -field.pitDepthMeters - 1e-6;
    const maxY = field.depthMeters + 2.0 + 1e-6;

    assert.ok(show.performers.length >= 40);
    assert.ok(show.sets.length >= 6);
    assert.ok(preset.provenanceNotes.some((n) => n.state === 'stated'));
    assert.ok(preset.provenanceNotes.some((n) => n.state === 'concluded'));
    assert.ok(preset.provenanceNotes.some((n) => n.state === 'gap'));

    for (const set of show.sets) {
      assert.ok(set.tempoBpm >= 60 && set.tempoBpm <= 220);
      for (const perf of show.performers) {
        const dot = set.positions[perf.id];
        assert.ok(dot, `${preset.id} missing ${perf.id} in ${set.id}`);
        assert.ok(Number.isFinite(dot.xMeters) && Number.isFinite(dot.yMeters));
        assert.ok(Math.abs(dot.xMeters) <= maxX, `${preset.id} ${perf.id} X out of bounds: ${dot.xMeters}`);
        assert.ok(dot.yMeters >= minY && dot.yMeters <= maxY, `${preset.id} ${perf.id} Y out of bounds: ${dot.yMeters}`);
      }
    }

    // JSON bundle round-trip
    const bundleParsed = parseShowBundle(serializeShowBundle(show));
    assert.equal(bundleParsed.ok, true);

    // Pyware Coordinate CSV round-trip
    const libImport = buildLibraryPresetImport(preset.id);
    assert.equal(libImport.receipt.status, 'FULL_SHOW_IMPORTED');
    const csvReceipt = importPywareCoordinateText(
      libImport.csvPreview,
      show.fieldStandardId,
      show.title
    );
    assert.equal(csvReceipt.status, 'FULL_SHOW_IMPORTED');
    assert.ok(csvReceipt.importedShow);
    assert.equal(csvReceipt.importedShow.sets.length, show.sets.length);
    assert.equal(csvReceipt.importedShow.performers.length, show.performers.length);

    for (let sIdx = 0; sIdx < show.sets.length; sIdx++) {
      const origSet = show.sets[sIdx]!;
      const reSet = csvReceipt.importedShow.sets[sIdx]!;
      for (const perf of show.performers) {
        const a = origSet.positions[perf.id]!;
        const b = reSet.positions[perf.label]!;
        assert.ok(b, `CSV re-import missing ${perf.label} in set ${sIdx + 1}`);
        assert.ok(Math.hypot(a.xMeters - b.xMeters, a.yMeters - b.yMeters) < 0.02);
      }
    }
  }
});

test('Star of Indiana 1991 preset transitions brass centroid from Side 1 Cross to Side 2 Mirror Cross', () => {
  const { receipt } = buildLibraryPresetImport('STAR_1991_CROSS');
  const show = receipt.importedShow!;
  const brass = show.performers.filter((p) => p.section === 'BRASS');

  const meanX = (setIdx: number) =>
    brass.reduce((acc, p) => acc + show.sets[setIdx]!.positions[p.id]!.xMeters, 0) /
    brass.length;

  assert.ok(meanX(0) < -4.0, `Expected Side 1 centroid < -4m, got ${meanX(0)}`);
  assert.ok(meanX(4) > 4.0, `Expected Side 2 mirror centroid > +4m, got ${meanX(4)}`);
});

test('Ohio State TBDBITL Script Ohio maintains 180 BPM all-brass/battery lineup and SOUSA1 dots & bows on Set 6', () => {
  const { receipt } = buildLibraryPresetImport('OSU_SCRIPT_OHIO');
  const show = receipt.importedShow!;

  assert.equal(show.performers.filter((p) => p.section === 'GUARD').length, 0);
  assert.equal(show.performers.filter((p) => p.section === 'PIT').length, 0);
  for (const s of show.sets) {
    assert.equal(s.tempoBpm, 180);
  }

  const sousa = show.performers.find((p) => p.id === 'SOUSA1');
  assert.ok(sousa);
  const dot6 = show.sets[5]!.positions['SOUSA1']!;
  assert.ok(dot6.yMeters > 28.0, `Expected SOUSA1 backfield above 'i' stem, got ${dot6.yMeters}`);

  const sousaBody = resolvePerformerBodyState(
    sousa,
    show.sets[5]!,
    0,
    0,
    dot6,
    -Math.PI / 2,
    false
  );
  assert.equal(sousaBody.posture, 'BOW_DROP');
  assert.equal(sousaBody.hornCarriage, 'HIGH_BELL_EXTENSION');
});

test('Bluecoats 2014 Tilt preset includes multi-tempo shifts and sequential body ripples', () => {
  const { receipt } = buildLibraryPresetImport('BLUECOATS_2014_TILT');
  const show = receipt.importedShow!;
  const bpms = new Set(show.sets.map((s) => s.tempoBpm));

  assert.ok(bpms.has(92));
  assert.ok(bpms.has(176));
  assert.ok(bpms.size >= 3);

  const rippleCues = show.sets.flatMap((s) => s.bodyCues ?? []).filter((c) => c.rippleDelayCounts > 0);
  assert.ok(rippleCues.length >= 2);
});
