import { describe, expect, it } from 'vitest';
import { indexCatalog, type Connection } from '@fds/domain';
import { makeTestCatalog } from '@fds/domain/testing';
import {
  checkPortTypeCompatibility,
  compatiblePortTypes,
  connectedComponent,
  connectionEndpoints,
  connectionIdFor,
  evaluateTargets,
  findSnap,
  portWorld,
  validateConnection,
  type ConnectionWorld,
  type PlacedObject,
} from './index';

const index = indexCatalog(makeTestCatalog());

function world(objects: PlacedObject[], connections: Connection[] = []): ConnectionWorld {
  return {
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    objectOrder: objects.map((o) => o.id),
    connections,
  };
}

const source: PlacedObject = { id: 'source', symbolId: 'sym.source', position: { x: 100, y: 100 }, rotation: 0 };
const hose: PlacedObject = { id: 'hose', symbolId: 'sym.hose', position: { x: 300, y: 100 }, rotation: 0 };
const hose2: PlacedObject = { id: 'hose2', symbolId: 'sym.hose', position: { x: 300, y: 200 }, rotation: 0 };
const splitter: PlacedObject = { id: 'splitter', symbolId: 'sym.splitter', position: { x: 400, y: 100 }, rotation: 0 };
const nozzle: PlacedObject = { id: 'nozzle', symbolId: 'sym.nozzle', position: { x: 500, y: 100 }, rotation: 0 };
const blocked: PlacedObject = { id: 'blocked', symbolId: 'sym.blocked', position: { x: 600, y: 100 }, rotation: 0 };

describe('port coordinate transformation', () => {
  it('places ports relative to the pivot without rotation', () => {
    const p = portWorld(index, source, 'out-1');
    // source is 80x40 with centre pivot at (100,100): local (80,10) -> world (140, 90)
    expect(p?.position).toEqual({ x: 140, y: 90 });
    expect(p?.direction).toBe(0);
  });

  it('rotates ports and their directions with the object', () => {
    const rotated = { ...hose, rotation: 90 };
    const a = portWorld(index, rotated, 'end-a');
    const b = portWorld(index, rotated, 'end-b');
    // hose 60x10, end-a at local (0,5) = 30 left of pivot; after +90° it is 30 above.
    expect(a?.position.x).toBeCloseTo(300, 9);
    expect(a?.position.y).toBeCloseTo(70, 9);
    expect(b?.position.y).toBeCloseTo(130, 9);
    expect(a?.direction).toBe(270);
    expect(b?.direction).toBe(90);
  });

  it('returns null for unknown ports or symbols', () => {
    expect(portWorld(index, source, 'nope')).toBeNull();
    expect(portWorld(index, { ...source, symbolId: 'missing' }, 'out-1')).toBeNull();
  });
});

describe('port compatibility', () => {
  it('requires an explicit allow rule', () => {
    expect(checkPortTypeCompatibility(index.connectionRules, 'pt.large', 'pt.large').compatible).toBe(true);
    const v = checkPortTypeCompatibility(index.connectionRules, 'pt.large', 'pt.small');
    expect(v).toEqual({ compatible: false, reason: 'no-rule' });
  });

  it('lets deny rules win over allow rules regardless of order', () => {
    const v = checkPortTypeCompatibility(index.connectionRules, 'pt.small', 'pt.blocked');
    expect(v.compatible).toBe(false);
    expect(v.compatible === false && v.reason).toBe('denied');
  });

  it('lists compatible types', () => {
    expect(compatiblePortTypes(index.connectionRules, 'pt.small')).toEqual(['pt.small']);
  });
});

