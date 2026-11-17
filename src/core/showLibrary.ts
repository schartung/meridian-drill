import { orderPerformersForRipple } from './choreography.ts';
import { FIELD_SPECS } from './fields.ts';
import {
  clampPointToFieldEnvelope,
  generateArcForm,
  generateBlockForm,
  generateCompanyFrontForm,
  generateLineForm,
  generateWedgeForm
} from './forms.ts';
import { solveMinCostAssignment } from './hungarian.ts';
import { formatShowAsPywareCoordinateCsv, ImportDiagnosticReceipt } from './importers.ts';
import {
  CanonicalPoint,
  DrillShow,
  FieldSpec,
  Performer,
  PerformerDot,
  ProvenanceNote
} from './types.ts';

export type LibraryShowId =
  | 'STAR_1991_CROSS'
  | 'OSU_SCRIPT_OHIO'
  | 'BLUECOATS_2014_TILT';

export interface RealWorldShowPreset {
  id: LibraryShowId;
  shortTitle: string;
  ensemble: string;
  yearLabel: string;
  repertoire: string;
  designerCredit: string;
  metricsLine: string;
  highlightNote: string;
  provenanceNotes: ProvenanceNote[];
  buildShow: () => DrillShow;
}

const NCAA_FIELD: FieldSpec = FIELD_SPECS.NCAA_DCI;

function rotateAround(
  pt: CanonicalPoint,
  origin: CanonicalPoint,
  angleDeg: number
): CanonicalPoint {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = pt.xMeters - origin.xMeters;
  const dy = pt.yMeters - origin.yMeters;
  return {
    xMeters: origin.xMeters + dx * c - dy * s,
    yMeters: origin.yMeters + dx * s + dy * c
  };
}

function toDotMap(
  ids: string[],
  pts: CanonicalPoint[],
  field: FieldSpec = NCAA_FIELD
): Record<string, PerformerDot> {
  const out: Record<string, PerformerDot> = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const raw = pts[i] ?? pts[pts.length - 1] ?? { xMeters: 0, yMeters: 18 };
    const clamped = clampPointToFieldEnvelope(raw, field);
    out[id] = { xMeters: clamped.xMeters, yMeters: clamped.yMeters };
  }
  return out;
}

