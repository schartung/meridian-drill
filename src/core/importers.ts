import { parseShowBundle } from './collaboration.ts';
import {
  formatCoordinateSheetText,
  fromCoordinateReadout,
  toCoordinateReadout
} from './coordinates.ts';
import { getFieldSpec } from './fields.ts';
import {
  CoordinateReadout,
  DrillSet,
  DrillShow,
  FieldSpec,
  FieldStandardId,
  HorizontalRelation,
  HorizontalSide,
  Performer,
  PerformerDot,
  ProvenanceNote,
  SectionId,
  VerticalRelation
} from './types.ts';

export type ImportOutcomeStatus =
  | 'FULL_SHOW_IMPORTED'
  | 'TEMPO_MAP_IMPORTED'
  | 'AUDIO_ONLY_IMPORTED'
  | 'AUDIO_EXTRACTED_BINARY_DRILL_LOCKED'
  | 'BINARY_DRILL_LOCKED'
  | 'VALIDATION_FAILED';

export interface ArchiveEntrySummary {
  name: string;
  compressedBytes: number;
  uncompressedBytes: number;
  compressionMethod: number;
  role: 'AUDIO' | 'COORDINATE_TABLE' | 'XML_SCORE_OR_META' | 'PYWARE_BINARY_3DJ' | 'ASSET';
}

export interface ImportedTempoSet {
  name: string;
  rehearsalMark: string;
  counts: number;
  tempoBpm: number;
  notes: string;
}

export interface ImportDiagnosticReceipt {
  status: ImportOutcomeStatus;
  sourceFilename: string;
  detectedFormat: string;
  provenanceNotes: ProvenanceNote[];
  archiveEntries: ArchiveEntrySummary[];
  extractedAudio?: {
    filename: string;
    bytes: Uint8Array;
    mimeType: string;
  };
  importedShow?: DrillShow;
  importedTempoSets?: ImportedTempoSet[];
  userGuidance: string[];
}

export const SAMPLE_PYWARE_COORDINATE_CSV = [
  'Performer,Section,Instrument,Set,Mark,Counts,Tempo,SideToSide,FrontToBack',
  'B1,BRASS,Trumpet,1,A,0,152,Side 1: 4 st outside 45 yd ln,4 st behind FH',
  'B2,BRASS,Trumpet,1,A,0,152,Side 1: On 45 yd ln,4 st behind FH',
  'B3,BRASS,Mellophone,1,A,0,152,Side 1: 4 st inside 45 yd ln,4 st behind FH',
  'B4,BRASS,Baritone,1,A,0,152,On 50 yd line,4 st behind FH',
  'B5,BRASS,Baritone,1,A,0,152,Side 2: 4 st inside 45 yd ln,4 st behind FH',
  'B6,BRASS,Tuba,1,A,0,152,Side 2: On 45 yd ln,4 st behind FH',
  'D1,BATTERY,Snare,1,A,0,152,Side 1: 2 st outside 50 yd ln,2 st in front of BH',
  'D2,BATTERY,Tenors,1,A,0,152,On 50 yd line,2 st in front of BH',
  'D3,BATTERY,Bass,1,A,0,152,Side 2: 2 st outside 50 yd ln,2 st in front of BH',
  'G1,GUARD,Flag,1,A,0,152,Side 1: 2 st inside 40 yd ln,6 st in front of FH',
  'G2,GUARD,Flag,1,A,0,152,Side 2: 2 st inside 40 yd ln,6 st in front of FH',
  'B1,BRASS,Trumpet,2,B,16,156,Side 1: 2 st outside 40 yd ln,2 st behind FH',
  'B2,BRASS,Trumpet,2,B,16,156,Side 1: 2 st inside 40 yd ln,2 st behind FH',
  'B3,BRASS,Mellophone,2,B,16,156,Side 1: 2 st outside 45 yd ln,2 st behind FH',
  'B4,BRASS,Baritone,2,B,16,156,Side 2: 2 st outside 45 yd ln,2 st behind FH',
  'B5,BRASS,Baritone,2,B,16,156,Side 2: 2 st inside 40 yd ln,2 st behind FH',
  'B6,BRASS,Tuba,2,B,16,156,Side 2: 2 st outside 40 yd ln,2 st behind FH',
  'D1,BATTERY,Snare,2,B,16,156,Side 1: 3 st inside 45 yd ln,On Front Hash',
  'D2,BATTERY,Tenors,2,B,16,156,On 50 yd line,On Front Hash',
  'D3,BATTERY,Bass,2,B,16,156,Side 2: 3 st inside 45 yd ln,On Front Hash',
  'G1,GUARD,Flag,2,B,16,156,Side 1: On 35 yd ln,4 st behind BH',
  'G2,GUARD,Flag,2,B,16,156,Side 2: On 35 yd ln,4 st behind BH',
  'B1,BRASS,Trumpet,3,C,16,160,Side 1: On 45 yd ln,On Front Hash',
  'B2,BRASS,Trumpet,3,C,16,160,Side 1: 4 st inside 45 yd ln,2 st in front of FH',
  'B3,BRASS,Mellophone,3,C,16,160,On 50 yd line,4 st in front of FH',
  'B4,BRASS,Baritone,3,C,16,160,Side 2: 4 st inside 45 yd ln,2 st in front of FH',
  'B5,BRASS,Baritone,3,C,16,160,Side 2: On 45 yd ln,On Front Hash',
  'B6,BRASS,Tuba,3,C,16,160,Side 2: 4 st outside 45 yd ln,2 st behind FH',
  'D1,BATTERY,Snare,3,C,16,160,Side 1: 2 st inside 45 yd ln,On Back Hash',
  'D2,BATTERY,Tenors,3,C,16,160,On 50 yd line,On Back Hash',
  'D3,BATTERY,Bass,3,C,16,160,Side 2: 2 st inside 45 yd ln,On Back Hash',
  'G1,GUARD,Flag,3,C,16,160,Side 1: 2 st outside 40 yd ln,6 st in front of FH',
  'G2,GUARD,Flag,3,C,16,160,Side 2: 2 st outside 40 yd ln,6 st in front of FH'
].join('\n');

export const SAMPLE_MUSICXML_SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Brass Opener Sketch (MusicXML)</work-title>
  </work>
  <part-list>
    <score-part id="P1"><part-name>Score Tempo Guide</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="above">
        <direction-type><rehearsal>A</rehearsal></direction-type>
        <sound tempo="144"/>
      </direction>
    </measure>
    <measure number="2"></measure>
    <measure number="3"></measure>
    <measure number="4"></measure>
    <measure number="5">
      <attributes>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="above">
        <direction-type><rehearsal>B</rehearsal></direction-type>
        <sound tempo="160"/>
      </direction>
    </measure>
    <measure number="6"></measure>
    <measure number="7"></measure>
    <measure number="8"></measure>
    <measure number="9">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="above">
        <direction-type><rehearsal>C</rehearsal></direction-type>
        <sound tempo="112"/>
      </direction>
    </measure>
    <measure number="10"></measure>
    <measure number="11"></measure>
    <measure number="12"></measure>
  </part>
