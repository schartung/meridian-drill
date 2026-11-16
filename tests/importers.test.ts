import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { formatCoordinateSheetText, toCoordinateReadout } from '../src/core/coordinates.ts';
import { FIELD_SPECS } from '../src/core/fields.ts';
import {
  formatShowAsPywareCoordinateCsv,
  importMusicXmlTempoMap,
  importPywareArchiveBytes,
  importPywareCoordinateText,
  SAMPLE_MUSICXML_SCORE,
  SAMPLE_PYWARE_COORDINATE_CSV
} from '../src/core/importers.ts';
import { FieldStandardId } from '../src/core/types.ts';

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildTestZipArchive(
  entries: Array<{
    name: string;
    data: Uint8Array;
    deflate?: boolean;
    zeroLocalSizes?: boolean;
  }>
): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const cdChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const uncompressed = entry.data;
    const method = entry.deflate ? 8 : 0;
    const compressed = entry.deflate ? deflateRawSync(uncompressed) : uncompressed;
    const crc = crc32(uncompressed);
    const flags = entry.zeroLocalSizes ? 0x0008 : 0x0000;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, entry.zeroLocalSizes ? 0 : crc, true);
    lv.setUint32(18, entry.zeroLocalSizes ? 0 : compressed.length, true);
    lv.setUint32(22, entry.zeroLocalSizes ? 0 : uncompressed.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    localChunks.push(lfh, compressed);

    const cdh = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, uncompressed.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    cdh.set(nameBytes, 46);

    cdChunks.push(cdh);
    localOffset += lfh.length + compressed.length;
  }

  const cdSize = cdChunks.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);

  const all = [...localChunks, ...cdChunks, eocd];
  const totalLen = all.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(totalLen);
  let cursor = 0;
  for (const chunk of all) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

test('Pyware coordinate sheet CSV round-trip bijection holds across NFHS, NCAA, and JMBA fields', () => {
  const standards: FieldStandardId[] = ['NFHS_HS', 'NCAA_DCI', 'JMBA_30M'];

  for (const stdId of standards) {
    const field = FIELD_SPECS[stdId];
    const s = field.stepSizeMeters;
    const fh = field.frontHashYMeters ?? 10;
    const bh = field.backHashYMeters ?? 20;

    // Select diverse points at exact 0.25-step multiples so text formatting is lossless
    const points = [
      { id: 'P1', xMeters: 0, yMeters: fh },
      { id: 'P2', xMeters: -2 * field.majorLineSpacingMeters - 4 * s, yMeters: fh + 2 * s },
      { id: 'P3', xMeters: -field.majorLineSpacingMeters + 2.5 * s, yMeters: bh - 3 * s },
      { id: 'P4', xMeters: 3 * field.majorLineSpacingMeters, yMeters: Math.max(0, fh - 6.25 * s) }
    ];

    const rows = ['Performer,Section,Instrument,Set,Counts,Tempo,SideToSide,FrontToBack'];
    for (const pt of points) {
      const readout = toCoordinateReadout(pt, field);
      const sheet = formatCoordinateSheetText(readout, field);
      rows.push(`"${pt.id}",BRASS,Trumpet,1,0,150,"${sheet.horizontalText}","${sheet.verticalText}"`);
    }

    const receipt = importPywareCoordinateText(rows.join('\n'), stdId, `Test ${stdId}`);
    assert.equal(receipt.status, 'FULL_SHOW_IMPORTED');
    assert.ok(receipt.importedShow);
    assert.equal(receipt.importedShow.performers.length, points.length);
    assert.equal(receipt.importedShow.sets.length, 1);

    for (const pt of points) {
      const recovered = receipt.importedShow.sets[0]!.positions[pt.id];
      assert.ok(recovered);
      assert.ok(
        Math.abs(recovered.xMeters - pt.xMeters) < 1e-5,
        `${stdId} X mismatch for ${pt.id}: got ${recovered.xMeters}, expected ${pt.xMeters}`
      );
      assert.ok(
        Math.abs(recovered.yMeters - pt.yMeters) < 1e-5,
        `${stdId} Y mismatch for ${pt.id}: got ${recovered.yMeters}, expected ${pt.yMeters}`
      );
    }

    // Also test full-show CSV serialization -> re-import
    const reCsv = formatShowAsPywareCoordinateCsv(receipt.importedShow);
    const reImported = importPywareCoordinateText(reCsv, stdId);
    assert.equal(reImported.status, 'FULL_SHOW_IMPORTED');
  }
});