function assignGroupOptimal(
  ids: string[],
  prevPositions: Record<string, PerformerDot>,
  targets: CanonicalPoint[],
  curveOffsetBySlot?: number[]
): Record<string, PerformerDot> {
  if (ids.length === 0) return {};
  const n = ids.length;
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prev = prevPositions[ids[i]!] ?? { xMeters: 0, yMeters: 18 };
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const tgt = targets[j]!;
      const d = Math.hypot(tgt.xMeters - prev.xMeters, tgt.yMeters - prev.yMeters);
      row.push(d * d);
    }
    cost.push(row);
  }
  const { assignment } = solveMinCostAssignment(cost);
  const out: Record<string, PerformerDot> = {};
  for (let i = 0; i < n; i++) {
    const slot = assignment[i]!;
    const pt = clampPointToFieldEnvelope(targets[slot]!, NCAA_FIELD);
    const curve = curveOffsetBySlot?.[slot];
    out[ids[i]!] = {
      xMeters: pt.xMeters,
      yMeters: pt.yMeters,
      ...(curve && Math.abs(curve) > 0.05 ? { curveOffsetMeters: curve } : {})
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Star of Indiana (1991) — "Roman Images: Cross-to-Cross Finale"
// ---------------------------------------------------------------------------

function buildRomanCrossPoints(
  center: CanonicalPoint,
  angleDeg: number
): CanonicalPoint[] {
  const pts: CanonicalPoint[] = [];
  // 14-performer vertical cross stem (-10.5m .. +10.5m)
  for (let i = 0; i < 14; i++) {
    const dy = -10.5 + (21.0 * i) / 13;
    pts.push(rotateAround({ xMeters: center.xMeters, yMeters: center.yMeters + dy }, center, angleDeg));
  }
  // 10-performer horizontal crossbar split symmetrically on either side of stem
  const armOffsets = [-7.5, -6.0, -4.5, -3.0, -1.5, 1.5, 3.0, 4.5, 6.0, 7.5];
  for (const dx of armOffsets) {
    pts.push(rotateAround({ xMeters: center.xMeters + dx, yMeters: center.yMeters + 2.5 }, center, angleDeg));
  }
  return pts;
}

function buildStar1991Show(): DrillShow {
  const brassIds = Array.from({ length: 24 }, (_, i) => `B${i + 1}`);
  const batteryIds = Array.from({ length: 12 }, (_, i) => `D${i + 1}`);
  const guardIds = Array.from({ length: 12 }, (_, i) => `G${i + 1}`);

  const performers: Performer[] = [
    ...brassIds.map((id, idx) => ({
      id,
      label: idx < 8 ? `T${idx + 1}` : idx < 16 ? `M${idx - 7}` : `U${idx - 15}`,
      name:
        idx < 8
          ? `Lead Trumpet ${idx + 1}`
          : idx < 16
            ? `Mellophone ${idx - 7}`
            : `Low Brass ${idx - 15}`,
      section: 'BRASS' as const,
      instrument: idx < 8 ? 'Trumpet' : idx < 16 ? 'Mellophone' : 'Contra / Baritone',
      clearanceRadiusMeters: idx < 16 ? 0.66 : 0.78,
      weightFactor: idx < 16 ? 1.05 : 1.35
    })),
    ...batteryIds.map((id, idx) => ({
      id,
      label: `D${idx + 1}`,
      name: `Battery ${idx + 1}`,
      section: 'BATTERY' as const,
      instrument: idx < 6 ? 'Snare' : idx < 9 ? 'Tenors' : 'Bass Drum',
      clearanceRadiusMeters: 0.72,
      weightFactor: 1.35
    })),
    ...guardIds.map((id, idx) => ({
      id,
      label: `G${idx + 1}`,
      name: `Color Guard ${idx + 1}`,
      section: 'GUARD' as const,
      instrument: 'Flag / Rifle',
      clearanceRadiusMeters: 0.92,
      weightFactor: 1.0
    }))
  ];

  // Set 1: Side 1 Roman Cross centered at Side 1 40 (-9.144m)
  const s1Pos: Record<string, PerformerDot> = {
    ...toDotMap(brassIds, buildRomanCrossPoints({ xMeters: -9.144, yMeters: 23.5 }, 12)),
    ...toDotMap(
      batteryIds,
      generateLineForm(12, { xMeters: -20.5, yMeters: 36.5 }, { xMeters: -3.5, yMeters: 31.5 })
    ),
    ...toDotMap(guardIds, [
      ...generateLineForm(6, { xMeters: -22.0, yMeters: 12.0 }, { xMeters: -14.0, yMeters: 10.5 }),
      ...generateLineForm(6, { xMeters: -4.0, yMeters: 10.5 }, { xMeters: 4.0, yMeters: 12.0 })
    ])
  };

  // Set 2: Zingali Pod Fracture — 4 rotating 6-brass diamonds converging toward midfield
  const diamondCenters: CanonicalPoint[] = [
    { xMeters: -13.5, yMeters: 17.5 },
    { xMeters: -6.5, yMeters: 29.0 },
    { xMeters: -2.0, yMeters: 15.0 },
    { xMeters: 2.5, yMeters: 25.0 }
  ];
  const s2BrassTargets: CanonicalPoint[] = [];
  for (const dc of diamondCenters) {
    s2BrassTargets.push(
      { xMeters: dc.xMeters, yMeters: dc.yMeters + 2.6 },
      { xMeters: dc.xMeters - 2.2, yMeters: dc.yMeters + 0.6 },
      { xMeters: dc.xMeters + 2.2, yMeters: dc.yMeters + 0.6 },
      { xMeters: dc.xMeters - 1.6, yMeters: dc.yMeters - 1.4 },
      { xMeters: dc.xMeters + 1.6, yMeters: dc.yMeters - 1.4 },
      { xMeters: dc.xMeters, yMeters: dc.yMeters - 2.6 }
    );
  }
  const s2Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(brassIds, s1Pos, s2BrassTargets),
    ...assignGroupOptimal(
      batteryIds,
      s1Pos,
      generateLineForm(12, { xMeters: -10.5, yMeters: 34.0 }, { xMeters: 6.5, yMeters: 32.5 })
    ),
    ...assignGroupOptimal(
      guardIds,
      s1Pos,
      generateArcForm(12, -16.0, 14.0, 10.5, -2.5)
    )
  };

  // Set 3: Midfield Interlocking Pass-Through across 50-yard line
  const diagA = generateLineForm(12, { xMeters: -9.0, yMeters: 15.0 }, { xMeters: 9.0, yMeters: 31.0 });
  const diagB = generateLineForm(12, { xMeters: -9.0, yMeters: 31.0 }, { xMeters: 9.0, yMeters: 15.0 });
  const s3BrassTargets = [...diagA, ...diagB];
  const s3Curves = [
    ...Array.from({ length: 12 }, () => 1.5),
    ...Array.from({ length: 12 }, () => -1.5)
  ];
  const s3Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(brassIds, s2Pos, s3BrassTargets, s3Curves),
    ...assignGroupOptimal(
      batteryIds,
      s2Pos,
      generateCompanyFrontForm(12, 0, 35.0, 18.0)
    ),
    ...assignGroupOptimal(guardIds, s2Pos, [
      ...generateLineForm(6, { xMeters: -22.0, yMeters: 13.0 }, { xMeters: -14.0, yMeters: 26.0 }),
      ...generateLineForm(6, { xMeters: 14.0, yMeters: 26.0 }, { xMeters: 22.0, yMeters: 13.0 })
    ])
  };

  // Set 4: Four-Arm Pinwheel radiating around Side 2 45 (+4.572m)
  const pinCenter: CanonicalPoint = { xMeters: 4.572, yMeters: 23.5 };
  const s4BrassTargets: CanonicalPoint[] = [];
  for (let arm = 0; arm < 4; arm++) {
    const baseAngle = (arm * Math.PI) / 2 + 0.35;
    for (let k = 0; k < 6; k++) {
      const r = 2.0 + k * 1.95;
      const twist = baseAngle + k * 0.14;
      s4BrassTargets.push({
        xMeters: pinCenter.xMeters + r * Math.cos(twist),
        yMeters: pinCenter.yMeters + r * 0.85 * Math.sin(twist)
      });
    }
  }
  const s4Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(brassIds, s3Pos, s4BrassTargets),
    ...assignGroupOptimal(
      batteryIds,
      s3Pos,
      generateLineForm(12, { xMeters: 2.0, yMeters: 34.5 }, { xMeters: 19.0, yMeters: 37.0 })
    ),
    ...assignGroupOptimal(
      guardIds,
      s3Pos,
      generateArcForm(12, -10.0, 22.0, 11.5, 3.0)
    )
  };

  // Set 5: Side 2 Mirror Roman Cross at +9.144m (Side 2 40)
  const s5Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(
      brassIds,
      s4Pos,
      buildRomanCrossPoints({ xMeters: 9.144, yMeters: 23.5 }, -12)
    ),
    ...assignGroupOptimal(
      batteryIds,
      s4Pos,
      generateLineForm(12, { xMeters: 3.5, yMeters: 31.5 }, { xMeters: 20.5, yMeters: 36.5 })
    ),
    ...assignGroupOptimal(guardIds, s4Pos, [
      ...generateLineForm(6, { xMeters: -4.0, yMeters: 12.0 }, { xMeters: 4.0, yMeters: 10.5 }),
      ...generateLineForm(6, { xMeters: 14.0, yMeters: 10.5 }, { xMeters: 22.0, yMeters: 12.0 })
    ])
  };

  // Set 6: Respighi Front Push — broad company front on NCAA Front Hash
  const s6Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(brassIds, s5Pos, generateCompanyFrontForm(24, 0, 18.288, 36.0)),
    ...assignGroupOptimal(batteryIds, s5Pos, generateCompanyFrontForm(12, 0, 23.5, 16.0)),
    ...assignGroupOptimal(guardIds, s5Pos, generateCompanyFrontForm(12, 0, 12.5, 38.0))
  };

  return {
    id: 'lib-star-1991-cross',
    title: 'Star of Indiana (1991) — Cross-to-Cross Finale',
    organization: 'Star of Indiana Drum & Bugle Corps (Archive Excerpt)',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 24,
    performers,
    sets: [
      {
        id: 'star-s1',
        name: 'Set 1: Side 1 Roman Cross',
        rehearsalMark: 'M.112',
        counts: 0,
        tempoBpm: 168,
        notes: 'Roman Cross tilted +12 deg over Side 1 40-yard line.',
        positions: s1Pos,
        bodyCues: [
          {
            id: 'star-cue-1',
            label: 'Cross Presentation to Box',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 16,
            rippleDelayCounts: 0,
            posture: 'UPRIGHT_GLIDE',
            hornCarriage: 'HORNS_BOX',
            upperFacing: 'PRESS_BOX',
            instruction: 'Hold proud Roman Cross angles while pressing upper body square to press box.'
          }
        ]
      },
      {
        id: 'star-s2',
        name: 'Set 2: Zingali Pod Fracture',
        rehearsalMark: 'M.116',
        counts: 16,
        tempoBpm: 176,
        notes: 'Cross splits into four 6-person diamonds converging toward midfield.',
        positions: s2Pos,
        bodyCues: [
          {
            id: 'star-cue-2',
            label: 'Pod Drive Jazz-Run',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 16,
            rippleDelayCounts: 0,
            posture: 'JAZZ_RUN',
            hornCarriage: 'HORNS_CARRY',
            upperFacing: 'TRAVEL',
            instruction: 'Drive smoothly along diagonal pod vectors keeping diamond intervals locked.'
          }
        ]
      },
      {
        id: 'star-s3',
        name: 'Set 3: Midfield Pass-Through',
        rehearsalMark: 'M.120',
        counts: 16,
        tempoBpm: 184,
        notes: 'Opposing brass X-diagonals weave across the 50-yard line with curved clearance.',
        positions: s3Pos
      },
      {
        id: 'star-s4',
        name: 'Set 4: Four-Arm Pinwheel',
        rehearsalMark: 'M.124',
        counts: 16,
        tempoBpm: 188,
        notes: 'Pinwheel spiral forms around Side 2 45-yard line at 188 BPM.',
        positions: s4Pos
      },
      {
        id: 'star-s5',
        name: 'Set 5: Side 2 Mirror Cross',
        rehearsalMark: 'M.128',
        counts: 16,
        tempoBpm: 192,
        notes: 'Snaps instantaneously into exact mirror-image Roman Cross on Side 2 40.',
        positions: s5Pos,
        bodyCues: [
          {
            id: 'star-cue-5',
            label: 'Mirror Cross Horn-Snap',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 12,
            rippleDelayCounts: 0,
            posture: 'UPRIGHT_GLIDE',
            hornCarriage: 'HORNS_SNAP_UP',
            upperFacing: 'PRESS_BOX',
            instruction: 'Snap bells straight into the press box on arrival at Side 2 Mirror Cross.'
          }
        ]
      },
      {
        id: 'star-s6',
        name: 'Set 6: Respighi Front Push',
        rehearsalMark: 'Cut',
        counts: 12,
        tempoBpm: 192,
        notes: 'Final broad company front push on Front Hash.',
        positions: s6Pos,
        bodyCues: [
          {
            id: 'star-cue-6',
            label: 'Final Impact Lunge & High Bell',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 0,
            rippleDelayCounts: 0,
            posture: 'LUNGE_LEFT',
            hornCarriage: 'HIGH_BELL_EXTENSION',
            upperFacing: 'PRESS_BOX',
            instruction: 'Lock wide left lunge across Front Hash and project maximum closing chord.'
          }
        ]
      }
    ],
    pins: [],
    harnessLedger: []
  };
}

