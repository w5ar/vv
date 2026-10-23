import { objectPorts, placementOf, portWorld, type PlacedObject } from '@fds/connection-engine';
import {
  portRefKey,
  type Annotation,
  type CatalogIndex,
  type Connection,
  type HoseLayout,
  type Id,
  type ObjectState,
  type SimulationState,
  type Zone,
} from '@fds/domain';
import { localToWorld, sub, type Vec2 } from '@fds/geometry';
import { Position, type Edge, type Node, type NodeHandle } from '@xyflow/react';

/**
 * Pure mapping from domain state to React Flow nodes and edges. React Flow
 * never owns authoritative data: every render derives nodes/edges from the
 * simulation state plus display-only overrides (drag preview, animation).
 */

export type PortHighlight = 'source' | 'valid' | 'invalid';
export type ObjectHighlight = 'active' | 'acting' | 'invalid' | 'hint';

export interface VisualOverride {
  readonly position?: Vec2 | undefined;
  readonly rotation?: number | undefined;
  readonly layout?: HoseLayout | undefined;
}

export interface SceneView {
  readonly catalog: CatalogIndex;
  readonly state: SimulationState;
  readonly zones?: readonly Zone[];
  readonly annotations?: readonly Annotation[];
  readonly overrides?: Readonly<Record<Id, VisualOverride>>;
  readonly pendingConnections?: readonly { connection: Connection; progress: number }[];
  readonly fadingConnections?: Readonly<Record<Id, number>>;
  readonly selectedIds?: ReadonlySet<Id>;
  readonly selectedConnectionId?: Id | null;
  readonly highlights?: ReadonlyMap<Id, ObjectHighlight>;
  readonly portHighlights?: ReadonlyMap<string, PortHighlight>;
  readonly highlightedZoneIds?: ReadonlySet<Id>;
  /** Display name of a role id (badge on personnel). */
  readonly roleLabel?: (roleId: Id) => string;
  readonly draggable?: (obj: ObjectState) => boolean;
  readonly connectable?: boolean;
  readonly showPortLabels?: boolean;
}