test('Pyware alternate word order parses accurately and malformed rows fail closed without guessing', () => {
  const altCsv = [
    'Performer,Set,Counts,SideToSide,FrontToBack',
    'B1,1,0,4.0 steps outside Side 1 35 yd ln,2.5 steps in front of Front Hash',
    'B2,1,0,S2 2.0 inside 40,On Back Hash',
    'B1,2,16,On 50 yd ln,4.0 steps behind Front Sideline',
    'B2,2,16,Side 1: On 45 yd ln,On Back Sideline'
  ].join('\n');

  const okReceipt = importPywareCoordinateText(altCsv, 'NCAA_DCI', 'Pyware Phrasing');
  assert.equal(okReceipt.status, 'FULL_SHOW_IMPORTED');
  assert.ok(okReceipt.importedShow);

  const f = FIELD_SPECS.NCAA_DCI;
  const b1s1 = okReceipt.importedShow.sets[0]!.positions['B1']!;
  assert.ok(Math.abs(b1s1.xMeters - (-(3 * f.majorLineSpacingMeters + 4 * f.stepSizeMeters))) < 1e-6);
  assert.ok(Math.abs(b1s1.yMeters - (f.frontHashYMeters! - 2.5 * f.stepSizeMeters)) < 1e-6);

  // Sample CSV fixture parses cleanly as full show
  const sampleReceipt = importPywareCoordinateText(SAMPLE_PYWARE_COORDINATE_CSV, 'NFHS_HS');
  assert.equal(sampleReceipt.status, 'FULL_SHOW_IMPORTED');
  assert.equal(sampleReceipt.importedShow!.performers.length, 11);
  assert.equal(sampleReceipt.importedShow!.sets.length, 3);

  // Invalid yard line (37 yd ln) fails closed
  const badYardCsv = [
    'Performer,Set,Counts,SideToSide,FrontToBack',
    'B1,1,0,Side 1: 4 st outside 37 yd ln,On FH'
  ].join('\n');
  const badReceipt = importPywareCoordinateText(badYardCsv, 'NCAA_DCI');
  assert.equal(badReceipt.status, 'VALIDATION_FAILED');
  assert.equal(badReceipt.importedShow, undefined);

  // Missing performer in Set 2 fails closed
  const missingDotCsv = [
    'Performer,Set,Counts,SideToSide,FrontToBack',
    'B1,1,0,On 50 yd ln,On FH',
    'B2,1,0,Side 1: On 45 yd ln,On FH',
    'B1,2,16,On 50 yd ln,On BH'
  ].join('\n');
  const missingReceipt = importPywareCoordinateText(missingDotCsv, 'NCAA_DCI');
  assert.equal(missingReceipt.status, 'VALIDATION_FAILED');
  assert.equal(missingReceipt.importedShow, undefined);
});

test('MusicXML importer parses mixed 4/4 and 3/4 measures, rehearsal marks, and variable BPM tempos', () => {
  const receipt = importMusicXmlTempoMap(SAMPLE_MUSICXML_SCORE, 'opener.musicxml');
  assert.equal(receipt.status, 'FULL_SHOW_IMPORTED');
  assert.ok(receipt.importedTempoSets);
  assert.ok(receipt.importedShow);

  assert.equal(receipt.importedTempoSets.length, 4);
  assert.deepEqual(
    receipt.importedTempoSets.map((s) => ({
      mark: s.rehearsalMark,
      counts: s.counts,
      tempoBpm: s.tempoBpm
    })),
    [
      { mark: 'A', counts: 0, tempoBpm: 144 },
      { mark: 'B', counts: 16, tempoBpm: 144 },
      { mark: 'C', counts: 12, tempoBpm: 160 },
      { mark: 'Hold', counts: 16, tempoBpm: 112 }
    ]
  );
});

test('Pyware .3dz ZIP unpacking extracts embedded audio and fails closed on Java binary .3dj streams', async () => {
  const fakeWavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
  const rawJavaSerialized = new Uint8Array([0xac, 0xed, 0x00, 0x05, 0x73, 0x72, 0x00, 0x0c, 0x44, 0x72, 0x69, 0x6c, 0x6c, 0x46, 0x69, 0x6c, 0x65]);
  const gzippedJava3dj = gzipSync(rawJavaSerialized);

  // Archive 1: Deflated .wav + Java-serialized .3dj with zeroed local sizes (Java ZipOutputStream style)
  const lockedArchive = buildTestZipArchive([
    { name: 'audio/opener_stem.wav', data: fakeWavBytes, deflate: true, zeroLocalSizes: true },
    { name: 'drill/show_v1.3dj', data: gzippedJava3dj, deflate: false, zeroLocalSizes: true }
  ]);

  const lockedReceipt = await importPywareArchiveBytes(
    lockedArchive,
    'show_package.3dz',
    'NFHS_HS'
  );
  assert.equal(lockedReceipt.status, 'AUDIO_EXTRACTED_BINARY_DRILL_LOCKED');
  assert.equal(lockedReceipt.importedShow, undefined);
  assert.ok(lockedReceipt.extractedAudio);
  assert.equal(lockedReceipt.extractedAudio.filename, 'audio/opener_stem.wav');
  assert.deepEqual(lockedReceipt.extractedAudio.bytes, fakeWavBytes);
  assert.ok(lockedReceipt.provenanceNotes.some((n) => n.state === 'gap' && n.statement.includes('0xACED')));

  // Direct standalone Java serialized .3dj also fails closed with exact diagnostic
  const rawReceipt = await importPywareArchiveBytes(rawJavaSerialized, 'legacy.3dj', 'NCAA_DCI');
  assert.equal(rawReceipt.status, 'BINARY_DRILL_LOCKED');
  assert.equal(rawReceipt.importedShow, undefined);

  // Archive 2: .3dz containing both audio AND exported coordinate CSV succeeds fully
  const csvBytes = new TextEncoder().encode(SAMPLE_PYWARE_COORDINATE_CSV);
  const fullArchive = buildTestZipArchive([
    { name: 'audio/opener_stem.wav', data: fakeWavBytes, deflate: true },
    { name: 'drill/pyware_coordinates.csv', data: csvBytes, deflate: true },
    { name: 'drill/show_v1.3dj', data: rawJavaSerialized, deflate: true }
  ]);

  const fullReceipt = await importPywareArchiveBytes(fullArchive, 'bridged_show.3dz', 'NFHS_HS');
  assert.equal(fullReceipt.status, 'FULL_SHOW_IMPORTED');
  assert.ok(fullReceipt.extractedAudio);
  assert.deepEqual(fullReceipt.extractedAudio.bytes, fakeWavBytes);
  assert.ok(fullReceipt.importedShow);
  assert.equal(fullReceipt.importedShow.performers.length, 11);
  assert.equal(fullReceipt.importedShow.sets.length, 3);
});