// ---------------------------------------------------------------------------
// 2. Ohio State University Marching Band (TBDBITL) — "Script Ohio"
// ---------------------------------------------------------------------------

function buildHollowBlockO(center: CanonicalPoint): CanonicalPoint[] {
  const dx = 3.6;
  const dy = 5.0;
  // 12 points forming a crisp rectangular perimeter: top(4), right(2), bottom(4), left(2)
  return [
    { xMeters: center.xMeters - dx, yMeters: center.yMeters + dy },
    { xMeters: center.xMeters - dx * 0.33, yMeters: center.yMeters + dy },
    { xMeters: center.xMeters + dx * 0.33, yMeters: center.yMeters + dy },
    { xMeters: center.xMeters + dx, yMeters: center.yMeters + dy },
    { xMeters: center.xMeters + dx, yMeters: center.yMeters + dy * 0.33 },
    { xMeters: center.xMeters + dx, yMeters: center.yMeters - dy * 0.33 },
    { xMeters: center.xMeters + dx, yMeters: center.yMeters - dy },
    { xMeters: center.xMeters + dx * 0.33, yMeters: center.yMeters - dy },
    { xMeters: center.xMeters - dx * 0.33, yMeters: center.yMeters - dy },
    { xMeters: center.xMeters - dx, yMeters: center.yMeters - dy },
    { xMeters: center.xMeters - dx, yMeters: center.yMeters - dy * 0.33 },
    { xMeters: center.xMeters - dx, yMeters: center.yMeters + dy * 0.33 }
  ];
}

