import { portRefKey, type CatalogIndex, type Connection, type Id, type Issue, type PortRef } from '@fds/domain';
import { add, distance, sub, type Vec2 } from '@fds/geometry';
import { checkPortTypeCompatibility } from './compatibility';
import { objectPorts, portWorld, type PlacedObject, type PortWorld } from './ports';

/** Snapshot of objects and logical connections the connection engine operates on. */
export interface ConnectionWorld {
  readonly objects: Readonly<Record<Id, PlacedObject>>;
  readonly objectOrder: readonly Id[];
  readonly connections: readonly Connection[];
}

export interface ConnectionOptions {
  /** When set, both ports must be within this world distance. */
  readonly maxDistance?: number | null | undefined;
}

function sameRef(a: PortRef, b: PortRef): boolean {
  return a.objectId === b.objectId && a.portId === b.portId;
}

export function connectionsAtPort(connections: readonly Connection[], ref: PortRef): Connection[] {
  return connections.filter((c) => sameRef(c.a, ref) || sameRef(c.b, ref));
}

export function connectionsOfObject(connections: readonly Connection[], objectId: Id): Connection[] {
  return connections.filter((c) => c.a.objectId === objectId || c.b.objectId === objectId);
}

/** The other end of a connection, seen from `ref`. */
export function otherEnd(connection: Connection, ref: PortRef): PortRef | null {
  if (sameRef(connection.a, ref)) return connection.b;
  if (sameRef(connection.b, ref)) return connection.a;
  return null;
}

