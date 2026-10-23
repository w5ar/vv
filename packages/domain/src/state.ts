import type { Id, Vec2 } from './common';
import type { Connection } from './scene';

/**
 * Runtime simulation state. Plain JSON-serializable data so it can be
 * snapshotted, compared and persisted. Never mutated in place: the engine
 * returns new state objects.
 */

export type ObjectKind = 'personnel' | 'equipment';

export interface ObjectState {
  readonly id: Id;
  readonly kind: ObjectKind;
  readonly symbolId: Id;
  readonly label?: string | undefined;
  readonly position: Vec2;
  readonly rotation: number;
  /** Personnel only. */
  readonly roleId: Id | null;
  /** Equipment only: equipment type id. */
  readonly typeId: Id | null;
  /** Equipment only: carrier personnel id. */
  readonly carriedBy: Id | null;
  /** Personnel only: carried equipment ids, in pick-up order. */
  readonly carrying: readonly Id[];
  readonly visualState: Id | null;
  /** Hoses only: world positions of end A and end B while laid; null when rolled or rigid. */
  readonly layout: HoseLayout | null;
}

export interface HoseLayout {
  readonly a: Vec2;
  readonly b: Vec2;
}

export type StepStatus = 'locked' | 'available' | 'completed';

export interface StepRuntime {
  readonly status: StepStatus;
  readonly completedAt?: number | undefined;
  readonly completedSeq?: number | undefined;
  /** True if the step's completion condition held before its dependencies were completed. */
  readonly outOfOrder?: boolean | undefined;
}

export interface ActionRuntime {
  readonly status: 'active' | 'completed';
  readonly actorIds: readonly Id[];
  readonly startedAt: number;
  readonly completedAt?: number | undefined;
}

export interface SimulationState {
  /** Number of accepted commands applied so far. */
  readonly seq: number;
  /** Logical simulation time (ms) of the last applied command. */
  readonly time: number;
  readonly objects: Readonly<Record<Id, ObjectState>>;
  /** Deterministic iteration order of objects. */
  readonly objectOrder: readonly Id[];
  readonly connections: Readonly<Record<Id, Connection>>;
  readonly connectionOrder: readonly Id[];
  readonly actions: Readonly<Record<Id, ActionRuntime>>;
  readonly steps: Readonly<Record<Id, StepRuntime>>;
  readonly completed: boolean;
  readonly completedAt?: number | undefined;
}