function buildCursiveOhioPoints(): CanonicalPoint[] {
  const pts: CanonicalPoint[] = [];

  // Capital cursive 'O' (11 dots): tall italicized loop centered (-15.5, 24.0)
  for (let i = 0; i < 11; i++) {
    const theta = (i / 11) * Math.PI * 2 + 0.15;
    const rawDy = 6.7 * Math.sin(theta);
    const skew = 0.22 * rawDy;
    pts.push({
      xMeters: -15.5 + 4.4 * Math.cos(theta) + skew,
      yMeters: 24.1 + rawDy
    });
  }

  // Cursive 'h' (10 dots): tall ascender down to baseline + rounded arch hump + ligature
  pts.push(
    { xMeters: -6.8, yMeters: 31.2 },
    { xMeters: -7.2, yMeters: 28.0 },
    { xMeters: -7.6, yMeters: 24.6 },
    { xMeters: -8.0, yMeters: 21.1 },
    { xMeters: -8.4, yMeters: 17.6 },
    { xMeters: -6.4, yMeters: 22.8 },
    { xMeters: -4.2, yMeters: 24.4 },
    { xMeters: -2.2, yMeters: 23.0 },
    { xMeters: -1.9, yMeters: 18.2 },
    { xMeters: 1.2, yMeters: 19.6 }
  );

  // Lowercase 'i' stem (5 dots) directly beneath x = +5.2m
  pts.push(
    { xMeters: 4.3, yMeters: 23.2 },
    { xMeters: 5.2, yMeters: 24.2 },
    { xMeters: 5.0, yMeters: 21.4 },
    { xMeters: 5.1, yMeters: 18.2 },
    { xMeters: 8.0, yMeters: 19.6 }
  );

  // Lowercase cursive 'o' (9 dots) centered (+14.0, 21.0)
  for (let i = 0; i < 9; i++) {
    const theta = (i / 9) * Math.PI * 2 + Math.PI * 0.85;
    pts.push({
      xMeters: 14.0 + 3.5 * Math.cos(theta),
      yMeters: 21.0 + 3.5 * Math.sin(theta)
    });
  }

  return pts;
}

