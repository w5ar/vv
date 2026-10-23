import type { Connection, Id, ObjectState, SimulationState, StepRuntime } from '@fds/domain';
import { normalizeAngle } from '@fds/geometry';
import type { ExerciseContext } from './context';
import { advanceProcedure } from './procedure';
import { carriedPosition } from './world';

/**
 * Builds the initial simulation state from the exercise's initial scene.
 * Unknown references do not throw: objects with unknown symbols are still
 * created so they can be reported by diagnostics and rendered as placeholders.
 */
export function createInitialState(ctx: ExerciseContext): SimulationState {
  const scene = ctx.exercise.initialScene;
  const objects: Record<Id, ObjectState> = {};
  const objectOrder: Id[] = [];

  for (const p of scene.personnel) {
    const role = p.roleId ? ctx.catalog.roles.get(p.roleId) : undefined;
    objects[p.id] = {
      id: p.id,
      kind: 'personnel',
      symbolId: p.symbolId || role?.symbolId || '',
      label: p.label,
      position: p.position,
      rotation: normalizeAngle(p.rotation),
      roleId: p.roleId,
      typeId: null,
      carriedBy: null,
      carrying: [],
      visualState: null,
    };
    objectOrder.push(p.id);
  }

  for (const e of scene.equipment) {
    const type = ctx.catalog.equipmentTypes.get(e.typeId);
    const symbol = type ? ctx.catalog.symbols.get(type.symbolId) : undefined;
    objects[e.id] = {
      id: e.id,
      kind: 'equipment',
      symbolId: type?.symbolId ?? '',
      label: e.label,
      position: e.position,
      rotation: normalizeAngle(e.rotation),
      roleId: null,
      typeId: e.typeId,
      carriedBy: null,
      carrying: [],
      visualState: e.state ?? symbol?.defaultState ?? null,
    };
    objectOrder.push(e.id);
  }

  // Resolve initial carrying relations after all objects exist.
  for (const e of scene.equipment) {
    if (!e.carriedBy) continue;
    const carrier = objects[e.carriedBy];
    const item = objects[e.id];
    if (!carrier || carrier.kind !== 'personnel' || !item) continue;
    objects[carrier.id] = { ...carrier, carrying: [...carrier.carrying, e.id] };
    objects[e.id] = {
      ...item,
      carriedBy: carrier.id,
      position: carriedPosition(ctx, carrier.position, carrier.carrying.length),
    };
  }

  const connections: Record<Id, Connection> = {};
  const connectionOrder: Id[] = [];
  for (const c of scene.connections) {
    connections[c.id] = c;
    connectionOrder.push(c.id);
  }

  const steps: Record<Id, StepRuntime> = {};
  for (const id of ctx.stepOrder) steps[id] = { status: 'locked' };

  const base: SimulationState = {
    seq: 0,
    time: 0,
    objects,
    objectOrder,
    connections,
    connectionOrder,
    actions: {},
    steps,
    completed: false,
  };
  // Unlock steps without dependencies and complete steps already satisfied.
  return advanceProcedure(ctx, base, base, []).state;
}
