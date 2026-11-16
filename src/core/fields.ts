import { FieldSpec, FieldStandardId } from './types.ts';

export const YARD_TO_METERS = 0.9144;
export const FOOT_TO_METERS = 0.3048;
export const INCH_TO_METERS = 0.0254;
export const STEP_8_TO_5_METERS = 22.5 * INCH_TO_METERS; // 0.5715 m exact (5 yards / 8)
export const STEP_JMBA_METERS = 5.0 / 8.0; // 0.625 m exact (5 meters / 8)

const FOOTBALL_WIDTH_METERS = 100 * YARD_TO_METERS; // 91.44 m
const FOOTBALL_ENDZONE_METERS = 10 * YARD_TO_METERS; // 9.144 m
const FOOTBALL_DEPTH_METERS = 160 * FOOT_TO_METERS; // 48.768 m
const FIVE_YARD_METERS = 5 * YARD_TO_METERS; // 4.572 m

export const FIELD_SPECS: Record<FieldStandardId, FieldSpec> = {
  NCAA_DCI: {
    id: 'NCAA_DCI',
    name: 'NCAA / DCI / BOA Stadium',
    shortName: 'NCAA / DCI',
    region: 'North America (College & Drum Corps)',
    gridType: 'YARD_LINES',
    widthMeters: FOOTBALL_WIDTH_METERS,
    endzoneDepthMeters: FOOTBALL_ENDZONE_METERS,
    depthMeters: FOOTBALL_DEPTH_METERS,
    pitDepthMeters: 4.5,
    majorLineSpacingMeters: FIVE_YARD_METERS,
    stepSizeMeters: STEP_8_TO_5_METERS,
    stepLabel: '8-to-5 (22.5 in / 0.5715 m)',
    frontHashYMeters: 60 * FOOT_TO_METERS, // 18.288 m
    backHashYMeters: 100 * FOOT_TO_METERS, // 30.48 m
    referenceLines: [
      { id: 'FRONT_SIDELINE', label: 'Front Sideline', shortLabel: 'FSL', yMeters: 0 },
      {
        id: 'FRONT_HASH',
        label: 'Front Hash (NCAA 60 ft)',
        shortLabel: 'FH',
        yMeters: 60 * FOOT_TO_METERS
      },
      {
        id: 'BACK_HASH',
        label: 'Back Hash (NCAA 100 ft)',
        shortLabel: 'BH',
        yMeters: 100 * FOOT_TO_METERS
      },
      {
        id: 'BACK_SIDELINE',
        label: 'Back Sideline',
        shortLabel: 'BSL',
        yMeters: FOOTBALL_DEPTH_METERS
      }
    ],
    provenance: [
      {
        state: 'stated',
        statement: '100-yard playing length (91.44 m), 160 ft width (48.768 m), hashes at 60 ft (18.288 m) and 100 ft (30.48 m).',
        sourceOrCondition: 'NCAA Football Field Spec / DCI & BOA Competition Standard'
      },
      {
        state: 'concluded',
        statement: 'Front Sideline to Front Hash is exact 32.0 steps (8-to-5), while Back Hash to Front Hash spans 40 ft (21.333 exact steps; traditional sheets round the seam).',
        sourceOrCondition: 'Derived from 18.288 / 0.5715 = 32.0; most likely wrong only on non-standard painted fields.'
      }
    ]
  },
  NFHS_HS: {
    id: 'NFHS_HS',
    name: 'NFHS High School Field',
    shortName: 'NFHS High School',
    region: 'North America (High School)',
    gridType: 'YARD_LINES',
    widthMeters: FOOTBALL_WIDTH_METERS,
    endzoneDepthMeters: FOOTBALL_ENDZONE_METERS,
    depthMeters: FOOTBALL_DEPTH_METERS,
    pitDepthMeters: 4.5,
    majorLineSpacingMeters: FIVE_YARD_METERS,
    stepSizeMeters: STEP_8_TO_5_METERS,
    stepLabel: '8-to-5 (22.5 in / 0.5715 m)',
    frontHashYMeters: (53 + 4 / 12) * FOOT_TO_METERS, // 16.256 m
    backHashYMeters: (106 + 8 / 12) * FOOT_TO_METERS, // 32.512 m
    referenceLines: [
      { id: 'FRONT_SIDELINE', label: 'Front Sideline', shortLabel: 'FSL', yMeters: 0 },
      {
        id: 'FRONT_HASH',
        label: 'Front Hash (NFHS 53 ft 4 in)',
        shortLabel: 'FH',
        yMeters: (53 + 4 / 12) * FOOT_TO_METERS
      },
      {
        id: 'BACK_HASH',
        label: 'Back Hash (NFHS 106 ft 8 in)',
        shortLabel: 'BH',
        yMeters: (106 + 8 / 12) * FOOT_TO_METERS
      },
      {
        id: 'BACK_SIDELINE',
        label: 'Back Sideline',
        shortLabel: 'BSL',
        yMeters: FOOTBALL_DEPTH_METERS
      }
    ],
    provenance: [
      {
        state: 'stated',
        statement: 'NFHS hashes divide the 160 ft field into exact thirds at 53 ft 4 in (16.256 m) and 106 ft 8 in (32.512 m).',
        sourceOrCondition: 'NFHS Football Field Rulebook'
      },
      {
        state: 'concluded',
        statement: 'Hashes sit 2.032 m (3.556 8-to-5 steps, rounded to 3.5 steps) closer to sidelines than NCAA hashes.',
        sourceOrCondition: 'Direct subtraction (60 ft - 53 ft 4 in = 6 ft 8 in = 2.032 m).'
      }
    ]
  },
  NFL_PRO: {
    id: 'NFL_PRO',
    name: 'NFL Pro Stadium',
    shortName: 'NFL Stadium',
    region: 'North America (Pro Stadiums)',
    gridType: 'YARD_LINES',
    widthMeters: FOOTBALL_WIDTH_METERS,
    endzoneDepthMeters: FOOTBALL_ENDZONE_METERS,
    depthMeters: FOOTBALL_DEPTH_METERS,
    pitDepthMeters: 4.5,
    majorLineSpacingMeters: FIVE_YARD_METERS,
    stepSizeMeters: STEP_8_TO_5_METERS,
    stepLabel: '8-to-5 (22.5 in / 0.5715 m)',
    frontHashYMeters: (70 + 9 / 12) * FOOT_TO_METERS, // 21.5646 m
    backHashYMeters: (89 + 3 / 12) * FOOT_TO_METERS, // 27.2034 m
    referenceLines: [
      { id: 'FRONT_SIDELINE', label: 'Front Sideline', shortLabel: 'FSL', yMeters: 0 },
      {
        id: 'FRONT_HASH',
        label: 'Front Hash (NFL 70 ft 9 in)',
        shortLabel: 'FH',
        yMeters: (70 + 9 / 12) * FOOT_TO_METERS
      },
      {
        id: 'BACK_HASH',
        label: 'Back Hash (NFL 89 ft 3 in)',
        shortLabel: 'BH',
        yMeters: (89 + 3 / 12) * FOOT_TO_METERS
      },
      {
        id: 'BACK_SIDELINE',
        label: 'Back Sideline',
        shortLabel: 'BSL',
        yMeters: FOOTBALL_DEPTH_METERS
      }
    ],
    provenance: [
      {
        state: 'stated',
        statement: 'NFL hash marks sit 70 ft 9 in (21.5646 m) from sidelines with 18 ft 6 in (5.6388 m) between hashes.',
        sourceOrCondition: 'NFL Official Field Diagram'
      }
    ]
  },
  DCUK_DCE: {
    id: 'DCUK_DCE',
    name: 'DCUK / DCE International Metric',
    shortName: 'DCUK / Europe',
    region: 'United Kingdom & Europe',
    gridType: 'YARD_LINES',
    widthMeters: 91.44,
    endzoneDepthMeters: 9.144,
    depthMeters: 48.8,
    pitDepthMeters: 4.5,
    majorLineSpacingMeters: FIVE_YARD_METERS,
    stepSizeMeters: STEP_8_TO_5_METERS,
    stepLabel: '8-to-5 (22.5 in / 0.5715 m)',
    frontHashYMeters: 18.3,
    backHashYMeters: 30.5,
    referenceLines: [
      { id: 'FRONT_SIDELINE', label: 'Front Sideline', shortLabel: 'FSL', yMeters: 0 },
      { id: 'FRONT_HASH', label: 'Front Hash (18.3 m)', shortLabel: 'FH', yMeters: 18.3 },
      { id: 'BACK_HASH', label: 'Back Hash (30.5 m)', shortLabel: 'BH', yMeters: 30.5 },
      { id: 'BACK_SIDELINE', label: 'Back Sideline (48.8 m)', shortLabel: 'BSL', yMeters: 48.8 }
    ],
    provenance: [
      {
        state: 'stated',
        statement: 'DCUK/DCE specifies 91.44 m length, 48.8 m depth, hashes at 18.3 m and 30.5 m, and a 4.5 m front staging pit.',
        sourceOrCondition: 'Drum Corps United Kingdom / Drum Corps Europe Rulebook'
      }
    ]
  },
  JMBA_30M: {
    id: 'JMBA_30M',
    name: 'JMBA Japan 30m x 30m Arena Floor',
    shortName: 'JMBA 30m x 30m',
    region: 'Japan (Indoor Arena Circuit)',
    gridType: 'METRIC_5M',
    widthMeters: 30.0,
    endzoneDepthMeters: 0,
    depthMeters: 30.0,
    pitDepthMeters: 3.5,
    majorLineSpacingMeters: 5.0,
    stepSizeMeters: STEP_JMBA_METERS,
    stepLabel: '8-per-5m (62.5 cm)',
    frontHashYMeters: 10.0,
    backHashYMeters: 20.0,
    referenceLines: [
      { id: 'FRONT_BOUNDARY', label: 'Front Boundary (0m)', shortLabel: '0m', yMeters: 0 },
      { id: 'LINE_5M', label: '5m Point Line', shortLabel: '5m', yMeters: 5.0 },
      { id: 'LINE_10M', label: '10m Point Line', shortLabel: '10m', yMeters: 10.0 },
      { id: 'CENTER_15M', label: 'Center Point (15m)', shortLabel: '15m Ctr', yMeters: 15.0 },
      { id: 'LINE_20M', label: '20m Point Line', shortLabel: '20m', yMeters: 20.0 },
      { id: 'LINE_25M', label: '25m Point Line', shortLabel: '25m', yMeters: 25.0 },
      { id: 'BACK_BOUNDARY', label: 'Back Boundary (30m)', shortLabel: '30m', yMeters: 30.0 }
    ],
    provenance: [
      {
        state: 'stated',
        statement: 'JMBA indoor competition uses a 30m x 30m floor divided into 5m point intersections with 8 steps per 5 meters (62.5 cm step).',
        sourceOrCondition: 'Japan Marching Band Association (JMBA) Arena Floor Specification'
      },
      {
        state: 'gap',
        statement: 'Venue-specific entry/exit perimeter buffers beyond 30m x 30m vary by arena and are modeled as a 3.5m front staging apron.',
        sourceOrCondition: 'Arena floor tape conventions vary outside the primary 30m x 30m competition square.'
      }
    ]
  }
};

export const FIELD_STANDARD_LIST: FieldSpec[] = [
  FIELD_SPECS.NCAA_DCI,
  FIELD_SPECS.NFHS_HS,
  FIELD_SPECS.NFL_PRO,
  FIELD_SPECS.DCUK_DCE,
  FIELD_SPECS.JMBA_30M
];

export function getFieldSpec(id: FieldStandardId): FieldSpec {
  return FIELD_SPECS[id];
}