function buildOsuScriptOhioShow(): DrillShow {
  const marchIds = Array.from({ length: 35 }, (_, i) => `B${i + 1}`);
  const sousaId = 'SOUSA1';
  const batteryIds = Array.from({ length: 12 }, (_, i) => `D${i + 1}`);

  // All-brass & percussion ensemble (zero Guard, zero Pit — authentic TBDBITL lineup)
  const performers: Performer[] = [
    ...marchIds.map((id, idx) => ({
      id,
      label: idx < 12 ? `T${idx + 1}` : idx < 24 ? `B${idx - 11}` : `H${idx - 23}`,
      name:
        idx < 12
          ? `Cornet / Trumpet ${idx + 1}`
          : idx < 24
            ? `Baritone / Trombone ${idx - 11}`
            : `Mellophone / Alto ${idx - 23}`,
      section: 'BRASS' as const,
      instrument: idx < 12 ? 'Trumpet' : idx < 24 ? 'Baritone' : 'Mellophone',
      clearanceRadiusMeters: 0.68,
      weightFactor: 1.1
    })),
    {
      id: sousaId,
      label: 'SOUSA',
      name: 'Senior Sousaphone (i-Dotter)',
      section: 'BRASS',
      instrument: 'Sousaphone',
      clearanceRadiusMeters: 0.88,
      weightFactor: 1.55
    },
    ...batteryIds.map((id, idx) => ({
      id,
      label: `D${idx + 1}`,
      name: `Percussion ${idx + 1}`,
      section: 'BATTERY' as const,
      instrument: idx < 6 ? 'Snare' : idx < 9 ? 'Tenors' : 'Bass Drum',
      clearanceRadiusMeters: 0.72,
      weightFactor: 1.35
    }))
  ];

  const tripleBlockAll = [
    ...buildHollowBlockO({ xMeters: -16.0, yMeters: 23.4 }),
    ...buildHollowBlockO({ xMeters: 0.0, yMeters: 23.4 }),
    ...buildHollowBlockO({ xMeters: 16.0, yMeters: 23.4 })
  ]; // 36 points: first 35 to B1..B35, last right-mid spot to SOUSA1
  const batteryCadenceBlock = generateBlockForm(12, { xMeters: 0, yMeters: 35.5 }, 2, 1.8);

  const s1Pos: Record<string, PerformerDot> = {
    ...toDotMap(marchIds, tripleBlockAll.slice(0, 35)),
    [sousaId]: clampPointToFieldEnvelope(tripleBlockAll[35]!, NCAA_FIELD),
    ...toDotMap(batteryIds, batteryCadenceBlock)
  };

  const finalOhioPts = buildCursiveOhioPoints(); // 35 crisp points: O(11), h(10), i(5), o(9)

  // Set 2: Peel-1 — Capital 'O' peels open while 'h-i-o' marchers funnel left along peel track
  const s2PeelTargets: CanonicalPoint[] = [
    ...finalOhioPts.slice(0, 11),
    ...generateLineForm(12, { xMeters: -11.0, yMeters: 29.0 }, { xMeters: -2.0, yMeters: 20.0 }),
    ...generateLineForm(12, { xMeters: 2.0, yMeters: 24.0 }, { xMeters: 15.0, yMeters: 22.0 })
  ];
  const s2Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(marchIds, s1Pos, s2PeelTargets),
    [sousaId]: { xMeters: 20.5, yMeters: 25.0 },
    ...assignGroupOptimal(batteryIds, s1Pos, generateBlockForm(12, { xMeters: 0, yMeters: 36.2 }, 2, 1.8))
  };

  // Set 3: Peel-2 — 'O' + 'h' lock in while 'i-o' unwind toward Side 2
  const s3PeelTargets: CanonicalPoint[] = [
    ...finalOhioPts.slice(0, 21),
    ...generateLineForm(14, { xMeters: 1.5, yMeters: 20.5 }, { xMeters: 16.5, yMeters: 23.5 })
  ];
  const s3Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(marchIds, s2Pos, s3PeelTargets),
    [sousaId]: { xMeters: 18.5, yMeters: 26.8 },
    ...assignGroupOptimal(batteryIds, s2Pos, generateBlockForm(12, { xMeters: 0, yMeters: 36.2 }, 2, 1.8))
  };

  // Set 4: Peel-3 — 'O-h-i' stem completes while 'o' closes its loop; SOUSA circles behind
  const s4PeelTargets: CanonicalPoint[] = [
    ...finalOhioPts.slice(0, 26),
    ...generateArcForm(9, 10.5, 17.5, 20.5, 3.2)
  ];
  const s4Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(marchIds, s3Pos, s4PeelTargets),
    [sousaId]: { xMeters: 10.8, yMeters: 27.6 },
    ...assignGroupOptimal(batteryIds, s3Pos, generateBlockForm(12, { xMeters: 0, yMeters: 36.2 }, 2, 1.8))
  };

  // Set 5: Full Cursive 'Ohio' complete + SOUSA1 struts down the lane toward the 'i' dot
  const s5Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(marchIds, s4Pos, finalOhioPts),
    [sousaId]: { xMeters: 5.2, yMeters: 27.0 },
    ...assignGroupOptimal(batteryIds, s4Pos, generateBlockForm(12, { xMeters: 0, yMeters: 36.2 }, 2, 1.8))
  };

  // Set 6: Hold cursive 'Ohio' while SOUSA1 dots the 'i' at (+5.2, +29.4) and bows
  const s6Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(marchIds, s5Pos, finalOhioPts),
    [sousaId]: { xMeters: 5.2, yMeters: 29.4 },
    ...assignGroupOptimal(batteryIds, s5Pos, generateBlockForm(12, { xMeters: 0, yMeters: 36.2 }, 2, 1.8))
  };

  return {
    id: 'lib-osu-script-ohio',
    title: 'Ohio State TBDBITL — Script Ohio',
    organization: 'The Ohio State University Marching Band (Tradition Excerpt)',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 14,
    performers,
    sets: [
      {
        id: 'osu-s1',
        name: 'Set 1: Triple Block O',
        rehearsalMark: 'Block',
        counts: 0,
        tempoBpm: 180,
        notes: 'Three Block O formations prepare to unwind at 180 BPM.',
        positions: s1Pos
      },
      {
        id: 'osu-s2',
        name: 'Set 2: Single-File Peel-Off',
        rehearsalMark: 'Peel-1',
        counts: 16,
        tempoBpm: 180,
        notes: 'Blocks unwind in single-file follow-the-leader fashion into the capital O.',
        positions: s2Pos
      },
      {
        id: 'osu-s3',
        name: 'Set 3: Cursive O-h Unwind',
        rehearsalMark: 'Peel-2',
        counts: 16,
        tempoBpm: 180,
        notes: 'Tall cursive h ascender snaps vertical while remaining brass trace toward Side 2.',
        positions: s3Pos
      },
      {
        id: 'osu-s4',
        name: 'Set 4: Cursive O-h-i Stem',
        rehearsalMark: 'Peel-3',
        counts: 16,
        tempoBpm: 180,
        notes: 'Lowercase i stem locks beneath Back Hash while Sousaphone circles Side 2.',
        positions: s4Pos
      },
      {
        id: 'osu-s5',
        name: 'Set 5: Script Ohio & Strut',
        rehearsalMark: 'Strut',
        counts: 16,
        tempoBpm: 180,
        notes: 'Cursive Ohio locks on turf as Senior Sousaphone struts up toward the i dot.',
        positions: s5Pos,
        bodyCues: [
          {
            id: 'osu-cue-strut',
            label: 'Senior Sousaphone Chair-Step Strut',
            targetPerformerIds: [sousaId],
            startCount: 0,
            endCount: 16,
            rippleDelayCounts: 0,
            posture: 'JAZZ_RUN',
            hornCarriage: 'HIGH_BELL_EXTENSION',
            upperFacing: 'PRESS_BOX',
            instruction: 'Drive crisp high-step strut up the Side 2 corridor directly onto the i dot.'
          }
        ]
      },
      {
        id: 'osu-s6',
        name: 'Set 6: Dotting the i',
        rehearsalMark: 'Dot-i',
        counts: 16,
        tempoBpm: 180,
        notes: 'Senior Sousaphone plants on the i dot at (+5.2m, 29.4m) and delivers signature bow.',
        positions: s6Pos,
        bodyCues: [
          {
            id: 'osu-cue-band-hold',
            label: 'Script Ohio Fanfare Project',
            targetPerformerIds: marchIds,
            startCount: 0,
            endCount: 0,
            rippleDelayCounts: 0,
            posture: 'UPRIGHT_GLIDE',
            hornCarriage: 'HORNS_SNAP_UP',
            upperFacing: 'PRESS_BOX',
            instruction: 'Hold rock-solid cursive Ohio alignment and drive sound toward Press Box.'
          },
          {
            id: 'osu-cue-sousa-bow',
            label: 'Sousaphone Senior Bow & Hat-Tip',
            targetPerformerIds: [sousaId],
            startCount: 0,
            endCount: 0,
            rippleDelayCounts: 0,
            posture: 'BOW_DROP',
            hornCarriage: 'HIGH_BELL_EXTENSION',
            upperFacing: 'PRESS_BOX',
            instruction: 'Plant firmly above the i stem and execute deep signature Press-Box bow.'
          }
        ]
      }
    ],
    pins: [],
    harnessLedger: []
  };
}

// ---------------------------------------------------------------------------
// 3. Bluecoats (2014) — "Tilt: Skewed Axis & Pitch-Bend Finale"
// ---------------------------------------------------------------------------