export interface PortHandleData {
  readonly id: Id;
  readonly key: string;
  readonly label: string;
  readonly typeName: string;
  /** Centre relative to the node's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly connected: boolean;
  readonly highlight: PortHighlight | null;
}

/** Laid hose drawn as a line inside the node box (coordinates relative to the box's top-left corner). */
export interface HoseLineData {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly strokeWidth: number;
  /** Line angle in degrees (for coupling ticks). */
  readonly angle: number;
  readonly couplingSymbolId?: Id | undefined;
  readonly couplingSize?: { width: number; height: number } | undefined;
}

/** Facing marker drawn next to a personnel symbol instead of rotating the body. */
export interface DirectionMarkerData {
  readonly symbolId: Id;
  readonly width: number;
  readonly height: number;
  /** Marker centre relative to the node's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export interface SymbolNodeData extends Record<string, unknown> {
  readonly objectId: Id;
  readonly kind: ObjectState['kind'];
  readonly symbolId: Id;
  readonly name: string;
  readonly label?: string | undefined;
  readonly roleLabel?: string | undefined;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly visualState: Id | null;
  readonly ports: readonly PortHandleData[];
  readonly carried: boolean;
  readonly highlight: ObjectHighlight | null;
  readonly connectable: boolean;
  readonly showPortLabels: boolean;
  /** Body is not rotated (e.g. personnel whose facing is shown by a marker). */
  readonly fixedBody?: boolean | undefined;
  readonly hose?: HoseLineData | undefined;
  readonly marker?: DirectionMarkerData | undefined;
  /** Containers (vehicles): number of items stored in their compartments. */
  readonly stored?: number | undefined;
}

export interface ZoneNodeData extends Record<string, unknown> {
  readonly name: string;
  readonly shape: 'rect' | 'circle';
  readonly width: number;
  readonly height: number;
  readonly highlighted: boolean;
}

export interface NoteNodeData extends Record<string, unknown> {
  readonly text: string;
  readonly fontSize: number;
}

export interface ConnectionEdgeData extends Record<string, unknown> {
  readonly a: Vec2;
  readonly b: Vec2;
  /** 0..1 — partial drawing for connections being created in a demonstration. */
  readonly progress: number;
  readonly opacity: number;
  readonly pending: boolean;
}

export type SymbolFlowNode = Node<SymbolNodeData, 'symbol'>;
export type ZoneFlowNode = Node<ZoneNodeData, 'zone'>;
export type NoteFlowNode = Node<NoteNodeData, 'note'>;
export type FlowNode = SymbolFlowNode | ZoneFlowNode | NoteFlowNode;
export type ConnectionFlowEdge = Edge<ConnectionEdgeData, 'connection'>;

export const HANDLE_SIZE = 12;
/** Carried items are drawn smaller, unrotated, in a column beside the carrier (display only). */
export const CARRIED_SCALE = 0.5;
const CARRIED_GAP = 2;
/** Padding around a laid hose line (hit area for selection). */
const HOSE_PAD = 8;
/** Edges sit below symbol nodes (z 10+) so ports always receive pointer events. */
const EDGE_Z = 5;

/** Objects with display overrides applied (positions/rotations used for drawing). */
export function displayedObjects(state: SimulationState, overrides: SceneView['overrides']): Record<Id, ObjectState> {
  if (!overrides || Object.keys(overrides).length === 0) return state.objects as Record<Id, ObjectState>;
  const out: Record<Id, ObjectState> = { ...state.objects };
  for (const [id, ov] of Object.entries(overrides)) {
    const obj = out[id];
    if (!obj) continue;
    out[id] = { ...obj, position: ov.position ?? obj.position, rotation: ov.rotation ?? obj.rotation, layout: ov.layout ?? obj.layout };
  }
  return out;
}

interface CarriedDisplay {
  readonly topLeft: Vec2;
  readonly width: number;
  readonly height: number;
  /** Worn items are drawn with another symbol (e.g. the apparatus on the back), rotated with the carrier. */
  readonly symbolId?: Id | undefined;
  readonly rotation?: number | undefined;
}

/**
 * Display boxes of carried items: compact, stacked top-down beside each carrier's displayed
 * position; worn items behind the carrier. Held items (carry `held`) are drawn where they are.
 */
function carriedDisplay(catalog: CatalogIndex, state: SimulationState, objects: Record<Id, ObjectState>): Map<Id, CarriedDisplay> {
  const out = new Map<Id, CarriedDisplay>();
  for (const id of state.objectOrder) {
    const carrier = objects[id];
    if (!carrier || carrier.kind !== 'personnel' || carrier.carrying.length === 0) continue;
    const size = catalog.symbols.get(carrier.symbolId)?.size ?? { width: 40, height: 40 };
    const left = carrier.position.x + size.width / 2 + CARRIED_GAP;
    let top = carrier.position.y - size.height / 2;
    for (const itemId of carrier.carrying) {
      const item = objects[itemId];
      if (!item || item.layout) continue;
      const type = item.typeId ? catalog.equipmentTypes.get(item.typeId) : undefined;
      if (type?.carry === 'held') continue;
      const worn = type?.depiction?.worn;
      const wornSymbol = worn ? catalog.symbols.get(worn.symbolId) : undefined;
      if (worn && wornSymbol) {
        const rad = (carrier.rotation * Math.PI) / 180;
        const c = { x: carrier.position.x - Math.cos(rad) * worn.distance, y: carrier.position.y - Math.sin(rad) * worn.distance };
        const { width, height } = wornSymbol.size;
        out.set(itemId, { topLeft: { x: c.x - width / 2, y: c.y - height / 2 }, width, height, symbolId: wornSymbol.id, rotation: carrier.rotation + 90 });
        continue;
      }
      const s = catalog.symbols.get(item.symbolId)?.size ?? { width: 20, height: 20 };
      const width = s.width * CARRIED_SCALE;
      const height = s.height * CARRIED_SCALE;
      out.set(itemId, { topLeft: { x: left, y: top }, width, height });
      top += height + CARRIED_GAP;
    }
  }
  return out;
}

function nameOf(catalog: CatalogIndex, obj: ObjectState): string {
  if (obj.kind === 'equipment' && obj.typeId) return catalog.equipmentTypes.get(obj.typeId)?.name ?? obj.id;
  return catalog.symbols.get(obj.symbolId)?.name ?? obj.id;
}

/** Centre of the symbol box in world space (React Flow node position with nodeOrigin [0.5, 0.5]). */
export function symbolCenter(catalog: CatalogIndex, obj: PlacedObject): Vec2 {
  const symbol = catalog.symbols.get(obj.symbolId);
  if (!symbol) return obj.position;
  return localToWorld(placementOf(symbol, obj.position, obj.rotation), { x: symbol.size.width / 2, y: symbol.size.height / 2 });
}

export function buildFlow(view: SceneView): { nodes: FlowNode[]; edges: ConnectionFlowEdge[] } {
  const { catalog, state } = view;
  const objects = displayedObjects(state, view.overrides);
  const connections = state.connectionOrder.map((id) => state.connections[id]).filter((c): c is Connection => !!c);
  const connectedKeys = new Set<string>();
  for (const c of connections) {
    connectedKeys.add(portRefKey(c.a));
    connectedKeys.add(portRefKey(c.b));
  }

  const compact = carriedDisplay(catalog, state, objects);
  /** Displayed position of a port: compact carried items scale their port positions. */
  const portPosition = (objectId: Id, portId: Id): Vec2 | null => {
    const obj = objects[objectId];
    if (!obj) return null;
    const box = compact.get(objectId);
    if (box) {
      const def = catalog.symbols.get(obj.symbolId)?.ports.find((p) => p.id === portId);
      return def ? { x: box.topLeft.x + def.position.x * CARRIED_SCALE, y: box.topLeft.y + def.position.y * CARRIED_SCALE } : null;
    }
    return portWorld(catalog, obj, portId)?.position ?? null;
  };

  const storedCount = new Map<Id, number>();
  for (const id of state.objectOrder) {
    const container = objects[id]?.storedIn;
    if (container) storedCount.set(container, (storedCount.get(container) ?? 0) + 1);
  }

  const nodes: FlowNode[] = [];
  for (const zone of view.zones ?? []) {
    const shape = zone.shape;
    const width = shape.type === 'rect' ? shape.rect.width : shape.radius * 2;
    const height = shape.type === 'rect' ? shape.rect.height : shape.radius * 2;
    const center = shape.type === 'rect' ? { x: shape.rect.x + width / 2, y: shape.rect.y + height / 2 } : shape.center;
    nodes.push({
      id: `zone:${zone.id}`,
      type: 'zone',
      position: center,
      width,
      height,
      measured: { width, height },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      zIndex: -10,
      data: { name: zone.name, shape: shape.type, width, height, highlighted: view.highlightedZoneIds?.has(zone.id) ?? false },
    });
  }
  for (const note of view.annotations ?? []) {
    nodes.push({
      id: `note:${note.id}`,
      type: 'note',
      position: note.position,
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -5,
      data: { text: note.text, fontSize: note.fontSize ?? 14 },
    });
  }

  for (const id of state.objectOrder) {
    const obj = objects[id];
    // Equipment stored in a vehicle's compartments is not on the scene.
    if (!obj || obj.storedIn) continue;
    const symbol = catalog.symbols.get(obj.symbolId);
    const type = obj.typeId ? catalog.equipmentTypes.get(obj.typeId) : undefined;
    const laid = !!obj.layout && type?.form === 'hose';
    let width = symbol?.size.width ?? 40;
    let height = symbol?.size.height ?? 40;
    let center = symbol ? symbolCenter(catalog, obj) : obj.position;
    let hose: HoseLineData | undefined;
    if (laid && obj.layout) {
      // Axis-aligned box around the line; the line itself is drawn inside it.
      const { a, b } = obj.layout;
      const pad = HOSE_PAD;
      width = Math.abs(b.x - a.x) + pad * 2;
      height = Math.abs(b.y - a.y) + pad * 2;
      center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const tl = { x: center.x - width / 2, y: center.y - height / 2 };
      const coupling = type?.depiction?.couplingSymbolId ? catalog.symbols.get(type.depiction.couplingSymbolId) : undefined;
      hose = {
        a: sub(a, tl),
        b: sub(b, tl),
        strokeWidth: type?.depiction?.laidLineStrokeWidth ?? 2,
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        couplingSymbolId: coupling?.id,
        couplingSize: coupling?.size,
      };
    }
    const box = compact.get(id);
    if (box) {
      width = box.width;
      height = box.height;
      center = { x: box.topLeft.x + width / 2, y: box.topLeft.y + height / 2 };
    }
    const topLeft = { x: center.x - width / 2, y: center.y - height / 2 };
    const markerDef = obj.kind === 'personnel' ? symbol?.directionMarker : undefined;
    const markerSymbol = markerDef ? catalog.symbols.get(markerDef.symbolId) : undefined;
    let marker: DirectionMarkerData | undefined;
    if (markerDef && markerSymbol) {
      const rad = (obj.rotation * Math.PI) / 180;
      marker = {
        symbolId: markerSymbol.id,
        width: markerSymbol.size.width,
        height: markerSymbol.size.height,
        x: width / 2 + Math.cos(rad) * markerDef.distance,
        y: height / 2 + Math.sin(rad) * markerDef.distance,
        rotation: obj.rotation,
      };
    }
    // The role badge is redundant when the symbol itself is the role's symbol.
    const role = obj.roleId ? catalog.roles.get(obj.roleId) : undefined;
    const showRole = !!obj.roleId && role?.symbolId !== obj.symbolId;
    const ports: PortHandleData[] = objectPorts(catalog, obj).map((p) => {
      const rel = sub(box ? (portPosition(id, p.def.id) ?? p.position) : p.position, topLeft);
      const key = portRefKey(p.ref);
      return {
        id: p.def.id,
        key,
        label: p.def.label ?? p.def.id,
        typeName: catalog.portTypes.get(p.def.type)?.name ?? p.def.type,
        x: rel.x,
        y: rel.y,
        connected: connectedKeys.has(key),
        highlight: view.portHighlights?.get(key) ?? null,
      };
    });
    const handles: NodeHandle[] = ports.map((p) => ({
      id: p.id,
      type: 'source',
      position: Position.Left,
      x: p.x - HANDLE_SIZE / 2,
      y: p.y - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    }));
    const carried = obj.carriedBy !== null && !laid;
    const connectable = (view.connectable ?? false) && ports.length > 0;
    nodes.push({
      id,
      type: 'symbol',
      position: center,
      width,
      height,
      measured: { width, height },
      handles,
      selected: view.selectedIds?.has(id) ?? false,
      draggable: !laid && view.draggable ? view.draggable(obj) : false,
      selectable: true,
      connectable,
      zIndex: carried ? 30 : obj.kind === 'personnel' ? 20 : laid ? 8 : 10,
      ...(laid ? { className: 'fds-flow-node--hose' } : {}),
      data: {
        objectId: id,
        kind: obj.kind,
        symbolId: box?.symbolId ?? obj.symbolId,
        name: nameOf(catalog, obj),
        label: obj.label,
        roleLabel: showRole && obj.roleId ? (view.roleLabel?.(obj.roleId) ?? obj.roleId) : undefined,
        width,
        height,
        rotation: box ? (box.rotation ?? 0) : obj.rotation,
        visualState: obj.visualState,
        ports,
        carried,
        highlight: view.highlights?.get(id) ?? null,
        connectable,
        showPortLabels: view.showPortLabels ?? false,
        fixedBody: !!marker,
        hose,
        marker,
        stored: storedCount.get(id),
      },
    });
  }

  const edges: ConnectionFlowEdge[] = [];
  const endpoints = (c: Connection): { a: Vec2; b: Vec2 } | null => {
    if (objects[c.a.objectId]?.storedIn || objects[c.b.objectId]?.storedIn) return null;
    const a = portPosition(c.a.objectId, c.a.portId);
    const b = portPosition(c.b.objectId, c.b.portId);
    return a && b ? { a, b } : null;
  };
  for (const c of connections) {
    const ends = endpoints(c);
    if (!ends) continue;
    edges.push({
      id: c.id,
      type: 'connection',
      source: c.a.objectId,
      sourceHandle: c.a.portId,
      target: c.b.objectId,
      targetHandle: c.b.portId,
      selected: view.selectedConnectionId === c.id,
      zIndex: EDGE_Z,
      data: { a: ends.a, b: ends.b, progress: 1, opacity: view.fadingConnections?.[c.id] ?? 1, pending: false },
    });
  }
  for (const { connection: c, progress } of view.pendingConnections ?? []) {
    const ends = endpoints(c);
    if (!ends) continue;
    edges.push({
      id: `pending:${c.id}`,
      type: 'connection',
      source: c.a.objectId,
      sourceHandle: c.a.portId,
      target: c.b.objectId,
      targetHandle: c.b.portId,
      selectable: false,
      zIndex: EDGE_Z,
      data: { a: ends.a, b: ends.b, progress, opacity: 1, pending: true },
    });
  }
  return { nodes, edges };
}
