import React from 'react';
import {
  BodyPostureId,
  HornCarriageId,
  InterpolatedPerformerState,
  Performer
} from '../core/types.ts';

interface MannequinPoseCardProps {
  performer: Performer;
  state: InterpolatedPerformerState;
  setName: string;
  countOffset: number;
  maxCounts: number;
}

interface JointPose2D {
  head: [number, number];
  shoulder: [number, number];
  hip: [number, number];
  footL: [number, number];
  kneeL: [number, number];
  footR: [number, number];
  kneeR: [number, number];
}

function getFrontPose(
  posture: BodyPostureId,
  isMoving: boolean,
  countOffset: number
): JointPose2D {
  const walkSwing = isMoving ? Math.sin(countOffset * Math.PI) * 3.5 : 0;

  switch (posture) {
    case 'KNEEL_RIGHT':
      return {
        head: [58, 56],
        shoulder: [58, 69],
        hip: [58, 92],
        kneeL: [46, 94],
        footL: [46, 118],
        kneeR: [68, 117],
        footR: [76, 118]
      };
    case 'BOW_DROP':
      return {
        head: [60, 50],
        shoulder: [60, 62],
        hip: [60, 84],
        kneeL: [53, 100],
        footL: [52, 118],
        kneeR: [67, 100],
        footR: [68, 118]
      };
    case 'LUNGE_LEFT':
      return {
        head: [46, 34],
        shoulder: [48, 46],
        hip: [53, 74],
        kneeL: [37, 94],
        footL: [34, 118],
        kneeR: [71, 96],
        footR: [86, 118]
      };
    case 'LUNGE_RIGHT':
      return {
        head: [74, 34],
        shoulder: [72, 46],
        hip: [67, 74],
        kneeL: [49, 96],
        footL: [34, 118],
        kneeR: [83, 94],
        footR: [86, 118]
      };
    case 'HALF_TIME_PLIE':
      return {
        head: [60, 32],
        shoulder: [60, 44],
        hip: [60, 74],
        kneeL: [43, 95],
        footL: [40, 118],
        kneeR: [77, 95],
        footR: [80, 118]
      };
    case 'CONTRAPPOSTO_LEAN':
      return {
        head: [66, 26],
        shoulder: [64, 39],
        hip: [57, 68],
        kneeL: [53, 93],
        footL: [51, 118],
        kneeR: [68, 93],
        footR: [73, 117]
      };
    case 'JAZZ_RUN':
      return {
        head: [60, 27],
        shoulder: [60, 40],
        hip: [60, 69],
        kneeL: [54, 92 - walkSwing * 0.6],
        footL: [53, 117 - Math.max(0, walkSwing)],
        kneeR: [66, 92 + walkSwing * 0.6],
        footR: [67, 117 - Math.max(0, -walkSwing)]
      };
    case 'UPRIGHT_GLIDE':
    default:
      return {
        head: [60, 24],
        shoulder: [60, 37],
        hip: [60, 67],
        kneeL: [55, 93],
        footL: [55, 118 - Math.max(0, walkSwing) * 0.5],
        kneeR: [65, 93],
        footR: [65, 118 - Math.max(0, -walkSwing) * 0.5]
      };
  }
}

function getSidePose(
  posture: BodyPostureId,
  isMoving: boolean,
  countOffset: number
): JointPose2D {
  const phase = isMoving ? Math.sin(countOffset * Math.PI) : 0;

  switch (posture) {
    case 'KNEEL_RIGHT':
      return {
        head: [62, 56],
        shoulder: [61, 69],
        hip: [58, 92],
        kneeL: [40, 92],
        footL: [38, 118],
        kneeR: [66, 117],
        footR: [82, 118]
      };
    case 'BOW_DROP':
      return {
        head: [36, 52],
        shoulder: [44, 62],
        hip: [64, 80],
        kneeL: [56, 99],
        footL: [54, 118],
        kneeR: [66, 99],
        footR: [66, 118]
      };
    case 'JAZZ_RUN':
      return {
        head: [50, 27],
        shoulder: [54, 40],
        hip: [61, 68],
        kneeL: [52 - phase * 7, 92],
        footL: [44 - phase * 12, 117],
        kneeR: [68 + phase * 7, 92],
        footR: [76 + phase * 12, 117]
      };
    case 'LUNGE_LEFT':
    case 'LUNGE_RIGHT':
      return {
        head: [53, 34],
        shoulder: [56, 46],
        hip: [60, 74],
        kneeL: [48, 94],
        footL: [46, 118],
        kneeR: [72, 95],
        footR: [78, 118]
      };
    case 'HALF_TIME_PLIE':
      return {
        head: [58, 32],
        shoulder: [58, 44],
        hip: [60, 74],
        kneeL: [50, 96],
        footL: [56, 118],
        kneeR: [54, 96],
        footR: [62, 118]
      };
    case 'CONTRAPPOSTO_LEAN':
      return {
        head: [56, 26],
        shoulder: [58, 39],
        hip: [61, 68],
        kneeL: [56, 93],
        footL: [57, 118],
        kneeR: [64, 93],
        footR: [68, 117]
      };
    case 'UPRIGHT_GLIDE':
    default:
      return {
        head: [59, 24],
        shoulder: [60, 37],
        hip: [60, 67],
        kneeL: [58 - phase * 6, 93],
        footL: [56 - phase * 9, 118],
        kneeR: [62 + phase * 6, 93],
        footR: [64 + phase * 9, 118]
      };
  }
}

