import {
  generateArcForm,
  generateCompanyFrontForm,
  generateLineForm
} from './forms.ts';
import { solveMinCostAssignment } from './hungarian.ts';
import { CanonicalPoint, DrillShow, Performer, PerformerDot } from './types.ts';

function buildEnsembleRoster(): Performer[] {
  const performers: Performer[] = [];

  for (let i = 1; i <= 8; i++) {
    performers.push({
      id: `B${i}`,
      label: `T${i}`,
      name: `Trumpet ${i}`,
      section: 'BRASS',
      instrument: 'Trumpet',
      clearanceRadiusMeters: 0.65,
      weightFactor: 1.0
    });
  }
  for (let i = 9; i <= 14; i++) {
    performers.push({
      id: `B${i}`,
      label: `M${i - 8}`,
      name: `Mellophone ${i - 8}`,
      section: 'BRASS',
      instrument: 'Mellophone',
      clearanceRadiusMeters: 0.68,
      weightFactor: 1.05
    });
  }
  for (let i = 15; i <= 20; i++) {
    performers.push({
      id: `B${i}`,
      label: `B${i - 14}`,
      name: `Baritone ${i - 14}`,
      section: 'BRASS',
      instrument: 'Baritone',
      clearanceRadiusMeters: 0.72,
      weightFactor: 1.2
    });
  }
  for (let i = 21; i <= 24; i++) {
    performers.push({
      id: `B${i}`,
      label: `U${i - 20}`,
      name: `Contra Tuba ${i - 20}`,
      section: 'BRASS',
      instrument: 'Contra Tuba',
      clearanceRadiusMeters: 0.88,
      weightFactor: 1.55
    });
  }

  for (let i = 1; i <= 6; i++) {
    performers.push({
      id: `P${i}`,
      label: `S${i}`,
      name: `Snare ${i}`,
      section: 'BATTERY',
      instrument: 'Snare Drum',
      clearanceRadiusMeters: 0.74,
      weightFactor: 1.25
    });
  }
  for (let i = 7; i <= 9; i++) {
    performers.push({
      id: `P${i}`,
      label: `Q${i - 6}`,
      name: `Tenors ${i - 6}`,
      section: 'BATTERY',
      instrument: 'Quad Tenors',
      clearanceRadiusMeters: 0.85,
      weightFactor: 1.45
    });
  }
  for (let i = 10; i <= 14; i++) {
    performers.push({
      id: `P${i}`,
      label: `BD${i - 9}`,
      name: `Bass ${i - 9}`,
      section: 'BATTERY',
      instrument: `Bass Drum ${i - 9}`,
      clearanceRadiusMeters: 0.82,
      weightFactor: 1.4
    });
  }

  const pitInstruments = [
    'Marimba 1',
    'Marimba 2',
    'Marimba 3',
    'Marimba 4',
    'Vibraphone 1',
    'Vibraphone 2',
    'Vibraphone 3',
    'Xylophone',
    'Synthesizer',
    'Timpani'
  ];
  for (let i = 1; i <= 10; i++) {
    performers.push({
      id: `F${i}`,
      label: `FE${i}`,
      name: pitInstruments[i - 1] ?? `Front Ensemble ${i}`,
      section: 'PIT',
      instrument: pitInstruments[i - 1] ?? 'Mallet Percussion',
      clearanceRadiusMeters: 0.8,
      weightFactor: 1.0
    });
  }

  for (let i = 1; i <= 16; i++) {
    const equip = i <= 8 ? 'Flag' : i <= 12 ? 'Rifle' : 'Sabre';
    performers.push({
      id: `G${i}`,
      label: `G${i}`,
      name: `Guard ${i} (${equip})`,
      section: 'GUARD',
      instrument: equip,
      clearanceRadiusMeters: 1.02,
      weightFactor: 0.95
    });
  }

  return performers;
}

