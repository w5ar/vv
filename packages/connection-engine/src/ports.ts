import type { CatalogIndex, Id, PortDefinition, PortRef, SymbolDefinition } from '@fds/domain';
import {
  centerPivot,
  localDirectionToWorld,
  localToWorld,
  normalizeAngle,
  type Placement,
  type Vec2,
} from '@fds/geometry';

/** Minimal view of a placed object needed for port geometry. */
export interface PlacedObject {
  readonly id: Id;
  readonly symbolId: Id;
  readonly position: Vec2;
  readonly rotation: number;
  /** Equipment type (needed for hoses). */
  readonly typeId?: Id | null | undefined;
  /** Laid hose: world positions of end A and end B. */
  readonly layout?: { readonly a: Vec2; readonly b: Vec2 } | null | undefined;
}

/** Placement of a laid hose: a rectangle stretched from end A to end B. */
export function layoutPlacement(symbol: SymbolDefinition, layout: { a: Vec2; b: Vec2 }): Placement {
  const length = Math.max(1, Math.hypot(layout.b.x - layout.a.x, layout.b.y - layout.a.y));
  const size = { width: length, height: symbol.size.height };
  return {
    position: { x: (layout.a.x + layout.b.x) / 2, y: (layout.a.y + layout.b.y) / 2 },
    rotation: normalizeAngle((Math.atan2(layout.b.y - layout.a.y, layout.b.x - layout.a.x) * 180) / Math.PI),
    size,
    pivot: { x: length / 2, y: symbol.size.height / 2 },
  };
}

function hoseEnd(index: CatalogIndex, obj: PlacedObject, portId: Id): 'a' | 'b' | null {
  if (!obj.layout || !obj.typeId) return null;
  const ends = index.equipmentTypes.get(obj.typeId)?.hoseEnds;
  if (!ends) return null;
  return ends[0] === portId ? 'a' : ends[1] === portId ? 'b' : null;
}

export interface PortWorld {
  readonly ref: PortRef;
  readonly def: PortDefinition;
  readonly position: Vec2;
  /** World direction in degrees, when the port defines one. */
  readonly direction: number | undefined;
}

export function symbolPivot(symbol: SymbolDefinition): Vec2 {
  return symbol.pivot ?? centerPivot(symbol.size);
}

export function placementOf(symbol: SymbolDefinition, position: Vec2, rotation: number): Placement {
  return { position, rotation, size: symbol.size, pivot: symbolPivot(symbol) };
}

export function objectPlacement(index: CatalogIndex, obj: PlacedObject): Placement | null {
  const symbol = index.symbols.get(obj.symbolId);
  if (!symbol) return null;
  if (obj.layout) return layoutPlacement(symbol, obj.layout);
  return placementOf(symbol, obj.position, obj.rotation);
}

function portOf(index: CatalogIndex, obj: PlacedObject, symbol: SymbolDefinition, placement: Placement, def: PortDefinition): PortWorld {
  const end = hoseEnd(index, obj, def.id);
  if (end && obj.layout) {
    // Laid hose: end ports sit exactly at the layout endpoints, facing away from the hose.
    const dir = placement.rotation;
    return { ref: { objectId: obj.id, portId: def.id }, def, position: obj.layout[end], direction: end === 'a' ? normalizeAngle(dir + 180) : dir };
  }
  const local = obj.layout ? { x: (def.position.x / symbol.size.width) * placement.size.width, y: def.position.y } : def.position;
  return {
    ref: { objectId: obj.id, portId: def.id },
    def,
    position: localToWorld(placement, local),
    direction: def.direction === undefined ? undefined : localDirectionToWorld(placement, def.direction),
  };
}

/** World position of one port, honouring the object's rotation, pivot and hose layout. */
export function portWorld(index: CatalogIndex, obj: PlacedObject, portId: Id): PortWorld | null {
  const symbol = index.symbols.get(obj.symbolId);
  if (!symbol) return null;
  const def = symbol.ports.find((p) => p.id === portId);
  if (!def) return null;
  const placement = objectPlacement(index, obj) as Placement;
  return portOf(index, obj, symbol, placement, def);
}

/** World positions of all ports of an object. */
export function objectPorts(index: CatalogIndex, obj: PlacedObject): PortWorld[] {
  const symbol = index.symbols.get(obj.symbolId);
  if (!symbol) return [];
  const placement = objectPlacement(index, obj) as Placement;
  return symbol.ports.map((def) => portOf(index, obj, symbol, placement, def));
}

/** World position of a named anchor (or the pivot for `pivot`). */
export function anchorWorld(index: CatalogIndex, obj: PlacedObject, anchorId: Id): Vec2 | null {
  const symbol = index.symbols.get(obj.symbolId);
  if (!symbol) return null;
  if (anchorId === 'pivot') return obj.position;
  const anchor = symbol.anchors.find((a) => a.id === anchorId);
  if (!anchor) return null;
  return localToWorld(placementOf(symbol, obj.position, obj.rotation), anchor.position);
}
