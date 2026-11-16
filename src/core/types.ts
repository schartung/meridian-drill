export type EpistemicTag = 'stated' | 'concluded' | 'gap';

export interface ProvenanceNote {
  state: EpistemicTag;
  statement: string;
  sourceOrCondition: string;
}

export type FieldStandardId =
  | 'NCAA_DCI'
  | 'NFHS_HS'
  | 'NFL_PRO'
  | 'DCUK_DCE'
  | 'JMBA_30M';

export type GridType = 'YARD_LINES' | 'METRIC_5M';

export interface ReferenceLineSpec {
  id: string;
  label: string;
  shortLabel: string;
  yMeters: number;
}

export interface FieldSpec {
  id: FieldStandardId;
  name: string;
  shortName: string;
  region: string;
  gridType: GridType;
  widthMeters: number;
  endzoneDepthMeters: number;
  depthMeters: number;
  pitDepthMeters: number;
  majorLineSpacingMeters: number;
  stepSizeMeters: number;
  stepLabel: string;
  frontHashYMeters: number | null;
  backHashYMeters: number | null;
  referenceLines: ReferenceLineSpec[];
  provenance: ProvenanceNote[];
}

export interface CanonicalPoint {
  xMeters: number;
  yMeters: number;
}

export type HorizontalSide = 'SIDE_1' | 'SIDE_2' | 'ON_CENTER';
export type HorizontalRelation = 'ON' | 'INSIDE' | 'OUTSIDE';
export type VerticalRelation = 'ON' | 'IN_FRONT' | 'BEHIND';

export interface CoordinateReadout {
  fieldId: FieldStandardId;
  side: HorizontalSide;
  lineIndex: number;
  lineValue: number;
  lineLabel: string;
  horizRelation: HorizontalRelation;
  horizSteps: number;
  horizExactMetersOffset: number;
  vertReferenceId: string;
  vertReferenceLabel: string;
  vertReferenceShortLabel: string;
  vertRelation: VerticalRelation;
  vertSteps: number;
  vertReferenceYMeters: number;
  vertExactMetersOffset: number;
}

export interface HashTranslationDelta {
  primaryHorizontal: string;
  primaryVertical: string;
  venueHorizontal: string;
  venueVertical: string;
  verticalStepShift: number;
  verticalMetersShift: number;
  warningMessage: string | null;
}

export type SectionId = 'BRASS' | 'BATTERY' | 'PIT' | 'GUARD';

export interface Performer {
  id: string;
  label: string;
  name: string;
  section: SectionId;
  instrument: string;
  clearanceRadiusMeters: number;
  weightFactor: number;
}

export interface PerformerDot {
  xMeters: number;
  yMeters: number;
  curveOffsetMeters?: number;
  focusTarget?: 'PRESS_BOX' | 'PODIUM' | 'BACKFIELD' | 'CENTER';
}

export interface DrillSet {
  id: string;
  name: string;
  rehearsalMark: string;
  counts: number;
  tempoBpm: number;
  notes: string;
  positions: Record<string, PerformerDot>;
}

export type CollaboratorRole = 'DESIGNER' | 'TECH' | 'PERFORMER';
export type PinCategory =
  | 'COLLISION'
  | 'STRIDE'
  | 'SIGHTLINE'
  | 'ACOUSTIC_PHASING'
  | 'HASH_SHIFT';
export type PinStatus = 'OPEN' | 'TRIAGED' | 'RESOLVED';

export interface FieldPin {
  id: string;
  setId: string;
  countOffset: number;
  performerId?: string;
  xMeters: number;
  yMeters: number;
  authorName: string;
  authorRole: CollaboratorRole;
  category: PinCategory;
  status: PinStatus;
  message: string;
  createdAtIso: string;
  resolvedByReceiptId?: string;
  telemetrySnapshot: {
    stepSizeLabel: string;
    speedMps: number;
    acousticDelayMs: number;
  };
}