function assignPoints(
  ids: string[],
  points: CanonicalPoint[]
): Record<string, PerformerDot> {
  const out: Record<string, PerformerDot> = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const pt = points[i] ?? { xMeters: 0, yMeters: 18 };
    out[id] = { xMeters: pt.xMeters, yMeters: pt.yMeters };
  }
  return out;
}

function assignNonCrossingFromPrev(
  ids: string[],
  prevMap: Record<string, PerformerDot>,
  targetPoints: CanonicalPoint[]
): Record<string, PerformerDot> {
  const costMatrix = ids.map((id) => {
    const src = prevMap[id] ?? { xMeters: 0, yMeters: 18 };
    return targetPoints.map((slot) =>
      Math.hypot(slot.xMeters - src.xMeters, slot.yMeters - src.yMeters)
    );
  });
  const { assignment } = solveMinCostAssignment(costMatrix);
  const out: Record<string, PerformerDot> = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const slot = targetPoints[assignment[i]!]!;
    out[id] = { xMeters: slot.xMeters, yMeters: slot.yMeters };
  }
  return out;
}

function swapDots(
  map: Record<string, PerformerDot>,
  idA: string,
  idB: string
): void {
  const a = map[idA];
  const b = map[idB];
  if (!a || !b) return;
  map[idA] = { ...b };
  map[idB] = { ...a };
}

function makeOrderedChevron(
  count: number,
  centerX: number,
  apexY: number,
  spanMeters: number,
  depthMeters: number
): CanonicalPoint[] {
  const pts: CanonicalPoint[] = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0.5 : i / (count - 1);
    const xMeters = centerX + (u - 0.5) * spanMeters;
    const distNorm = Math.abs(2 * u - 1);
    const yMeters = apexY + distNorm * depthMeters;
    pts.push({ xMeters, yMeters });
  }
  return pts;
}

