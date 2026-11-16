import {
  computeHashTranslationDelta,
  formatCoordinateSheetText,
  formatSteps,
  toCoordinateReadout
} from './coordinates.ts';
import { FIELD_SPECS, getFieldSpec } from './fields.ts';
import {
  computeAcousticDelayMs
} from './intelligence.ts';
import {
  computeSegmentArcLengthMeters,
  getTransitionWindow
} from './interpolation.ts';
import {
  DrillShow,
  FieldPin,
  FieldStandardId,
  Performer,
  ShowIntelligenceReport
} from './types.ts';

export interface DotBookEntry {
  setIndex: number;
  setId: string;
  setName: string;
  rehearsalMark: string;
  countsFromPrev: number;
  tempoBpm: number;
  horizontalText: string;
  verticalText: string;
  compactText: string;
  venueTranslationNote: string | null;
  stepSizeText: string;
  pathTypeText: string;
  leftNeighborLabel: string | null;
  rightNeighborLabel: string | null;
  acousticDelayMs: number;
  notes: string;
}

export interface PerformerDotBook {
  showTitle: string;
  fieldName: string;
  venueComparisonName: string | null;
  performer: Performer;
  entries: DotBookEntry[];
  pins: FieldPin[];
}

export function generatePerformerDotBook(
  show: DrillShow,
  performerId: string
): PerformerDotBook {
  const performer =
    show.performers.find((p) => p.id === performerId) ?? show.performers[0]!;
  const field = getFieldSpec(show.fieldStandardId);
  const venueField = show.comparisonFieldId
    ? getFieldSpec(show.comparisonFieldId)
    : null;

  const entries: DotBookEntry[] = [];

  for (let i = 0; i < show.sets.length; i++) {
    const set = show.sets[i]!;
    const dot = set.positions[performer.id] ?? { xMeters: 0, yMeters: 0 };
    const readout = toCoordinateReadout(dot, field);
    const sheetText = formatCoordinateSheetText(readout, field);

    let venueNote: string | null = null;
    if (venueField && venueField.id !== field.id) {
      const delta = computeHashTranslationDelta(dot, field, venueField);
      venueNote = delta.warningMessage ?? `${delta.venueHorizontal} | ${delta.venueVertical}`;
    }

    let stepSizeText = 'Opening Set';
    let pathTypeText = 'Anchor';
    if (i > 0) {
      const win = getTransitionWindow(show, i - 1);
      const prevDot = win?.fromSet.positions[performer.id];
      if (win && prevDot && win.counts > 0) {
        const arcLen = computeSegmentArcLengthMeters(prevDot, dot);
        if (arcLen < 0.05) {
          stepSizeText = `Hold (${win.counts} cts)`;
          pathTypeText = 'Stationary';
        } else {
          const stepLen = arcLen / win.counts;
          const stepsPerFive = field.majorLineSpacingMeters / stepLen;
          stepSizeText = `${formatSteps(stepsPerFive)}-to-5 (${win.counts} cts)`;
          const curve = dot.curveOffsetMeters ?? 0;
          pathTypeText =
            Math.abs(curve) > 0.05
              ? `Curved arc (${curve > 0 ? '+' : ''}${curve.toFixed(1)}m)`
              : 'Straight path';
        }
      }
    }

    // Nearest physical left and right neighbors within same set
    let bestLeft: { label: string; dx: number } | null = null;
    let bestRight: { label: string; dx: number } | null = null;
    for (const other of show.performers) {
      if (other.id === performer.id) continue;
      const otherDot = set.positions[other.id];
      if (!otherDot) continue;
      const dy = Math.abs(otherDot.yMeters - dot.yMeters);
      if (dy > 4.5) continue;
      const dx = otherDot.xMeters - dot.xMeters;
      if (dx < -0.1 && (!bestLeft || Math.abs(dx) < Math.abs(bestLeft.dx))) {
        bestLeft = { label: `${other.label} (${formatSteps(Math.abs(dx) / field.stepSizeMeters)} st)`, dx };
      } else if (dx > 0.1 && (!bestRight || dx < bestRight.dx)) {
        bestRight = { label: `${other.label} (${formatSteps(dx / field.stepSizeMeters)} st)`, dx };
      }
    }

    entries.push({
      setIndex: i,
      setId: set.id,
      setName: set.name,
      rehearsalMark: set.rehearsalMark,
      countsFromPrev: set.counts,
      tempoBpm: set.tempoBpm,
      horizontalText: sheetText.horizontalText,
      verticalText: sheetText.verticalText,
      compactText: sheetText.compactText,
      venueTranslationNote: venueNote,
      stepSizeText,
      pathTypeText,
      leftNeighborLabel: bestLeft?.label ?? null,
      rightNeighborLabel: bestRight?.label ?? null,
      acousticDelayMs: Math.round(computeAcousticDelayMs(dot, show.ambientTempCelsius) * 10) / 10,
      notes: set.notes
    });
  }

  const pins = show.pins.filter((p) => p.performerId === performer.id);

  return {
    showTitle: show.title,
    fieldName: field.name,
    venueComparisonName: venueField ? venueField.name : null,
    performer,
    entries,
    pins
  };
}

