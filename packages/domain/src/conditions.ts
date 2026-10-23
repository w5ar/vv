import { z } from 'zod';
import { FiniteNumber, IdSchema, PortRefSchema, type Id, type PortRef } from './common';

/**
 * Declarative state predicates. Conditions are pure data, evaluated by the
 * simulation engine against a simulation state. They are used for step
 * completion, preconditions, command rules and exercise completion.
 */

/**
 * Selects one port (`portId` given) or any port of an object (`portId` omitted).
 * The object is a specific instance (`objectId`) or any equipment of a type (`typeId`),
 * for interchangeable items such as hoses of the same kind. One of the two is required.
 */
export interface PortSelector {
  objectId?: Id | undefined;
  typeId?: Id | undefined;
  portId?: Id | undefined;
}

export type Condition =
  | { type: 'all'; of: Condition[] }
  | { type: 'any'; of: Condition[] }
  | { type: 'not'; of: Condition }
  | { type: 'stepCompleted'; stepId: Id }
  | { type: 'actionCompleted'; actionId: Id }
  | { type: 'actionActive'; actionId: Id }
  /** A direct logical connection exists between the two selectors. */
  | { type: 'connected'; a: PortSelector; b: PortSelector }
  /** The objects are reachable through a chain of logical connections (graph reachability only). */
  | { type: 'linked'; a: Id; b: Id }
  | { type: 'portFree'; port: PortRef }
  | { type: 'inZone'; objectId: Id; zoneId: Id }
  | { type: 'near'; objectId: Id; targetId: Id; maxDistance: number }
  /**
   * Carrying at least `count` (default 1) items: a specific item (`equipmentId`),
   * items of a type (`typeId`) or anything (both omitted).
   */
  | { type: 'carrying'; personnelId: Id; equipmentId?: Id | undefined; typeId?: Id | undefined; count?: number | undefined }
  /** Equipment is on the ground (neither carried nor stored in a container). */
  | { type: 'placed'; equipmentId: Id }
  /**
   * Equipment is stored in a container (vehicle): a specific item, or at least `count` (default 1)
   * items of `typeId`; in `containerId` if given, else in any container.
   */
  | { type: 'stored'; equipmentId?: Id | undefined; typeId?: Id | undefined; containerId?: Id | undefined; count?: number | undefined }
  /** A specific hose is laid, or at least `count` (default 1) hoses of `typeId` are laid. */
  | { type: 'laid'; equipmentId?: Id | undefined; typeId?: Id | undefined; count?: number | undefined }
  | { type: 'hasRole'; personnelId: Id; roleId: Id }
  | { type: 'objectState'; objectId: Id; state: Id }
  | { type: 'rotation'; objectId: Id; angle: number; tolerance: number };

export type ConditionType = Condition['type'];

const PortSelectorSchema = z.strictObject({ objectId: IdSchema.optional(), typeId: IdSchema.optional(), portId: IdSchema.optional() });
const CountSchema = z.number().int().positive().optional();

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('all'), of: z.array(ConditionSchema) }),
    z.strictObject({ type: z.literal('any'), of: z.array(ConditionSchema).min(1) }),
    z.strictObject({ type: z.literal('not'), of: ConditionSchema }),
    z.strictObject({ type: z.literal('stepCompleted'), stepId: IdSchema }),
    z.strictObject({ type: z.literal('actionCompleted'), actionId: IdSchema }),
    z.strictObject({ type: z.literal('actionActive'), actionId: IdSchema }),
    z.strictObject({ type: z.literal('connected'), a: PortSelectorSchema, b: PortSelectorSchema }),
    z.strictObject({ type: z.literal('linked'), a: IdSchema, b: IdSchema }),
    z.strictObject({ type: z.literal('portFree'), port: PortRefSchema }),
    z.strictObject({ type: z.literal('inZone'), objectId: IdSchema, zoneId: IdSchema }),
    z.strictObject({
      type: z.literal('near'),
      objectId: IdSchema,
      targetId: IdSchema,
      maxDistance: z.number().positive(),
    }),
    z.strictObject({
      type: z.literal('carrying'),
      personnelId: IdSchema,
      equipmentId: IdSchema.optional(),
      typeId: IdSchema.optional(),
      count: CountSchema,
    }),
    z.strictObject({ type: z.literal('placed'), equipmentId: IdSchema }),
    z.strictObject({
      type: z.literal('stored'),
      equipmentId: IdSchema.optional(),
      typeId: IdSchema.optional(),
      containerId: IdSchema.optional(),
      count: CountSchema,
    }),
    z.strictObject({ type: z.literal('laid'), equipmentId: IdSchema.optional(), typeId: IdSchema.optional(), count: CountSchema }),
    z.strictObject({ type: z.literal('hasRole'), personnelId: IdSchema, roleId: IdSchema }),
    z.strictObject({ type: z.literal('objectState'), objectId: IdSchema, state: IdSchema }),
    z.strictObject({
      type: z.literal('rotation'),
      objectId: IdSchema,
      angle: FiniteNumber,
      tolerance: z.number().nonnegative(),
    }),
  ]),
);

/** Visits every condition node depth-first (including the root). */
export function walkCondition(condition: Condition, visit: (c: Condition) => void): void {
  visit(condition);
  switch (condition.type) {
    case 'all':
    case 'any':
      for (const c of condition.of) walkCondition(c, visit);
      break;
    case 'not':
      walkCondition(condition.of, visit);
      break;
    default:
      break;
  }
}

/** Object ids referenced anywhere inside a condition. */
export function conditionObjectIds(condition: Condition): Id[] {
  const ids = new Set<Id>();
  walkCondition(condition, (c) => {
    switch (c.type) {
      case 'connected':
        if (c.a.objectId) ids.add(c.a.objectId);
        if (c.b.objectId) ids.add(c.b.objectId);
        break;
      case 'linked':
        ids.add(c.a);
        ids.add(c.b);
        break;
      case 'portFree':
        ids.add(c.port.objectId);
        break;
      case 'inZone':
      case 'objectState':
      case 'rotation':
        ids.add(c.objectId);
        break;
      case 'near':
        ids.add(c.objectId);
        ids.add(c.targetId);
        break;
      case 'carrying':
        ids.add(c.personnelId);
        if (c.equipmentId) ids.add(c.equipmentId);
        break;
      case 'placed':
        ids.add(c.equipmentId);
        break;
      case 'laid':
        if (c.equipmentId) ids.add(c.equipmentId);
        break;
      case 'stored':
        if (c.equipmentId) ids.add(c.equipmentId);
        if (c.containerId) ids.add(c.containerId);
        break;
      case 'hasRole':
        ids.add(c.personnelId);
        break;
      default:
        break;
    }
  });
  return [...ids];
}
