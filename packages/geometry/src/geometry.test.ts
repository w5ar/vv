import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  lerpAngle,
  localToWorld,
  nearestWithin,
  normalizeAngle,
  placementBounds,
  placementContainsPoint,
  placementsOverlap,
  rectsIntersect,
  rotateVec,
  snapAngle,
  worldToLocal,
  type Placement,
} from './index';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('angles', () => {
  it('normalizes into [0, 360)', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(720)).toBe(0);
    expect(normalizeAngle(-0)).toBe(0);
    expect(Object.is(normalizeAngle(-360), 0)).toBe(true);
  });

  it('computes shortest signed delta and interpolates along it', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    close(lerpAngle(350, 10, 0.5), 0);
  });

  it('rotates clockwise on screen for positive angles (y down)', () => {
    const v = rotateVec({ x: 1, y: 0 }, 90);
    close(v.x, 0);
    close(v.y, 1);
  });

  it('snaps to angle steps', () => {
    expect(snapAngle(44, 90)).toBe(0);
    expect(snapAngle(46, 90)).toBe(90);
    expect(snapAngle(-46, 90)).toBe(270);
  });
});

describe('placements', () => {
  const p: Placement = { position: { x: 100, y: 100 }, rotation: 90, size: { width: 40, height: 20 }, pivot: { x: 20, y: 10 } };

  it('transforms local points with rotation around the pivot', () => {
    // right-middle edge (40,10) is 20 units right of pivot; after +90° it is 20 units below.
    const w = localToWorld(p, { x: 40, y: 10 });
    close(w.x, 100);
    close(w.y, 120);
    const back = worldToLocal(p, w);
    close(back.x, 40);
    close(back.y, 10);
  });

  it('computes rotated axis-aligned bounds', () => {
    const b = placementBounds(p);
    close(b.width, 20);
    close(b.height, 40);
    close(b.x, 90);
    close(b.y, 80);
  });

  it('hit tests in local space', () => {
    expect(placementContainsPoint(p, { x: 100, y: 118 })).toBe(true);
    expect(placementContainsPoint(p, { x: 118, y: 100 })).toBe(false);
  });

  it('detects oriented overlap with SAT and ignores touching edges', () => {
    const a: Placement = { position: { x: 0, y: 0 }, rotation: 0, size: { width: 10, height: 10 }, pivot: { x: 5, y: 5 } };
    const touching: Placement = { ...a, position: { x: 10, y: 0 } };
    const overlapping: Placement = { ...a, position: { x: 9, y: 0 } };
    const rotatedNear: Placement = { ...a, position: { x: 12, y: 0 }, rotation: 45 };
    expect(placementsOverlap(a, touching)).toBe(false);
    expect(placementsOverlap(a, overlapping)).toBe(true);
    // A 45° rotated square reaches ~7.07 from its centre, so at distance 12 it overlaps the edge at 5.
    expect(placementsOverlap(a, rotatedNear)).toBe(true);
    expect(placementsOverlap(a, { ...rotatedNear, position: { x: 13, y: 0 } })).toBe(false);
  });

  it('intersects rectangles strictly', () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
  });
});

describe('proximity', () => {
  it('returns items within distance, nearest first, stable for ties', () => {
    const items = [
      { id: 'a', p: { x: 5, y: 0 } },
      { id: 'b', p: { x: 1, y: 0 } },
      { id: 'c', p: { x: 0, y: 1 } },
      { id: 'd', p: { x: 50, y: 0 } },
    ];
    const found = nearestWithin(items, (i) => i.p, { x: 0, y: 0 }, 10).map((r) => r.item.id);
    expect(found).toEqual(['b', 'c', 'a']);
  });
});
