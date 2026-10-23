import type { ConnectionWorld } from '@fds/connection-engine';
import { objectPlacement } from '@fds/connection-engine';
import type { Connection, Id, ObjectState, SimulationState } from '@fds/domain';
import { add, type Placement, type Vec2 } from '@fds/geometry';
import type { ExerciseContext } from './context';

export function connectionList(state: SimulationState): Connection[] {
  const out: Connection[] = [];
  for (const id of state.connectionOrder) {
    const c = state.connections[id];
    if (c) out.push(c);
  }
  return out;
}

/** View of the simulation state for the connection engine. */
export function connectionWorld(state: SimulationState): ConnectionWorld {
  return { objects: state.objects, objectOrder: state.objectOrder, connections: connectionList(state) };
}

export function placementOfObject(ctx: ExerciseContext, obj: ObjectState): Placement | null {
  return objectPlacement(ctx.catalog, obj);
}

/** Visual/logical position of the i-th carried item relative to its carrier. */
export function carriedPosition(ctx: ExerciseContext, carrierPosition: Vec2, slot: number): Vec2 {
  const o = ctx.exercise.settings.carryOffset;
  return add(carrierPosition, { x: o.x, y: o.y + slot * 14 });
}

export function categoryOf(ctx: ExerciseContext, obj: ObjectState): Id | undefined {
  return ctx.catalog.symbols.get(obj.symbolId)?.category;
}

export function objectName(ctx: ExerciseContext, obj: ObjectState | undefined, fallbackId?: Id): string {
  if (!obj) return fallbackId ?? '?';
  if (obj.label) return obj.label;
  if (obj.kind === 'equipment' && obj.typeId) return ctx.catalog.equipmentTypes.get(obj.typeId)?.name ?? obj.id;
  if (obj.roleId) return ctx.catalog.roles.get(obj.roleId)?.name ?? obj.id;
  return ctx.catalog.symbols.get(obj.symbolId)?.name ?? obj.id;
}
