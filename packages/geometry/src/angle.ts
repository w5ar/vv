import type { Vec2 } from './vec';

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normalizes an angle to the half-open interval [0, 360). */
export function normalizeAngle(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  // Avoid returning -0 and floating noise like 359.9999999 for -1e-12.
  return Math.abs(n - 360) < 1e-9 ? 0 : n === 0 ? 0 : n;
}

/** Smallest signed difference `to - from`, in the interval (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = normalizeAngle(to) - normalizeAngle(from);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Interpolates along the shortest arc. */
export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeAngle(from + angleDelta(from, to) * t);
}

/** Rotates a vector around the origin. Positive angles rotate clockwise on screen (y down). */
export function rotateVec(v: Vec2, deg: number): Vec2 {
  if (deg === 0) return { x: v.x, y: v.y };
  const r = degToRad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function rotateAround(point: Vec2, pivot: Vec2, deg: number): Vec2 {
  const local = rotateVec({ x: point.x - pivot.x, y: point.y - pivot.y }, deg);
  return { x: local.x + pivot.x, y: local.y + pivot.y };
}

/** Unit vector pointing in the given direction (0° = +x / right, 90° = +y / down). */
export function directionVec(deg: number): Vec2 {
  const r = degToRad(deg);
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Snaps an angle to the nearest multiple of `step` degrees. */
export function snapAngle(deg: number, step: number): number {
  if (step <= 0) return normalizeAngle(deg);
  return normalizeAngle(Math.round(deg / step) * step);
}