export type FormShape =
  | 'ARC'
  | 'LINE'
  | 'COMPANY_FRONT'
  | 'WEDGE'
  | 'BLOCK'
  | 'SPIRAL';

export type DrillLensSpec =
  | {
      kind: 'OPTIMIZE_ASSIGNMENT';
      fromSetIndex: number;
      lockSections: boolean;
      stridePower?: number;
    }
  | {
      kind: 'DEFLECT_COLLISIONS';
      fromSetIndex: number;
      minClearanceMeters: number;
    }
  | {
      kind: 'STAGE_FORM';
      setIndex: number;
      performerIds: string[];
      shape: FormShape;
      centerXMeters: number;
      baseYMeters: number;
      spanMeters: number;
      depthMeters: number;
      assignOptimallyFromPrev: boolean;
    }
  | {
      kind: 'COMPACT_ACOUSTIC';
      setIndex: number;
      maxDelayMs: number;
      targetSections: SectionId[];
    };

export interface TransitionSummaryMetrics {
  collisionCount: number;
  nearMissCount: number;
  crossingCount: number;
  maxStepsPerFive: number;
  meanStepsPerFive: number;
  maxAcousticDelayMs: number;
  cleanlinessScore: number;
}

export interface HarnessRunReceipt {
  id: string;
  timestampIso: string;
  lensSummary: string;
  lensType: DrillLensSpec['kind'];
  setId: string;
  targetSetId?: string;
  affectedPerformerIds: string[];
  beforeMetrics: TransitionSummaryMetrics;
  afterMetrics: TransitionSummaryMetrics;
  materializedInputDigest: string;
  previousSetsSnapshot: DrillSet[];
}

export interface DrillShow {
  id: string;
  title: string;
  organization: string;
  fieldStandardId: FieldStandardId;
  comparisonFieldId?: FieldStandardId;
  ambientTempCelsius: number;
  performers: Performer[];
  sets: DrillSet[];
  pins: FieldPin[];
  harnessLedger: HarnessRunReceipt[];
}

export interface InterpolatedPerformerState {
  performerId: string;
  xMeters: number;
  yMeters: number;
  headingRad: number;
  speedMps: number;
  stepsPerFive: number;
  stepLengthMeters: number;
  isMoving: boolean;
}

export interface CollisionIssue {
  id: string;
  severity: 'CRITICAL' | 'NEAR_MISS';
  fromSetIndex: number;
  toSetIndex: number;
  countOffset: number;
  performerAId: string;
  performerBId: string;
  minDistanceMeters: number;
  requiredClearanceMeters: number;
  midpoint: CanonicalPoint;
}

export interface StrideAlert {
  id: string;
  severity: 'WARNING' | 'CRITICAL';
  fromSetIndex: number;
  toSetIndex: number;
  performerId: string;
  arcLengthMeters: number;
  counts: number;
  stepsPerFive: number;
  stepLengthMeters: number;
  speedMps: number;
}

export interface WhiplashAlert {
  id: string;
  fromSetIndex: number;
  setIndex: number;
  toSetIndex: number;
  performerId: string;
  turnAngleDeg: number;
  incomingSpeedMps: number;
  outgoingSpeedMps: number;
  momentumScore: number;
}

export interface AcousticReport {
  speedOfSoundMps: number;
  ambientTempCelsius: number;
  frontReferenceYMeters: number;
  focalListenerPoint: CanonicalPoint;
  maxEnsembleDelayMs: number;
  pitToBackSpreadMs: number;
  tearRisk: 'LOW' | 'MODERATE' | 'HIGH';
  worstPerformerId: string | null;
}

export interface ShowIntelligenceReport {
  cleanlinessScore: number;
  collisions: CollisionIssue[];
  strideAlerts: StrideAlert[];
  whiplashAlerts: WhiplashAlert[];
  acoustic: AcousticReport;
  crossingCountsByTransition: number[];
}

export type CameraPresetId =
  | 'TOP_2D'
  | 'HIGH_CAM_JUDGE'
  | 'BOX_SCAFFOLD'
  | 'PERFORMER_POV';
