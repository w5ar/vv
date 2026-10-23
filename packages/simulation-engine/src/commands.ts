import { connectionIdFor, validateConnection } from '@fds/connection-engine';
import type { Command, CommandOf, Id, Issue, ObjectKind, ObjectState, SimEvent, SimulationState } from '@fds/domain';
import { angleDelta, distance, distanceToPlacement, normalizeAngle } from '@fds/geometry';
import { evaluateCondition } from './conditions';
import type { ExerciseContext } from './context';
import { carriedPosition, connectionWorld, objectName, placementOfObject } from './world';

/**
 * Per-command intrinsic validation and application. These encode simulation
 * mechanics only (existence, carrying, proximity, port rules). Exercise-
 * specific rules are layered on top in `rules.ts`.
 */

export interface Applied {
  readonly state: SimulationState;
  readonly events: SimEvent[];
  /** Objects whose placement changed (for overlap checks). */
  readonly moved: Id[];
}

type Validator<T extends Command['type']> = (ctx: ExerciseContext, state: SimulationState, cmd: CommandOf<T>) => Issue[];
type Applier<T extends Command['type']> = (ctx: ExerciseContext, state: SimulationState, cmd: CommandOf<T>) => Applied;

function err(code: string, message: string, objectIds: Id[] = []): Issue {
  return { code, severity: 'error', message, objectIds };
}

function requireObject(state: SimulationState, id: Id, kind: ObjectKind, issues: Issue[]): ObjectState | null {
  const obj = state.objects[id];
  if (!obj) {
    issues.push(err('command.unknown-object', `Objekt „${id}” ne postoji u sceni.`, [id]));
    return null;
  }
  if (obj.kind !== kind) {
    const expected = kind === 'personnel' ? 'osoba' : 'oprema';
    issues.push(err('command.wrong-kind', `Objekt „${id}” nije ${expected}.`, [id]));
    return null;
  }
  return obj;
}

function withObjects(state: SimulationState, updates: ObjectState[]): SimulationState {
  const objects = { ...state.objects };
  for (const u of updates) objects[u.id] = u;
  return { ...state, objects };
}

/** Repositions carried items after the carrier moved. */
function carriedUpdates(ctx: ExerciseContext, state: SimulationState, carrier: ObjectState): ObjectState[] {
  return carrier.carrying.flatMap((itemId, slot) => {
    const item = state.objects[itemId];
    return item ? [{ ...item, position: carriedPosition(ctx, carrier.position, slot) }] : [];
  });
}

function rotationIssues(ctx: ExerciseContext, obj: ObjectState, rotation: number): Issue[] {
  const symbol = ctx.catalog.symbols.get(obj.symbolId);
  if (!symbol) return [err('command.unknown-symbol', `Simbol „${obj.symbolId}” nije u katalogu.`, [obj.id])];
  const policy = symbol.rotation;
  if (policy.mode === 'none' && Math.abs(angleDelta(obj.rotation, rotation)) > 1e-6) {
    return [err('rotation.not-allowed', `Objekt ${objectName(ctx, obj)} nije moguće rotirati.`, [obj.id])];
  }
  if (policy.mode === 'step') {
    const n = normalizeAngle(rotation) / policy.stepDegrees;
    if (Math.abs(n - Math.round(n)) > 1e-6) {
      return [
        err('rotation.invalid-step', `Objekt ${objectName(ctx, obj)} rotira se samo u koracima od ${policy.stepDegrees}°.`, [obj.id]),
      ];
    }
  }
  return [];
}