describe('connection constraints', () => {
  const w = world([source, hose, hose2, splitter, nozzle, blocked]);

  it('accepts compatible free ports', () => {
    expect(validateConnection(index, w, { objectId: 'source', portId: 'out-1' }, { objectId: 'hose', portId: 'end-a' })).toEqual([]);
  });

  it('rejects incompatible port types', () => {
    const issues = validateConnection(index, w, { objectId: 'hose', portId: 'end-b' }, { objectId: 'nozzle', portId: 'in' });
    expect(issues.map((i) => i.code)).toEqual(['connection.incompatible']);
  });

  it('rejects explicitly denied combinations with the rule message', () => {
    const issues = validateConnection(index, w, { objectId: 'nozzle', portId: 'in' }, { objectId: 'blocked', portId: 'x' });
    expect(issues[0]?.code).toBe('connection.denied');
    expect(issues[0]?.ruleId).toBe('rule.small-blocked-deny');
    expect(issues[0]?.message).toBe('Testno pravilo zabrane.');
  });

  it('enforces max connections per port', () => {
    const c: Connection = { id: 'c1', a: { objectId: 'source', portId: 'out-1' }, b: { objectId: 'hose', portId: 'end-a' } };
    const w2 = world([source, hose, hose2], [c]);
    const issues = validateConnection(index, w2, { objectId: 'source', portId: 'out-1' }, { objectId: 'hose2', portId: 'end-a' });
    expect(issues.map((i) => i.code)).toEqual(['connection.port-full']);
  });

  it('rejects duplicates, self connections and unknown references', () => {
    const c: Connection = { id: 'c1', a: { objectId: 'source', portId: 'out-1' }, b: { objectId: 'hose', portId: 'end-a' } };
    const w2 = world([source, hose], [c]);
    expect(validateConnection(index, w2, { objectId: 'hose', portId: 'end-a' }, { objectId: 'source', portId: 'out-1' })[0]?.code).toBe(
      'connection.duplicate',
    );
    expect(validateConnection(index, w2, { objectId: 'hose', portId: 'end-a' }, { objectId: 'hose', portId: 'end-b' })[0]?.code).toBe(
      'connection.same-object',
    );
    expect(validateConnection(index, w2, { objectId: 'ghost', portId: 'x' }, { objectId: 'hose', portId: 'end-b' })[0]?.code).toBe(
      'connection.unknown-object',
    );
    expect(validateConnection(index, w2, { objectId: 'hose', portId: 'zzz' }, { objectId: 'source', portId: 'out-2' })[0]?.code).toBe(
      'connection.unknown-port',
    );
  });

  it('applies an optional distance limit', () => {
    const issues = validateConnection(
      index,
      w,
      { objectId: 'source', portId: 'out-1' },
      { objectId: 'hose', portId: 'end-a' },
      { maxDistance: 50 },
    );
    expect(issues.map((i) => i.code)).toEqual(['connection.too-far']);
  });
});

describe('target highlighting and snapping', () => {
  it('marks only compatible free ports as valid targets', () => {
    const w = world([source, hose, splitter, nozzle]);
    const targets = evaluateTargets(index, w, { objectId: 'nozzle', portId: 'in' });
    const valid = targets.filter((t) => t.valid).map((t) => `${t.port.ref.objectId}#${t.port.ref.portId}`);
    expect(valid).toEqual(['splitter#out-a', 'splitter#out-b']);
  });

  it('snaps a dragged object so that compatible ports coincide', () => {
    const w = world([source, hose]);
    // source out-1 is at (140, 90). Hose end-a is 30 left of the hose pivot.
    // Proposing the hose at (175, 95) puts end-a at (145, 95): within 10 of out-1.
    const snap = findSnap(index, w, 'hose', { x: 175, y: 95 }, 10);
    expect(snap?.ownPort).toEqual({ objectId: 'hose', portId: 'end-a' });
    expect(snap?.targetPort).toEqual({ objectId: 'source', portId: 'out-1' });
    expect(snap?.position).toEqual({ x: 170, y: 90 });
  });

  it('does not snap to incompatible or occupied ports', () => {
    const w = world([splitter, hose]);
    // splitter out-a (small) at (420, 90); hose end-a (large) placed nearby
    expect(findSnap(index, w, 'hose', { x: 452, y: 95 }, 10)).toBeNull();
  });

  it('recomputes endpoints after rotation', () => {
    const c: Connection = { id: 'c1', a: { objectId: 'source', portId: 'out-1' }, b: { objectId: 'hose', portId: 'end-a' } };
    const w = world([source, { ...hose, rotation: 180 }], [c]);
    const ends = connectionEndpoints(index, w, c);
    // rotated 180°, end-a moves to the right side of the hose
    expect(ends?.b.position.x).toBeCloseTo(330, 9);
    expect(ends?.b.position.y).toBeCloseTo(100, 9);
  });
});

describe('graph helpers', () => {
  it('derives deterministic connection ids independent of endpoint order', () => {
    const a = { objectId: 'x', portId: 'p' };
    const b = { objectId: 'y', portId: 'q' };
    expect(connectionIdFor(a, b)).toBe(connectionIdFor(b, a));
    expect(connectionIdFor(a, b)).toBe('conn:x.p--y.q');
  });

  it('finds connected components', () => {
    const conns: Connection[] = [
      { id: '1', a: { objectId: 'a', portId: 'p' }, b: { objectId: 'b', portId: 'p' } },
      { id: '2', a: { objectId: 'b', portId: 'q' }, b: { objectId: 'c', portId: 'p' } },
      { id: '3', a: { objectId: 'd', portId: 'p' }, b: { objectId: 'e', portId: 'p' } },
    ];
    expect([...connectedComponent(conns, 'a')].sort()).toEqual(['a', 'b', 'c']);
  });
});
