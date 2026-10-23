import type { CatalogIndex, Id, PortDefinition, PortRef, SymbolDefinition } from '@fds/domain';
import {
  centerPivot,
  localDirectionToWorld,
  localToWorld,
  type Placement,
  type Vec2,
} from '@fds/geometry';

/** Minimal view of a placed object needed for port geometry. */
export interface PlacedObject {
  readonly id: Id;
  readonly symbolId: Id;
  readonly position: Vec2;
  readonly rotation: number;
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
  return placementOf(symbol, obj.position, obj.rotation);
}

/** World position of one port, honouring the object's rotation and pivot. */
export function portWorld(index: CatalogIndex, obj: PlacedObject, portId: Id): PortWorld | null {
  const symbol = index.symbols.get(obj.symbolId);
  if (!symbol) return null;
  const def = symbol.ports.find((p) => p.id === portId);
  if (!def) return null;
  const placement = placementOf(symbol, obj.position, obj.rotation);
  return {
    ref: { objectId: obj.id, portId },
    def,
    position: localToWorld(placement, def.position),
    direction: def.direction === undefined ? undefined : localDirectionToWorld(placement, def.direction),
  };
}

/** World positions of all ports of an object. */
export function objectPorts(index: CatalogIndex, obj: PlacedObject): PortWorld[] {
  const symbol = index.symbols.get(obj.symbolId);
  if (!symbol) return [];
  const placement = placementOf(symbol, obj.position, obj.rotation);
  return symbol.ports.map((def) => ({
    ref: { objectId: obj.id, portId: def.id },
    def,
    position: localToWorld(placement, def.position),
    direction: def.direction === undefined ? undefined : localDirectionToWorld(placement, def.direction),
  }));
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
