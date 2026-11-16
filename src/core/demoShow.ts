import {
  generateArcForm,
  generateBlockForm,
  generateCompanyFrontForm,
  generateLineForm,
  generateSpiralForm,
  generateWedgeForm
} from './forms.ts';
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

export function createDemoShow(): DrillShow {
  const performers = buildEnsembleRoster();
  const brassIds = performers.filter((p) => p.section === 'BRASS').map((p) => p.id);
  const batteryIds = performers.filter((p) => p.section === 'BATTERY').map((p) => p.id);
  const pitIds = performers.filter((p) => p.section === 'PIT').map((p) => p.id);
  const guardIds = performers.filter((p) => p.section === 'GUARD').map((p) => p.id);

  const pitAnchors = generateCompanyFrontForm(pitIds.length, 0, -2.2, 22.0);
  const pitMap = assignPoints(pitIds, pitAnchors);

  // Set 1: Opening Tableau (M.1)
  const s1BrassA = generateLineForm(12, { xMeters: -24, yMeters: 12 }, { xMeters: -3, yMeters: 24 });
  const s1BrassB = generateLineForm(12, { xMeters: 3, yMeters: 14 }, { xMeters: 24, yMeters: 28 });
  const s1Battery = generateBlockForm(14, { xMeters: 0, yMeters: 31 }, 2, 1.9);
  const s1GuardL = generateArcForm(8, -28, -14, 18, -3.5);
  const s1GuardR = generateArcForm(8, 14, 28, 18, -3.5);
  const set1Positions = {
    ...pitMap,
    ...assignPoints(brassIds, [...s1BrassA, ...s1BrassB]),
    ...assignPoints(batteryIds, s1Battery),
    ...assignPoints(guardIds, [...s1GuardL, ...s1GuardR])
  };

  // Set 2: Fanfare Unfold (M.9, 16 cts)
  const s2BrassA = generateArcForm(12, -23, -2, 14, 6.0);
  const s2BrassB = generateArcForm(12, 2, 23, 14, 6.0);
  const s2Battery = generateWedgeForm(14, { xMeters: 0, yMeters: 21 }, 16, 6.5);
  const s2GuardL = generateLineForm(8, { xMeters: -25, yMeters: 8 }, { xMeters: -12, yMeters: 26 });
  const s2GuardR = generateLineForm(8, { xMeters: 12, yMeters: 26 }, { xMeters: 25, yMeters: 8 });
  const set2Positions = {
    ...pitMap,
    ...assignPoints(brassIds, [...s2BrassA, ...s2BrassB]),
    ...assignPoints(batteryIds, s2Battery),
    ...assignPoints(guardIds, [...s2GuardL, ...s2GuardR])
  };

  // Set 3: Rotating Diamond Compression (M.13, 16 cts)
  const s3Brass = generateBlockForm(24, { xMeters: 0, yMeters: 19 }, 4, 2.2);
  const s3Battery = generateCompanyFrontForm(14, 0, 27.5, 19.5);
  const s3GuardL = generateArcForm(8, -21, -7, 11, -3.0);
  const s3GuardR = generateArcForm(8, 7, 21, 11, -3.0);
  const set3Positions = {
    ...pitMap,
    ...assignPoints(brassIds, s3Brass),
    ...assignPoints(batteryIds, s3Battery),
    ...assignPoints(guardIds, [...s3GuardL, ...s3GuardR])
  };

  // Set 4: Pass-Through Acceleration (M.17, 12 cts @ 172 BPM)
  // Intentional opposing corridors preparing a mid-set crossing & collision into Set 5!
  const s4BrassL = generateLineForm(12, { xMeters: -20, yMeters: 12 }, { xMeters: -2, yMeters: 22 });
  const s4BrassR = generateLineForm(12, { xMeters: 2, yMeters: 22 }, { xMeters: 20, yMeters: 12 });
  const s4Battery = generateWedgeForm(14, { xMeters: 0, yMeters: 25 }, 14, 5.5);
  const s4GuardL = generateLineForm(8, { xMeters: -14, yMeters: 18.288 }, { xMeters: -3, yMeters: 18.288 });
  const s4GuardR = generateLineForm(8, { xMeters: 3, yMeters: 18.288 }, { xMeters: 14, yMeters: 18.288 });
  const set4Positions = {
    ...pitMap,
    ...assignPoints(brassIds, [...s4BrassL, ...s4BrassR]),
    ...assignPoints(batteryIds, s4Battery),
    ...assignPoints(guardIds, [...s4GuardL, ...s4GuardR])
  };

  // Set 5: Company Front Hit on NCAA Front Hash (M.20, 16 cts @ 168 BPM)
  // Intentional crossed trumpet/mellophone slots (left/right inversion on inner brass)
  // and opposing horizontal Guard pass-through across the 50 so AI Intelligence & Harness
  // demonstrate real collision/crossing cleanup in 1 click!
  const frontPoints = generateCompanyFrontForm(24, 0, 18.288, 36.576);
  const crossedFrontPoints = [...frontPoints];
  // Swap two inner-left and inner-right slices to create realistic crossed paths to optimize.
  for (let k = 0; k < 4; k++) {
    const leftIdx = 8 + k;
    const rightIdx = 15 - k;
    const tmp = crossedFrontPoints[leftIdx]!;
    crossedFrontPoints[leftIdx] = crossedFrontPoints[rightIdx]!;
    crossedFrontPoints[rightIdx] = tmp;
  }

  const s5Battery = generateCompanyFrontForm(14, 0, 22.0, 18.0);
  // Guard crosses horizontally through center of front hash (s4GuardL -> right, s4GuardR -> left)
  const s5GuardLTargets = generateLineForm(8, { xMeters: 3, yMeters: 18.288 }, { xMeters: 16, yMeters: 18.288 });
  const s5GuardRTargets = generateLineForm(8, { xMeters: -16, yMeters: 18.288 }, { xMeters: -3, yMeters: 18.288 });
  const set5Positions = {
    ...pitMap,
    ...assignPoints(brassIds, crossedFrontPoints),
    ...assignPoints(batteryIds, s5Battery),
    ...assignPoints(guardIds, [...s5GuardLTargets, ...s5GuardRTargets])
  };

  // Set 6: Ballad Breath Spiral (M.24, 24 cts @ 112 BPM)
  const s6Brass = generateSpiralForm(24, { xMeters: -9.144, yMeters: 21.0 }, 2.2, 13.5, 1.5);
  const s6Battery = generateArcForm(14, 6, 24, 25, 4.0);
  const s6Guard = generateArcForm(16, -24, 18, 9.5, -3.5);
  const set6Positions = {
    ...pitMap,
    ...assignPoints(brassIds, s6Brass),
    ...assignPoints(batteryIds, s6Battery),
    ...assignPoints(guardIds, s6Guard)
  };

  // Set 7: Apex Resolution Hold (M.30, 16 cts @ 112 BPM)
  const s7Brass = generateWedgeForm(24, { xMeters: 0, yMeters: 11.5 }, 32.0, 14.0);
  const s7Battery = generateBlockForm(14, { xMeters: 0, yMeters: 23.0 }, 2, 1.75);
  const s7GuardL = generateLineForm(8, { xMeters: -26, yMeters: 12 }, { xMeters: -18, yMeters: 24 });
  const s7GuardR = generateLineForm(8, { xMeters: 18, yMeters: 24 }, { xMeters: 26, yMeters: 12 });
  const set7Positions = {
    ...pitMap,
    ...assignPoints(brassIds, s7Brass),
    ...assignPoints(batteryIds, s7Battery),
    ...assignPoints(guardIds, [...s7GuardL, ...s7GuardR])
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
        tempoBpm: 160,
        notes: 'Asymmetric diagonal scatter with Guard framing flanks and Battery block backfield.',
        positions: set1Positions
      },
      {
        id: 'set-2',
        name: 'Set 2: Fanfare Unfold',
        rehearsalMark: 'M.9',
        counts: 16,
        tempoBpm: 160,
        notes: 'Dual brass concert arcs unfold around Battery wedge impact.',
        positions: set2Positions
      },
      {
        id: 'set-3',
        name: 'Set 3: Central Compression',
        rehearsalMark: 'M.13',
        counts: 16,
        tempoBpm: 168,
        notes: 'Tight 4x6 brass block centered on 50; Battery shifts to Front Hash + 9m.',
        positions: set3Positions
      },
      {
        id: 'set-4',
        name: 'Set 4: Pass-Through Prep',
        rehearsalMark: 'M.17',
        counts: 12,
        tempoBpm: 172,
        notes: '172 BPM acceleration setting up Guard/Brass crossing corridor into M.20 Company Front.',
        positions: set4Positions
      },
      {
        id: 'set-5',
        name: 'Set 5: Company Front Hit',
        rehearsalMark: 'M.20',
        counts: 16,
        tempoBpm: 168,
        notes: '40-yard Brass Company Front on Front Hash; run AI Optimize/Deflect to clean pass-through.',
        positions: set5Positions
      },
      {
        id: 'set-6',
        name: 'Set 6: Ballad Breath Spiral',
        rehearsalMark: 'M.24',
        counts: 24,
        tempoBpm: 112,
        notes: 'Lyrical unwind into Side 1 40-yard spiral; Guard frames front sideline.',
        positions: set6Positions
      },
      {
        id: 'set-7',
        name: 'Set 7: Apex Chevron Hold',
        rehearsalMark: 'M.30',
        counts: 16,
        tempoBpm: 112,
        notes: 'Symmetric chevron aimed directly at Press Box podium.',
        positions: set7Positions
      }
    ],
    pins: [
      {
        id: 'pin-1',
        setId: 'set-4',
        countOffset: 8,
        performerId: 'G8',
        xMeters: 0,
        yMeters: 18.288,
        authorName: 'Maya Chen',
        authorRole: 'TECH',
        category: 'COLLISION',
        status: 'OPEN',
        message: 'Guard flags collide head-on at 50yd Front Hash around count 8 into Set 5; curve pass-through lanes.',
        createdAtIso: '2026-11-15T18:10:00.000Z',
        telemetrySnapshot: {
          stepSizeLabel: '6.2-to-5',
          speedMps: 2.1,
          acousticDelayMs: 47.4
        }
      },
      {
        id: 'pin-2',
        setId: 'set-5',
        countOffset: 0,
        performerId: 'B11',
        xMeters: -4.1,
        yMeters: 18.288,
        authorName: 'Jordan Reyes',
        authorRole: 'PERFORMER',
        category: 'STRIDE',
        status: 'OPEN',
        message: 'Mellophone 3 crosses Trumpet 8 & Baritones into the Company Front; optimize slot order.',
        createdAtIso: '2026-11-15T18:22:00.000Z',
        telemetrySnapshot: {
          stepSizeLabel: '5.1-to-5',
          speedMps: 2.5,
          acousticDelayMs: 48.2
        }
      },
      {
        id: 'pin-3',
        setId: 'set-2',
        countOffset: 0,
        performerId: 'P1',
        xMeters: 0,
        yMeters: 21.0,
        authorName: 'Elena Vance',
        authorRole: 'DESIGNER',
        category: 'HASH_SHIFT',
        status: 'TRIAGED',
        message: 'Verify NFHS high school practice turf hash offset (+3.56 steps from FH) before Friday stadium run.',
        createdAtIso: '2026-11-15T17:45:00.000Z',
        telemetrySnapshot: {
          stepSizeLabel: '7.8-to-5',
          speedMps: 1.56,
          acousticDelayMs: 67.0
        }
      }
    ],
    harnessLedger: []
  };
}
