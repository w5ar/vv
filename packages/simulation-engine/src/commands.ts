import { connectionIdFor, connectionsAtPort, otherEnd, portWorld, validateConnection } from '@fds/connection-engine';
import type { Command, CommandOf, Id, Issue, ObjectKind, ObjectState, SimEvent, SimulationState } from '@fds/domain';
import { angleDelta, distance, distanceToPlacement, normalizeAngle, type Vec2 } from '@fds/geometry';
import { evaluateCondition } from './conditions';
import type { ExerciseContext } from './context';
import { carriedPosition, connectionList, connectionWorld, objectName, placementOfObject } from './world';

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

function hoseType(ctx: ExerciseContext, obj: ObjectState | undefined) {
  const type = obj?.typeId ? ctx.catalog.equipmentTypes.get(obj.typeId) : undefined;
  return type?.form === 'hose' ? type : undefined;
}

function laidIssue(ctx: ExerciseContext, obj: ObjectState): Issue[] {
  return obj.layout
    ? [err('hose.laid', `${objectName(ctx, obj)} je položena; najprije je treba rastaviti i namotati.`, [obj.id])]
    : [];
}

function actorIssues(state: SimulationState, actorId: Id | undefined): Issue[] {
  const issues: Issue[] = [];
  if (actorId) requireObject(state, actorId, 'personnel', issues);
  return issues;
}

/**
 * Start point (end A) of a hose being laid: explicit `from`, else the port connected to end A,
 * else the carrier's position, else the coil's position.
 */
