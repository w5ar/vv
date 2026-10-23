import type { ConnectionWorld } from '@fds/connection-engine';
import { objectPlacement } from '@fds/connection-engine';
import type { Connection, EquipmentType, Id, ObjectState, SimulationState } from '@fds/domain';
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

export function equipmentTypeOf(ctx: ExerciseContext, obj: ObjectState | undefined): EquipmentType | undefined {
  return obj?.typeId ? ctx.catalog.equipmentTypes.get(obj.typeId) : undefined;
}

/** Bulky items lifted where they lie: they keep their place and move with the carrier. */
export function isHeld(ctx: ExerciseContext, obj: ObjectState | undefined): boolean {
  return equipmentTypeOf(ctx, obj)?.carry === 'held';
}

/**
 * Items that move when a carrier walks: the held items it carries plus the held items joined to them
 * that nobody carries (a lifted part of a suction line takes the strainer hanging on it along).
 * A part also joined to parts carried by someone else stays where it is: it hangs between carriers.
 */
export function heldGroup(ctx: ExerciseContext, state: SimulationState, carrierId: Id): Id[] {
  const carrier = state.objects[carrierId];
  if (!carrier) return [];
  const own = carrier.carrying.filter((id) => isHeld(ctx, state.objects[id]));
  if (own.length === 0) return [];
  const neighbours = new Map<Id, Id[]>();
  for (const c of connectionList(state)) {
    neighbours.set(c.a.objectId, [...(neighbours.get(c.a.objectId) ?? []), c.b.objectId]);
    neighbours.set(c.b.objectId, [...(neighbours.get(c.b.objectId) ?? []), c.a.objectId]);
  }
  const loose = (id: Id) => {
    const o = state.objects[id];
    return !!o && isHeld(ctx, o) && !o.carriedBy && !o.storedIn;
  };
  // Components of loose parts, and the carriers of the parts they touch.
  const out = new Set<Id>(own);
  const seen = new Set<Id>();
  for (const start of own) {
    for (const first of neighbours.get(start) ?? []) {
      if (seen.has(first) || !loose(first)) continue;
      const component: Id[] = [];
      const carriers = new Set<Id>();
      const queue = [first];
      seen.add(first);
      while (queue.length > 0) {
        const id = queue.shift() as Id;
        component.push(id);
        for (const n of neighbours.get(id) ?? []) {
          const o = state.objects[n];
          if (o?.carriedBy && isHeld(ctx, o)) carriers.add(o.carriedBy);
          else if (!seen.has(n) && loose(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      if (carriers.size === 1 && carriers.has(carrierId)) for (const id of component) out.add(id);
    }
  }
  return [...out];
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
