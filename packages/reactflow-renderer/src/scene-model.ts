import { connectionEndpoints, objectPorts, placementOf, type PlacedObject } from '@fds/connection-engine';
import { portRefKey, type Annotation, type CatalogIndex, type Connection, type Id, type ObjectState, type SimulationState, type Zone } from '@fds/domain';
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
/** Edges sit below symbol nodes (z 10+) so ports always receive pointer events. */
const EDGE_Z = 5;

/** Objects with display overrides applied (positions/rotations used for drawing). */
export function displayedObjects(state: SimulationState, overrides: SceneView['overrides']): Record<Id, ObjectState> {
  if (!overrides || Object.keys(overrides).length === 0) return state.objects as Record<Id, ObjectState>;
  const out: Record<Id, ObjectState> = { ...state.objects };
  for (const [id, ov] of Object.entries(overrides)) {
    const obj = out[id];
    if (!obj) continue;
    out[id] = { ...obj, position: ov.position ?? obj.position, rotation: ov.rotation ?? obj.rotation };
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
    if (!obj) continue;
    const symbol = catalog.symbols.get(obj.symbolId);
    const width = symbol?.size.width ?? 40;
    const height = symbol?.size.height ?? 40;
    const center = symbol ? symbolCenter(catalog, obj) : obj.position;
    const topLeft = { x: center.x - width / 2, y: center.y - height / 2 };
    const ports: PortHandleData[] = objectPorts(catalog, obj).map((p) => {
      const rel = sub(p.position, topLeft);
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
    const carried = obj.carriedBy !== null;
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
      draggable: view.draggable ? view.draggable(obj) : false,
      selectable: true,
      connectable,
      zIndex: carried ? 30 : obj.kind === 'personnel' ? 20 : 10,
      data: {
        objectId: id,
        kind: obj.kind,
        symbolId: obj.symbolId,
        name: nameOf(catalog, obj),
        label: obj.label,
        roleLabel: obj.roleId ? (view.roleLabel?.(obj.roleId) ?? obj.roleId) : undefined,
        width,
        height,
        rotation: obj.rotation,
        visualState: obj.visualState,
        ports,
        carried,
        highlight: view.highlights?.get(id) ?? null,
        connectable,
        showPortLabels: view.showPortLabels ?? false,
      },
    });
  }

  const edges: ConnectionFlowEdge[] = [];
  const world = { objects };
  for (const c of connections) {
    const ends = connectionEndpoints(catalog, world, c);
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
      data: { a: ends.a.position, b: ends.b.position, progress: 1, opacity: view.fadingConnections?.[c.id] ?? 1, pending: false },
    });
  }
  for (const { connection: c, progress } of view.pendingConnections ?? []) {
    const ends = connectionEndpoints(catalog, world, c);
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
      data: { a: ends.a.position, b: ends.b.position, progress, opacity: 1, pending: true },
    });
  }
  return { nodes, edges };
}