function buildBluecoats2014Show(): DrillShow {
  const brassIds = Array.from({ length: 24 }, (_, i) => `B${i + 1}`);
  const batteryIds = Array.from({ length: 12 }, (_, i) => `D${i + 1}`);
  const pitIds = Array.from({ length: 6 }, (_, i) => `P${i + 1}`);
  const guardIds = Array.from({ length: 10 }, (_, i) => `G${i + 1}`);

  const performers: Performer[] = [
    ...brassIds.map((id, idx) => ({
      id,
      label: idx < 8 ? `T${idx + 1}` : idx < 16 ? `M${idx - 7}` : `U${idx - 15}`,
      name:
        idx < 8
          ? `Trumpet ${idx + 1}`
          : idx < 16
            ? `Mellophone ${idx - 7}`
            : `Baritone / Contra ${idx - 15}`,
      section: 'BRASS' as const,
      instrument: idx < 8 ? 'Trumpet' : idx < 16 ? 'Mellophone' : 'Baritone / Contra',
      clearanceRadiusMeters: idx < 16 ? 0.65 : 0.78,
      weightFactor: idx < 16 ? 1.05 : 1.35
    })),
    ...batteryIds.map((id, idx) => ({
      id,
      label: `D${idx + 1}`,
      name: `Battery ${idx + 1}`,
      section: 'BATTERY' as const,
      instrument: idx < 6 ? 'Snare' : idx < 9 ? 'Tenors' : 'Bass Drum',
      clearanceRadiusMeters: 0.72,
      weightFactor: 1.35
    })),
    ...pitIds.map((id, idx) => ({
      id,
      label: `P${idx + 1}`,
      name: `Front Ensemble ${idx + 1}`,
      section: 'PIT' as const,
      instrument: idx < 3 ? 'Marimba' : 'Synth / Drumset',
      clearanceRadiusMeters: 0.75,
      weightFactor: 1.0
    })),
    ...guardIds.map((id, idx) => ({
      id,
      label: `G${idx + 1}`,
      name: `Color Guard ${idx + 1}`,
      section: 'GUARD' as const,
      instrument: 'Flag / Sabre',
      clearanceRadiusMeters: 0.92,
      weightFactor: 1.0
    }))
  ];

  const TILT_DEG = -19;
  const skewCenter: CanonicalPoint = { xMeters: 0, yMeters: 21.5 };
  const skewAll = (pts: CanonicalPoint[]): CanonicalPoint[] =>
    pts.map((p) => rotateAround(p, skewCenter, TILT_DEG));

  const fixedPit = toDotMap(
    pitIds,
    generateCompanyFrontForm(6, 0, -2.2, 16.0)
  );

  // Set 1: Skewed Perspective Wedge (-19 deg axis)
  const s1Pos: Record<string, PerformerDot> = {
    ...toDotMap(
      brassIds,
      skewAll(generateWedgeForm(24, { xMeters: -2.0, yMeters: 15.0 }, 22.0, 10.5))
    ),
    ...toDotMap(
      batteryIds,
      skewAll(generateLineForm(12, { xMeters: -14.0, yMeters: 29.0 }, { xMeters: 4.0, yMeters: 29.0 }))
    ),
    ...fixedPit,
    ...toDotMap(
      guardIds,
      skewAll([
        ...generateLineForm(5, { xMeters: -16.0, yMeters: 14.0 }, { xMeters: -16.0, yMeters: 24.0 }),
        ...generateLineForm(5, { xMeters: 12.0, yMeters: 14.0 }, { xMeters: 12.0, yMeters: 24.0 })
      ])
    )
  };

  // Set 2: Tilted Minimalist Rail
  const s2Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(
      brassIds,
      s1Pos,
      skewAll([
        ...generateLineForm(12, { xMeters: -15.0, yMeters: 17.0 }, { xMeters: 15.0, yMeters: 17.0 }),
        ...generateLineForm(12, { xMeters: -13.0, yMeters: 20.5 }, { xMeters: 13.0, yMeters: 20.5 })
      ])
    ),
    ...assignGroupOptimal(
      batteryIds,
      s1Pos,
      skewAll(generateLineForm(12, { xMeters: -10.0, yMeters: 26.0 }, { xMeters: 10.0, yMeters: 26.0 }))
    ),
    ...fixedPit,
    ...assignGroupOptimal(
      guardIds,
      s1Pos,
      skewAll(generateArcForm(10, -20.0, 20.0, 25.0, 4.5))
    )
  };

  // Set 3: Hymn of Acxiom Breath Arc (92 BPM Ballad)
  const s3Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(
      brassIds,
      s2Pos,
      skewAll(generateArcForm(24, -18.0, 18.0, 20.0, -5.5))
    ),
    ...assignGroupOptimal(
      batteryIds,
      s2Pos,
      skewAll(generateCompanyFrontForm(12, 0, 27.5, 14.0))
    ),
    ...fixedPit,
    ...assignGroupOptimal(
      guardIds,
      s2Pos,
      skewAll(generateCompanyFrontForm(10, 0, 11.5, 28.0))
    )
  };

  // Set 4: Kinetic Rhomboid Acceleration (176 BPM Drive)
  const s4Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(
      brassIds,
      s3Pos,
      skewAll(generateBlockForm(24, { xMeters: 2.0, yMeters: 19.0 }, 4, 2.2))
    ),
    ...assignGroupOptimal(
      batteryIds,
      s3Pos,
      skewAll(generateBlockForm(12, { xMeters: -7.5, yMeters: 24.5 }, 2, 1.8))
    ),
    ...fixedPit,
    ...assignGroupOptimal(
      guardIds,
      s3Pos,
      skewAll([
        ...generateLineForm(5, { xMeters: -14.0, yMeters: 12.0 }, { xMeters: -4.0, yMeters: 12.0 }),
        ...generateLineForm(5, { xMeters: 8.0, yMeters: 24.0 }, { xMeters: 18.0, yMeters: 24.0 })
      ])
    )
  };

  // Set 5: 36m Diagonal Ramp Front (148 BPM)
  const s5Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(
      brassIds,
      s4Pos,
      skewAll(generateCompanyFrontForm(24, 0, 19.0, 36.0))
    ),
    ...assignGroupOptimal(
      batteryIds,
      s4Pos,
      skewAll(generateCompanyFrontForm(12, 0, 24.0, 18.0))
    ),
    ...fixedPit,
    ...assignGroupOptimal(
      guardIds,
      s4Pos,
      skewAll(generateCompanyFrontForm(10, 0, 13.0, 34.0))
    )
  };

  // Set 6: Pitch-Bend Diagonal Hold
  const s6Pos: Record<string, PerformerDot> = {
    ...assignGroupOptimal(
      brassIds,
      s5Pos,
      skewAll(generateCompanyFrontForm(24, 0, 18.2, 36.0))
    ),
    ...assignGroupOptimal(
      batteryIds,
      s5Pos,
      skewAll(generateCompanyFrontForm(12, 0, 23.2, 18.0))
    ),
    ...fixedPit,
    ...assignGroupOptimal(
      guardIds,
      s5Pos,
      skewAll(generateCompanyFrontForm(10, 0, 12.0, 34.0))
    )
  };

  const orderedCenterOut = orderPerformersForRipple(brassIds, s3Pos, 'CENTER_OUT');
  const orderedLeftToRight = orderPerformersForRipple(brassIds, s5Pos, 'LEFT_TO_RIGHT');

  return {
    id: 'lib-bluecoats-2014-tilt',
    title: 'Bluecoats (2014) — Tilt Finale',
    organization: 'Bluecoats Drum & Bugle Corps (Archive Excerpt)',
    fieldStandardId: 'NCAA_DCI',
    ambientTempCelsius: 22,
    performers,
    sets: [
      {
        id: 'bloo-s1',
        name: 'Set 1: Skewed Perspective Wedge',
        rehearsalMark: 'M.1',
        counts: 0,
        tempoBpm: 164,
        notes: 'Every visual axis skewed -19 deg relative to stadium yard lines.',
        positions: s1Pos,
        bodyCues: [
          {
            id: 'bloo-cue-1',
            label: 'Contrapposto Axis Lean',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 16,
            rippleDelayCounts: 0,
            posture: 'CONTRAPPOSTO_LEAN',
            hornCarriage: 'HORNS_BOX',
            upperFacing: 'PRESS_BOX',
            instruction: 'Angle torso cleanly against the -19 deg visual grid to establish skewed illusion.'
          }
        ]
      },
      {
        id: 'bloo-s2',
        name: 'Set 2: Tilted Minimalist Rail',
        rehearsalMark: 'M.9',
        counts: 16,
        tempoBpm: 164,
        notes: 'Parallel diagonal rails slice laterally across the tilted plane.',
        positions: s2Pos,
        bodyCues: [
          {
            id: 'bloo-cue-2',
            label: 'Diagonal Jazz-Run Extension',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 24,
            rippleDelayCounts: 0,
            posture: 'JAZZ_RUN',
            hornCarriage: 'HORNS_CARRY',
            upperFacing: 'TRAVEL',
            instruction: 'Push silently across tilted rails with articulated ankle extension.'
          }
        ]
      },
      {
        id: 'bloo-s3',
        name: 'Set 3: Hymn of Acxiom Arc',
        rehearsalMark: 'Ballad',
        counts: 24,
        tempoBpm: 92,
        notes: '92 BPM ballad breath arc with center-out plie and high-bell bloom.',
        positions: s3Pos,
        bodyCues: [
          {
            id: 'bloo-cue-3',
            label: 'Center-Out Acxiom Plie Ripple',
            targetPerformerIds: orderedCenterOut,
            startCount: 1,
            endCount: 16,
            rippleDelayCounts: 0.45,
            posture: 'HALF_TIME_PLIE',
            hornCarriage: 'HIGH_BELL_EXTENSION',
            upperFacing: 'PRESS_BOX',
            instruction: 'Drop softly into centered plie and bloom upward through electronic chorale.'
          }
        ]
      },
      {
        id: 'bloo-s4',
        name: 'Set 4: Kinetic Rhomboid Drive',
        rehearsalMark: 'Drive',
        counts: 16,
        tempoBpm: 176,
        notes: 'High-velocity 176 BPM acceleration into compact tilted block.',
        positions: s4Pos
      },
      {
        id: 'bloo-s5',
        name: 'Set 5: Diagonal Pitch-Bend Front',
        rehearsalMark: 'Bend-1',
        counts: 16,
        tempoBpm: 148,
        notes: '36m -19 deg diagonal front triggers left-to-right pitch-bend lunge wave.',
        positions: s5Pos,
        bodyCues: [
          {
            id: 'bloo-cue-5',
            label: 'Pitch-Bend Drop Lean Ripple',
            targetPerformerIds: orderedLeftToRight,
            startCount: 1,
            endCount: 12,
            rippleDelayCounts: 0.35,
            posture: 'LUNGE_LEFT',
            hornCarriage: 'HORNS_SNAP_UP',
            upperFacing: 'PRESS_BOX',
            instruction: 'Snap horns up and tilt weight left sequentially with the virtual pitch-bend.'
          }
        ]
      },
      {
        id: 'bloo-s6',
        name: 'Set 6: Upward Tilt Release',
        rehearsalMark: 'Tilt!',
        counts: 12,
        tempoBpm: 148,
        notes: 'Counter-leans right on closing pitch-bend resolution.',
        positions: s6Pos,
        bodyCues: [
          {
            id: 'bloo-cue-6',
            label: 'Closing Counter-Tilt High Bell',
            targetPerformerIds: brassIds,
            startCount: 0,
            endCount: 0,
            rippleDelayCounts: 0,
            posture: 'LUNGE_RIGHT',
            hornCarriage: 'HIGH_BELL_EXTENSION',
            upperFacing: 'PRESS_BOX',
            instruction: 'Counter-shift into right lunge and elevate bell to +35 deg through cutoff.'
          }
        ]
      }
    ],
    pins: [],
    harnessLedger: []
  };
}