export function exportDotBookMarkdown(book: PerformerDotBook): string {
  const lines: string[] = [
    `# Dot-Book: ${book.performer.label} — ${book.performer.name}`,
    `**Show:** ${book.showTitle}`,
    `**Section / Instrument:** ${book.performer.section} / ${book.performer.instrument}`,
    `**Field Standard:** ${book.fieldName}`,
    book.venueComparisonName
      ? `**Venue Hash Comparison:** ${book.venueComparisonName}`
      : '',
    '',
    '| Set | Mark | Counts | Tempo | Horizontal | Front-Back | Stride & Path | Dress Neighbors | Sound Lag |',
    '| :--- | :--- | ---: | ---: | :--- | :--- | :--- | :--- | ---: |'
  ].filter(Boolean);

  for (const e of book.entries) {
    const neighbors = [
      e.leftNeighborLabel ? `L: ${e.leftNeighborLabel}` : null,
      e.rightNeighborLabel ? `R: ${e.rightNeighborLabel}` : null
    ]
      .filter(Boolean)
      .join(' / ');
    lines.push(
      `| ${e.setName} | ${e.rehearsalMark} | ${e.countsFromPrev} | ${e.tempoBpm} | ${e.horizontalText} | ${e.verticalText} | ${e.stepSizeText} (${e.pathTypeText}) | ${neighbors || 'Open interval'} | ${e.acousticDelayMs} ms |`
    );
  }

  if (book.entries.some((e) => e.venueTranslationNote)) {
    lines.push('', '## Venue Hash Translation Alerts');
    for (const e of book.entries) {
      if (e.venueTranslationNote) {
        lines.push(`- **${e.setName} (${e.rehearsalMark}):** ${e.venueTranslationNote}`);
      }
    }
  }

  if (book.pins.length > 0) {
    lines.push('', '## Attached Staff & Rehearsal Pins');
    for (const pin of book.pins) {
      lines.push(
        `- [${pin.status}] **${pin.category}** (${pin.authorName}, ${pin.authorRole}): ${pin.message}`
      );
    }
  }

  return lines.join('\n');
}

