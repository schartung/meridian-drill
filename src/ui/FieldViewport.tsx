import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildCameraState, projectWorldToScreen } from '../core/camera3d.ts';
import {
  computeHashTranslationDelta,
  formatCoordinateSheetText,
  formatSteps,
  snapMetersToHalfStep,
  toCoordinateReadout
} from '../core/coordinates.ts';
import { getFieldSpec } from '../core/fields.ts';
import { clampPointToFieldEnvelope } from '../core/forms.ts';
import {
  computeAcousticDelayMs,
  speedOfSoundMps
} from '../core/intelligence.ts';
import {
  computeSegmentControlPointForMidpoint,
  evaluateSegmentPoint,
  getTransitionWindow,
  interpolateShowAtPosition
} from '../core/interpolation.ts';
import {
  CameraPresetId,
  CanonicalPoint,
  CollaboratorRole,
  DrillShow,
  PerformerDot,
  SectionId,
  ShowIntelligenceReport
} from '../core/types.ts';

export type ViewportToolMode = 'SELECT' | 'MOVE' | 'CURVE' | 'PIN';

export interface ViewportOverlays {
  paths: boolean;
  acousticRings: boolean;
  collisions: boolean;
  bodyVisuals: boolean;
  labels: boolean;
  snapHalfStep: boolean;
}

interface FieldViewportProps {
  show: DrillShow;
  activeSetIndex: number;
  countOffset: number;
  cameraPreset: CameraPresetId;
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  toolMode: ViewportToolMode;
  sectionFilter: SectionId | 'ALL';
  overlays: ViewportOverlays;
  collaboratorRole: CollaboratorRole;
  intelligence: ShowIntelligenceReport;
  onUpdateSetPositions: (
    setIndex: number,
    nextPositions: Record<string, PerformerDot>
  ) => void;
  onDropPin: (
    xMeters: number,
    yMeters: number,
    nearPerformerId?: string
  ) => void;
  highlightedPinId: string | null;
  povPerformerId: string;
  onCyclePovPerformer: (delta: number) => void;
}

const SECTION_COLORS: Record<SectionId, string> = {
  BRASS: '#f59e0b',
  BATTERY: '#22d3ee',
  PIT: '#a78bfa',
  GUARD: '#fb7185'
};

