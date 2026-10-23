import type { Command } from './commands';
import type { Id, Vec2 } from './common';
import type { Issue } from './issues';
import type { Connection } from './scene';

/** Structured events emitted by the simulation engine. */
export type SimEvent =
  | { type: 'PersonnelMoved'; personnelId: Id; from: Vec2; to: Vec2 }
  | { type: 'EquipmentMoved'; equipmentId: Id; from: Vec2; to: Vec2 }
  | { type: 'ObjectRotated'; objectId: Id; from: number; to: number }
  | { type: 'EquipmentPickedUp'; personnelId: Id; equipmentId: Id; from: Vec2 }
  | { type: 'EquipmentPlaced'; personnelId: Id; equipmentId: Id; at: Vec2; rotation: number }
  | { type: 'PortsConnected'; connection: Connection; actorId?: Id | undefined }
  | { type: 'PortsDisconnected'; connection: Connection; actorId?: Id | undefined }
  | { type: 'HoseLaid'; equipmentId: Id; personnelId?: Id | undefined; from: Vec2; to: Vec2 }
  | { type: 'HoseRolledUp'; equipmentId: Id; personnelId?: Id | undefined; at: Vec2 }
  | { type: 'EquipmentHandedOver'; fromId: Id; toId: Id; equipmentId: Id }
  | { type: 'RoleAssigned'; personnelId: Id; roleId: Id | null; previousRoleId: Id | null }
  | { type: 'ActionBegan'; actionId: Id; actorIds: Id[] }
  | { type: 'ActionCompleted'; actionId: Id }
  | { type: 'ObjectStateChanged'; objectId: Id; from: Id | null; to: Id }
  | { type: 'StepAvailable'; stepId: Id }
  | { type: 'StepCompleted'; stepId: Id; outOfOrder: boolean }
  | { type: 'StageCompleted'; stageId: Id }
  | { type: 'ExerciseCompleted' }
  | { type: 'OrderDeviation'; stepId: Id; missingStepIds: Id[] }
  | { type: 'RuleWarning'; ruleId: Id; message: string };

export type SimEventType = SimEvent['type'];

/** One entry in the session history: an attempted command and its outcome. */
export interface HistoryEntry {
  /** Attempt index (accepted and rejected commands). */
  readonly attempt: number;
  /** Sequence number after applying (accepted only). */
  readonly seq: number | null;
  readonly time: number;
  readonly command: Command;
  readonly accepted: boolean;
  readonly events: readonly SimEvent[];
  readonly issues: readonly Issue[];
}