const validators: { [T in Command['type']]: Validator<T> } = {
  MovePersonnel: (_ctx, state, cmd) => {
    const issues: Issue[] = [];
    requireObject(state, cmd.personnelId, 'personnel', issues);
    return issues;
  },
  MoveEquipment: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const eq = requireObject(state, cmd.equipmentId, 'equipment', issues);
    const portable = eq?.typeId ? ctx.catalog.equipmentTypes.get(eq.typeId)?.portable === true : false;
    if (eq && !eq.carriedBy && portable && ctx.exercise.settings.equipmentMovePolicy === 'non-portable-only') {
      issues.push(
        err('move.portable-must-be-carried', `${objectName(ctx, eq)} je prijenosna oprema: osoba je treba uzeti i odložiti na novo mjesto.`, [eq.id]),
      );
    }
    if (eq?.carriedBy) {
      const carrier = state.objects[eq.carriedBy];
      issues.push(
        err('command.equipment-carried', `${objectName(ctx, eq)} nosi ${objectName(ctx, carrier, eq.carriedBy)}; najprije je treba odložiti.`, [
          eq.id,
        ]),
      );
    }
    return issues;
  },
  RotateObject: (ctx, state, cmd) => {
    const obj = state.objects[cmd.objectId];
    if (!obj) return [err('command.unknown-object', `Objekt „${cmd.objectId}” ne postoji u sceni.`, [cmd.objectId])];
    return rotationIssues(ctx, obj, cmd.rotation);
  },
  PickUpEquipment: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const person = requireObject(state, cmd.personnelId, 'personnel', issues);
    const eq = requireObject(state, cmd.equipmentId, 'equipment', issues);
    if (!person || !eq) return issues;
    const type = eq.typeId ? ctx.catalog.equipmentTypes.get(eq.typeId) : undefined;
    if (!type?.portable) {
      issues.push(err('pickup.not-portable', `${objectName(ctx, eq)} nije prijenosna oprema.`, [eq.id]));
    }
    if (eq.carriedBy === person.id) {
      issues.push(err('pickup.already-carrying', `${objectName(ctx, person)} već nosi ${objectName(ctx, eq)}.`, [eq.id, person.id]));
    } else if (eq.carriedBy) {
      issues.push(err('pickup.carried-by-other', `${objectName(ctx, eq)} već nosi netko drugi.`, [eq.id, eq.carriedBy]));
    }
    const limit = ctx.exercise.settings.maxCarriedPerPerson;
    if (limit != null && person.carrying.length >= limit) {
      issues.push(err('pickup.capacity', `${objectName(ctx, person)} ne može nositi više od ${limit} predmeta.`, [person.id]));
    }
    const placement = placementOfObject(ctx, eq);
    const d = placement ? distanceToPlacement(placement, person.position) : distance(person.position, eq.position);
    if (!eq.carriedBy && d > ctx.exercise.settings.pickUpDistance) {
      issues.push(
        err('pickup.too-far', `${objectName(ctx, person)} je predaleko od opreme ${objectName(ctx, eq)} (${Math.round(d)}).`, [
          person.id,
          eq.id,
        ]),
      );
    }
    return issues;
  },
  PlaceEquipment: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const person = requireObject(state, cmd.personnelId, 'personnel', issues);
    const eq = requireObject(state, cmd.equipmentId, 'equipment', issues);
    if (!person || !eq) return issues;
    if (eq.carriedBy !== person.id) {
      issues.push(err('place.not-carrying', `${objectName(ctx, person)} ne nosi ${objectName(ctx, eq)}.`, [person.id, eq.id]));
      return issues;
    }
    const d = distance(person.position, cmd.at);
    if (d > ctx.exercise.settings.placeDistance) {
      issues.push(err('place.too-far', `Mjesto odlaganja je predaleko od osobe ${objectName(ctx, person)} (${Math.round(d)}).`, [person.id, eq.id]));
    }
    if (cmd.rotation !== undefined) issues.push(...rotationIssues(ctx, eq, cmd.rotation));
    return issues;
  },
  ConnectPorts: (ctx, state, cmd) => {
    const issues = validateConnection(ctx.catalog, connectionWorld(state), cmd.a, cmd.b, {
      maxDistance: ctx.exercise.settings.connectionMaxDistance,
    });
    const id = cmd.connectionId ?? connectionIdFor(cmd.a, cmd.b);
    if (issues.length === 0 && state.connections[id]) {
      issues.push(err('connection.id-taken', `Spoj s oznakom „${id}” već postoji.`));
    }
    return issues;
  },
  DisconnectPorts: (_ctx, state, cmd) =>
    state.connections[cmd.connectionId] ? [] : [err('connection.unknown', `Spoj „${cmd.connectionId}” ne postoji.`)],
  AssignRole: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    requireObject(state, cmd.personnelId, 'personnel', issues);
    if (cmd.roleId !== null && !ctx.catalog.roles.has(cmd.roleId)) {
      issues.push(err('role.unknown', `Uloga „${cmd.roleId}” nije definirana.`, [cmd.personnelId]));
    }
    return issues;
  },
  BeginAction: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const action = ctx.actions.get(cmd.actionId);
    if (!action) return [err('action.unknown', `Radnja „${cmd.actionId}” nije definirana u vježbi.`)];
    const rt = state.actions[cmd.actionId];
    if (rt?.status === 'active') issues.push(err('action.already-active', `Radnja „${action.name}” je već u tijeku.`));
    if (rt?.status === 'completed') issues.push(err('action.already-completed', `Radnja „${action.name}” je već izvršena.`));
    const actors: ObjectState[] = [];
    for (const id of cmd.actorIds) {
      const actor = requireObject(state, id, 'personnel', issues);
      if (actor) actors.push(actor);
    }
    if (actors.length < action.minActors) {
      issues.push(err('action.not-enough-actors', `Radnja „${action.name}” zahtijeva najmanje ${action.minActors} izvršitelja.`));
    }
    if (action.actorRoleIds.length > 0) {
      for (const actor of actors) {
        if (!actor.roleId || !action.actorRoleIds.includes(actor.roleId)) {
          const roles = action.actorRoleIds.map((r) => ctx.catalog.roles.get(r)?.name ?? r).join(', ');
          issues.push(
            err('action.wrong-role', `${objectName(ctx, actor)} ne može izvršiti radnju „${action.name}” (potrebna uloga: ${roles}).`, [
              actor.id,
            ]),
          );
        }
      }
    }
    if (action.requires && !evaluateCondition(ctx, state, action.requires)) {
      issues.push(err('action.precondition', `Uvjeti za radnju „${action.name}” nisu ispunjeni.`, cmd.actorIds));
    }
    return issues;
  },
  CompleteAction: (ctx, state, cmd) => {
    const action = ctx.actions.get(cmd.actionId);
    if (!action) return [err('action.unknown', `Radnja „${cmd.actionId}” nije definirana u vježbi.`)];
    return state.actions[cmd.actionId]?.status === 'active'
      ? []
      : [err('action.not-active', `Radnja „${action.name}” nije započeta.`)];
  },
  SetObjectState: (ctx, state, cmd) => {
    const obj = state.objects[cmd.objectId];
    if (!obj) return [err('command.unknown-object', `Objekt „${cmd.objectId}” ne postoji u sceni.`, [cmd.objectId])];
    const symbol = ctx.catalog.symbols.get(obj.symbolId);
    if (!symbol?.visualStates.some((s) => s.id === cmd.state)) {
      return [err('state.unknown', `Objekt ${objectName(ctx, obj)} nema stanje „${cmd.state}”.`, [obj.id])];
    }
    return [];
  },
};

