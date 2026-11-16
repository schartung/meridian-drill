import { CameraPresetId, FieldSpec, InterpolatedPerformerState } from './types.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraState {
  preset: CameraPresetId;
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fovRad: number;
}

export interface ProjectedScreenPoint {
  u: number;
  v: number;
  depth: number;
  scalePerMeter: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-9) {
    return { x: 0, y: 1, z: 0 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function buildCameraState(
  preset: CameraPresetId,
  field: FieldSpec,
  orbitYawRad: number,
  orbitPitchRad: number,
  zoom: number,
  povState?: InterpolatedPerformerState
): CameraState {
  const safeZoom = Math.min(2.6, Math.max(0.45, zoom));
  const fieldCenterY = field.depthMeters * 0.36;
  const worldUp: Vec3 = { x: 0, y: 0, z: 1 };

  let eye: Vec3;
  let target: Vec3;
  let fovDeg = 46;

  if (preset === 'PERFORMER_POV' && povState) {
    const baseYaw = povState.isMoving ? povState.headingRad : -Math.PI / 2;
    const lookYaw = baseYaw + orbitYawRad;
    const lookPitch = Math.min(0.45, Math.max(-0.55, orbitPitchRad));
    eye = {
      x: povState.xMeters,
      y: povState.yMeters,
      z: 1.65
    };
    const cosP = Math.cos(lookPitch);
    target = {
      x: eye.x + Math.cos(lookYaw) * cosP * 15,
      y: eye.y + Math.sin(lookYaw) * cosP * 15,
      z: eye.z + Math.sin(lookPitch) * 15
    };
    fovDeg = 60 / Math.sqrt(safeZoom);
  } else {
    const baseTarget: Vec3 = { x: 0, y: fieldCenterY, z: 0 };
    const baseDistance =
      preset === 'BOX_SCAFFOLD'
        ? field.depthMeters * 0.94
        : field.depthMeters * 1.34;
    const basePitch = preset === 'BOX_SCAFFOLD' ? 0.34 : 0.62;
    const pitch = Math.min(1.38, Math.max(0.14, basePitch + orbitPitchRad));
    const radius = baseDistance / safeZoom;

    // At orbitYawRad = 0, camera sits straight in front along -Y looking +Y across the 50.
    const horizDist = radius * Math.cos(pitch);
    const heightZ = radius * Math.sin(pitch);
    eye = {
      x: baseTarget.x + Math.sin(orbitYawRad) * horizDist,
      y: baseTarget.y - Math.cos(orbitYawRad) * horizDist,
      z: Math.max(2.0, heightZ)
    };
    target = baseTarget;
    fovDeg = preset === 'BOX_SCAFFOLD' ? 48 : 44;
  }

  const forward = normalize(sub(target, eye));
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));

  return {
    preset,
    eye,
    forward,
    right,
    up,
    fovRad: (fovDeg * Math.PI) / 180
  };
}

export function projectWorldToScreen(
  point3d: Vec3,
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number
): ProjectedScreenPoint | null {
  const rel = sub(point3d, camera.eye);
  const depth = dot(rel, camera.forward);
  if (depth <= 0.25) {
    return null;
  }

  const camX = dot(rel, camera.right);
  const camY = dot(rel, camera.up);
  const focalPx = (0.5 * viewportHeight) / Math.tan(camera.fovRad * 0.5);

  const u = 0.5 * viewportWidth + (camX / depth) * focalPx;
  const v = 0.5 * viewportHeight - (camY / depth) * focalPx;

  return {
    u,
    v,
    depth,
    scalePerMeter: focalPx / depth
  };
}
