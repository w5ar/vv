import { normalizeAngle, rotateVec } from './angle';
import { distanceSq, dot, sub, type Size, type Vec2 } from './vec';

/** Axis-aligned rectangle; (x, y) is the top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Placement of a rectangular symbol in world space.
 *
 * - `size` is the logical size of the symbol in local units.
 * - `pivot` is the local point (relative to the symbol's top-left corner) that
 *   is placed at `position` and around which the symbol rotates.
 */
export interface Placement {
  readonly position: Vec2;
  readonly rotation: number;
  readonly size: Size;
  readonly pivot: Vec2;
}

export function centerPivot(size: Size): Vec2 {
  return { x: size.width / 2, y: size.height / 2 };
}

/** Transforms a point from symbol-local coordinates into world coordinates. */
export function localToWorld(placement: Placement, local: Vec2): Vec2 {
  const rotated = rotateVec(sub(local, placement.pivot), placement.rotation);
  return { x: placement.position.x + rotated.x, y: placement.position.y + rotated.y };
}

/** Inverse of {@link localToWorld}. */
export function worldToLocal(placement: Placement, world: Vec2): Vec2 {
  const unrotated = rotateVec(sub(world, placement.position), -placement.rotation);
  return { x: unrotated.x + placement.pivot.x, y: unrotated.y + placement.pivot.y };
}

/** Converts a local direction (degrees) into a world direction. */
export function localDirectionToWorld(placement: Placement, deg: number): number {
  return normalizeAngle(deg + placement.rotation);
}

export function placementCorners(placement: Placement): [Vec2, Vec2, Vec2, Vec2] {
  const { width, height } = placement.size;
  return [
    localToWorld(placement, { x: 0, y: 0 }),
    localToWorld(placement, { x: width, y: 0 }),
    localToWorld(placement, { x: width, y: height }),
    localToWorld(placement, { x: 0, y: height }),
  ];
}

export function boundsOfPoints(points: readonly Vec2[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** World-space axis-aligned bounds of a (possibly rotated) placement. */
export function placementBounds(placement: Placement): Rect {
  return boundsOfPoints(placementCorners(placement));
}

export function rectContains(rect: Rect, p: Vec2): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

/** True when the rectangles share interior area (touching edges do not count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function rectUnion(rects: readonly Rect[]): Rect {
  const points: Vec2[] = [];
  for (const r of rects) {
    points.push({ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height });
  }
  return boundsOfPoints(points);
}

export function expandRect(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin };
}

export function rectCenter(rect: Rect): Vec2 {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Hit test against the rotated symbol rectangle. */
export function placementContainsPoint(placement: Placement, world: Vec2): boolean {
  const local = worldToLocal(placement, world);
  const eps = 1e-9;
  return (
    local.x >= -eps &&
    local.y >= -eps &&
    local.x <= placement.size.width + eps &&
    local.y <= placement.size.height + eps
  );
}

function projectOnto(points: readonly Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const d = dot(p, axis);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * Oriented-rectangle intersection using the separating axis theorem.
 * Touching edges are not counted as overlap.
 */
export function placementsOverlap(a: Placement, b: Placement): boolean {
  const ca = placementCorners(a);
  const cb = placementCorners(b);
  const axes: Vec2[] = [
    sub(ca[1], ca[0]),
    sub(ca[3], ca[0]),
    sub(cb[1], cb[0]),
    sub(cb[3], cb[0]),
  ];
  for (const axis of axes) {
    if (axis.x === 0 && axis.y === 0) continue;
    const [minA, maxA] = projectOnto(ca, axis);
    const [minB, maxB] = projectOnto(cb, axis);
    const eps = 1e-9 * Math.max(1, Math.abs(maxA), Math.abs(maxB));
    if (maxA <= minB + eps || maxB <= minA + eps) return false;
  }
  return true;
}

export interface NearestResult<T> {
  readonly item: T;
  readonly distance: number;
}

/** Returns items within `maxDistance` of `point`, nearest first. Ties keep input order (stable). */
export function nearestWithin<T>(
  items: readonly T[],
  pointOf: (item: T) => Vec2,
  point: Vec2,
  maxDistance: number,
): NearestResult<T>[] {
  const maxSq = maxDistance * maxDistance;
  const found: { item: T; dSq: number; index: number }[] = [];
  items.forEach((item, index) => {
    const dSq = distanceSq(pointOf(item), point);
    if (dSq <= maxSq) found.push({ item, dSq, index });
  });
  found.sort((x, y) => x.dSq - y.dSq || x.index - y.index);
  return found.map((f) => ({ item: f.item, distance: Math.sqrt(f.dSq) }));
}

/** Distance from a world point to the (rotated) symbol rectangle; 0 when inside. */
export function distanceToPlacement(placement: Placement, world: Vec2): number {
  const local = worldToLocal(placement, world);
  const cx = Math.min(Math.max(local.x, 0), placement.size.width);
  const cy = Math.min(Math.max(local.y, 0), placement.size.height);
  return Math.hypot(local.x - cx, local.y - cy);
}