const appliers: { [T in Command['type']]: Applier<T> } = {
  MovePersonnel: (ctx, state, cmd) => {
    const person = state.objects[cmd.personnelId] as ObjectState;
    const moved = { ...person, position: cmd.to };
    return {
      state: withObjects(state, [moved, ...carriedUpdates(ctx, state, moved)]),
      events: [{ type: 'PersonnelMoved', personnelId: person.id, from: person.position, to: cmd.to }],
      moved: [person.id],
    };
  },
  MoveEquipment: (_ctx, state, cmd) => {
    const eq = state.objects[cmd.equipmentId] as ObjectState;
    return {
      state: withObjects(state, [{ ...eq, position: cmd.to }]),
      events: [{ type: 'EquipmentMoved', equipmentId: eq.id, from: eq.position, to: cmd.to }],
      moved: [eq.id],
    };
  },
  RotateObject: (_ctx, state, cmd) => {
    const obj = state.objects[cmd.objectId] as ObjectState;
    const to = normalizeAngle(cmd.rotation);
    return {
      state: withObjects(state, [{ ...obj, rotation: to }]),
      events: [{ type: 'ObjectRotated', objectId: obj.id, from: obj.rotation, to }],
      moved: [obj.id],
    };
  },
  PickUpEquipment: (ctx, state, cmd) => {
    const person = state.objects[cmd.personnelId] as ObjectState;
    const eq = state.objects[cmd.equipmentId] as ObjectState;
    const carrier = { ...person, carrying: [...person.carrying, eq.id] };
    const item = { ...eq, carriedBy: person.id, position: carriedPosition(ctx, person.position, person.carrying.length) };
    return {
      state: withObjects(state, [carrier, item]),
      events: [{ type: 'EquipmentPickedUp', personnelId: person.id, equipmentId: eq.id, from: eq.position }],
      moved: [],
    };
  },
  PlaceEquipment: (ctx, state, cmd) => {
    const person = state.objects[cmd.personnelId] as ObjectState;
    const eq = state.objects[cmd.equipmentId] as ObjectState;
    const carrier = { ...person, carrying: person.carrying.filter((id) => id !== eq.id) };
    const rotation = cmd.rotation === undefined ? eq.rotation : normalizeAngle(cmd.rotation);
    const item = { ...eq, carriedBy: null, position: cmd.at, rotation };
    const s1 = withObjects(state, [carrier, item]);
    return {
      state: withObjects(s1, carriedUpdates(ctx, s1, carrier)),
      events: [{ type: 'EquipmentPlaced', personnelId: person.id, equipmentId: eq.id, at: cmd.at, rotation }],
      moved: [eq.id],
    };
  },
  ConnectPorts: (_ctx, state, cmd) => {
    const id = cmd.connectionId ?? connectionIdFor(cmd.a, cmd.b);
    const connection = { id, a: cmd.a, b: cmd.b };
    return {
      state: {
        ...state,
        connections: { ...state.connections, [id]: connection },
        connectionOrder: [...state.connectionOrder, id],
      },
      events: [{ type: 'PortsConnected', connection }],
      moved: [],
    };
  },
  DisconnectPorts: (_ctx, state, cmd) => {
    const connection = state.connections[cmd.connectionId];
    const connections = { ...state.connections };
    delete connections[cmd.connectionId];
    return {
      state: { ...state, connections, connectionOrder: state.connectionOrder.filter((id) => id !== cmd.connectionId) },
      events: connection ? [{ type: 'PortsDisconnected', connection }] : [],
      moved: [],
    };
  },
  AssignRole: (_ctx, state, cmd) => {
    const person = state.objects[cmd.personnelId] as ObjectState;
    return {
      state: withObjects(state, [{ ...person, roleId: cmd.roleId }]),
      events: [{ type: 'RoleAssigned', personnelId: person.id, roleId: cmd.roleId, previousRoleId: person.roleId }],
      moved: [],
    };
  },
  BeginAction: (_ctx, state, cmd) => ({
    state: {
      ...state,
      actions: { ...state.actions, [cmd.actionId]: { status: 'active', actorIds: [...cmd.actorIds], startedAt: state.time } },
    },
    events: [{ type: 'ActionBegan', actionId: cmd.actionId, actorIds: [...cmd.actorIds] }],
    moved: [],
  }),
  CompleteAction: (_ctx, state, cmd) => {
    const rt = state.actions[cmd.actionId];
    return {
      state: {
        ...state,
        actions: {
          ...state.actions,
          [cmd.actionId]: { status: 'completed', actorIds: rt?.actorIds ?? [], startedAt: rt?.startedAt ?? state.time, completedAt: state.time },
        },
      },
      events: [{ type: 'ActionCompleted', actionId: cmd.actionId }],
      moved: [],
    };
  },
  SetObjectState: (_ctx, state, cmd) => {
    const obj = state.objects[cmd.objectId] as ObjectState;
    return {
      state: withObjects(state, [{ ...obj, visualState: cmd.state }]),
      events: [{ type: 'ObjectStateChanged', objectId: obj.id, from: obj.visualState, to: cmd.state }],
      moved: [],
    };
  },
};

export function validateIntrinsic(ctx: ExerciseContext, state: SimulationState, command: Command): Issue[] {
  const validator = validators[command.type] as Validator<Command['type']>;
  return validator(ctx, state, command as never);
}

/** Applies a command that has already been validated. */
export function applyIntrinsic(ctx: ExerciseContext, state: SimulationState, command: Command): Applied {
  const applier = appliers[command.type] as Applier<Command['type']>;
  return applier(ctx, state, command as never);
}
