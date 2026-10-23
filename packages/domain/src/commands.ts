import { z } from 'zod';
import { IdSchema, PortRefSchema, RotationSchema, Vec2Schema, type Id } from './common';

/**
 * Commands are requests to change the simulation state. They are validated by
 * the simulation engine before execution and either accepted (producing
 * events) or rejected (producing issues). The same command vocabulary is used
 * by demonstration scripts, interactive training and assessment.
 *
 * NOTE: this vocabulary is generic. It was not derived from real source
 * materials because none were available; see docs/OPEN_QUESTIONS.md.
 */

export const MovePersonnelSchema = z.strictObject({
  type: z.literal('MovePersonnel'),
  personnelId: IdSchema,
  to: Vec2Schema,
});

export const MoveEquipmentSchema = z.strictObject({
  type: z.literal('MoveEquipment'),
  equipmentId: IdSchema,
  to: Vec2Schema,
});

export const RotateObjectSchema = z.strictObject({
  type: z.literal('RotateObject'),
  objectId: IdSchema,
  rotation: RotationSchema,
});

export const PickUpEquipmentSchema = z.strictObject({
  type: z.literal('PickUpEquipment'),
  personnelId: IdSchema,
  equipmentId: IdSchema,
});

export const PlaceEquipmentSchema = z.strictObject({
  type: z.literal('PlaceEquipment'),
  personnelId: IdSchema,
  equipmentId: IdSchema,
  at: Vec2Schema,
  rotation: RotationSchema.optional(),
});

export const ConnectPortsSchema = z.strictObject({
  type: z.literal('ConnectPorts'),
  a: PortRefSchema,
  b: PortRefSchema,
  /** Optional explicit id; otherwise the engine derives a deterministic one. */
  connectionId: IdSchema.optional(),
});

export const DisconnectPortsSchema = z.strictObject({
  type: z.literal('DisconnectPorts'),
  connectionId: IdSchema,
});

export const AssignRoleSchema = z.strictObject({
  type: z.literal('AssignRole'),
  personnelId: IdSchema,
  roleId: IdSchema.nullable(),
});

export const BeginActionSchema = z.strictObject({
  type: z.literal('BeginAction'),
  actionId: IdSchema,
  actorIds: z.array(IdSchema).default([]),
});

export const CompleteActionSchema = z.strictObject({
  type: z.literal('CompleteAction'),
  actionId: IdSchema,
});

export const SetObjectStateSchema = z.strictObject({
  type: z.literal('SetObjectState'),
  objectId: IdSchema,
  state: IdSchema,
});

export const CommandSchema = z.discriminatedUnion('type', [
  MovePersonnelSchema,
  MoveEquipmentSchema,
  RotateObjectSchema,
  PickUpEquipmentSchema,
  PlaceEquipmentSchema,
  ConnectPortsSchema,
  DisconnectPortsSchema,
  AssignRoleSchema,
  BeginActionSchema,
  CompleteActionSchema,
  SetObjectStateSchema,
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandInput = z.input<typeof CommandSchema>;
export type CommandType = Command['type'];
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

export const COMMAND_TYPES = CommandSchema.options.map((o) => o.shape.type.value) as readonly CommandType[];

export const CommandTypeSchema = z.enum(COMMAND_TYPES as [CommandType, ...CommandType[]]);

/** All object ids a command refers to (actors, targets, connection endpoints). */
export function commandObjectIds(command: Command): Id[] {
  switch (command.type) {
    case 'MovePersonnel':
      return [command.personnelId];
    case 'MoveEquipment':
      return [command.equipmentId];
    case 'RotateObject':
    case 'SetObjectState':
      return [command.objectId];
    case 'PickUpEquipment':
    case 'PlaceEquipment':
      return [command.personnelId, command.equipmentId];
    case 'ConnectPorts':
      return [command.a.objectId, command.b.objectId];
    case 'DisconnectPorts':
      return [];
    case 'AssignRole':
      return [command.personnelId];
    case 'BeginAction':
      return [...command.actorIds];
    case 'CompleteAction':
      return [];
  }
}

/** Port ids referenced by a command, as `objectId#portId` keys. */
export function commandPortKeys(command: Command): string[] {
  if (command.type === 'ConnectPorts') {
    return [`${command.a.objectId}#${command.a.portId}`, `${command.b.objectId}#${command.b.portId}`];
  }
  return [];
}