function getHornSegmentSide(
  shoulder: [number, number],
  carriage: HornCarriageId,
  section: Performer['section']
): { hand: [number, number]; tip: [number, number]; angleDeg: number } {
  const angleMap: Record<HornCarriageId, number> = {
    HORNS_DOWN: -52,
    HORNS_CARRY: -12,
    HORNS_BOX: 10,
    HORNS_SNAP_UP: 14,
    HIGH_BELL_EXTENSION: 35
  };
  const angleDeg = angleMap[carriage];
  const rad = (angleDeg * Math.PI) / 180;

  if (section === 'GUARD') {
    const hand: [number, number] =
      carriage === 'HIGH_BELL_EXTENSION'
        ? [shoulder[0] - 8, shoulder[1] - 18]
        : [shoulder[0] - 13, shoulder[1] + 2];
    const poleLen = carriage === 'HORNS_DOWN' ? 24 : 34;
    const tipAngle = carriage === 'HORNS_DOWN' ? -1.1 : rad + 0.55;
    return {
      hand,
      tip: [
        hand[0] - Math.cos(tipAngle) * poleLen,
        hand[1] - Math.sin(tipAngle) * poleLen
      ],
      angleDeg
    };
  }

  if (section === 'BATTERY' || section === 'PIT') {
    const hand: [number, number] = [shoulder[0] - 14, shoulder[1] + 15];
    const lift = carriage === 'HIGH_BELL_EXTENSION' ? -18 : carriage === 'HORNS_SNAP_UP' ? -10 : 0;
    return {
      hand,
      tip: [hand[0] - 14, hand[1] + lift],
      angleDeg
    };
  }

  // Brass horn facing left on Side Profile SVG (audience side is left)
  const hand: [number, number] =
    carriage === 'HORNS_DOWN'
      ? [shoulder[0] - 4, shoulder[1] + 16]
      : [shoulder[0] - 12, shoulder[1] - 4];
  const len = 24;
  return {
    hand,
    tip: [hand[0] - Math.cos(rad) * len, hand[1] - Math.sin(rad) * len],
    angleDeg
  };
}

