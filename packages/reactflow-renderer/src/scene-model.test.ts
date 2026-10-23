import { describe, expect, it } from 'vitest';
import { CatalogSchema, indexCatalog, type ObjectState, type SimulationState } from '@fds/domain';
import { testCatalogInput } from '@fds/domain/testing';
import { buildFlow, CARRIED_SCALE, type SymbolFlowNode } from './scene-model';

const catalog = indexCatalog(
  CatalogSchema.parse({
    ...testCatalogInput,
    symbols: testCatalogInput.symbols?.map((s) =>
      s.id === 'sym.person' ? { ...s, directionMarker: { symbolId: 'sym.blocked', distance: 25 } } : s,
    ),
    equipmentTypes: testCatalogInput.equipmentTypes?.map((e) =>
      e.id === 'et.hose' ? { ...e, form: 'hose', hoseEnds: ['end-a', 'end-b'], depiction: { laidLineStrokeWidth: 2.6, couplingSymbolId: 'sym.blocked' } } : e,
    ),
    roles: testCatalogInput.roles?.map((r) => (r.id === 'role.leader' ? { ...r, symbolId: 'sym.person' } : r)),
  }),
);

function obj(partial: Partial<ObjectState> & Pick<ObjectState, 'id' | 'kind' | 'symbolId'>): ObjectState {
  return { label: undefined, position: { x: 0, y: 0 }, rotation: 0, roleId: null, typeId: null, carriedBy: null, carrying: [], visualState: null, layout: null, ...partial };
}

function stateOf(objects: ObjectState[], connections: SimulationState['connections'] = {}): SimulationState {
  return {
    seq: 0,
    time: 0,
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    objectOrder: objects.map((o) => o.id),
    connections,
    connectionOrder: Object.keys(connections),
    actions: {},
    steps: {},
    completed: false,
  };
}

const node = (nodes: ReturnType<typeof buildFlow>['nodes'], id: string) => nodes.find((n) => n.id === id) as SymbolFlowNode;

describe('scene model', () => {
  it('draws a laid hose as a line between its end ports, with coupling marks', () => {
    const hose = obj({ id: 'h', kind: 'equipment', symbolId: 'sym.hose', typeId: 'et.hose', layout: { a: { x: 0, y: 0 }, b: { x: 300, y: 400 } } });
    const { nodes } = buildFlow({ catalog, state: stateOf([hose]) });
    const n = node(nodes, 'h');
    expect(n.position).toEqual({ x: 150, y: 200 });
    expect(n.data.hose).toMatchObject({ a: { x: 8, y: 8 }, b: { x: 308, y: 408 }, strokeWidth: 2.6, couplingSymbolId: 'sym.blocked' });
    expect(n.data.ports.map((p) => [p.id, p.x, p.y])).toEqual([
      ['end-a', 8, 8],
      ['end-b', 308, 408],
    ]);
    expect(n.draggable).toBe(false);
  });

  it('draws carried items compact beside the carrier and attaches edges to their scaled ports', () => {
    const person = obj({ id: 'p', kind: 'personnel', symbolId: 'sym.person', position: { x: 100, y: 100 }, carrying: ['h'] });
    const hose = obj({ id: 'h', kind: 'equipment', symbolId: 'sym.hose', typeId: 'et.hose', carriedBy: 'p', position: { x: 122, y: 82 }, rotation: 90 });
    const source = obj({ id: 's', kind: 'equipment', symbolId: 'sym.source', typeId: 'et.source', position: { x: 300, y: 100 } });
    const state = stateOf([person, hose, source], { c: { id: 'c', a: { objectId: 's', portId: 'out-1' }, b: { objectId: 'h', portId: 'end-a' } } });
    const { nodes, edges } = buildFlow({ catalog, state });
    const n = node(nodes, 'h');
    // Hose symbol 60×10 at half scale, unrotated; top-left at the carrier's (30×30) right edge + 2 and top edge.
    expect([n.data.width, n.data.height, n.data.rotation]).toEqual([60 * CARRIED_SCALE, 10 * CARRIED_SCALE, 0]);
    const left = 100 + 15 + 2;
    const top = 100 - 15;
    expect(n.position).toEqual({ x: left + 15, y: top + 2.5 });
    expect(edges[0]?.data?.b).toEqual({ x: left, y: top + 5 * CARRIED_SCALE });
  });

  it('draws held items in place, worn items behind the carrier and leaves stored items out', () => {
    const vehicles = indexCatalog(
      CatalogSchema.parse({
        ...testCatalogInput,
        equipmentTypes: testCatalogInput.equipmentTypes?.map((e) =>
          e.id === 'et.hose'
            ? { ...e, carry: 'held' }
            : e.id === 'et.nozzle'
              ? { ...e, depiction: { worn: { symbolId: 'sym.blocked', distance: 33 } } }
              : e.id === 'et.source'
                ? { ...e, container: true }
                : e,
        ),
      }),
    );
    const person = obj({ id: 'p', kind: 'personnel', symbolId: 'sym.person', position: { x: 100, y: 100 }, rotation: 0, carrying: ['h', 'n'] });
    const hose = obj({ id: 'h', kind: 'equipment', symbolId: 'sym.hose', typeId: 'et.hose', carriedBy: 'p', position: { x: 200, y: 120 }, rotation: 90 });
    const nozzle = obj({ id: 'n', kind: 'equipment', symbolId: 'sym.nozzle', typeId: 'et.nozzle', carriedBy: 'p', position: { x: 122, y: 82 } });
    const vehicle = obj({ id: 'v', kind: 'equipment', symbolId: 'sym.source', typeId: 'et.source', position: { x: 300, y: 300 } });
    const inside = obj({ id: 's', kind: 'equipment', symbolId: 'sym.splitter', typeId: 'et.splitter', storedIn: 'v', position: { x: 300, y: 300 } });
    const { nodes } = buildFlow({ catalog: vehicles, state: stateOf([person, hose, nozzle, vehicle, inside]) });
    const h = node(nodes, 'h');
    expect([h.position, h.data.width, h.data.rotation]).toEqual([{ x: 200, y: 120 }, 60, 90]);
    const n = node(nodes, 'n');
    expect(n.data.symbolId).toBe('sym.blocked');
    expect(n.position).toEqual({ x: 100 - 33, y: 100 });
    expect(n.data.rotation).toBe(90);
    expect(nodes.some((x) => x.id === 's')).toBe(false);
    expect(node(nodes, 'v').data.stored).toBe(1);
  });

  it('shows facing markers instead of rotating personnel and hides redundant role badges', () => {
    const leader = obj({ id: 'l', kind: 'personnel', symbolId: 'sym.person', roleId: 'role.leader', position: { x: 50, y: 50 }, rotation: 90 });
    const member = obj({ id: 'm', kind: 'personnel', symbolId: 'sym.person', roleId: 'role.member', position: { x: 150, y: 50 } });
    const { nodes } = buildFlow({ catalog, state: stateOf([leader, member]), roleLabel: (id) => id });
    const l = node(nodes, 'l');
    expect(l.data.fixedBody).toBe(true);
    expect(l.data.marker).toMatchObject({ symbolId: 'sym.blocked', rotation: 90 });
    expect(l.data.marker?.x).toBeCloseTo(15);
    expect(l.data.marker?.y).toBeCloseTo(15 + 25);
    expect(l.data.roleLabel).toBeUndefined();
    expect(node(nodes, 'm').data.roleLabel).toBe('role.member');
  });
});