</score-partwise>`;

function inferSectionFromText(sectionText?: string, instrumentText?: string, label?: string): SectionId {
  const combined = `${sectionText ?? ''} ${instrumentText ?? ''}`.toUpperCase();
  if (combined.includes('BATT') || combined.includes('SNARE') || combined.includes('TENOR') || combined.includes('QUAD') || combined.includes('BASS DRUM')) {
    return 'BATTERY';
  }
  if (combined.includes('PIT') || combined.includes('FRONT') || combined.includes('MARIMBA') || combined.includes('VIBE') || combined.includes('SYNTH')) {
    return 'PIT';
  }
  if (combined.includes('GUARD') || combined.includes('FLAG') || combined.includes('RIFLE') || combined.includes('SABRE')) {
    return 'GUARD';
  }
  if (combined.includes('BRASS') || combined.includes('TRUMPET') || combined.includes('MELLO') || combined.includes('BARI') || combined.includes('TUBA') || combined.includes('HORN')) {
    return 'BRASS';
  }
  const upperLabel = (label ?? '').trim().toUpperCase();
  if (upperLabel.startsWith('D') || upperLabel.startsWith('S') || upperLabel.startsWith('Q')) return 'BATTERY';
  if (upperLabel.startsWith('P')) return 'PIT';
  if (upperLabel.startsWith('G') || upperLabel.startsWith('F')) return 'GUARD';
  return 'BRASS';
}

function defaultClearanceAndWeight(section: SectionId, instrumentText?: string): {
  clearanceRadiusMeters: number;
  weightFactor: number;
} {
  const inst = (instrumentText ?? '').toUpperCase();
  if (section === 'GUARD') {
    return { clearanceRadiusMeters: 0.92, weightFactor: 1.0 };
  }
  if (section === 'PIT') {
    return { clearanceRadiusMeters: 0.72, weightFactor: 1.0 };
  }
  if (section === 'BATTERY') {
    if (inst.includes('TENOR') || inst.includes('BASS')) {
      return { clearanceRadiusMeters: 0.78, weightFactor: 1.45 };
    }
    return { clearanceRadiusMeters: 0.72, weightFactor: 1.3 };
  }
  if (inst.includes('TUBA') || inst.includes('SOUS')) {
    return { clearanceRadiusMeters: 0.78, weightFactor: 1.55 };
  }
  return { clearanceRadiusMeters: 0.65, weightFactor: 1.05 };
}

function splitDelimitedRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());

  if (delimiter === '|' && out.length >= 2 && out[0] === '' && out[out.length - 1] === '') {
    return out.slice(1, -1);
  }
  return out;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i]!;
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === delim && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }
  return best;
}

function normalizeColKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseHorizontalCoordinatePhrase(
  rawText: string,
  field: FieldSpec
):
  | {
      ok: true;
      side: HorizontalSide;
      lineIndex: number;
      lineValue: number;
      lineLabel: string;
      horizRelation: HorizontalRelation;
      horizSteps: number;
    }
  | { ok: false; error: string } {
  const clean = rawText.trim().replace(/\s+/g, ' ');
  if (!clean) {
    return { ok: false, error: 'Horizontal coordinate cell is empty.' };
  }

  // Exact center check (On 50 yd line / On 0m center)
  if (
    /^(?:(?:side\s*[12]|s[12])\s*:?\s*)?on\s+(?:center|50(?:\.0+)?(?:\s*(?:yd|yard))?(?:\s*(?:ln|line))?|0(?:\.0+)?\s*m(?:\s*(?:center|ctr|line))?)$/i.test(
      clean
    ) ||
    /^50(?:\.0+)?\s*(?:yd|yard)\s*(?:ln|line)$/i.test(clean)
  ) {
    const centerVal = field.gridType === 'YARD_LINES' ? 50 : 0;
    const centerLabel = field.gridType === 'YARD_LINES' ? '50' : '0m';
    return {
      ok: true,
      side: 'ON_CENTER',
      lineIndex: 0,
      lineValue: centerVal,
      lineLabel: centerLabel,
      horizRelation: 'ON',
      horizSteps: 0
    };
  }

  let side: HorizontalSide | null = null;
  if (/\b(?:side\s*1|s1)\b/i.test(clean)) {
    side = 'SIDE_1';
  } else if (/\b(?:side\s*2|s2)\b/i.test(clean)) {
    side = 'SIDE_2';
  }

  // Strip side markers and colons cleanly regardless of Pyware vs Meridian word ordering
  const stripped = clean
    .replace(/\b(?:side\s*[12]|s[12])\b\s*:?\s*/gi, '')
    .trim()
    .replace(/\s+/g, ' ');

  const validateMajorLine = (
    lineNum: number
  ): { ok: true; lineIndex: number; lineValue: number; lineLabel: string } | { ok: false; error: string } => {
    const maxK = Math.round(field.widthMeters / 2 / field.majorLineSpacingMeters);
    if (field.gridType === 'YARD_LINES') {
      if (
        lineNum < 0 ||
        lineNum > 50 ||
        Math.abs(lineNum % 5) > 1e-6
      ) {
        return {
          ok: false,
          error: `Unsupported yard line "${lineNum}" in "${rawText}" (expected multiple of 5 from 0 to 50).`
        };
      }
      const lineIndex = Math.round((50 - lineNum) / 5);
      return {
        ok: true,
        lineIndex,
        lineValue: lineNum,
        lineLabel: String(lineNum)
      };
    }

    const maxMetric = maxK * 5;
    if (lineNum < 0 || lineNum > maxMetric || Math.abs(lineNum % 5) > 1e-6) {
      return {
        ok: false,
        error: `Unsupported metric line "${lineNum}m" in "${rawText}" (expected multiple of 5 from 0 to ${maxMetric}).`
      };
    }
    const lineIndex = Math.round(lineNum / 5);
    return {
      ok: true,
      lineIndex,
      lineValue: lineNum,
      lineLabel: `${lineNum}m`
    };
  };

  // Case 1: "On <line>"
  const onMatch = stripped.match(
    /^on\s+(\d+(?:\.\d+)?)\s*(?:m\b)?\s*(?:yd|yard)?\s*(?:ln|line)?$/i
  );
  if (onMatch) {
    const lineNum = Number(onMatch[1]);
    const validated = validateMajorLine(lineNum);
    if (!validated.ok) return validated;
    if (validated.lineIndex === 0) {
      return {
        ...validated,
        side: 'ON_CENTER',
        horizRelation: 'ON',
        horizSteps: 0
      };
    }
    if (!side) {
      return {
        ok: false,
        error: `Horizontal coordinate "${rawText}" is missing Side 1 or Side 2.`
      };
    }
    return {
      ...validated,
      side,
      horizRelation: 'ON',
      horizSteps: 0
    };
  }

  // Case 2: "<steps> st/steps outside/inside <line>"
  const stepMatch = stripped.match(
    /^(\d+(?:\.\d+)?)\s*(?:steps?|st)?\s*(outside|out|inside|in)\s+(\d+(?:\.\d+)?)\s*(?:m\b)?\s*(?:yd|yard)?\s*(?:ln|line)?$/i
  );
  if (stepMatch) {
    const steps = Number(stepMatch[1]);
    const relRaw = stepMatch[2]!.toLowerCase();
    const lineNum = Number(stepMatch[3]);
    if (!Number.isFinite(steps) || steps < 0) {
      return { ok: false, error: `Invalid horizontal step count in "${rawText}".` };
    }
    const validated = validateMajorLine(lineNum);
    if (!validated.ok) return validated;
    if (!side) {
      return {
        ok: false,
        error: `Horizontal coordinate "${rawText}" is missing Side 1 or Side 2.`
      };
    }
    const horizRelation: HorizontalRelation =
      Math.abs(steps) < 1e-7
        ? 'ON'
        : relRaw === 'inside' || relRaw === 'in'
          ? 'INSIDE'
          : 'OUTSIDE';
    return {
      ...validated,
      side,
      horizRelation,
      horizSteps: steps
    };
  }

  return {
    ok: false,
    error: `Could not parse horizontal coordinate "${rawText}". Expected Pyware format such as "Side 1: 4 st outside 35 yd ln" or "On 50 yd line".`
  };
}

function matchVerticalReferenceLine(refRaw: string, field: FieldSpec) {
  const norm = refRaw
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const ref of field.referenceLines) {
    const labelClean = ref.label.toLowerCase().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (
      norm === ref.id.toLowerCase() ||
      norm === ref.shortLabel.toLowerCase() ||
      norm === ref.label.toLowerCase() ||
      norm === labelClean
    ) {
      return ref;
    }
  }

  const findById = (ids: string[]) =>
    field.referenceLines.find((r) => ids.includes(r.id));

  if (/^(fsl|front\s*side\s*line|front\s*boundary|front)$/.test(norm)) {
    return findById(['FRONT_SIDELINE', 'FRONT_BOUNDARY']);
  }
  if (/^(fh|front\s*hash|visitor\s*hash|front\s*hs)$/.test(norm)) {
    return findById(['FRONT_HASH', 'LINE_10M']);
  }
  if (/^(bh|back\s*hash|home\s*hash|back\s*hs)$/.test(norm)) {
    return findById(['BACK_HASH', 'LINE_20M']);
  }
  if (/^(bsl|back\s*side\s*line|back\s*boundary|back)$/.test(norm)) {
    return findById(['BACK_SIDELINE', 'BACK_BOUNDARY']);
  }

  // Metric JMBA point lines ("5m line", "15m center point")
  const meterMatch = norm.match(/^(\d+)\s*m(?:\s*(?:point|ctr|center|line|boundary))*/);
  if (meterMatch) {
    const val = Number(meterMatch[1]);
    return field.referenceLines.find((r) => Math.abs(r.yMeters - val) < 1e-6);
  }

  return undefined;
}

export function parseVerticalCoordinatePhrase(
  rawText: string,
  field: FieldSpec
):
  | {
      ok: true;
      vertReferenceId: string;
      vertReferenceLabel: string;
      vertReferenceShortLabel: string;
      vertReferenceYMeters: number;
      vertRelation: VerticalRelation;
      vertSteps: number;
    }
  | { ok: false; error: string } {
  const clean = rawText.trim().replace(/\s+/g, ' ');
  if (!clean) {
    return { ok: false, error: 'Vertical coordinate cell is empty.' };
  }

  const onMatch = clean.match(/^on\s+(.+)$/i);
  if (onMatch) {
    const ref = matchVerticalReferenceLine(onMatch[1]!, field);
    if (!ref) {
      return {
        ok: false,
        error: `Unknown field hash/sideline reference "${onMatch[1]}" in "${rawText}".`
      };
    }
    return {
      ok: true,
      vertReferenceId: ref.id,
      vertReferenceLabel: ref.label,
      vertReferenceShortLabel: ref.shortLabel,
      vertReferenceYMeters: ref.yMeters,
      vertRelation: 'ON',
      vertSteps: 0
    };
  }

  const stepMatch = clean.match(
    /^(\d+(?:\.\d+)?)\s*(?:steps?|st)?\s*(behind|bhd|in\s+front\s+of|in\s+front|front|frt)\s+(.+)$/i
  );
  if (stepMatch) {
    const steps = Number(stepMatch[1]);
    const relToken = stepMatch[2]!.toLowerCase().trim();
    const ref = matchVerticalReferenceLine(stepMatch[3]!, field);
    if (!Number.isFinite(steps) || steps < 0) {
      return { ok: false, error: `Invalid front-to-back step count in "${rawText}".` };
    }
    if (!ref) {
      return {
        ok: false,
        error: `Unknown field hash/sideline reference "${stepMatch[3]}" in "${rawText}".`
      };
    }
    const vertRelation: VerticalRelation =
      Math.abs(steps) < 1e-7
        ? 'ON'
        : relToken === 'behind' || relToken === 'bhd'
          ? 'BEHIND'
          : 'IN_FRONT';

    return {
      ok: true,
      vertReferenceId: ref.id,
      vertReferenceLabel: ref.label,
      vertReferenceShortLabel: ref.shortLabel,
      vertReferenceYMeters: ref.yMeters,
      vertRelation,
      vertSteps: steps
    };
  }

  return {
    ok: false,
    error: `Could not parse front-to-back coordinate "${rawText}". Expected format such as "4 st behind FH" or "2.5 steps in front of Back Hash".`
  };
}

export function formatShowAsPywareCoordinateCsv(show: DrillShow): string {
  const field = getFieldSpec(show.fieldStandardId);
  const rows: string[] = [
    'Performer,Section,Instrument,Set,Mark,Counts,Tempo,SideToSide,FrontToBack'
  ];
  for (let sIdx = 0; sIdx < show.sets.length; sIdx++) {
    const set = show.sets[sIdx]!;
    for (const perf of show.performers) {
      const dot = set.positions[perf.id];
      if (!dot) continue;
      const readout = toCoordinateReadout(dot, field);
      const sheet = formatCoordinateSheetText(readout, field);
      rows.push(
        `${perf.label},${perf.section},${perf.instrument},${sIdx + 1},${set.rehearsalMark},${set.counts},${set.tempoBpm},"${sheet.horizontalText}","${sheet.verticalText}"`
      );
    }
  }
  return rows.join('\n');
}

export function importPywareCoordinateText(
  text: string,
  targetFieldId: FieldStandardId,
  showTitle = 'Imported Coordinate Show',
  sourceFilename = 'coordinate-sheet.csv'
): ImportDiagnosticReceipt {
  const field = getFieldSpec(targetFieldId);
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\|\s*:?---/.test(l));

  if (rawLines.length < 2) {
    return {
      status: 'VALIDATION_FAILED',
      sourceFilename,
      detectedFormat: 'Coordinate Table',
      provenanceNotes: [
        {
          state: 'gap',
          statement: 'Fewer than two non-empty rows found in coordinate input.',
          sourceOrCondition: `Input "${sourceFilename}" must contain a header row plus at least one coordinate row.`
        }
      ],
      archiveEntries: [],
      userGuidance: ['Paste a header row (Performer, Set, Counts, SideToSide, FrontToBack) followed by performer rows.']
    };
  }

  const delimiter = detectDelimiter(rawLines[0]!);
  const headers = splitDelimitedRow(rawLines[0]!, delimiter).map(normalizeColKey);

  const findCol = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.includes(h));

  const perfCol = findCol(['performer', 'label', 'symbol', 'performerid', 'id', 'marcher', 'dotlabel']);
  const setCol = findCol(['set', 'setnumber', 'setname', 'page', 'pagenumber']);
  const markCol = findCol(['mark', 'rehearsalmark', 'rehearsal']);
  const countsCol = findCol(['counts', 'count', 'cts']);
  const tempoCol = findCol(['tempo', 'bpm', 'tempobpm']);
  const secCol = findCol(['section', 'sec']);
  const instCol = findCol(['instrument', 'inst']);
  const nameCol = findCol(['name', 'performername']);
  const curveCol = findCol(['curve', 'curveoffset', 'curveoffsetmeters']);

  const horizTextCol = findCol(['sidetoside', 'horizontal', 'leftright', 'yardline', 'xcoordtext', 'horizontaltxt']);
  const vertTextCol = findCol(['fronttoback', 'vertical', 'frontback', 'hash', 'ycoordtext', 'verticaltxt']);

  const xStepsCol = findCol(['xsteps', 'xcoordinate', 'xstep']);
  const yStepsCol = findCol(['ysteps', 'ycoordinate', 'ystep']);
  const xMetersCol = findCol(['xmeters', 'xm']);
  const yMetersCol = findCol(['ymeters', 'ym']);

  const hasTextMode = horizTextCol !== -1 && vertTextCol !== -1;
  const hasStepsMode = xStepsCol !== -1 && yStepsCol !== -1;
  const hasMetersMode = xMetersCol !== -1 && yMetersCol !== -1;

  if (perfCol === -1 || setCol === -1 || (!hasTextMode && !hasStepsMode && !hasMetersMode)) {
    return {
      status: 'VALIDATION_FAILED',
      sourceFilename,
      detectedFormat: 'Unrecognized Coordinate Table',
      provenanceNotes: [
        {
          state: 'gap',
          statement: `Missing required columns in header: [${headers.join(', ')}].`,
          sourceOrCondition: 'Requires Performer + Set + either (SideToSide + FrontToBack), (X_Steps + Y_Steps), or (X_Meters + Y_Meters).'
        }
      ],
      archiveEntries: [],
      userGuidance: ['Include columns Performer, Set, Counts, SideToSide, FrontToBack (or click "Load Sample Pyware CSV" to inspect a valid template).']
    };
  }

  const modeLabel = hasTextMode
    ? `Pyware Coordinate Text Table (${field.shortName})`
    : hasStepsMode
      ? `Numerical Step-Grid CSV (${field.shortName})`
      : `Canonical Meter CSV (${field.shortName})`;

  interface ParsedSetMeta {
    key: string;
    counts: number;
    tempoBpm: number;
    rehearsalMark: string;
    positions: Record<string, PerformerDot>;
  }

  const performerMap = new Map<string, Performer>();
  const setOrder: string[] = [];
  const setMap = new Map<string, ParsedSetMeta>();

  for (let rowIdx = 1; rowIdx < rawLines.length; rowIdx++) {
    const row = splitDelimitedRow(rawLines[rowIdx]!, delimiter);
    const label = (row[perfCol] ?? '').trim();
    const setKey = (row[setCol] ?? '').trim();
    if (!label || !setKey) {
      return {
        status: 'VALIDATION_FAILED',
        sourceFilename,
        detectedFormat: modeLabel,
        provenanceNotes: [
          {
            state: 'gap',
            statement: `Row ${rowIdx + 1} is missing Performer or Set identifier.`,
            sourceOrCondition: rawLines[rowIdx]!
          }
        ],
        archiveEntries: [],
        userGuidance: [`Fix empty Performer/Set field on row ${rowIdx + 1} and retry.`]
      };
    }

    const rawCounts = countsCol !== -1 ? Number(row[countsCol] ?? '0') : 16;
    if (!Number.isFinite(rawCounts) || rawCounts < 0) {
      return {
        status: 'VALIDATION_FAILED',
        sourceFilename,
        detectedFormat: modeLabel,
        provenanceNotes: [
          {
            state: 'gap',
            statement: `Row ${rowIdx + 1} has non-numeric or negative Counts ("${row[countsCol]}").`,
            sourceOrCondition: rawLines[rowIdx]!
          }
        ],
        archiveEntries: [],
        userGuidance: [`Provide a valid non-negative count on row ${rowIdx + 1}.`]
      };
    }

    const rawTempo = tempoCol !== -1 && row[tempoCol] ? Number(row[tempoCol]) : 140;
    const tempoBpm = Number.isFinite(rawTempo) && rawTempo > 0 ? rawTempo : 140;

    let xMeters = 0;
    let yMeters = 0;

    if (hasTextMode) {
      const hCell = row[horizTextCol] ?? '';
      const vCell = row[vertTextCol] ?? '';
      const hRes = parseHorizontalCoordinatePhrase(hCell, field);
      if (!hRes.ok) {
        return {
          status: 'VALIDATION_FAILED',
          sourceFilename,
          detectedFormat: modeLabel,
          provenanceNotes: [
            {
              state: 'gap',
              statement: `Row ${rowIdx + 1} (${label}, Set ${setKey}): ${hRes.error}`,
              sourceOrCondition: rawLines[rowIdx]!
            }
          ],
          archiveEntries: [],
          userGuidance: [`Correct horizontal coordinate text on row ${rowIdx + 1}.`]
        };
      }
      const vRes = parseVerticalCoordinatePhrase(vCell, field);
      if (!vRes.ok) {
        return {
          status: 'VALIDATION_FAILED',
          sourceFilename,
          detectedFormat: modeLabel,
          provenanceNotes: [
            {
              state: 'gap',
              statement: `Row ${rowIdx + 1} (${label}, Set ${setKey}): ${vRes.error}`,
              sourceOrCondition: rawLines[rowIdx]!
            }
          ],
          archiveEntries: [],
          userGuidance: [`Correct front-to-back coordinate text on row ${rowIdx + 1}.`]
        };
      }

      const readout: CoordinateReadout = {
        fieldId: field.id,
        side: hRes.side,
        lineIndex: hRes.lineIndex,
        lineValue: hRes.lineValue,
        lineLabel: hRes.lineLabel,
        horizRelation: hRes.horizRelation,
        horizSteps: hRes.horizSteps,
        horizExactMetersOffset: 0,
        vertReferenceId: vRes.vertReferenceId,
        vertReferenceLabel: vRes.vertReferenceLabel,
        vertReferenceShortLabel: vRes.vertReferenceShortLabel,
        vertRelation: vRes.vertRelation,
        vertSteps: vRes.vertSteps,
        vertReferenceYMeters: vRes.vertReferenceYMeters,
        vertExactMetersOffset: 0
      };
      const pt = fromCoordinateReadout(readout, field);
      xMeters = pt.xMeters;
      yMeters = pt.yMeters;
    } else if (hasMetersMode) {
      const xm = Number(row[xMetersCol]);
      const ym = Number(row[yMetersCol]);
      if (!Number.isFinite(xm) || !Number.isFinite(ym)) {
        return {
          status: 'VALIDATION_FAILED',
          sourceFilename,
          detectedFormat: modeLabel,
          provenanceNotes: [
            {
              state: 'gap',
              statement: `Row ${rowIdx + 1} has non-finite meter coordinates.`,
              sourceOrCondition: rawLines[rowIdx]!
            }
          ],
          archiveEntries: [],
          userGuidance: [`Ensure numeric X_Meters and Y_Meters values on row ${rowIdx + 1}.`]
        };
      }
      xMeters = xm;
      yMeters = ym;
    } else {
      const xs = Number(row[xStepsCol]);
      const ys = Number(row[yStepsCol]);
      if (!Number.isFinite(xs) || !Number.isFinite(ys)) {
        return {
          status: 'VALIDATION_FAILED',
          sourceFilename,
          detectedFormat: modeLabel,
          provenanceNotes: [
            {
              state: 'gap',
              statement: `Row ${rowIdx + 1} has non-finite step-grid coordinates.`,
              sourceOrCondition: rawLines[rowIdx]!
            }
          ],
          archiveEntries: [],
          userGuidance: [`Ensure numeric X_Steps and Y_Steps values on row ${rowIdx + 1}.`]
        };
      }
      xMeters = xs * field.stepSizeMeters;
      yMeters = ys * field.stepSizeMeters;
    }

    const curveOffset =
      curveCol !== -1 && row[curveCol] && Number.isFinite(Number(row[curveCol]))
        ? Number(row[curveCol])
        : undefined;

    if (!performerMap.has(label)) {
      const sectionRaw = secCol !== -1 ? row[secCol] : undefined;
      const instRaw = instCol !== -1 ? row[instCol] : undefined;
      const nameRaw = nameCol !== -1 ? row[nameCol] : undefined;
      const section = inferSectionFromText(sectionRaw, instRaw, label);
      const phys = defaultClearanceAndWeight(section, instRaw);
      performerMap.set(label, {
        id: label,
        label,
        name: nameRaw?.trim() || `${label} (${instRaw?.trim() || section})`,
        section,
        instrument: instRaw?.trim() || (section === 'BATTERY' ? 'Snare' : section === 'GUARD' ? 'Flag' : section === 'PIT' ? 'Marimba' : 'Brass'),
        clearanceRadiusMeters: phys.clearanceRadiusMeters,
        weightFactor: phys.weightFactor
      });
    }

    if (!setMap.has(setKey)) {
      setOrder.push(setKey);
      const mark = markCol !== -1 && row[markCol]?.trim() ? row[markCol]!.trim() : setKey;
      setMap.set(setKey, {
        key: setKey,
        counts: rawCounts,
        tempoBpm,
        rehearsalMark: mark,
        positions: {}
      });
    }

    const setEntry = setMap.get(setKey)!;
    setEntry.positions[label] = {
      xMeters,
      yMeters,
      ...(curveOffset && Math.abs(curveOffset) > 1e-6 ? { curveOffsetMeters: curveOffset } : {})
    };
  }

  const performers = Array.from(performerMap.values());
  const sets: DrillSet[] = [];

  for (let sIdx = 0; sIdx < setOrder.length; sIdx++) {
    const key = setOrder[sIdx]!;
    const meta = setMap.get(key)!;
    for (const perf of performers) {
      if (!meta.positions[perf.id]) {
        return {
          status: 'VALIDATION_FAILED',
          sourceFilename,
          detectedFormat: modeLabel,
          provenanceNotes: [
            {
              state: 'gap',
              statement: `Performer "${perf.label}" is missing a coordinate entry in Set "${key}".`,
              sourceOrCondition: 'All performers must have explicit coordinates on every set (no silent spot guessing).'
            }
          ],
          archiveEntries: [],
          userGuidance: [`Add a row for performer "${perf.label}" on Set "${key}".`]
        };
      }
    }

    sets.push({
      id: `imp-set-${sIdx + 1}`,
      name: /^set\b/i.test(key) ? key : `Set ${key}`,
      rehearsalMark: meta.rehearsalMark,
      counts: sIdx === 0 ? 0 : meta.counts,
      tempoBpm: meta.tempoBpm,
      notes: `Imported from ${sourceFilename} using ${field.shortName} geometry.`,
      positions: meta.positions
    });
  }

  const importedShow: DrillShow = {
    id: `imported-${Date.now().toString(36)}`,
    title: showTitle,
    organization: 'Imported Production',
    fieldStandardId: targetFieldId,
    ambientTempCelsius: 20,
    performers,
    sets,
    pins: [],
    harnessLedger: []
  };

  return {
    status: 'FULL_SHOW_IMPORTED',
    sourceFilename,
    detectedFormat: modeLabel,
    provenanceNotes: [
      {
        state: 'stated',
        statement: `Parsed ${performers.length} performers across ${sets.length} sets explicitly listed in "${sourceFilename}".`,
        sourceOrCondition: 'Input coordinate table rows'
      },
      {
        state: 'concluded',
        statement: `Inverted step phrases onto canonical meters using ${field.name} (${field.stepLabel}); most likely wrong if the source sheet was printed under a different hash standard.`,
        sourceOrCondition: `${field.id} coordinate bijection`
      }
    ],
    archiveEntries: [],
    importedShow,
    userGuidance: [
      `Verify the Primary Field Standard (${field.shortName}) matches the stadium hash standard on your source printed sheet, or use Ghost Overlay to check hash deltas.`
    ]
  };
}

function buildStarterShowForTempoSets(
  title: string,
  tempoSets: ImportedTempoSet[],
  existingShow?: DrillShow
): DrillShow {
  if (existingShow) {
    const updatedSets: DrillSet[] = tempoSets.map((ts, idx) => {
      const existingSet = existingShow.sets[idx] ?? existingShow.sets[existingShow.sets.length - 1]!;
      const clonedPositions = Object.fromEntries(
        Object.entries(existingSet.positions).map(([id, dot]) => [id, { ...dot }])
      );
      return {
        ...existingSet,
        id: existingShow.sets[idx]?.id ?? `xml-set-${idx + 1}`,
        name: ts.name,
        rehearsalMark: ts.rehearsalMark,
        counts: idx === 0 ? 0 : ts.counts,
        tempoBpm: ts.tempoBpm,
        notes: ts.notes,
        positions: clonedPositions
      };
    });
    return {
      ...existingShow,
      sets: updatedSets
    };
  }

  const performers: Performer[] = [];
  for (let i = 0; i < 16; i++) {
    const id = `B${i + 1}`;
    performers.push({
      id,
      label: id,
      name: `Brass ${i + 1}`,
      section: 'BRASS',
      instrument: i < 8 ? 'Trumpet' : 'Baritone',
      clearanceRadiusMeters: 0.65,
      weightFactor: 1.05
    });
  }
  for (let i = 0; i < 8; i++) {
    const id = `D${i + 1}`;
    performers.push({
      id,
      label: id,
      name: `Battery ${i + 1}`,
      section: 'BATTERY',
      instrument: i < 4 ? 'Snare' : 'Bass',
      clearanceRadiusMeters: 0.72,
      weightFactor: 1.3
    });
  }
  for (let i = 0; i < 8; i++) {
    const id = `G${i + 1}`;
    performers.push({
      id,
      label: id,
      name: `Guard ${i + 1}`,
      section: 'GUARD',
      instrument: 'Flag',
      clearanceRadiusMeters: 0.92,
      weightFactor: 1.0
    });
  }

  const sets: DrillSet[] = tempoSets.map((ts, sIdx) => {
    const positions: Record<string, PerformerDot> = {};
    const expand = 1 + (sIdx % 3) * 0.14;
    const shiftY = (sIdx % 2 === 0 ? 0 : -2.286);

    for (let i = 0; i < 16; i++) {
      const frac = i / 15 - 0.5;
      const arch = Math.cos(frac * Math.PI) * (sIdx % 2 === 1 ? -3.2 : 0);
      positions[`B${i + 1}`] = {
        xMeters: frac * 26 * expand,
        yMeters: 16.0 + arch + shiftY
      };
    }
    for (let i = 0; i < 8; i++) {
      const frac = i / 7 - 0.5;
      positions[`D${i + 1}`] = {
        xMeters: frac * 11 * expand,
        yMeters: 23.0 + shiftY * 0.6
      };
    }
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const idx = i % 4;
      positions[`G${i + 1}`] = {
        xMeters: side * (10 + idx * 2.8) * expand,
        yMeters: 27.5 - idx * 1.4
      };
    }

    return {
      id: `mxml-set-${sIdx + 1}`,
      name: ts.name,
      rehearsalMark: ts.rehearsalMark,
      counts: sIdx === 0 ? 0 : ts.counts,
      tempoBpm: ts.tempoBpm,
      notes: ts.notes,
      positions
    };
  });

  return {
    id: `musicxml-${Date.now().toString(36)}`,
    title,
    organization: 'MusicXML Score Sync',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 20,
    performers,
    sets,
    pins: [],
    harnessLedger: []
  };
}

export function importMusicXmlTempoMap(
  xmlText: string,
  sourceFilename = 'score.musicxml',
  existingShow?: DrillShow
): ImportDiagnosticReceipt {
  const titleMatch =
    xmlText.match(/<work-title[^>]*>([^<]+)<\/work-title>/i) ||
    xmlText.match(/<movement-title[^>]*>([^<]+)<\/movement-title>/i);
  const scoreTitle = titleMatch ? titleMatch[1]!.trim() : 'MusicXML Variable Tempo Show';

  const firstPartMatch = xmlText.match(/<part\b[^>]*>([\s\S]*?)<\/part>/i);
  const scanScope = firstPartMatch ? firstPartMatch[1]! : xmlText;
  const measureMatches = Array.from(scanScope.matchAll(/<measure\b[^>]*number=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/measure>/gi));

  if (measureMatches.length === 0) {
    return {
      status: 'VALIDATION_FAILED',
      sourceFilename,
      detectedFormat: 'MusicXML',
      provenanceNotes: [
        {
          state: 'gap',
          statement: 'No <measure> elements found inside MusicXML document.',
          sourceOrCondition: sourceFilename
        }
      ],
      archiveEntries: [],
      userGuidance: ['Export uncompressed MusicXML (.musicxml / .xml) containing at least one <measure> from Dorico, MuseScore, Finale, or Sibelius.']
    };
  }

  let currentBeats = 4;
  let currentBeatType = 4;
  let currentTempo = 120;

  interface ParsedMeasure {
    numLabel: string;
    counts: number;
    tempoBpm: number;
    rehearsalMark: string | null;
    tempoChanged: boolean;
  }

  const parsedMeasures: ParsedMeasure[] = [];

  for (const mMatch of measureMatches) {
    const numLabel = mMatch[1]!;
    const body = mMatch[2]!;
    const prevTempo = currentTempo;

    const beatsMatch = body.match(/<beats[^>]*>(\d+)<\/beats>/i);
    const beatTypeMatch = body.match(/<beat-type[^>]*>(\d+)<\/beat-type>/i);
    if (beatsMatch && beatTypeMatch) {
      const b = Number(beatsMatch[1]);
      const bt = Number(beatTypeMatch[1]);
      if (Number.isFinite(b) && b > 0 && Number.isFinite(bt) && bt > 0) {
        currentBeats = b;
        currentBeatType = bt;
      }
    }

    const soundTempoMatch = body.match(/<sound\b[^>]*tempo=["']?(\d+(?:\.\d+)?)["']?/i);
    const perMinuteMatch = body.match(/<per-minute[^>]*>(\d+(?:\.\d+)?)<\/per-minute>/i);
    if (soundTempoMatch) {
      const t = Number(soundTempoMatch[1]);
      if (Number.isFinite(t) && t > 20 && t < 320) currentTempo = t;
    } else if (perMinuteMatch) {
      const t = Number(perMinuteMatch[1]);
      if (Number.isFinite(t) && t > 20 && t < 320) currentTempo = t;
    }

    const rehearsalMatch = body.match(/<rehearsal[^>]*>([^<]+)<\/rehearsal>/i);
    const rehearsalMark = rehearsalMatch ? rehearsalMatch[1]!.trim() : null;

    let measureCounts = currentBeats;
    if (currentBeatType === 8 && currentBeats % 3 === 0 && currentBeats >= 6) {
      measureCounts = currentBeats / 3;
    }

    parsedMeasures.push({
      numLabel,
      counts: measureCounts,
      tempoBpm: currentTempo,
      rehearsalMark,
      tempoChanged: Math.abs(currentTempo - prevTempo) > 0.5
    });
  }

  // Partition measures into rehearsal phrases; each phrase feeds the transition to the next set anchor.
  const phraseStarts: number[] = [0];
  for (let i = 1; i < parsedMeasures.length; i++) {
    const pm = parsedMeasures[i]!;
    if (pm.rehearsalMark || pm.tempoChanged) {
      phraseStarts.push(i);
    }
  }
  if (phraseStarts.length === 1 && parsedMeasures.length > 4) {
    // No rehearsal marks present: subdivide evenly into 4-measure musical blocks.
    for (let i = 4; i < parsedMeasures.length; i += 4) {
      phraseStarts.push(i);
    }
  }

  const importedTempoSets: ImportedTempoSet[] = [];
  const openerMark = parsedMeasures[0]!.rehearsalMark ?? `m${parsedMeasures[0]!.numLabel}`;
  importedTempoSets.push({
    name: `Set 1: ${openerMark}`,
    rehearsalMark: openerMark,
    counts: 0,
    tempoBpm: parsedMeasures[0]!.tempoBpm,
    notes: `Score measure ${parsedMeasures[0]!.numLabel} opening anchor.`
  });

  for (let pIdx = 0; pIdx < phraseStarts.length; pIdx++) {
    const startIdx = phraseStarts[pIdx]!;
    const endIdx =
      pIdx < phraseStarts.length - 1 ? phraseStarts[pIdx + 1]! : parsedMeasures.length;
    let totalCounts = 0;
    for (let m = startIdx; m < endIdx; m++) {
      totalCounts += parsedMeasures[m]!.counts;
    }
    const phraseTempo = parsedMeasures[startIdx]!.tempoBpm;
    const isFinalBlock = pIdx === phraseStarts.length - 1;
    const nextMark = !isFinalBlock
      ? parsedMeasures[endIdx]!.rehearsalMark ?? `m${parsedMeasures[endIdx]!.numLabel}`
      : 'Hold';

    importedTempoSets.push({
      name: `Set ${pIdx + 2}: ${nextMark}`,
      rehearsalMark: nextMark,
      counts: totalCounts,
      tempoBpm: phraseTempo,
      notes: `MusicXML measures ${parsedMeasures[startIdx]!.numLabel}-${parsedMeasures[endIdx - 1]!.numLabel} (${totalCounts} cts @ ${phraseTempo} BPM).`
    });
  }

  const importedShow = buildStarterShowForTempoSets(
    scoreTitle,
    importedTempoSets,
    existingShow
  );

  return {
    status: existingShow ? 'TEMPO_MAP_IMPORTED' : 'FULL_SHOW_IMPORTED',
    sourceFilename,
    detectedFormat: 'MusicXML Score Tempo & Rehearsal Map',
    provenanceNotes: [
      {
        state: 'stated',
        statement: `Extracted ${parsedMeasures.length} measures across ${importedTempoSets.length} rehearsal/phrase sets from "${sourceFilename}".`,
        sourceOrCondition: 'MusicXML <measure>, <time>, <sound tempo>, and <rehearsal> tags'
      },
      {
        state: 'concluded',
        statement: 'Mapped simple meters (4/4, 3/4) 1:1 to marching counts and compound x/8 meters (6/8, 9/8, 12/8) to dotted-quarter counts; most likely wrong if conducting slow compound subdivisions in eighth-note pulses.',
        sourceOrCondition: 'Marching beat-map pulse convention'
      }
    ],
    archiveEntries: [],
    importedTempoSets,
    importedShow,
    userGuidance: existingShow
      ? ['Apply to update your active show Set counts, rehearsal marks, and variable BPM map.']
      : ['Apply to load a staged drill skeleton synchronized to the score tempo and rehearsal marks.']
  };
}

function classifyArchiveEntryRole(name: string): ArchiveEntrySummary['role'] {
  const lower = name.toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(lower)) return 'AUDIO';
  if (/\.(csv|tsv|txt)$/.test(lower)) return 'COORDINATE_TABLE';
  if (/\.(3dj|3dx|pyw)$/.test(lower)) return 'PYWARE_BINARY_3DJ';
  if (/\.(musicxml|xml|json)$/.test(lower)) return 'XML_SCORE_OR_META';
  return 'ASSET';
}

function inferAudioMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
}

async function decompressStreamBytes(
  data: Uint8Array,
  format: 'deflate-raw' | 'gzip'
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(`DecompressionStream('${format}') is unavailable in this runtime.`);
  }
  const cleanCopy = new Uint8Array(data.byteLength);
  cleanCopy.set(data);
  const ds = new DecompressionStream(format);
  const stream = new Blob([cleanCopy]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function formatMagicHex(bytes: Uint8Array, count = 4): string {
  const take = Math.min(count, bytes.length);
  const hex: string[] = [];
  for (let i = 0; i < take; i++) {
    hex.push(bytes[i]!.toString(16).toUpperCase().padStart(2, '0'));
  }
  return `0x${hex.join('')}`;
}

async function inspectBinaryOrTextPayload(
  bytes: Uint8Array
): Promise<{
  kind: 'TEXT' | 'JAVA_SERIALIZED' | 'BINARY_UNKNOWN';
  text?: string;
  magicHex: string;
}> {
  let payload = bytes;
  if (payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) {
    try {
      payload = await decompressStreamBytes(payload, 'gzip');
    } catch {
      return { kind: 'BINARY_UNKNOWN', magicHex: formatMagicHex(payload) };
    }
  }

  const magicHex = formatMagicHex(payload);
  if (payload.length >= 4 && payload[0] === 0xac && payload[1] === 0xed) {
    return { kind: 'JAVA_SERIALIZED', magicHex };
  }

  // Check if predominantly UTF-8 text (JSON / XML / CSV)
  const sampleLen = Math.min(payload.length, 512);
  let nonText = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = payload[i]!;
    if (b === 0 || (b < 0x09 && b !== 0x09) || (b > 0x0d && b < 0x20)) {
      nonText++;
    }
  }
  if (sampleLen > 0 && nonText / sampleLen < 0.03) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(payload);
    return { kind: 'TEXT', text, magicHex };
  }

  return { kind: 'BINARY_UNKNOWN', magicHex };
}

interface ParsedZipEntry {
  summary: ArchiveEntrySummary;
  bytes: Uint8Array;
}

async function readZipArchiveEntries(bytes: Uint8Array): Promise<ParsedZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minScan = Math.max(0, bytes.length - 65558);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minScan; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Missing ZIP End of Central Directory record.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const results: ParsedZipEntry[] = [];

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries; idx++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error(`Invalid ZIP Central Directory header at entry ${idx}.`);
    }

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
    ptr += 46 + fileNameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;

    if (
      localHeaderOffset + 30 > bytes.length ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      throw new Error(`Invalid ZIP Local File Header for "${name}".`);
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    let entryBytes: Uint8Array;
    if (compressionMethod === 0) {
      entryBytes = compressedSlice.slice();
    } else if (compressionMethod === 8) {
      entryBytes = await decompressStreamBytes(compressedSlice, 'deflate-raw');
    } else {
      throw new Error(
        `Unsupported ZIP compression method ${compressionMethod} for "${name}".`
      );
    }

    results.push({
      summary: {
        name,
        compressedBytes: compressedSize,
        uncompressedBytes: Math.max(uncompressedSize, entryBytes.length),
        compressionMethod,
        role: classifyArchiveEntryRole(name)
      },
      bytes: entryBytes
    });
  }

  return results;
}

const PYWARE_CSV_BRIDGE_GUIDE = [
  '1. Open the show in Pyware 3D and choose File -> Print / Export Coordinate Sheets (CSV or Tab-delimited text).',
  '2. Verify the target Field Standard selector above matches the hash setting used inside Pyware (NFHS High School vs NCAA / DCI).',
  '3. Drop the exported .csv/.txt here (or paste into the table box) to recover canonical meter coordinates across all sets.'
];

export async function importPywareArchiveBytes(
  bytes: Uint8Array,
  filename: string,
  targetFieldId: FieldStandardId,
  existingShow?: DrillShow
): Promise<ImportDiagnosticReceipt> {
  if (bytes.length === 0) {
    return {
      status: 'VALIDATION_FAILED',
      sourceFilename: filename,
      detectedFormat: 'Empty File',
      provenanceNotes: [
        {
          state: 'gap',
          statement: `File "${filename}" contains 0 bytes.`,
          sourceOrCondition: 'Byte stream check'
        }
      ],
      archiveEntries: [],
      userGuidance: ['Select a non-empty .3dz, .3dj, .csv, .musicxml, .json, or audio file.']
    };
  }

  const lowerName = filename.toLowerCase();

  // Handle direct audio upload cleanly
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(lowerName)) {
    return {
      status: 'AUDIO_ONLY_IMPORTED',
      sourceFilename: filename,
      detectedFormat: `Show Audio Track (${lowerName.split('.').pop()?.toUpperCase() ?? 'AUDIO'})`,
      provenanceNotes: [
        {
          state: 'stated',
          statement: `Loaded ${bytes.byteLength.toLocaleString()} bytes of encoded show audio from "${filename}".`,
          sourceOrCondition: 'Direct audio byte upload'
        }
      ],
      archiveEntries: [],
      extractedAudio: {
        filename,
        bytes,
        mimeType: inferAudioMime(filename)
      },
      userGuidance: [
        'Audio waveform will sync cleanly against every Set tempo marker on the bottom Timeline.'
      ]
    };
  }

  // Case 1: ZIP container (.3dz package or ZIP-wrapped .3dj)
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05);

  if (isZip) {
    let entries: ParsedZipEntry[];
    try {
      entries = await readZipArchiveEntries(bytes);
    } catch (err) {
      return {
        status: 'VALIDATION_FAILED',
        sourceFilename: filename,
        detectedFormat: 'Corrupt or Incomplete ZIP / .3dz Archive',
        provenanceNotes: [
          {
            state: 'gap',
            statement: `ZIP parser failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            sourceOrCondition: filename
          }
        ],
        archiveEntries: [],
        userGuidance: ['Verify the .3dz package finished writing to disk before importing.']
      };
    }

    const archiveEntries = entries.map((e) => e.summary);
    const audioEntry = entries.find((e) => e.summary.role === 'AUDIO');
    const extractedAudio = audioEntry
      ? {
          filename: audioEntry.summary.name,
          bytes: audioEntry.bytes,
          mimeType: inferAudioMime(audioEntry.summary.name)
        }
      : undefined;

    // Look for readable Meridian JSON, Coordinate CSV, or MusicXML inside the ZIP package
    let importedShow: DrillShow | undefined;
    let importedFromNote = '';
    const extraNotes: ProvenanceNote[] = [];

    for (const entry of entries) {
      const entryLower = entry.summary.name.toLowerCase();
      if (entryLower.endsWith('.json')) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
        const parsed = parseShowBundle(text);
        if (parsed.ok) {
          importedShow = parsed.show;
          importedFromNote = entry.summary.name;
          break;
        }
      } else if (entry.summary.role === 'COORDINATE_TABLE') {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
        const csvReceipt = importPywareCoordinateText(
          text,
          targetFieldId,
          filename.replace(/\.[^.]+$/, ''),
          entry.summary.name
        );
        if (csvReceipt.status === 'FULL_SHOW_IMPORTED' && csvReceipt.importedShow) {
          importedShow = csvReceipt.importedShow;
          importedFromNote = entry.summary.name;
          extraNotes.push(...csvReceipt.provenanceNotes);
          break;
        }
      } else if (entryLower.endsWith('.musicxml') || entryLower.endsWith('.xml')) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(entry.bytes);
        if (text.includes('<measure')) {
          const mxmlReceipt = importMusicXmlTempoMap(text, entry.summary.name, existingShow);
          if (mxmlReceipt.importedShow) {
            importedShow = mxmlReceipt.importedShow;
            importedFromNote = entry.summary.name;
            extraNotes.push(...mxmlReceipt.provenanceNotes);
          }
        }
      }
    }

    // Inspect binary .3dj entries honestly
    const binary3djInsights: string[] = [];
    for (const entry of entries) {
      if (entry.summary.role !== 'PYWARE_BINARY_3DJ') continue;
      const inspected = await inspectBinaryOrTextPayload(entry.bytes);
      if (inspected.kind === 'JAVA_SERIALIZED') {
        binary3djInsights.push(
          `"${entry.summary.name}" (${entry.bytes.length} bytes) uses Java ObjectOutputStream binary serialization (${inspected.magicHex}).`
        );
      } else if (inspected.kind === 'TEXT' && inspected.text && !importedShow) {
        if (inspected.text.trim().startsWith('{')) {
          const parsed = parseShowBundle(inspected.text);
          if (parsed.ok) {
            importedShow = parsed.show;
            importedFromNote = entry.summary.name;
          }
        } else if (inspected.text.includes('<measure')) {
          const mxml = importMusicXmlTempoMap(inspected.text, entry.summary.name, existingShow);
          if (mxml.importedShow) {
            importedShow = mxml.importedShow;
            importedFromNote = entry.summary.name;
          }
        }
      } else if (inspected.kind === 'BINARY_UNKNOWN') {
        binary3djInsights.push(
          `"${entry.summary.name}" (${entry.bytes.length} bytes) carries a proprietary binary header (${inspected.magicHex}).`
        );
      }
    }

    const baseProvenance: ProvenanceNote[] = [
      {
        state: 'stated',
        statement: `Unpacked ${archiveEntries.length} ZIP entries from "${filename}" (${archiveEntries.map((e) => e.name).join(', ')}).`,
        sourceOrCondition: 'Standard PKZIP Central Directory'
      }
    ];

    if (extractedAudio) {
      baseProvenance.push({
        state: 'stated',
        statement: `Extracted embedded audio track "${extractedAudio.filename}" (${extractedAudio.bytes.byteLength.toLocaleString()} bytes).`,
        sourceOrCondition: 'ZIP entry extraction'
      });
    }

    if (importedShow) {
      return {
        status: 'FULL_SHOW_IMPORTED',
        sourceFilename: filename,
        detectedFormat: `Pyware .3dz / ZIP Package (${importedFromNote})`,
        provenanceNotes: [...baseProvenance, ...extraNotes],
        archiveEntries,
        extractedAudio,
        importedShow,
        userGuidance: extractedAudio
          ? ['Apply imported show and arm extracted show audio onto the Timeline in 1 click.']
          : ['Click Apply Imported Show to open all sets on the 2D/3D field stage.']
      };
    }

    const binaryGapNote: ProvenanceNote = {
      state: 'gap',
      statement:
        binary3djInsights.length > 0
          ? binary3djInsights.join(' ')
          : 'Archive does not contain an open CSV, JSON, or MusicXML coordinate table alongside its binary drill file.',
      sourceOrCondition:
        'Pyware .3dj binary object schemas are proprietary to Pygraphics and cannot be deterministically decoded without guessing.'
    };

    return {
      status: extractedAudio ? 'AUDIO_EXTRACTED_BINARY_DRILL_LOCKED' : 'BINARY_DRILL_LOCKED',
      sourceFilename: filename,
      detectedFormat: 'Pyware .3dz Package (Proprietary Binary .3dj Inside)',
      provenanceNotes: [...baseProvenance, binaryGapNote],
      archiveEntries,
      extractedAudio,
      userGuidance: extractedAudio
        ? [
            `Good news: "${extractedAudio.filename}" was unpacked from your .3dz package and can be loaded directly onto the audio waveform.`,
            ...PYWARE_CSV_BRIDGE_GUIDE
          ]
        : PYWARE_CSV_BRIDGE_GUIDE
    };
  }

  // Case 2: Raw GZIP, Java ObjectOutputStream, XML, JSON, or CSV/TSV
  const inspected = await inspectBinaryOrTextPayload(bytes);
  if (inspected.kind === 'JAVA_SERIALIZED' || inspected.kind === 'BINARY_UNKNOWN') {
    const isJava = inspected.kind === 'JAVA_SERIALIZED';
    return {
      status: 'BINARY_DRILL_LOCKED',
      sourceFilename: filename,
      detectedFormat: isJava
        ? `Pyware Binary .3dj (Java ObjectOutputStream ${inspected.magicHex})`
        : `Opaque Binary File (${inspected.magicHex})`,
      provenanceNotes: [
        {
          state: 'stated',
          statement: isJava
            ? `Detected Java serialized object stream signature (${inspected.magicHex}) in "${filename}" (${bytes.byteLength.toLocaleString()} bytes).`
            : `Detected binary payload signature ${inspected.magicHex} in "${filename}" (${bytes.byteLength.toLocaleString()} bytes).`,
          sourceOrCondition: 'Binary magic header inspection'
        },
        {
          state: 'gap',
          statement:
            'Proprietary Pygraphics binary classes are unpublished outside Pyware runtime, so performer dots cannot be decoded from raw .3dj bytes without fabrication.',
          sourceOrCondition: 'Fail-closed epistemic boundary'
        }
      ],
      archiveEntries: [],
      userGuidance: PYWARE_CSV_BRIDGE_GUIDE
    };
  }

  const text = inspected.text ?? '';
  const trimmed = text.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const bundle = parseShowBundle(trimmed);
    if (bundle.ok) {
      return {
        status: 'FULL_SHOW_IMPORTED',
        sourceFilename: filename,
        detectedFormat: 'Meridian Show Bundle (.meridian.json)',
        provenanceNotes: [
          {
            state: 'stated',
            statement: `Validated canonical show bundle "${bundle.show.title}" (${bundle.show.performers.length} performers, ${bundle.show.sets.length} sets).`,
            sourceOrCondition: 'JSON schema validator'
          }
        ],
        archiveEntries: [],
        importedShow: bundle.show,
        userGuidance: ['Click Apply Imported Show to load this bundle.']
      };
    }
  }

  if (trimmed.startsWith('<') && trimmed.includes('<measure')) {
    return importMusicXmlTempoMap(trimmed, filename, existingShow);
  }

  return importPywareCoordinateText(
    trimmed,
    targetFieldId,
    filename.replace(/\.[^.]+$/, ''),
    filename
  );
}