// ---------------------------------------------------------------------------
// Public Library Catalog & Importer Integration Helper
// ---------------------------------------------------------------------------

export const REAL_WORLD_SHOW_PRESETS: RealWorldShowPreset[] = [
  {
    id: 'STAR_1991_CROSS',
    shortTitle: 'Cross-to-Cross Finale (1991)',
    ensemble: 'Star of Indiana',
    yearLabel: '1991 · DCI World Champion',
    repertoire: 'Ottorino Respighi — Roman Festivals (arr. Jim Prime Jr.)',
    designerCredit: 'George Zingali',
    metricsLine: '48 performers · 6 sets · 168-192 BPM · NCAA/DCI',
    highlightNote: 'Side 1 Roman Cross -> Zingali pod fracture -> weave -> Side 2 Mirror Cross.',
    provenanceNotes: [
      {
        state: 'stated',
        statement:
          'Star of Indiana 1991 DCI World Championship closer ("Roman Images") designed by George Zingali to Ottorino Respighi music.',
        sourceOrCondition: 'DCI historical repertoire & Boston University finals-week record'
      },
      {
        state: 'concluded',
        statement:
          '48-performer Side-1-cross to mirror Side-2-cross reconstruction capturing pod split and curved 50yd weave; most likely wrong if compared against individual 1991 member dot books.',
        sourceOrCondition: 'Public high-cam geometric structure scaled to studio ensemble'
      },
      {
        state: 'gap',
        statement:
          'Hand-charted 1991 rehearsal drill sheets and exact measure-by-measure beat logs were never publicly released.',
        sourceOrCondition: 'Star of Indiana / DCI archive boundary'
      }
    ],
    buildShow: buildStar1991Show
  },
  {
    id: 'OSU_SCRIPT_OHIO',
    shortTitle: 'Script Ohio (TBDBITL)',
    ensemble: 'Ohio State Marching Band',
    yearLabel: '1936-Present · College Classic',
    repertoire: 'Robert Planquette — Le Regiment de Sambre et Meuse',
    designerCredit: 'Eugene Weigel (1936)',
    metricsLine: '48 brass & battery · 6 sets · 180 BPM · NCAA',
    highlightNote: 'Triple Block O unwinds into legible cursive "Ohio" as SOUSA1 dots & bows.',
    provenanceNotes: [
      {
        state: 'stated',
        statement:
          'Traditional all-brass & percussion Script Ohio marched at 180 BPM to "Le Regiment de Sambre et Meuse" from Triple Block O with a senior sousaphone dotting the "i".',
        sourceOrCondition: 'OSU TBDBITL published historical tradition'
      },
      {
        state: 'concluded',
        statement:
          '48-piece cursive coordinate reconstruction placing uppercase "O" through lowercase "o" upright across front-to-back yard corridors; most likely wrong if treated as full 228-piece OSU row/file coordinates.',
        sourceOrCondition: 'Scaled cursive geometric fit to NCAA 100x53.3 yd field'
      },
      {
        state: 'gap',
        statement:
          'Internal OSU pregame ramp charts and exact member-level file peel numbers are university band property.',
        sourceOrCondition: 'Proprietary OSU Marching Band materials'
      }
    ],
    buildShow: buildOsuScriptOhioShow
  },
  {
    id: 'BLUECOATS_2014_TILT',
    shortTitle: 'Tilt Finale (2014)',
    ensemble: 'Bluecoats Drum & Bugle Corps',
    yearLabel: '2014 · DCI Silver Medalist',
    repertoire: 'Braxton / Akiho / Vienna Teng ("Hymn of Acxiom")',
    designerCredit: 'Mitch Rogers & Design Team',
    metricsLine: '52 performers · 6 sets · 92-176 BPM · -19 deg Axis',
    highlightNote: 'Off-axis -19 deg grid, 92 BPM Acxiom plie bloom, & pitch-bend lunge wave.',
    provenanceNotes: [
      {
        state: 'stated',
        statement:
          'Bluecoats 2014 production ("Tilt") staged skewed off-axis visual alignments, "Hymn of Acxiom" ballad contrast, and an electronic pitch-bend finale.',
        sourceOrCondition: 'Bluecoats / DCI 2014 program notes'
      },
      {
        state: 'concluded',
        statement:
          '52-piece -19 degree off-axis geometric excerpt combining variable ballad/drive tempos (92 -> 176 -> 148 BPM) and center-out / left-to-right lean ripples; most likely wrong if modeling elevated wedge prop platforms.',
        sourceOrCondition: 'Tilted coordinate projection onto canonical turf plane'
      },
      {
        state: 'gap',
        statement:
          'Full 150-member Pyware .3dj drill files for the 2014 Bluecoats remain proprietary to the corps design staff.',
        sourceOrCondition: 'Closed corps choreography files'
      }
    ],
    buildShow: buildBluecoats2014Show
  }
];

export function getLibraryPreset(id: LibraryShowId): RealWorldShowPreset {
  const found = REAL_WORLD_SHOW_PRESETS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Unknown library show preset: ${id}`);
  }
  return found;
}

export function buildLibraryPresetImport(id: LibraryShowId): {
  preset: RealWorldShowPreset;
  receipt: ImportDiagnosticReceipt;
  csvPreview: string;
} {
  const preset = getLibraryPreset(id);
  const importedShow = preset.buildShow();
  const csvPreview = formatShowAsPywareCoordinateCsv(importedShow);

  const receipt: ImportDiagnosticReceipt = {
    status: 'FULL_SHOW_IMPORTED',
    sourceFilename: `${id.toLowerCase()}.csv`,
    detectedFormat: `Stored Library Excerpt (${preset.ensemble} — ${preset.shortTitle})`,
    provenanceNotes: preset.provenanceNotes,
    archiveEntries: [],
    importedShow,
    userGuidance: [
      `Designer: ${preset.designerCredit} | Music: ${preset.repertoire}.`,
      'Click Apply Show & Synth Audio to load onto the stage with synchronized variable-tempo playback.'
    ]
  };

  return { preset, receipt, csvPreview };
}