export function exportRehearsalTriageMarkdown(
  show: DrillShow,
  intel: ShowIntelligenceReport
): string {
  const field = getFieldSpec(show.fieldStandardId);
  const lines: string[] = [
    `# Rehearsal Triage Report: ${show.title}`,
    `**Organization:** ${show.organization}`,
    `**Field Standard:** ${field.name}`,
    `**Cleanliness Score:** ${intel.cleanlinessScore}/100 | **Speed of Sound:** ${intel.acoustic.speedOfSoundMps.toFixed(1)} m/s (${show.ambientTempCelsius}C)`,
    '',
    `## Physics Summary`,
    `- **Critical Collisions:** ${intel.collisions.filter((c) => c.severity === 'CRITICAL').length}`,
    `- **Near-Miss Equipment Pinches:** ${intel.collisions.filter((c) => c.severity === 'NEAR_MISS').length}`,
    `- **Stride Alerts (< 6-to-5):** ${intel.strideAlerts.length}`,
    `- **Momentum Whiplash Turns:** ${intel.whiplashAlerts.length}`,
    `- **Acoustic Spread (Pit to Back):** ${intel.acoustic.pitToBackSpreadMs.toFixed(1)} ms (${intel.acoustic.tearRisk} risk)`,
    '',
    '## Collaboration Field Pins'
  ];

  for (const pin of show.pins) {
    const setName = show.sets.find((s) => s.id === pin.setId)?.name ?? pin.setId;
    lines.push(
      `- **[${pin.status}] ${pin.category}** — ${setName} (ct ${pin.countOffset}) | ${pin.authorName} (${pin.authorRole}): ${pin.message}`
    );
  }

  if (show.harnessLedger.length > 0) {
    lines.push('', '## Materialized AI Harness Receipts');
    for (const r of show.harnessLedger) {
      lines.push(
        `- **${r.lensSummary}** [digest \`${r.materializedInputDigest}\`]: collisions ${r.beforeMetrics.collisionCount} -> ${r.afterMetrics.collisionCount}, crossings ${r.beforeMetrics.crossingCount} -> ${r.afterMetrics.crossingCount}, score ${r.beforeMetrics.cleanlinessScore} -> ${r.afterMetrics.cleanlinessScore}`
      );
    }
  }

  return lines.join('\n');
}

export function serializeShowBundle(show: DrillShow): string {
  return JSON.stringify(show, null, 2);
}

export function parseShowBundle(
  json: string
): { ok: true; show: DrillShow } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON show bundle: ${err instanceof Error ? err.message : 'parse error'}`
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Show bundle root must be a JSON object.' };
  }

  const candidate = parsed as Partial<DrillShow>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    !candidate.fieldStandardId ||
    !(candidate.fieldStandardId in FIELD_SPECS)
  ) {
    return {
      ok: false,
      error: 'Show bundle missing valid id, title, or supported fieldStandardId.'
    };
  }

  if (!Array.isArray(candidate.performers) || candidate.performers.length === 0) {
    return { ok: false, error: 'Show bundle must include at least one performer.' };
  }
  if (!Array.isArray(candidate.sets) || candidate.sets.length === 0) {
    return { ok: false, error: 'Show bundle must include at least one drill set.' };
  }

  for (const set of candidate.sets) {
    if (!set || typeof set.id !== 'string' || !set.positions) {
      return { ok: false, error: 'Malformed DrillSet entry in bundle.' };
    }
    for (const [perfId, dot] of Object.entries(set.positions)) {
      if (
        !dot ||
        !Number.isFinite(dot.xMeters) ||
        !Number.isFinite(dot.yMeters)
      ) {
        return {
          ok: false,
          error: `Non-finite coordinate for performer ${perfId} in set ${set.id}.`
        };
      }
    }
  }

  return {
    ok: true,
    show: {
      id: candidate.id,
      title: candidate.title,
      organization: candidate.organization ?? 'Meridian Ensemble',
      fieldStandardId: candidate.fieldStandardId as FieldStandardId,
      comparisonFieldId: candidate.comparisonFieldId,
      ambientTempCelsius:
        typeof candidate.ambientTempCelsius === 'number' &&
        Number.isFinite(candidate.ambientTempCelsius)
          ? candidate.ambientTempCelsius
          : 20,
      performers: candidate.performers,
      sets: candidate.sets,
      pins: Array.isArray(candidate.pins) ? candidate.pins : [],
      harnessLedger: Array.isArray(candidate.harnessLedger)
        ? candidate.harnessLedger
        : []
    }
  };
}