/** Deterministic connection id derived from the (sorted) endpoints. */
export function connectionIdFor(a: PortRef, b: PortRef): Id {
  const [x, y] = [portRefKey(a), portRefKey(b)].sort();
  return `conn:${x}--${y}`.replace(/#/g, '.');
}

function issue(code: string, message: string, refs: PortRef[], extra: Partial<Issue> = {}): Issue {
  return {
    code,
    severity: 'error',
    message,
    objectIds: [...new Set(refs.map((r) => r.objectId))],
    portKeys: refs.map(portRefKey),
    ...extra,
  };
}

function resolvePort(index: CatalogIndex, world: ConnectionWorld, ref: PortRef, issues: Issue[]): PortWorld | null {
  const obj = world.objects[ref.objectId];
  if (!obj) {
    issues.push(issue('connection.unknown-object', `Objekt „${ref.objectId}” ne postoji.`, [ref]));
    return null;
  }
  const port = portWorld(index, obj, ref.portId);
  if (!port) {
    issues.push(issue('connection.unknown-port', `Objekt „${ref.objectId}” nema priključak „${ref.portId}”.`, [ref]));
    return null;
  }
  return port;
}

function portLabel(index: CatalogIndex, port: PortWorld): string {
  const typeName = index.portTypes.get(port.def.type)?.name ?? port.def.type;
  return `${port.def.label ?? port.ref.portId} (${typeName})`;
}

/**
 * Validates a proposed connection against declared rules and constraints:
 * existence, self-connection, duplicates, port-type compatibility,
 * maximum connections per port and an optional distance limit.
 */
export function validateConnection(
  index: CatalogIndex,
  world: ConnectionWorld,
  a: PortRef,
  b: PortRef,
  options: ConnectionOptions = {},
): Issue[] {
  const issues: Issue[] = [];
  const pa = resolvePort(index, world, a, issues);
  const pb = resolvePort(index, world, b, issues);
  if (!pa || !pb) return issues;

  if (a.objectId === b.objectId) {
    issues.push(issue('connection.same-object', 'Priključci istog objekta ne mogu se međusobno spojiti.', [a, b]));
    return issues;
  }

  if (world.connections.some((c) => (sameRef(c.a, a) && sameRef(c.b, b)) || (sameRef(c.a, b) && sameRef(c.b, a)))) {
    issues.push(issue('connection.duplicate', 'Ovi priključci su već spojeni.', [a, b]));
    return issues;
  }

  const verdict = checkPortTypeCompatibility(index.connectionRules, pa.def.type, pb.def.type);
  if (!verdict.compatible) {
    if (verdict.reason === 'denied') {
      issues.push(
        issue(
          'connection.denied',
          verdict.rule.message ?? `Spajanje ${portLabel(index, pa)} i ${portLabel(index, pb)} izričito je zabranjeno.`,
          [a, b],
          { ruleId: verdict.rule.id },
        ),
      );
    } else {
      issues.push(
        issue(
          'connection.incompatible',
          `Priključci ${portLabel(index, pa)} i ${portLabel(index, pb)} nisu kompatibilni (nema deklariranog pravila).`,
          [a, b],
        ),
      );
    }
  }

  for (const p of [pa, pb]) {
    const used = connectionsAtPort(world.connections, p.ref).length;
    if (used >= p.def.maxConnections) {
      issues.push(
        issue(
          'connection.port-full',
          `Priključak ${portLabel(index, p)} već ima najveći dopušteni broj spojeva (${p.def.maxConnections}).`,
          [p.ref],
        ),
      );
    }
  }

  const maxDistance = options.maxDistance;
  if (maxDistance != null) {
    const d = distance(pa.position, pb.position);
    if (d > maxDistance) {
      issues.push(
        issue(
          'connection.too-far',
          `Priključci su predaleko (${Math.round(d)} > ${Math.round(maxDistance)}).`,
          [a, b],
        ),
      );
    }
  }
  return issues;
}

export interface TargetCandidate {
  readonly port: PortWorld;
  readonly valid: boolean;
  readonly issues: Issue[];
  readonly distance: number;
}

/**
 * Evaluates every port in the world as a potential target for `source`.
 * Used to highlight valid connection targets while the user drags a connection.
 */
export function evaluateTargets(
  index: CatalogIndex,
  world: ConnectionWorld,
  source: PortRef,
  options: ConnectionOptions = {},
): TargetCandidate[] {
  const sourceObj = world.objects[source.objectId];
  const sourcePort = sourceObj ? portWorld(index, sourceObj, source.portId) : null;
  if (!sourcePort) return [];
  const out: TargetCandidate[] = [];
  for (const id of world.objectOrder) {
    if (id === source.objectId) continue;
    const obj = world.objects[id];
    if (!obj) continue;
    for (const port of objectPorts(index, obj)) {
      const issues = validateConnection(index, world, source, port.ref, options);
      out.push({ port, valid: issues.length === 0, issues, distance: distance(sourcePort.position, port.position) });
    }
  }
  return out;
}

export interface SnapResult {
  /** Port on the moving object. */
  readonly ownPort: PortRef;
  /** Port on another object it snaps to. */
  readonly targetPort: PortRef;
  /** Adjusted object position that makes the two ports coincide. */
  readonly position: Vec2;
  readonly distance: number;
}

/**
 * Finds the best snap for an object being dragged to `proposedPosition`:
 * the nearest pair (own port, other object's port) that is compatible, has
 * free capacity and lies within `snapDistance`. Ties resolve deterministically
 * in object/port declaration order.
 */
export function findSnap(
  index: CatalogIndex,
  world: ConnectionWorld,
  objectId: Id,
  proposedPosition: Vec2,
  snapDistance: number,
): SnapResult | null {
  const moving = world.objects[objectId];
  if (!moving || snapDistance <= 0) return null;
  const movedWorld: ConnectionWorld = {
    ...world,
    objects: { ...world.objects, [objectId]: { ...moving, position: proposedPosition } },
  };
  const own = objectPorts(index, movedWorld.objects[objectId] as PlacedObject);
  let best: SnapResult | null = null;
  for (const ownPort of own) {
    for (const id of world.objectOrder) {
      if (id === objectId) continue;
      const other = world.objects[id];
      if (!other) continue;
      for (const target of objectPorts(index, other)) {
        const d = distance(ownPort.position, target.position);
        if (d > snapDistance || (best && d >= best.distance)) continue;
        if (validateConnection(index, movedWorld, ownPort.ref, target.ref).length > 0) continue;
        best = {
          ownPort: ownPort.ref,
          targetPort: target.ref,
          position: add(proposedPosition, sub(target.position, ownPort.position)),
          distance: d,
        };
      }
    }
  }
  return best;
}

/** World endpoints of a logical connection (used to draw it). */
export function connectionEndpoints(
  index: CatalogIndex,
  world: Pick<ConnectionWorld, 'objects'>,
  connection: Connection,
): { a: PortWorld; b: PortWorld } | null {
  const oa = world.objects[connection.a.objectId];
  const ob = world.objects[connection.b.objectId];
  if (!oa || !ob) return null;
  const a = portWorld(index, oa, connection.a.portId);
  const b = portWorld(index, ob, connection.b.portId);
  return a && b ? { a, b } : null;
}

/** Ids of objects reachable from `start` through logical connections (including `start`). */
export function connectedComponent(connections: readonly Connection[], start: Id): Set<Id> {
  const adjacency = new Map<Id, Id[]>();
  const link = (from: Id, to: Id) => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const c of connections) {
    link(c.a.objectId, c.b.objectId);
    link(c.b.objectId, c.a.objectId);
  }
  const seen = new Set<Id>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift() as Id;
    for (const next of adjacency.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