export const MannequinPoseCard: React.FC<MannequinPoseCardProps> = ({
  performer,
  state,
  setName,
  countOffset,
  maxCounts
}) => {
  const bs = state.bodyState;
  const front = getFrontPose(bs.posture, state.isMoving, countOffset);
  const side = getSidePose(bs.posture, state.isMoving, countOffset);
  const hornSide = getHornSegmentSide(side.shoulder, bs.hornCarriage, performer.section);

  const accentColor =
    performer.section === 'BRASS'
      ? '#f59e0b'
      : performer.section === 'BATTERY'
        ? '#22d3ee'
        : performer.section === 'GUARD'
          ? '#fb7185'
          : '#a78bfa';

  const hornGlow =
    bs.hornCarriage === 'HORNS_BOX' ||
    bs.hornCarriage === 'HORNS_SNAP_UP' ||
    bs.hornCarriage === 'HIGH_BELL_EXTENSION';

  return (
    <div className="card">
      <div className="card-title">
        <span>
          Movement Coach: {performer.label} ({performer.instrument})
        </span>
        <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
          {bs.postureShortCode}
        </span>
      </div>

      <div className="mannequin-stage">
        {/* Front View SVG */}
        <div className="mannequin-pane">
          <div className="mannequin-pane-label">Audience Front</div>
          <svg viewBox="0 0 120 132" className="mannequin-svg" aria-label="Audience Front Pose">
            <line x1="8" y1="118" x2="112" y2="118" stroke="#2d4366" strokeWidth="1.5" />
            {bs.isPulseActive && (
              <circle
                cx={front.hip[0]}
                cy={front.hip[1]}
                r={18 + bs.pulseProgress * 12}
                fill="none"
                stroke="#fef08a"
                strokeOpacity={0.7 - bs.pulseProgress * 0.5}
                strokeWidth="1.5"
              />
            )}
            {/* Legs */}
            <polyline
              points={`${front.hip[0]},${front.hip[1]} ${front.kneeL[0]},${front.kneeL[1]} ${front.footL[0]},${front.footL[1]}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={`${front.hip[0]},${front.hip[1]} ${front.kneeR[0]},${front.kneeR[1]} ${front.footR[0]},${front.footR[1]}`}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Torso */}
            <line
              x1={front.hip[0]}
              y1={front.hip[1]}
              x2={front.shoulder[0]}
              y2={front.shoulder[1]}
              stroke="#f1f5f9"
              strokeWidth="4.6"
              strokeLinecap="round"
            />
            {/* Shoulders */}
            <line
              x1={front.shoulder[0] - 11}
              y1={front.shoulder[1] + 2}
              x2={front.shoulder[0] + 11}
              y2={front.shoulder[1] + 2}
              stroke={accentColor}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Head */}
            <circle cx={front.head[0]} cy={front.head[1]} r="6.5" fill={accentColor} />
            {/* Horn / Equipment front cue */}
            {hornGlow && (
              <circle
                cx={front.shoulder[0]}
                cy={front.shoulder[1] - 4}
                r="4"
                fill="#fef08a"
                fillOpacity="0.85"
              />
            )}
          </svg>
        </div>

        {/* Side Profile View SVG */}
        <div className="mannequin-pane">
          <div className="mannequin-pane-label">Side Profile (Box &larr;)</div>
          <svg viewBox="0 0 120 132" className="mannequin-svg" aria-label="Side Profile Pose">
            <line x1="8" y1="118" x2="112" y2="118" stroke="#2d4366" strokeWidth="1.5" />
            <text x="12" y="113" fill="#64748b" fontSize="8" fontFamily="monospace">
              BOX
            </text>
            {/* Legs */}
            <polyline
              points={`${side.hip[0]},${side.hip[1]} ${side.kneeL[0]},${side.kneeL[1]} ${side.footL[0]},${side.footL[1]}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={`${side.hip[0]},${side.hip[1]} ${side.kneeR[0]},${side.kneeR[1]} ${side.footR[0]},${side.footR[1]}`}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Torso */}
            <line
              x1={side.hip[0]}
              y1={side.hip[1]}
              x2={side.shoulder[0]}
              y2={side.shoulder[1]}
              stroke="#f1f5f9"
              strokeWidth="4.6"
              strokeLinecap="round"
            />
            {/* Arms to instrument */}
            <line
              x1={side.shoulder[0]}
              y1={side.shoulder[1] + 2}
              x2={hornSide.hand[0]}
              y2={hornSide.hand[1]}
              stroke="#cbd5e1"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {/* Instrument / Equipment Angle */}
            <line
              x1={hornSide.hand[0]}
              y1={hornSide.hand[1]}
              x2={hornSide.tip[0]}
              y2={hornSide.tip[1]}
              stroke={hornGlow ? '#fef08a' : '#94a3b8'}
              strokeWidth={performer.section === 'GUARD' ? '2.4' : '3.6'}
              strokeLinecap="round"
            />
            {performer.section === 'BRASS' && hornGlow && (
              <circle cx={hornSide.tip[0]} cy={hornSide.tip[1]} r="2.6" fill="#fef08a" />
            )}
            {/* Head */}
            <circle cx={side.head[0]} cy={side.head[1]} r="6.5" fill={accentColor} />
          </svg>
        </div>
      </div>

      <div className="pose-coach-notes">
        <div className="issue-header">
          <span>{bs.cueLabel}</span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
            {setName.split(':')[0]} · ct {countOffset.toFixed(1)}
            {maxCounts > 0 ? `/${maxCounts}` : ''}
          </span>
        </div>
        {bs.triggerCount > 0 && (
          <div className="mono" style={{ fontSize: 10.5, color: '#fef08a' }}>
            Personal ripple cue triggers at count {bs.triggerCount.toFixed(1)}
          </div>
        )}
        <div className="issue-body">
          <strong>Feet &amp; Body:</strong> {bs.lowerBodyCoaching}
        </div>
        <div className="issue-body">
          <strong>Upper &amp; Projection:</strong> {bs.upperBodyCoaching}
        </div>
        {bs.videoRefUrl && (
          <div className="issue-actions">
            <a
              href={bs.videoRefUrl}
              target="_blank"
              rel="noreferrer"
              className="mini-btn accent"
              style={{ textDecoration: 'none' }}
            >
              Open Reference Video
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