export const FieldViewport: React.FC<FieldViewportProps> = ({
  show,
  activeSetIndex,
  countOffset,
  cameraPreset,
  selectedIds,
  onSelectIds,
  toolMode,
  sectionFilter,
  overlays,
  collaboratorRole,
  intelligence,
  onUpdateSetPositions,
  onDropPin,
  highlightedPinId,
  povPerformerId,
  onCyclePovPerformer
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 520 });

  // 2D camera pan/zoom
  const [pan2d, setPan2d] = useState({ x: 0, y: 0 });
  const [zoom2d, setZoom2d] = useState(1.0);

  // 3D orbit state
  const [orbitYaw, setOrbitYaw] = useState(0);
  const [orbitPitch, setOrbitPitch] = useState(0);
  const [zoom3d, setZoom3d] = useState(1.0);

  // Drag interaction state
  const dragRef = useRef<{
    kind: 'NONE' | 'MARQUEE' | 'MOVE_DOTS' | 'CURVE_HANDLE' | 'ORBIT_3D' | 'PAN_2D';
    startScreenX: number;
    startScreenY: number;
    startWorldX: number;
    startWorldY: number;
    initialDots: Record<string, PerformerDot>;
    curvePerformerId?: string;
    startOrbitYaw: number;
    startOrbitPitch: number;
    startPanX: number;
    startPanY: number;
  }>({
    kind: 'NONE',
    startScreenX: 0,
    startScreenY: 0,
    startWorldX: 0,
    startWorldY: 0,
    initialDots: {},
    startOrbitYaw: 0,
    startOrbitPitch: 0,
    startPanX: 0,
    startPanY: 0
  });

  const [marqueeRect, setMarqueeRect] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const field = useMemo(() => getFieldSpec(show.fieldStandardId), [show.fieldStandardId]);
  const comparisonField = useMemo(
    () => (show.comparisonFieldId ? getFieldSpec(show.comparisonFieldId) : null),
    [show.comparisonFieldId]
  );

  const interpolated = useMemo(
    () => interpolateShowAtPosition(show, activeSetIndex, countOffset, field),
    [show, activeSetIndex, countOffset, field]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 10 && rect.height > 10) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset orbit gently when switching camera presets
  useEffect(() => {
    setOrbitYaw(0);
    setOrbitPitch(0);
    setZoom3d(1.0);
  }, [cameraPreset]);

  // 2D coordinate transform helpers
  const transform2d = useMemo(() => {
    const totalW = field.widthMeters + field.endzoneDepthMeters * 2 + 6;
    const totalH = field.depthMeters + field.pitDepthMeters + 6;
    const pad = 28;
    const baseScale = Math.min(
      (size.width - pad * 2) / totalW,
      (size.height - pad * 2) / totalH
    );
    const scale = Math.max(2, baseScale * zoom2d);
    const centerX = size.width / 2 + pan2d.x;
    const fieldMidY = (field.depthMeters - field.pitDepthMeters) / 2;
    const centerY = size.height / 2 + pan2d.y;

    return {
      scale,
      toScreen(pt: CanonicalPoint): { u: number; v: number } {
        return {
          u: centerX + pt.xMeters * scale,
          v: centerY - (pt.yMeters - fieldMidY) * scale
        };
      },
      toWorld(u: number, v: number): CanonicalPoint {
        return {
          xMeters: (u - centerX) / scale,
          yMeters: fieldMidY - (v - centerY) / scale
        };
      }
    };
  }, [field, size, zoom2d, pan2d]);

  const camera3d = useMemo(() => {
    const povState = interpolated[povPerformerId];
    return buildCameraState(
      cameraPreset,
      field,
      orbitYaw,
      orbitPitch,
      zoom3d,
      povState
    );
  }, [cameraPreset, field, orbitYaw, orbitPitch, zoom3d, interpolated, povPerformerId]);

  // Render canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear stadium background
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, size.width, size.height);

    const selectedSet = new Set(selectedIds);
    const activeWindow = getTransitionWindow(show, activeSetIndex);

    if (cameraPreset === 'TOP_2D') {
      const halfW = field.widthMeters / 2;
      const fullHalfW = halfW + field.endzoneDepthMeters;
      const tl = transform2d.toScreen({ xMeters: -fullHalfW, yMeters: field.depthMeters });
      const br = transform2d.toScreen({ xMeters: fullHalfW, yMeters: 0 });
      const turfW = br.u - tl.u;
      const turfH = br.v - tl.v;

      // Pit / Staging zone
      const pitTl = transform2d.toScreen({
        xMeters: -halfW * 0.45,
        yMeters: 0
      });
      const pitBr = transform2d.toScreen({
        xMeters: halfW * 0.45,
        yMeters: -field.pitDepthMeters
      });
      ctx.fillStyle = '#0d1926';
      ctx.fillRect(pitTl.u, pitTl.v, pitBr.u - pitTl.u, pitBr.v - pitTl.v);
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pitTl.u, pitTl.v, pitBr.u - pitTl.u, pitBr.v - pitTl.v);

      // Podium icon at (0, -4.0)
      const podium = transform2d.toScreen({ xMeters: 0, yMeters: -4.0 });
      ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
      ctx.strokeStyle = '#22d3ee';
      ctx.beginPath();
      ctx.rect(podium.u - 8, podium.v - 5, 16, 10);
      ctx.fill();
      ctx.stroke();

      // Main Turf
      ctx.fillStyle = '#0d2b1f';
      ctx.fillRect(tl.u, tl.v, turfW, turfH);

      // Alternating 5-yard / 5m turf stripes
      const maxK = Math.round(halfW / field.majorLineSpacingMeters);
      for (let xIdx = -maxK; xIdx < maxK; xIdx++) {
        if (Math.abs(xIdx) % 2 === 0) {
          const x0 = xIdx * field.majorLineSpacingMeters;
          const x1 = (xIdx + 1) * field.majorLineSpacingMeters;
          const p0 = transform2d.toScreen({ xMeters: x0, yMeters: field.depthMeters });
          const p1 = transform2d.toScreen({ xMeters: x1, yMeters: 0 });
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.fillRect(p0.u, p0.v, p1.u - p0.u, p1.v - p0.v);
        }
      }

      // Endzones (when applicable)
      if (field.endzoneDepthMeters > 0) {
        const ezL0 = transform2d.toScreen({ xMeters: -fullHalfW, yMeters: field.depthMeters });
        const ezL1 = transform2d.toScreen({ xMeters: -halfW, yMeters: 0 });
        ctx.fillStyle = 'rgba(99, 102, 241, 0.09)';
        ctx.fillRect(ezL0.u, ezL0.v, ezL1.u - ezL0.u, ezL1.v - ezL0.v);

        const ezR0 = transform2d.toScreen({ xMeters: halfW, yMeters: field.depthMeters });
        const ezR1 = transform2d.toScreen({ xMeters: fullHalfW, yMeters: 0 });
        ctx.fillRect(ezR0.u, ezR0.v, ezR1.u - ezR0.u, ezR1.v - ezR0.v);
      }

      // Vertical Yard / 5m lines & Numbers
      ctx.font = '600 10px "SF Mono", monospace';
      ctx.textAlign = 'center';
      for (let k = -maxK; k <= maxK; k++) {
        const x = k * field.majorLineSpacingMeters;
        const top = transform2d.toScreen({ xMeters: x, yMeters: field.depthMeters });
        const bot = transform2d.toScreen({ xMeters: x, yMeters: 0 });
        ctx.strokeStyle =
          k === 0
            ? 'rgba(255, 255, 255, 0.6)'
            : 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = k === 0 ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(top.u, top.v);
        ctx.lineTo(bot.u, bot.v);
        ctx.stroke();

        // Yard numbers or meter labels
        const label =
          field.gridType === 'YARD_LINES'
            ? k % 2 === 0
              ? String(50 - 5 * Math.abs(k))
              : ''
            : `${Math.abs(k) * 5}m`;
        if (label) {
          ctx.fillStyle = 'rgba(241, 245, 249, 0.55)';
          const numFront = transform2d.toScreen({ xMeters: x, yMeters: 4.5 });
          const numBack = transform2d.toScreen({
            xMeters: x,
            yMeters: field.depthMeters - 4.5
          });
          ctx.fillText(label, numFront.u, numFront.v + 3);
          ctx.fillText(label, numBack.u, numBack.v + 3);
        }
      }

      // Outer field perimeter
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(tl.u, tl.v, turfW, turfH);

      // Reference horizontal lines (Hashes or 5m JMBA rows)
      if (field.gridType === 'METRIC_5M') {
        for (const ref of field.referenceLines) {
          const pL = transform2d.toScreen({ xMeters: -halfW, yMeters: ref.yMeters });
          const pR = transform2d.toScreen({ xMeters: halfW, yMeters: ref.yMeters });
          ctx.strokeStyle =
            ref.id === 'CENTER_15M'
              ? 'rgba(245, 158, 11, 0.5)'
              : 'rgba(255, 255, 255, 0.16)';
          ctx.beginPath();
          ctx.moveTo(pL.u, pL.v);
          ctx.lineTo(pR.u, pR.v);
          ctx.stroke();
        }
        // JMBA 5m point crosses
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        for (let k = -maxK; k <= maxK; k++) {
          const x = k * 5;
          for (const ref of field.referenceLines) {
            const pt = transform2d.toScreen({ xMeters: x, yMeters: ref.yMeters });
            ctx.beginPath();
            ctx.moveTo(pt.u - 3, pt.v);
            ctx.lineTo(pt.u + 3, pt.v);
            ctx.moveTo(pt.u, pt.v - 3);
            ctx.lineTo(pt.u, pt.v + 3);
            ctx.stroke();
          }
        }
      } else {
        // Draw crisp hash ticks along every 1-yard or 5-yard tick
        const drawHashes = (yMeters: number, color: string, dashed: boolean) => {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = dashed ? 1.3 : 1.8;
          if (dashed) ctx.setLineDash([5, 4]);
          const left = transform2d.toScreen({ xMeters: -halfW, yMeters });
          const right = transform2d.toScreen({ xMeters: halfW, yMeters });
          ctx.beginPath();
          ctx.moveTo(left.u, left.v);
          ctx.lineTo(right.u, right.v);
          ctx.stroke();
          ctx.restore();
        };

        if (field.frontHashYMeters !== null) {
          drawHashes(field.frontHashYMeters, 'rgba(245, 158, 11, 0.72)', false);
        }
        if (field.backHashYMeters !== null) {
          drawHashes(field.backHashYMeters, 'rgba(245, 158, 11, 0.72)', false);
        }

        // Ghost Venue Hash Overlay
        if (comparisonField && comparisonField.id !== field.id) {
          if (comparisonField.frontHashYMeters !== null) {
            drawHashes(comparisonField.frontHashYMeters, '#22d3ee', true);
          }
          if (comparisonField.backHashYMeters !== null) {
            drawHashes(comparisonField.backHashYMeters, '#22d3ee', true);
          }
        }
      }

      // Acoustic Delay Isochrone Rings centered at podium (0, -4.0)
      if (overlays.acousticRings) {
        const c = speedOfSoundMps(show.ambientTempCelsius);
        const pitBase = 2.0;
        const center = transform2d.toScreen({ xMeters: 0, yMeters: -4.0 });
        ctx.save();
        ctx.beginPath();
        ctx.rect(tl.u, tl.v, turfW, turfH);
        ctx.clip();

        for (const ms of [30, 55, 80, 105]) {
          const radiusM = pitBase + (ms / 1000) * c;
          const radiusPx = radiusM * transform2d.scale;
          ctx.strokeStyle =
            ms >= 80
              ? 'rgba(251, 113, 133, 0.42)'
              : ms >= 55
                ? 'rgba(245, 158, 11, 0.35)'
                : 'rgba(34, 211, 238, 0.3)';
          ctx.lineWidth = 1.1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(center.u, center.v, radiusPx, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(203, 213, 225, 0.65)';
          ctx.font = '600 10px "SF Mono", monospace';
          ctx.fillText(`${ms}ms`, center.u + 22, center.v - radiusPx + 11);
        }
        ctx.restore();
      }

      // Transition Motion Paths & Curve Handles
      if (overlays.paths && activeWindow) {
        for (const perf of show.performers) {
          if (sectionFilter !== 'ALL' && perf.section !== sectionFilter) continue;
          const p0 = activeWindow.fromSet.positions[perf.id];
          const p1 = activeWindow.toSet.positions[perf.id];
          if (!p0 || !p1) continue;
          const dist = Math.hypot(p1.xMeters - p0.xMeters, p1.yMeters - p0.yMeters);
          if (dist < 0.05) continue;

          const isSel = selectedSet.has(perf.id);
          ctx.strokeStyle = isSel
            ? '#ffffff'
            : `${SECTION_COLORS[perf.section]}55`;
          ctx.lineWidth = isSel ? 1.8 : 1.0;
          ctx.beginPath();
          const startS = transform2d.toScreen(p0);
          ctx.moveTo(startS.u, startS.v);
          const steps = 14;
          for (let s = 1; s <= steps; s++) {
            const pt = evaluateSegmentPoint(p0, p1, s / steps);
            const sp = transform2d.toScreen(pt);
            ctx.lineTo(sp.u, sp.v);
          }
          ctx.stroke();

          if (toolMode === 'CURVE' && collaboratorRole === 'DESIGNER') {
            const handleWorld = computeSegmentControlPointForMidpoint(p0, p1);
            const handleScr = transform2d.toScreen(handleWorld);
            ctx.fillStyle = Math.abs(p1.curveOffsetMeters ?? 0) > 0.05 ? '#22d3ee' : '#64748b';
            ctx.beginPath();
            ctx.arc(handleScr.u, handleScr.v, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Collision Warning Halos for active transition
      if (overlays.collisions) {
        const activeCols = intelligence.collisions.filter(
          (c) => c.fromSetIndex === activeSetIndex
        );
        for (const col of activeCols) {
          const sp = transform2d.toScreen(col.midpoint);
          ctx.save();
          ctx.strokeStyle = col.severity === 'CRITICAL' ? '#fb7185' : '#f59e0b';
          ctx.fillStyle =
            col.severity === 'CRITICAL'
              ? 'rgba(251, 113, 133, 0.2)'
              : 'rgba(245, 158, 11, 0.16)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(sp.u, sp.v, Math.max(11, transform2d.scale * 1.15), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw Performers
      for (const perf of show.performers) {
        const state = interpolated[perf.id];
        if (!state) continue;
        const sp = transform2d.toScreen({
          xMeters: state.xMeters,
          yMeters: state.yMeters
        });
        const dimmed = sectionFilter !== 'ALL' && perf.section !== sectionFilter;
        const isSel = selectedSet.has(perf.id);
        const color = SECTION_COLORS[perf.section];
        const bs = state.bodyState;

        ctx.save();
        ctx.globalAlpha = dimmed ? 0.2 : 1.0;

        // Ripple / Snap Activation Halo
        if (overlays.bodyVisuals && bs.isPulseActive) {
          ctx.save();
          ctx.strokeStyle = `rgba(254, 240, 138, ${0.95 - bs.pulseProgress * 0.7})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(sp.u, sp.v, 8 + bs.pulseProgress * 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Heading indicator vector when moving (Foot Travel Direction)
        if (state.isMoving) {
          const hx = sp.u + Math.cos(state.headingRad) * 11;
          const hy = sp.v - Math.sin(state.headingRad) * 11;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(sp.u, sp.v);
          ctx.lineTo(hx, hy);
          ctx.stroke();
        }

        // Upper-body shoulder T-bar & Horn/Equipment Projection Tick
        if (overlays.bodyVisuals) {
          const ux = Math.cos(bs.upperFacingRad);
          const uy = -Math.sin(bs.upperFacingRad);
          const px = -uy;
          const py = ux;
          const isActiveProject =
            bs.hornCarriage === 'HORNS_BOX' ||
            bs.hornCarriage === 'HORNS_SNAP_UP' ||
            bs.hornCarriage === 'HIGH_BELL_EXTENSION';
          const barHalf = isSel ? 7.5 : 6.2;

          ctx.strokeStyle = isActiveProject ? '#fef08a' : '#94a3b8';
          ctx.lineWidth = isActiveProject ? 1.8 : 1.1;
          ctx.beginPath();
          ctx.moveTo(sp.u - px * barHalf, sp.v - py * barHalf);
          ctx.lineTo(sp.u + px * barHalf, sp.v + py * barHalf);
          ctx.stroke();

          if (isActiveProject) {
            const tickLen = bs.hornCarriage === 'HIGH_BELL_EXTENSION' ? 10 : 7.5;
            ctx.beginPath();
            ctx.moveTo(sp.u, sp.v);
            ctx.lineTo(sp.u + ux * tickLen, sp.v + uy * tickLen);
            ctx.stroke();
          }
        }

        if (isSel) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(sp.u, sp.v, 9.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        const shape = overlays.bodyVisuals ? bs.markerShape2d : 'CIRCLE';
        const baseR = isSel ? 5.2 : 4.2;

        if (shape === 'DIAMOND') {
          const r = baseR + 1.4;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(sp.u, sp.v - r);
          ctx.lineTo(sp.u + r, sp.v);
          ctx.lineTo(sp.u, sp.v + r);
          ctx.lineTo(sp.u - r, sp.v);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#070b12';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Hollow core signaling lower elevation (kneel / bow)
          ctx.fillStyle = '#070b12';
          ctx.beginPath();
          ctx.arc(sp.u, sp.v, 1.9, 0, Math.PI * 2);
          ctx.fill();
        } else if (shape === 'CAPSULE') {
          ctx.save();
          ctx.translate(sp.u, sp.v);
          const tilt =
            bs.posture === 'LUNGE_LEFT'
              ? -0.35
              : bs.posture === 'LUNGE_RIGHT'
                ? 0.35
                : bs.posture === 'CONTRAPPOSTO_LEAN'
                  ? 0.55
                  : 0;
          ctx.rotate(tilt);
          const w = isSel ? 12.0 : 10.2;
          const h = isSel ? 6.0 : 5.2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
          ctx.fill();
          ctx.strokeStyle = '#070b12';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        } else if (shape === 'CHEVRON') {
          ctx.save();
          ctx.translate(sp.u, sp.v);
          const angle = state.isMoving
            ? Math.atan2(-Math.sin(state.headingRad), Math.cos(state.headingRad))
            : Math.PI / 2;
          ctx.rotate(angle);
          const r = baseR + 1.6;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(-r * 0.85, -r * 0.8);
          ctx.lineTo(-r * 0.35, 0);
          ctx.lineTo(-r * 0.85, r * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#070b12';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sp.u, sp.v, baseR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#070b12';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (overlays.labels || isSel) {
          ctx.font = isSel
            ? '700 10px "SF Mono", monospace'
            : '600 9px "SF Mono", monospace';
          ctx.fillStyle = isSel ? '#ffffff' : 'rgba(241, 245, 249, 0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(perf.label, sp.u, sp.v - 10);
        }
        ctx.restore();
      }

      // Field Pins on 2D field
      for (const pin of show.pins) {
        const setMatch = show.sets[activeSetIndex]?.id === pin.setId;
        const sp = transform2d.toScreen({ xMeters: pin.xMeters, yMeters: pin.yMeters });
        const isHl = highlightedPinId === pin.id;
        ctx.save();
        ctx.globalAlpha = setMatch || isHl ? 1.0 : 0.42;
        ctx.fillStyle =
          pin.status === 'RESOLVED'
            ? '#10b981'
            : pin.status === 'TRIAGED'
              ? '#f59e0b'
              : '#fb7185';
        ctx.strokeStyle = isHl ? '#ffffff' : '#070b12';
        ctx.lineWidth = isHl ? 2.2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(sp.u, sp.v);
        ctx.lineTo(sp.u - 6, sp.v - 13);
        ctx.lineTo(sp.u + 6, sp.v - 13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Marquee overlay
      if (marqueeRect) {
        const mx = Math.min(marqueeRect.x0, marqueeRect.x1);
        const my = Math.min(marqueeRect.y0, marqueeRect.y1);
        const mw = Math.abs(marqueeRect.x1 - marqueeRect.x0);
        const mh = Math.abs(marqueeRect.y1 - marqueeRect.y0);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.2;
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeRect(mx, my, mw, mh);
      }
    } else {
      // 3D Perspective Rendering (HIGH_CAM_JUDGE, BOX_SCAFFOLD, PERFORMER_POV)
      const proj = (x: number, y: number, z: number) =>
        projectWorldToScreen({ x, y, z }, camera3d, size.width, size.height);

      // Draw horizon sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, size.height * 0.62);
      skyGrad.addColorStop(0, '#040811');
      skyGrad.addColorStop(1, '#0e192c');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, size.width, size.height);

      const drawGroundLine = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        color: string,
        widthPx: number
      ) => {
        const steps = 10;
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;
        ctx.beginPath();
        let started = false;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const p = proj(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0);
          if (!p) continue;
          if (!started) {
            ctx.moveTo(p.u, p.v);
            started = true;
          } else {
            ctx.lineTo(p.u, p.v);
          }
        }
        if (started) ctx.stroke();
      };

      const halfW = field.widthMeters / 2;
      const fullHalfW = halfW + field.endzoneDepthMeters;

      // Front Ensemble Pit Apron in 3D
      const pitHalfW = halfW * 0.45;
      const pit0 = proj(-pitHalfW, -field.pitDepthMeters, 0);
      const pit1 = proj(pitHalfW, -field.pitDepthMeters, 0);
      const pit2 = proj(pitHalfW, 0, 0);
      const pit3 = proj(-pitHalfW, 0, 0);
      if (pit0 && pit1 && pit2 && pit3) {
        ctx.fillStyle = '#0d1926';
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pit0.u, pit0.v);
        ctx.lineTo(pit1.u, pit1.v);
        ctx.lineTo(pit2.u, pit2.v);
        ctx.lineTo(pit3.u, pit3.v);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Render turf quad slices along X so perspective clipping stays clean
      const maxK = Math.round(halfW / field.majorLineSpacingMeters);
      for (let k = -maxK; k < maxK; k++) {
        const x0 = k * field.majorLineSpacingMeters;
        const x1 = (k + 1) * field.majorLineSpacingMeters;
        const c00 = proj(x0, 0, 0);
        const c10 = proj(x1, 0, 0);
        const c11 = proj(x1, field.depthMeters, 0);
        const c01 = proj(x0, field.depthMeters, 0);
        if (c00 && c10 && c11 && c01) {
          ctx.fillStyle = Math.abs(k) % 2 === 0 ? '#0d2b1f' : '#103425';
          ctx.beginPath();
          ctx.moveTo(c00.u, c00.v);
          ctx.lineTo(c10.u, c10.v);
          ctx.lineTo(c11.u, c11.v);
          ctx.lineTo(c01.u, c01.v);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Endzones in 3D
      if (field.endzoneDepthMeters > 0) {
        for (const [ex0, ex1] of [
          [-fullHalfW, -halfW],
          [halfW, fullHalfW]
        ]) {
          const p0 = proj(ex0!, 0, 0);
          const p1 = proj(ex1!, 0, 0);
          const p2 = proj(ex1!, field.depthMeters, 0);
          const p3 = proj(ex0!, field.depthMeters, 0);
          if (p0 && p1 && p2 && p3) {
            ctx.fillStyle = 'rgba(79, 70, 229, 0.14)';
            ctx.beginPath();
            ctx.moveTo(p0.u, p0.v);
            ctx.lineTo(p1.u, p1.v);
            ctx.lineTo(p2.u, p2.v);
            ctx.lineTo(p3.u, p3.v);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Field perimeter & yard lines
      drawGroundLine(-fullHalfW, 0, fullHalfW, 0, 'rgba(255,255,255,0.68)', 1.8);
      drawGroundLine(
        -fullHalfW,
        field.depthMeters,
        fullHalfW,
        field.depthMeters,
        'rgba(255,255,255,0.55)',
        1.5
      );
      drawGroundLine(-fullHalfW, 0, -fullHalfW, field.depthMeters, 'rgba(255,255,255,0.55)', 1.5);
      drawGroundLine(fullHalfW, 0, fullHalfW, field.depthMeters, 'rgba(255,255,255,0.55)', 1.5);

      for (let k = -maxK; k <= maxK; k++) {
        const x = k * field.majorLineSpacingMeters;
        drawGroundLine(
          x,
          0,
          x,
          field.depthMeters,
          k === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.2)',
          k === 0 ? 1.8 : 1.0
        );
      }

      if (field.frontHashYMeters !== null) {
        drawGroundLine(
          -halfW,
          field.frontHashYMeters,
          halfW,
          field.frontHashYMeters,
          'rgba(245, 158, 11, 0.72)',
          1.5
        );
      }
      if (field.backHashYMeters !== null) {
        drawGroundLine(
          -halfW,
          field.backHashYMeters,
          halfW,
          field.backHashYMeters,
          'rgba(245, 158, 11, 0.72)',
          1.5
        );
      }
      if (comparisonField && comparisonField.id !== field.id) {
        if (comparisonField.frontHashYMeters !== null) {
          drawGroundLine(
            -halfW,
            comparisonField.frontHashYMeters,
            halfW,
            comparisonField.frontHashYMeters,
            '#22d3ee',
            1.4
          );
        }
        if (comparisonField.backHashYMeters !== null) {
          drawGroundLine(
            -halfW,
            comparisonField.backHashYMeters,
            halfW,
            comparisonField.backHashYMeters,
            '#22d3ee',
            1.4
          );
        }
      }

      // Motion paths on turf in 3D
      if (overlays.paths && activeWindow) {
        for (const perf of show.performers) {
          if (sectionFilter !== 'ALL' && perf.section !== sectionFilter) continue;
          const p0 = activeWindow.fromSet.positions[perf.id];
          const p1 = activeWindow.toSet.positions[perf.id];
          if (!p0 || !p1) continue;
          if (Math.hypot(p1.xMeters - p0.xMeters, p1.yMeters - p0.yMeters) < 0.05) continue;

          ctx.strokeStyle = selectedSet.has(perf.id)
            ? '#ffffff'
            : `${SECTION_COLORS[perf.section]}66`;
          ctx.lineWidth = selectedSet.has(perf.id) ? 2.0 : 1.1;
          ctx.beginPath();
          let started = false;
          for (let s = 0; s <= 12; s++) {
            const pt = evaluateSegmentPoint(p0, p1, s / 12);
            const sp = proj(pt.xMeters, pt.yMeters, 0.04);
            if (!sp) continue;
            if (!started) {
              ctx.moveTo(sp.u, sp.v);
              started = true;
            } else {
              ctx.lineTo(sp.u, sp.v);
            }
          }
          if (started) ctx.stroke();
        }
      }

      // Depth-sorted 3D performers
      const renderItems = show.performers
        .map((perf) => {
          if (cameraPreset === 'PERFORMER_POV' && perf.id === povPerformerId) {
            return null;
          }
          const st = interpolated[perf.id];
          if (!st) return null;
          const bs = st.bodyState;
          const useBody = overlays.bodyVisuals;
          const elev = useBody ? bs.elevationMeters : 1.72;
          const lx = useBody ? bs.leanXMeters : 0;
          const ly = useBody ? bs.leanYMeters : 0;

          const base = proj(st.xMeters, st.yMeters, 0);
          const head = proj(st.xMeters + lx, st.yMeters + ly, elev);
          if (!base || !head) return null;

          const knee =
            useBody && bs.posture === 'KNEEL_RIGHT'
              ? proj(st.xMeters + 0.14, st.yMeters - 0.16, 0.48)
              : null;

          let hornOrigin = null;
          let hornTip = null;
          if (useBody) {
            const ux = Math.cos(bs.upperFacingRad);
            const uy = Math.sin(bs.upperFacingRad);
            const tiltRad = (bs.hornAngleDeg * Math.PI) / 180;
            const horizReach = Math.cos(tiltRad) * 0.72;
            const vertReach = Math.sin(tiltRad) * 0.72;
            const chestZ = elev * 0.78;
            hornOrigin = proj(st.xMeters + lx * 0.75, st.yMeters + ly * 0.75, chestZ);
            hornTip = proj(
              st.xMeters + lx * 0.75 + ux * horizReach,
              st.yMeters + ly * 0.75 + uy * horizReach,
              Math.max(0.25, chestZ + vertReach)
            );
          }

          return { perf, st, base, head, knee, hornOrigin, hornTip };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.base.depth - a.base.depth);

      for (const item of renderItems) {
        const { perf, st, base, head, knee, hornOrigin, hornTip } = item;
        const bs = st.bodyState;
        const dimmed = sectionFilter !== 'ALL' && perf.section !== sectionFilter;
        const isSel = selectedSet.has(perf.id);
        const color = SECTION_COLORS[perf.section];
        const heightPx = Math.max(8, Math.abs(base.v - head.v));
        const bodyRadius = Math.max(2.2, Math.min(18, base.scalePerMeter * 0.24));

        ctx.save();
        ctx.globalAlpha = dimmed ? 0.22 : 1.0;

        // 3D Ripple activation ring on turf
        if (overlays.bodyVisuals && bs.isPulseActive) {
          ctx.strokeStyle = `rgba(254, 240, 138, ${0.9 - bs.pulseProgress * 0.65})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(
            base.u,
            base.v,
            bodyRadius * (2.6 + bs.pulseProgress * 2.0),
            bodyRadius * (1.05 + bs.pulseProgress * 0.85),
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }

        // Shadow on turf
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.beginPath();
        ctx.ellipse(base.u, base.v, bodyRadius * 1.4, bodyRadius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        if (isSel) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(base.u, base.v, bodyRadius * 2.2, bodyRadius * 0.9, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Uniform torso column (bent through knee when kneeling)
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(2, bodyRadius * 1.15);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(base.u, base.v - heightPx * 0.06);
        if (knee) {
          ctx.lineTo(knee.u, knee.v);
        }
        ctx.lineTo(head.u, head.v + heightPx * 0.14);
        ctx.stroke();

        // 3D Horn / Equipment projection vector
        if (hornOrigin && hornTip) {
          const isBright =
            bs.hornCarriage === 'HORNS_BOX' ||
            bs.hornCarriage === 'HORNS_SNAP_UP' ||
            bs.hornCarriage === 'HIGH_BELL_EXTENSION';
          ctx.strokeStyle = isBright ? '#fef08a' : '#94a3b8';
          ctx.lineWidth = Math.max(1.4, bodyRadius * 0.65);
          ctx.beginPath();
          ctx.moveTo(hornOrigin.u, hornOrigin.v);
          ctx.lineTo(hornTip.u, hornTip.v);
          ctx.stroke();
        }

        // Section plume / shako crown
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(head.u, head.v, Math.max(2.5, bodyRadius * 0.95), 0, Math.PI * 2);
        ctx.fill();

        if (overlays.labels || isSel) {
          ctx.font = '700 10px "SF Mono", monospace';
          ctx.fillStyle = isSel ? '#ffffff' : 'rgba(241, 245, 249, 0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(perf.label, head.u, head.v - 7);
        }
        ctx.restore();
      }
    }
  }, [
    size,
    show,
    activeSetIndex,
    cameraPreset,
    selectedIds,
    sectionFilter,
    overlays,
    toolMode,
    collaboratorRole,
    intelligence,
    field,
    comparisonField,
    interpolated,
    transform2d,
    camera3d,
    marqueeRect,
    highlightedPinId,
    povPerformerId
  ]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (cameraPreset !== 'TOP_2D') {
      dragRef.current = {
        kind: 'ORBIT_3D',
        startScreenX: sx,
        startScreenY: sy,
        startWorldX: 0,
        startWorldY: 0,
        initialDots: {},
        startOrbitYaw: orbitYaw,
        startOrbitPitch: orbitPitch,
        startPanX: pan2d.x,
        startPanY: pan2d.y
      };
      return;
    }

    if (e.button === 1 || e.altKey) {
      dragRef.current = {
        kind: 'PAN_2D',
        startScreenX: sx,
        startScreenY: sy,
        startWorldX: 0,
        startWorldY: 0,
        initialDots: {},
        startOrbitYaw: 0,
        startOrbitPitch: 0,
        startPanX: pan2d.x,
        startPanY: pan2d.y
      };
      return;
    }

    const worldPt = transform2d.toWorld(sx, sy);

    // Pin tool mode
    if (toolMode === 'PIN') {
      let nearestId: string | undefined;
      let bestDist = 2.0;
      for (const perf of show.performers) {
        const st = interpolated[perf.id];
        if (!st) continue;
        const d = Math.hypot(st.xMeters - worldPt.xMeters, st.yMeters - worldPt.yMeters);
        if (d < bestDist) {
          bestDist = d;
          nearestId = perf.id;
        }
      }
      onDropPin(worldPt.xMeters, worldPt.yMeters, nearestId);
      return;
    }

    // Check curve handle hit when CURVE mode active
    const activeWindow = getTransitionWindow(show, activeSetIndex);
    if (toolMode === 'CURVE' && collaboratorRole === 'DESIGNER' && activeWindow) {
      for (const perf of show.performers) {
        const p0 = activeWindow.fromSet.positions[perf.id];
        const p1 = activeWindow.toSet.positions[perf.id];
        if (!p0 || !p1) continue;
        const handleW = computeSegmentControlPointForMidpoint(p0, p1);
        const handleS = transform2d.toScreen(handleW);
        if (Math.hypot(handleS.u - sx, handleS.v - sy) <= 10) {
          dragRef.current = {
            kind: 'CURVE_HANDLE',
            startScreenX: sx,
            startScreenY: sy,
            startWorldX: worldPt.xMeters,
            startWorldY: worldPt.yMeters,
            initialDots: { ...activeWindow.toSet.positions },
            curvePerformerId: perf.id,
            startOrbitYaw: 0,
            startOrbitPitch: 0,
            startPanX: 0,
            startPanY: 0
          };
          onSelectIds([perf.id]);
          return;
        }
      }
    }

    // Check performer dot hit
    let hitId: string | null = null;
    let bestPx = 12;
    for (const perf of show.performers) {
      const st = interpolated[perf.id];
      if (!st) continue;
      const sp = transform2d.toScreen({ xMeters: st.xMeters, yMeters: st.yMeters });
      const d = Math.hypot(sp.u - sx, sp.v - sy);
      if (d <= bestPx) {
        bestPx = d;
        hitId = perf.id;
      }
    }

    if (hitId) {
      let nextSel: string[];
      if (e.shiftKey) {
        nextSel = selectedIds.includes(hitId)
          ? selectedIds.filter((id) => id !== hitId)
          : [...selectedIds, hitId];
      } else {
        nextSel = selectedIds.includes(hitId) ? selectedIds : [hitId];
      }
      onSelectIds(nextSel);

      if (
        collaboratorRole === 'DESIGNER' &&
        (toolMode === 'MOVE' || toolMode === 'SELECT') &&
        countOffset < 0.05
      ) {
        const setPositions = show.sets[activeSetIndex]?.positions ?? {};
        dragRef.current = {
          kind: 'MOVE_DOTS',
          startScreenX: sx,
          startScreenY: sy,
          startWorldX: worldPt.xMeters,
          startWorldY: worldPt.yMeters,
          initialDots: Object.fromEntries(
            nextSel.map((id) => [id, { ...(setPositions[id] ?? { xMeters: 0, yMeters: 0 }) }])
          ),
          startOrbitYaw: 0,
          startOrbitPitch: 0,
          startPanX: 0,
          startPanY: 0
        };
      }
      return;
    }

    // Background marquee selection
    if (!e.shiftKey) {
      onSelectIds([]);
    }
    dragRef.current = {
      kind: 'MARQUEE',
      startScreenX: sx,
      startScreenY: sy,
      startWorldX: worldPt.xMeters,
      startWorldY: worldPt.yMeters,
      initialDots: {},
      startOrbitYaw: 0,
      startOrbitPitch: 0,
      startPanX: 0,
      startPanY: 0
    };
    setMarqueeRect({ x0: sx, y0: sy, x1: sx, y1: sy });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.kind === 'NONE') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (drag.kind === 'ORBIT_3D') {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      setOrbitYaw(drag.startOrbitYaw + dx * 0.007);
      setOrbitPitch(drag.startOrbitPitch + dy * 0.005);
      return;
    }

    if (drag.kind === 'PAN_2D') {
      setPan2d({
        x: drag.startPanX + (sx - drag.startScreenX),
        y: drag.startPanY + (sy - drag.startScreenY)
      });
      return;
    }

    if (drag.kind === 'MARQUEE') {
      setMarqueeRect({
        x0: drag.startScreenX,
        y0: drag.startScreenY,
        x1: sx,
        y1: sy
      });
      return;
    }

    if (drag.kind === 'MOVE_DOTS') {
      const currWorld = transform2d.toWorld(sx, sy);
      const dx = currWorld.xMeters - drag.startWorldX;
      const dy = currWorld.yMeters - drag.startWorldY;
      const basePositions = show.sets[activeSetIndex]?.positions ?? {};
      const nextPositions = { ...basePositions };

      for (const [id, initDot] of Object.entries(drag.initialDots)) {
        let moved: CanonicalPoint = {
          xMeters: initDot.xMeters + dx,
          yMeters: initDot.yMeters + dy
        };
        if (overlays.snapHalfStep) {
          moved = snapMetersToHalfStep(moved, field);
        }
        moved = clampPointToFieldEnvelope(moved, field);
        nextPositions[id] = {
          ...initDot,
          xMeters: moved.xMeters,
          yMeters: moved.yMeters
        };
      }
      onUpdateSetPositions(activeSetIndex, nextPositions);
      return;
    }

    if (drag.kind === 'CURVE_HANDLE' && drag.curvePerformerId) {
      const win = getTransitionWindow(show, activeSetIndex);
      if (!win) return;
      const p0 = win.fromSet.positions[drag.curvePerformerId];
      const p1 = drag.initialDots[drag.curvePerformerId];
      if (!p0 || !p1) return;
      const currWorld = transform2d.toWorld(sx, sy);
      const dx = p1.xMeters - p0.xMeters;
      const dy = p1.yMeters - p0.yMeters;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) return;
      const nx = -dy / len;
      const ny = dx / len;
      const midX = 0.5 * (p0.xMeters + p1.xMeters);
      const midY = 0.5 * (p0.yMeters + p1.yMeters);
      const signedOffset = (currWorld.xMeters - midX) * nx + (currWorld.yMeters - midY) * ny;
      const clampedOffset = Math.min(6, Math.max(-6, Math.round(signedOffset * 10) / 10));

      onUpdateSetPositions(win.toSetIndex, {
        ...win.toSet.positions,
        [drag.curvePerformerId]: {
          ...p1,
          curveOffsetMeters: clampedOffset
        }
      });
    }
  };

  const handleMouseUp = () => {
    const drag = dragRef.current;
    if (drag.kind === 'MARQUEE' && marqueeRect) {
      const minX = Math.min(marqueeRect.x0, marqueeRect.x1);
      const maxX = Math.max(marqueeRect.x0, marqueeRect.x1);
      const minY = Math.min(marqueeRect.y0, marqueeRect.y1);
      const maxY = Math.max(marqueeRect.y0, marqueeRect.y1);
      if (maxX - minX > 4 && maxY - minY > 4) {
        const picked: string[] = [];
        for (const perf of show.performers) {
          if (sectionFilter !== 'ALL' && perf.section !== sectionFilter) continue;
          const st = interpolated[perf.id];
          if (!st) continue;
          const sp = transform2d.toScreen({ xMeters: st.xMeters, yMeters: st.yMeters });
          if (sp.u >= minX && sp.u <= maxX && sp.v >= minY && sp.v <= maxY) {
            picked.push(perf.id);
          }
        }
        onSelectIds(picked);
      }
      setMarqueeRect(null);
    }
    dragRef.current.kind = 'NONE';
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const factor = e.deltaY < 0 ? 1.09 : 0.92;
    if (cameraPreset === 'TOP_2D') {
      setZoom2d((z) => Math.min(3.5, Math.max(0.55, z * factor)));
    } else {
      setZoom3d((z) => Math.min(2.6, Math.max(0.45, z * factor)));
    }
  };

  // Selected performer live telemetry HUD
  const focusedId = selectedIds[0] ?? (cameraPreset === 'PERFORMER_POV' ? povPerformerId : undefined);
  const focusedPerf = focusedId ? show.performers.find((p) => p.id === focusedId) : undefined;
  const focusedState = focusedId ? interpolated[focusedId] : undefined;
  const focusedReadout = focusedState
    ? toCoordinateReadout(
        { xMeters: focusedState.xMeters, yMeters: focusedState.yMeters },
        field
      )
    : null;
  const focusedText = focusedReadout
    ? formatCoordinateSheetText(focusedReadout, field)
    : null;
  const hashDelta =
    focusedState && comparisonField && comparisonField.id !== field.id
      ? computeHashTranslationDelta(
          { xMeters: focusedState.xMeters, yMeters: focusedState.yMeters },
          field,
          comparisonField
        )
      : null;

  return (
    <div className="viewport-wrap" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="field-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor:
            toolMode === 'PIN'
              ? 'crosshair'
              : cameraPreset === 'TOP_2D'
                ? 'default'
                : 'grab'
        }}
      />

      <div className="viewport-top-hud">
        <div className="hud-pill-row">
          <div className="hud-pill">
            <strong>{field.shortName}</strong>
            <span>|</span>
            <span>{field.stepLabel}</span>
            {comparisonField && comparisonField.id !== field.id && (
              <>
                <span>|</span>
                <span style={{ color: '#22d3ee' }}>
                  Ghost Overlay: {comparisonField.shortName}
                </span>
              </>
            )}
          </div>
          {cameraPreset === 'PERFORMER_POV' && (
            <div className="hud-pill">
              <button type="button" onClick={() => onCyclePovPerformer(-1)}>
                Prev
              </button>
              <strong style={{ color: '#22d3ee' }}>
                POV: {show.performers.find((p) => p.id === povPerformerId)?.label ?? povPerformerId}
              </strong>
              <button type="button" onClick={() => onCyclePovPerformer(1)}>
                Next
              </button>
            </div>
          )}
        </div>

        <div className="hud-pill-row">
          <div className="hud-pill">
            <span>
              {cameraPreset === 'TOP_2D'
                ? 'Scroll zoom · Alt+Drag pan'
                : 'Drag orbit · Scroll zoom'}
            </span>
            <button
              type="button"
              onClick={() => {
                setPan2d({ x: 0, y: 0 });
                setZoom2d(1.0);
                setOrbitYaw(0);
                setOrbitPitch(0);
                setZoom3d(1.0);
              }}
            >
              Reset View
            </button>
          </div>
        </div>
      </div>

      {focusedPerf && focusedState && focusedText && (
        <div className="viewport-bottom-hud">
          <div className="coord-primary">
            [{focusedPerf.label}] {focusedPerf.name} — {focusedText.compactText}
          </div>
          <div className="coord-meta">
            <span>
              Stride:{' '}
              <strong>
                {focusedState.isMoving
                  ? `${formatSteps(focusedState.stepsPerFive)}-to-5`
                  : 'Hold'}
              </strong>
            </span>
            <span>
              Speed: <strong>{focusedState.speedMps.toFixed(2)} m/s</strong>
            </span>
            <span>
              Sound Lag:{' '}
              <strong>
                {computeAcousticDelayMs(
                  { xMeters: focusedState.xMeters, yMeters: focusedState.yMeters },
                  show.ambientTempCelsius
                ).toFixed(1)}{' '}
                ms
              </strong>
            </span>
            <span>
              Body: <strong style={{ color: '#fef08a' }}>{focusedState.bodyState.postureLabel}</strong>{' '}
              ({focusedState.bodyState.hornLabel})
            </span>
            {selectedIds.length > 1 && (
              <span style={{ color: '#22d3ee' }}>
                +{selectedIds.length - 1} more selected
              </span>
            )}
          </div>
          {hashDelta?.warningMessage && (
            <div className="coord-warning">{hashDelta.warningMessage}</div>
          )}
        </div>
      )}
    </div>
  );
};