export function createDemoShow(): DrillShow {
  const performers = buildEnsembleRoster();
  const brassIds = performers.filter((p) => p.section === 'BRASS').map((p) => p.id);
  const batteryIds = performers.filter((p) => p.section === 'BATTERY').map((p) => p.id);
  const pitIds = performers.filter((p) => p.section === 'PIT').map((p) => p.id);
  const guardIds = performers.filter((p) => p.section === 'GUARD').map((p) => p.id);

  // Guard roles stay in clean non-overlapping corridors: 7 Left, 1 Center Soloist (G8), 8 Right
  const guardLeftIds = guardIds.slice(0, 7);
  const guardSoloId = guardIds[7]!; // G8
  const guardRightIds = guardIds.slice(8); // G9..G16

  // Brass soloist B12 occupies center corridor while B1..B11 (11) and B13..B24 (12) occupy left/right wings
  const brassLeftIds = brassIds.slice(0, 11);
  const brassSoloId = brassIds[11]!; // B12
  const brassRightIds = brassIds.slice(12);

  const pitAnchors = generateCompanyFrontForm(pitIds.length, 0, -2.2, 24.0);
  const pitMap = assignPoints(pitIds, pitAnchors);

  // Set 1: Opening Tableau (M.1)
  const set1Positions: Record<string, PerformerDot> = {
    ...pitMap,
    ...assignPoints(
      brassLeftIds,
      generateLineForm(11, { xMeters: -25, yMeters: 12.0 }, { xMeters: -4.0, yMeters: 16.5 })
    ),
    [brassSoloId]: { xMeters: 0, yMeters: 13.5 },
    ...assignPoints(
      brassRightIds,
      generateLineForm(12, { xMeters: 4.0, yMeters: 16.5 }, { xMeters: 26, yMeters: 12.0 })
    ),
    ...assignPoints(batteryIds, makeOrderedChevron(14, 0, 21.0, 26.0, 2.2)),
    ...assignPoints(guardLeftIds, generateArcForm(7, -42, -29, 16.0, -2.0)),
    [guardSoloId]: { xMeters: 0, yMeters: 10.5 },
    ...assignPoints(guardRightIds, generateArcForm(8, 29, 43, 16.0, -2.0))
  };

  // Set 2: Fanfare Unfold (M.9, 20 cts @ 152 BPM)
  const set2Positions: Record<string, PerformerDot> = {
    ...pitMap,
    ...assignNonCrossingFromPrev(
      brassLeftIds,
      set1Positions,
      generateArcForm(11, -25, -4.0, 13.5, 3.2)
    ),
    [brassSoloId]: { xMeters: 0, yMeters: 14.5 },
    ...assignNonCrossingFromPrev(
      brassRightIds,
      set1Positions,
      generateArcForm(12, 4.0, 26, 13.5, 3.2)
    ),
    ...assignNonCrossingFromPrev(
      batteryIds,
      set1Positions,
      makeOrderedChevron(14, 0, 20.0, 25.0, 2.8)
    ),
    ...assignNonCrossingFromPrev(
      guardLeftIds,
      set1Positions,
      generateLineForm(7, { xMeters: -41, yMeters: 12.5 }, { xMeters: -28.5, yMeters: 20.0 })
    ),
    [guardSoloId]: { xMeters: 0, yMeters: 11.2 },
    ...assignNonCrossingFromPrev(
      guardRightIds,
      set1Positions,
      generateLineForm(8, { xMeters: 28.5, yMeters: 20.0 }, { xMeters: 42, yMeters: 12.5 })
    )
  };

  // Set 3: Tight Central Bow (M.13, 20 cts @ 156 BPM)
  const set3Positions: Record<string, PerformerDot> = {
    ...pitMap,
    ...assignNonCrossingFromPrev(
      brassLeftIds,
      set2Positions,
      generateArcForm(11, -23.0, -3.5, 15.0, 3.5)
    ),
    [brassSoloId]: { xMeters: 0, yMeters: 16.2 },
    ...assignNonCrossingFromPrev(
      brassRightIds,
      set2Positions,
      generateArcForm(12, 3.5, 24.0, 15.0, 3.5)
    ),
    ...assignNonCrossingFromPrev(
      batteryIds,
      set2Positions,
      generateCompanyFrontForm(14, 0, 22.0, 25.0)
    ),
    ...assignNonCrossingFromPrev(
      guardLeftIds,
      set2Positions,
      generateArcForm(7, -40, -27, 14.5, -1.8)
    ),
    [guardSoloId]: { xMeters: 0, yMeters: 12.5 },
    ...assignNonCrossingFromPrev(
      guardRightIds,
      set2Positions,
      generateArcForm(8, 27, 41, 14.5, -1.8)
    )
  };

  // Set 4: Pass-Through Prep (M.17, 16 cts @ 160 BPM)
  // Guard soloist G8 steps around to (0, 20.0) while Brass soloist B12 steps to (0, 13.5),
  // preparing a deliberate head-on collision and crossed Brass wing slots into Set 5!
  const set4Positions: Record<string, PerformerDot> = {
    ...pitMap,
    ...assignNonCrossingFromPrev(
      brassLeftIds,
      set3Positions,
      generateLineForm(11, { xMeters: -24.5, yMeters: 16.5 }, { xMeters: -4.2, yMeters: 18.288 })
    ),
    [brassSoloId]: { xMeters: 0, yMeters: 13.5 },
    ...assignNonCrossingFromPrev(
      brassRightIds,
      set3Positions,
      generateLineForm(12, { xMeters: 4.2, yMeters: 18.288 }, { xMeters: 25.5, yMeters: 16.5 })
    ),
    ...assignNonCrossingFromPrev(
      batteryIds,
      set3Positions,
      generateCompanyFrontForm(14, 0, 22.5, 25.0)
    ),
    ...assignNonCrossingFromPrev(
      guardLeftIds,
      set3Positions,
      generateArcForm(7, -40, -28, 16.5, -1.8)
    ),
    [guardSoloId]: { xMeters: 0, yMeters: 20.2 },
    ...assignNonCrossingFromPrev(
      guardRightIds,
      set3Positions,
      generateArcForm(8, 28, 42, 16.5, -1.8)
    )
  };

  // Offset center soloists slightly in Set 3 so Set 3 -> Set 4 maintains safe passing clearance.
  set3Positions[brassSoloId] = { xMeters: -1.8, yMeters: 15.8 };
  set3Positions[guardSoloId] = { xMeters: 1.8, yMeters: 12.5 };

  // Stagger two inner Brass prep spots on the front side of the Front Hash so swapping their
  // Set 5 slots produces true intersecting paths with near-miss asynchronous passing clearance.
  set4Positions[brassLeftIds[5]!] = {
    ...set4Positions[brassLeftIds[5]!]!,
    yMeters: 15.2
  };
  set4Positions[brassLeftIds[6]!] = {
    ...set4Positions[brassLeftIds[6]!]!,
    yMeters: 17.2
  };
  set4Positions[brassRightIds[3]!] = {
    ...set4Positions[brassRightIds[3]!]!,
    yMeters: 15.2
  };
  set4Positions[brassRightIds[4]!] = {
    ...set4Positions[brassRightIds[4]!]!,
    yMeters: 17.2
  };

  // Set 5: Company Front Hit on NCAA Front Hash (M.20, 16 cts @ 160 BPM)
  const s5BrassLeft = assignNonCrossingFromPrev(
    brassLeftIds,
    set4Positions,
    generateLineForm(11, { xMeters: -25.0, yMeters: 18.288 }, { xMeters: -4.0, yMeters: 18.288 })
  );
  const s5BrassRight = assignNonCrossingFromPrev(
    brassRightIds,
    set4Positions,
    generateLineForm(12, { xMeters: 4.0, yMeters: 18.288 }, { xMeters: 26.0, yMeters: 18.288 })
  );
  const s5BrassClean: Record<string, PerformerDot> = {
    ...s5BrassLeft,
    ...s5BrassRight
  };
  const s5BrassAll: Record<string, PerformerDot> = {
    ...s5BrassClean
  };

  // Deliberately swap two inner Brass pairs to create solvable X-crossings for OPTIMIZE_ASSIGNMENT
  swapDots(s5BrassAll, brassLeftIds[5]!, brassLeftIds[6]!);
  swapDots(s5BrassAll, brassRightIds[3]!, brassRightIds[4]!);

  const s5GuardLeft = assignNonCrossingFromPrev(
    guardLeftIds,
    set4Positions,
    generateLineForm(7, { xMeters: -41, yMeters: 18.288 }, { xMeters: -28.5, yMeters: 18.288 })
  );
  const s5GuardRight = assignNonCrossingFromPrev(
    guardRightIds,
    set4Positions,
    generateLineForm(8, { xMeters: 28.5, yMeters: 18.288 }, { xMeters: 42.5, yMeters: 18.288 })
  );

  const set5CleanPositions: Record<string, PerformerDot> = {
    ...pitMap,
    ...s5BrassClean,
    ...assignNonCrossingFromPrev(
      batteryIds,
      set4Positions,
      generateCompanyFrontForm(14, 0, 22.0, 25.0)
    ),
    ...s5GuardLeft,
    ...s5GuardRight,
    [brassSoloId]: { xMeters: 0, yMeters: 20.0 },
    [guardSoloId]: { xMeters: 0, yMeters: 13.5 }
  };

  const set5Positions: Record<string, PerformerDot> = {
    ...set5CleanPositions,
    ...s5BrassAll
  };

  // Set 6: Ballad Breath Arcs (M.24, 24 cts @ 116 BPM)
  // Assigned from uncrossed Set 5 slots so optimizing Set 5 simultaneously clears Set 5 -> Set 6.
  const set6Positions: Record<string, PerformerDot> = {
    ...pitMap,
    ...assignNonCrossingFromPrev(
      brassLeftIds,
      set5CleanPositions,
      generateArcForm(11, -26, -4.0, 18.0, 3.6)
    ),
    [brassSoloId]: { xMeters: -1.6, yMeters: 18.2 },
    ...assignNonCrossingFromPrev(
      brassRightIds,
      set5CleanPositions,
      generateArcForm(12, 4.0, 27, 18.0, 3.6)
    ),
    ...assignNonCrossingFromPrev(
      batteryIds,
      set5CleanPositions,
      generateArcForm(14, -13, 13, 24.2, 1.5)
    ),
    ...assignNonCrossingFromPrev(
      guardLeftIds,
      set5CleanPositions,
      generateArcForm(7, -41, -28.5, 13.0, -2.0)
    ),
    [guardSoloId]: { xMeters: 1.6, yMeters: 12.2 },
    ...assignNonCrossingFromPrev(
      guardRightIds,
      set5CleanPositions,
      generateArcForm(8, 28.5, 42.5, 13.0, -2.0)
    )
  };
  set6Positions[brassLeftIds[5]!] = {
    ...set6Positions[brassLeftIds[5]!]!,
    yMeters: set6Positions[brassLeftIds[5]!]!.yMeters + 1.0
  };
  set6Positions[brassLeftIds[6]!] = {
    ...set6Positions[brassLeftIds[6]!]!,
    yMeters: set6Positions[brassLeftIds[6]!]!.yMeters - 1.0
  };
  set6Positions[brassRightIds[3]!] = {
    ...set6Positions[brassRightIds[3]!]!,
    yMeters: set6Positions[brassRightIds[3]!]!.yMeters + 1.6
  };
  set6Positions[brassRightIds[4]!] = {
    ...set6Positions[brassRightIds[4]!]!,
    yMeters: set6Positions[brassRightIds[4]!]!.yMeters - 1.4
  };

  // Set 7: Apex Chevron Hold (M.30, 20 cts @ 112 BPM)
  const set7Positions: Record<string, PerformerDot> = {
    ...pitMap,
    ...assignNonCrossingFromPrev(
      brassLeftIds,
      set6Positions,
      generateLineForm(11, { xMeters: -25, yMeters: 20.5 }, { xMeters: -3.5, yMeters: 13.0 })
    ),
    [brassSoloId]: { xMeters: 0, yMeters: 11.8 },
    ...assignNonCrossingFromPrev(
      brassRightIds,
      set6Positions,
      generateLineForm(12, { xMeters: 3.5, yMeters: 13.0 }, { xMeters: 26, yMeters: 20.5 })
    ),
    ...assignNonCrossingFromPrev(
      batteryIds,
      set6Positions,
      makeOrderedChevron(14, 0, 20.5, 25.0, 2.5)
    ),
    ...assignNonCrossingFromPrev(
      guardLeftIds,
      set6Positions,
      generateLineForm(7, { xMeters: -41, yMeters: 13.0 }, { xMeters: -28.5, yMeters: 21.0 })
    ),
    [guardSoloId]: { xMeters: 0, yMeters: 8.8 },
    ...assignNonCrossingFromPrev(
      guardRightIds,
      set6Positions,
      generateLineForm(8, { xMeters: 28.5, yMeters: 21.0 }, { xMeters: 42, yMeters: 13.0 })
    )
  };

  return {
    id: 'meridian-demo-mvt1',
    title: 'Kinetic Meridian — Mvt. I: Horizon & Impact',
    organization: 'Meridian Vanguard (64-Piece Studio Demo)',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 21,
    performers,
    sets: [
      {
        id: 'set-1',
        name: 'Set 1: Opening Tableau',
        rehearsalMark: 'M.1',
        counts: 0,
        tempoBpm: 152,
        notes: 'Asymmetric diagonal scatter with Guard framing flanks and Battery chevron backfield.',
        positions: set1Positions
      },
      {
        id: 'set-2',
        name: 'Set 2: Fanfare Unfold',
        rehearsalMark: 'M.9',
        counts: 20,
        tempoBpm: 152,
        notes: 'Dual brass concert arcs unfold around Battery wedge impact.',
        positions: set2Positions
      },
      {
        id: 'set-3',
        name: 'Set 3: Central Bow',
        rehearsalMark: 'M.13',
        counts: 20,
        tempoBpm: 156,
        notes: 'Sweeping 23-piece brass bow around center soloist; Battery locks behind Front Hash.',
        positions: set3Positions
      },
      {
        id: 'set-4',
        name: 'Set 4: Pass-Through Prep',
        rehearsalMark: 'M.17',
        counts: 16,
        tempoBpm: 160,
        notes: 'Sets up Brass/Guard center pass-through collision and crossed inner Brass slots into M.20.',
        positions: set4Positions
      },
      {
        id: 'set-5',
        name: 'Set 5: Company Front Hit',
        rehearsalMark: 'M.20',
        counts: 16,
        tempoBpm: 160,
        notes: 'Brass Company Front on Front Hash; run AI Optimize + Curve Pass-Through to clean M.17 -> M.20.',
        positions: set5Positions
      },
      {
        id: 'set-6',
        name: 'Set 6: Ballad Breath Arcs',
        rehearsalMark: 'M.24',
        counts: 24,
        tempoBpm: 116,
        notes: 'Lyrical dual brass arcs opening across the field; Guard frames front sideline.',
        positions: set6Positions
      },
      {
        id: 'set-7',
        name: 'Set 7: Apex Chevron Hold',
        rehearsalMark: 'M.30',
        counts: 20,
        tempoBpm: 112,
        notes: 'Symmetric chevron aimed directly at Press Box podium.',
        positions: set7Positions
      }
    ],
    pins: [
      {
        id: 'pin-1',
        setId: 'set-4',
        countOffset: 8.0,
        performerId: guardSoloId,
        xMeters: 0,
        yMeters: 16.85,
        authorName: 'Maya Chen',
        authorRole: 'TECH',
        category: 'COLLISION',
        status: 'OPEN',
        message: 'Guard soloist G8 and Mellophone M4 collide head-on at 50yd around count 8 into Set 5; curve pass-through lanes.',
        createdAtIso: '2026-11-15T18:10:00.000Z',
        telemetrySnapshot: {
          stepSizeLabel: '10.9-to-5',
          speedMps: 1.12,
          acousticDelayMs: 54.9
        }
      },
      {
        id: 'pin-2',
        setId: 'set-5',
        countOffset: 0,
        performerId: brassLeftIds[5]!,
        xMeters: -12.4,
        yMeters: 18.288,
        authorName: 'Jordan Reyes',
        authorRole: 'PERFORMER',
        category: 'STRIDE',
        status: 'OPEN',
        message: 'Inner Brass slots cross paths into the Company Front; optimize dot assignment with section locks.',
        createdAtIso: '2026-11-15T18:22:00.000Z',
        telemetrySnapshot: {
          stepSizeLabel: '8.4-to-5',
          speedMps: 1.45,
          acousticDelayMs: 63.4
        }
      },
      {
        id: 'pin-3',
        setId: 'set-2',
        countOffset: 0,
        performerId: 'P1',
        xMeters: 0,
        yMeters: 20.0,
        authorName: 'Elena Vance',
        authorRole: 'DESIGNER',
        category: 'HASH_SHIFT',
        status: 'TRIAGED',
        message: 'Verify NFHS high school practice turf hash offset (+3.56 steps from FH) before Friday stadium run.',
        createdAtIso: '2026-11-15T17:45:00.000Z',
        telemetrySnapshot: {
          stepSizeLabel: '8.4-to-5',
          speedMps: 1.38,
          acousticDelayMs: 64.1
        }
      }
    ],
    harnessLedger: []
  };
}
