import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCameraState, projectWorldToScreen } from '../src/core/camera3d.ts';
import {
  exportDotBookMarkdown,
  exportRehearsalTriageMarkdown,
  generatePerformerDotBook,
  parseShowBundle,
  serializeShowBundle
} from '../src/core/collaboration.ts';
import { createDemoShow } from '../src/core/demoShow.ts';
import { FIELD_SPECS } from '../src/core/fields.ts';
import { executeHarnessLens } from '../src/core/harness.ts';
import {
  analyzeShowIntelligence,
  analyzeTransitionCollisions,
  countTransitionCrossings
} from '../src/core/intelligence.ts';

test('demo show maintains 64 performers across 7 sets with calibrated solvable issues on Set 4 -> Set 5', () => {
  const show = createDemoShow();
  assert.equal(show.performers.length, 64);
  assert.equal(show.sets.length, 7);
  assert.ok(show.pins.length >= 3);

  for (const set of show.sets) {
    assert.equal(Object.keys(set.positions).length, 64);
    for (const perf of show.performers) {
      const dot = set.positions[perf.id];
      assert.ok(dot !== undefined, `Missing dot for ${perf.id} in ${set.id}`);
      assert.ok(Number.isFinite(dot.xMeters) && Number.isFinite(dot.yMeters));
    }
  }

  const initialIntel = analyzeShowIntelligence(show, 3);
  assert.ok(
    initialIntel.cleanlinessScore >= 60 && initialIntel.cleanlinessScore < 90,
    `Expected initial demo cleanlinessScore in [60, 90), got ${initialIntel.cleanlinessScore}`
  );
  assert.ok(analyzeTransitionCollisions(show, 3).length >= 1);
  assert.ok(countTransitionCrossings(show, 3) >= 2);

  // Step 1: Optimize section-locked dot assignment on Set 4 -> Set 5
  const optRes = executeHarnessLens(show, {
    kind: 'OPTIMIZE_ASSIGNMENT',
    fromSetIndex: 3,
    lockSections: true,
    stridePower: 2.2
  });
  assert.equal(optRes.ok, true);
  if (!optRes.ok) return;
  assert.equal(countTransitionCrossings(optRes.updatedShow, 3), 0);

  // Step 2: Curve remaining pass-through collisions on Set 4 -> Set 5
  const defRes = executeHarnessLens(optRes.updatedShow, {
    kind: 'DEFLECT_COLLISIONS',
    fromSetIndex: 3,
    minClearanceMeters: 1.25
  });
  assert.equal(defRes.ok, true);
  if (!defRes.ok) return;
  assert.equal(
    analyzeTransitionCollisions(defRes.updatedShow, 3).filter(
      (c) => c.severity === 'CRITICAL'
    ).length,
    0
  );
  const finalIntel = analyzeShowIntelligence(defRes.updatedShow, 3);
  assert.ok(
    finalIntel.cleanlinessScore >= 90,
    `Expected final cleanlinessScore >= 90 after two-step AI Harness cleanup, got ${finalIntel.cleanlinessScore}`
  );
});

test('3D pinhole camera maintains closed-form center symmetry, depth ordering, and behind-camera culling', () => {
  const ncaa = FIELD_SPECS.NCAA_DCI;
  const cam = buildCameraState('HIGH_CAM_JUDGE', ncaa, 0, 0, 1.0);
  const width = 1280;
  const height = 720;

  for (const y of [0, 10, 18.288, 30.48, 45]) {
    const pCenter = projectWorldToScreen({ x: 0, y, z: 0 }, cam, width, height);
    assert.ok(pCenter !== null);
    assert.ok(
      Math.abs(pCenter.u - width / 2) < 1e-9,
      `Centerline point (0, ${y}) must project to u = width/2`
    );
  }

  const pFront = projectWorldToScreen({ x: 0, y: 0, z: 0 }, cam, width, height)!;
  const pBack = projectWorldToScreen({ x: 0, y: 40, z: 0 }, cam, width, height)!;
  assert.ok(
    pBack.v < pFront.v,
    'Backfield point must project higher on screen (smaller v) than front sideline'
  );

  const pBehind = projectWorldToScreen({ x: 0, y: -120, z: 0 }, cam, width, height);
  assert.equal(pBehind, null);
});

test('collaboration Dot-Book, Triage Markdown, and JSON show bundle round-trip cleanly and reject invalid input', () => {
  const show = createDemoShow();
  show.comparisonFieldId = 'NFHS_HS';
  const intel = analyzeShowIntelligence(show, 4);

  const dotBook = generatePerformerDotBook(show, 'B1');
  assert.equal(dotBook.entries.length, 7);
  const md = exportDotBookMarkdown(dotBook);
  assert.ok(md.includes('Trumpet 1'));
  assert.ok(md.includes('Venue Hash Translation Alerts'));

  const triage = exportRehearsalTriageMarkdown(show, intel);
  assert.ok(triage.includes('Collaboration Field Pins'));

  const bundleJson = serializeShowBundle(show);
  const parsed = parseShowBundle(bundleJson);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.show.performers.length, 64);
    assert.equal(parsed.show.sets.length, 7);
  }

  const badJson = parseShowBundle('{ not valid json');
  assert.equal(badJson.ok, false);
});