export function resolveLayFrom(ctx: ExerciseContext, state: SimulationState, cmd: CommandOf<'LayHose'>): Vec2 {
  if (cmd.from) return cmd.from;
  const hose = state.objects[cmd.equipmentId];
  const endA = hoseType(ctx, hose)?.hoseEnds?.[0];
  if (hose && endA) {
    const ref = { objectId: hose.id, portId: endA };
    const conn = connectionsAtPort(connectionList(state), ref)[0];
    const other = conn ? otherEnd(conn, ref) : null;
    const partner = other ? state.objects[other.objectId] : undefined;
    const p = other && partner ? portWorld(ctx.catalog, partner, other.portId) : null;
    if (p) return p.position;
  }
  if (hose?.carriedBy) return state.objects[hose.carriedBy]?.position ?? hose.position;
  return hose?.position ?? cmd.to;
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
    if (eq) issues.push(...laidIssue(ctx, eq));
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
    const laid = laidIssue(ctx, obj);
    return laid.length > 0 ? laid : rotationIssues(ctx, obj, cmd.rotation);
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
    issues.push(...laidIssue(ctx, eq));
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
    const actor = actorIssues(state, cmd.actorId);
    if (actor.length > 0) return actor;
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
    state.connections[cmd.connectionId] ? actorIssues(state, cmd.actorId) : [err('connection.unknown', `Spoj „${cmd.connectionId}” ne postoji.`)],
  LayHose: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const hose = requireObject(state, cmd.equipmentId, 'equipment', issues);
    if (cmd.personnelId) requireObject(state, cmd.personnelId, 'personnel', issues);
    if (!hose) return issues;
    if (!hoseType(ctx, hose)) issues.push(err('hose.not-hose', `${objectName(ctx, hose)} nije cijev.`, [hose.id]));
    else if (hose.layout) issues.push(err('hose.already-laid', `${objectName(ctx, hose)} je već položena.`, [hose.id]));
    return issues;
  },
  RollUpHose: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const hose = requireObject(state, cmd.equipmentId, 'equipment', issues);
    if (cmd.personnelId) requireObject(state, cmd.personnelId, 'personnel', issues);
    if (!hose) return issues;
    const type = hoseType(ctx, hose);
    if (!type) return [err('hose.not-hose', `${objectName(ctx, hose)} nije cijev.`, [hose.id])];
    if (!hose.layout) return [err('hose.not-laid', `${objectName(ctx, hose)} nije položena.`, [hose.id])];
    const conns = connectionList(state).filter((c) => c.a.objectId === hose.id || c.b.objectId === hose.id);
    if (conns.length > 0) {
      issues.push(err('hose.connected', `${objectName(ctx, hose)} je još spojena; najprije je treba rastaviti.`, [hose.id]));
    }
    return issues;
  },
  HandOverEquipment: (ctx, state, cmd) => {
    const issues: Issue[] = [];
    const from = requireObject(state, cmd.fromId, 'personnel', issues);
    const to = requireObject(state, cmd.toId, 'personnel', issues);
    const eq = requireObject(state, cmd.equipmentId, 'equipment', issues);
    if (!from || !to || !eq) return issues;
    if (eq.carriedBy !== from.id) {
      issues.push(err('handover.not-carrying', `${objectName(ctx, from)} ne nosi ${objectName(ctx, eq)}.`, [from.id, eq.id]));
    }
    if (from.id === to.id) issues.push(err('handover.same-person', 'Oprema se ne može predati istoj osobi.', [from.id]));
    const d = distance(from.position, to.position);
    if (d > ctx.exercise.settings.pickUpDistance) {
      issues.push(err('handover.too-far', `${objectName(ctx, from)} i ${objectName(ctx, to)} su predaleko za predaju (${Math.round(d)}).`, [from.id, to.id]));
    }
    const limit = ctx.exercise.settings.maxCarriedPerPerson;
    if (limit != null && to.carrying.length >= limit) {
      issues.push(err('pickup.capacity', `${objectName(ctx, to)} ne može nositi više od ${limit} predmeta.`, [to.id]));
    }
    return issues;
  },
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
    const actor = actorIssues(state, cmd.actorId);
    if (actor.length > 0) return actor;
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
      events: [{ type: 'PortsConnected', connection, ...(cmd.actorId ? { actorId: cmd.actorId } : {}) }],
      moved: [],
    };
  },
  DisconnectPorts: (_ctx, state, cmd) => {
    const connection = state.connections[cmd.connectionId];
    const connections = { ...state.connections };
    delete connections[cmd.connectionId];
    return {
      state: { ...state, connections, connectionOrder: state.connectionOrder.filter((id) => id !== cmd.connectionId) },
      events: connection ? [{ type: 'PortsDisconnected', connection, ...(cmd.actorId ? { actorId: cmd.actorId } : {}) }] : [],
      moved: [],
    };
  },
  LayHose: (ctx, state, cmd) => {
    const hose = state.objects[cmd.equipmentId] as ObjectState;
    const from = resolveLayFrom(ctx, state, cmd);
    const layout = { a: from, b: cmd.to };
    const updates: ObjectState[] = [];
    if (hose.carriedBy) {
      const carrier = state.objects[hose.carriedBy];
      if (carrier) {
        const updated = { ...carrier, carrying: carrier.carrying.filter((id) => id !== hose.id) };
        updates.push(updated, ...carriedUpdates(ctx, state, updated));
      }
    }
    updates.push({
      ...hose,
      carriedBy: null,
      layout,
      position: { x: (from.x + cmd.to.x) / 2, y: (from.y + cmd.to.y) / 2 },
      rotation: normalizeAngle((Math.atan2(cmd.to.y - from.y, cmd.to.x - from.x) * 180) / Math.PI),
    });
    return {
      state: withObjects(state, updates),
      events: [{ type: 'HoseLaid', equipmentId: hose.id, personnelId: cmd.personnelId, from, to: cmd.to }],
      moved: [hose.id],
    };
  },
  RollUpHose: (_ctx, state, cmd) => {
    const hose = state.objects[cmd.equipmentId] as ObjectState;
    const at = cmd.at ?? hose.layout?.a ?? hose.position;
    return {
      state: withObjects(state, [{ ...hose, layout: null, position: at, rotation: 0 }]),
      events: [{ type: 'HoseRolledUp', equipmentId: hose.id, personnelId: cmd.personnelId, at }],
      moved: [hose.id],
    };
  },
  HandOverEquipment: (ctx, state, cmd) => {
    const from = state.objects[cmd.fromId] as ObjectState;
    const to = state.objects[cmd.toId] as ObjectState;
    const eq = state.objects[cmd.equipmentId] as ObjectState;
    const giver = { ...from, carrying: from.carrying.filter((id) => id !== eq.id) };
    const receiver = { ...to, carrying: [...to.carrying, eq.id] };
    const item = { ...eq, carriedBy: to.id, position: carriedPosition(ctx, to.position, to.carrying.length) };
    const s1 = withObjects(state, [giver, receiver, item]);
    return {
      state: withObjects(s1, carriedUpdates(ctx, s1, giver)),
      events: [{ type: 'EquipmentHandedOver', fromId: from.id, toId: to.id, equipmentId: eq.id }],
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
