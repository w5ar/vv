import type { Command, Connection, Id, Issue, SimEvent, SimulationState } from '@fds/domain';
import { distance, lerpAngle, lerpVec, type Vec2 } from '@fds/geometry';
import type { ExerciseContext } from './context';
import { executeCommand } from './engine';
import { createInitialState } from './initial-state';
import { replay } from './session';
import { carriedPosition } from './world';

/**
 * Demonstration timeline.
 *
 * Logical time: every scripted command gets a [startMs, endMs] window. The
 * command is applied to the authoritative state exactly at `endMs`, so the
 * state at any logical time t is "initial state + all commands with
 * endMs <= t" — independent of how the playhead got there (play, seek, step).
 *
 * Visual time: the renderer maps wall-clock time to logical time (speed,
 * pause). In-progress commands are *interpolated* for display only via
 * {@link frameAt}; interpolation never touches the authoritative state.
 */

export interface TimelineEntry {
  /** Index in authoritative (application) order. */
  readonly index: number;
  readonly stepId: Id;
  readonly command: Command;
  readonly startMs: number;
  readonly endMs: number;
  readonly caption?: string | undefined;
  /** Objects visually animated by this command (resources). */
  readonly animates: readonly Id[];
}

export interface TimelineProblem {
  readonly entryIndex: number;
  readonly stepId: Id;
  readonly command: Command;
  readonly issues: Issue[];
}

export interface Timeline {
  readonly entries: readonly TimelineEntry[];
  readonly durationMs: number;
  readonly stepWindows: Readonly<Record<Id, { startMs: number; endMs: number }>>;
  readonly stageWindows: Readonly<Record<Id, { startMs: number; endMs: number }>>;
  /** Commands rejected while compiling (indicates an inconsistent script). */
  readonly problems: readonly TimelineProblem[];
  /** Events produced at each entry (same index as `entries`). */
  readonly events: readonly (readonly SimEvent[])[];
  readonly initialState: SimulationState;
  readonly finalState: SimulationState;
  /** Boundaries (unique endMs values plus 0 and duration) for step forward/back. */
  readonly boundaries: readonly number[];
  readonly snapshotInterval: number;
  /** snapshots[k] = state after k * snapshotInterval applied entries. */
  readonly snapshots: readonly SimulationState[];
}

function animatedObjects(state: SimulationState, command: Command): Id[] {
  const carried = (id: Id) => state.objects[id]?.carrying ?? [];
  switch (command.type) {
    case 'MovePersonnel':
      return [command.personnelId, ...carried(command.personnelId)];
    case 'MoveEquipment':
      return [command.equipmentId];
    case 'RotateObject':
      return [command.objectId];
    case 'PickUpEquipment':
    case 'PlaceEquipment':
      return [command.personnelId, command.equipmentId];
    case 'BeginAction':
      return [...command.actorIds];
    case 'AssignRole':
      return [command.personnelId];
    case 'SetObjectState':
      return [command.objectId];
    case 'ConnectPorts':
    case 'DisconnectPorts':
    case 'CompleteAction':
      return [];
  }
}

function defaultDuration(ctx: ExerciseContext, state: SimulationState, command: Command): number {
  const a = ctx.exercise.animation;
  switch (command.type) {
    case 'MovePersonnel':
    case 'MoveEquipment': {
      const id = command.type === 'MovePersonnel' ? command.personnelId : command.equipmentId;
      const from = state.objects[id]?.position ?? command.to;
      return Math.max(a.minMoveMs, (distance(from, command.to) / a.moveSpeed) * 1000);
    }
    case 'RotateObject':
      return a.rotateMs;
    case 'PickUpEquipment':
      return a.pickUpMs;
    case 'PlaceEquipment':
      return a.placeMs;
    case 'ConnectPorts':
      return a.connectMs;
    case 'DisconnectPorts':
      return a.disconnectMs;
    case 'AssignRole':
      return a.assignRoleMs;
    case 'SetObjectState':
      return a.setStateMs;
    case 'BeginAction':
      return a.beginActionMs;
    case 'CompleteAction': {
      const action = ctx.actions.get(command.actionId);
      return action?.durationMs ?? a.actionMs;
    }
  }
}

/**
 * Compiles step scripts into a timeline.
 *
 * Scheduling (deterministic list scheduling in topological step order):
 * a step starts when all its dependencies have ended (+ stepGapMs) and all
 * objects it animates are free. Independent steps that animate different
 * objects therefore play in parallel. Within a step, commands run
 * sequentially unless marked `withPrevious`.
 */
export function compileTimeline(ctx: ExerciseContext, options: { snapshotInterval?: number } = {}): Timeline {
  const gap = ctx.exercise.animation.stepGapMs;
  const initialState = createInitialState(ctx);

  // Pass 1: schedule, simulating in script order to know positions for durations.
  interface Draft {
    order: number;
    stepId: Id;
    command: Command;
    startMs: number;
    endMs: number;
    caption?: string | undefined;
    animates: Id[];
  }
  const drafts: Draft[] = [];
  const stepEnd = new Map<Id, number>();
  const objectFree = new Map<Id, number>();
  let sim = initialState;

  for (const stepId of ctx.stepOrder) {
    const step = ctx.steps.get(stepId);
    if (!step) continue;
    let probe = sim;
    const stepAnimates = new Set<Id>();
    for (const sc of step.script) {
      for (const id of animatedObjects(probe, sc.command)) stepAnimates.add(id);
      const r = executeCommand(ctx, probe, sc.command, probe.time);
      probe = r.state;
    }
    let start = 0;
    for (const dep of step.dependsOn) start = Math.max(start, (stepEnd.get(dep) ?? 0) + gap);
    for (const id of stepAnimates) start = Math.max(start, objectFree.get(id) ?? 0);

    let cursor = start;
    let prevStart = start;
    let end = start;
    for (const sc of step.script) {
      // Whole milliseconds keep the schedule exact for seeking and UI sliders.
      const duration = Math.round(sc.durationMs ?? defaultDuration(ctx, sim, sc.command));
      const s = (sc.withPrevious ? prevStart : cursor) + Math.round(sc.delayMs);
      const e = s + duration;
      drafts.push({
        order: drafts.length,
        stepId,
        command: sc.command,
        startMs: s,
        endMs: e,
        caption: sc.caption,
        animates: animatedObjects(sim, sc.command),
      });
      sim = executeCommand(ctx, sim, sc.command, e).state;
      prevStart = s;
      cursor = Math.max(cursor, e);
      end = Math.max(end, e);
    }
    stepEnd.set(stepId, end);
    for (const id of stepAnimates) objectFree.set(id, end);
  }

  // Pass 2: authoritative application in end-time order.
  drafts.sort((x, y) => x.endMs - y.endMs || x.order - y.order);
  const interval = Math.max(1, options.snapshotInterval ?? 8);
  const snapshots: SimulationState[] = [initialState];
  const entries: TimelineEntry[] = [];
  const events: SimEvent[][] = [];
  const problems: TimelineProblem[] = [];
  let state = initialState;
  drafts.forEach((d, index) => {
    const r = executeCommand(ctx, state, d.command, d.endMs);
    entries.push({ index, stepId: d.stepId, command: d.command, startMs: d.startMs, endMs: d.endMs, caption: d.caption, animates: d.animates });
    events.push(r.events);
    if (!r.accepted) problems.push({ entryIndex: index, stepId: d.stepId, command: d.command, issues: r.issues });
    // A rejected command leaves state unchanged (exactly like replay) but still occupies its slot.
    state = r.state;
    if ((index + 1) % interval === 0) snapshots.push(state);
  });

  const stepWindows: Record<Id, { startMs: number; endMs: number }> = {};
  for (const e of entries) {
    const w = stepWindows[e.stepId];
    stepWindows[e.stepId] = w
      ? { startMs: Math.min(w.startMs, e.startMs), endMs: Math.max(w.endMs, e.endMs) }
      : { startMs: e.startMs, endMs: e.endMs };
  }
  const stageWindows: Record<Id, { startMs: number; endMs: number }> = {};
  for (const [stageId, stepIds] of ctx.stageSteps) {
    const ws = stepIds.map((id) => stepWindows[id]).filter((w): w is { startMs: number; endMs: number } => !!w);
    if (ws.length > 0) {
      stageWindows[stageId] = { startMs: Math.min(...ws.map((w) => w.startMs)), endMs: Math.max(...ws.map((w) => w.endMs)) };
    }
  }

  const durationMs = entries.reduce((m, e) => Math.max(m, e.endMs), 0);
  const boundaries = [...new Set([0, ...entries.map((e) => e.endMs), durationMs])].sort((a, b) => a - b);

  return {
    entries,
    durationMs,
    stepWindows,
    stageWindows,
    problems,
    events,
    initialState,
    finalState: state,
    boundaries,
    snapshotInterval: interval,
    snapshots,
  };
}

/** Number of entries applied at logical time t (entries with endMs <= t). */
export function appliedCountAt(timeline: Timeline, t: number): number {
  let lo = 0;
  let hi = timeline.entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((timeline.entries[mid]?.endMs ?? Infinity) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Authoritative state after `count` applied entries, reconstructed from the nearest snapshot. */
export function stateAfterEntries(ctx: ExerciseContext, timeline: Timeline, count: number): SimulationState {
  const n = Math.max(0, Math.min(count, timeline.entries.length));
  const k = Math.min(Math.floor(n / timeline.snapshotInterval), timeline.snapshots.length - 1);
  const base = timeline.snapshots[k] ?? timeline.initialState;
  const from = k * timeline.snapshotInterval;
  const rest = timeline.entries.slice(from, n).map((e) => ({ command: e.command, time: e.endMs }));
  return replay(ctx, rest, base).state;
}

export function stateAt(ctx: ExerciseContext, timeline: Timeline, t: number): SimulationState {
  return stateAfterEntries(ctx, timeline, appliedCountAt(timeline, t));
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export interface VisualOverride {
  readonly position?: Vec2;
  readonly rotation?: number;
}

export interface ActiveEntry {
  readonly entry: TimelineEntry;
  /** Linear progress 0..1. */
  readonly progress: number;
}

export interface VisualFrame {
  readonly time: number;
  /** Authoritative state at this time. */
  readonly state: SimulationState;
  readonly appliedCount: number;
  /** Commands in progress (startMs <= t < endMs). */
  readonly active: readonly ActiveEntry[];
  readonly activeStepIds: readonly Id[];
  /** Display-only positions/rotations for animated objects. */
  readonly overrides: Readonly<Record<Id, VisualOverride>>;
  /** Connections being drawn (not yet in state) with progress. */
  readonly pendingConnections: readonly { connection: Connection; progress: number }[];
  /** Connections being removed (still in state) with remaining opacity. */
  readonly fadingConnections: Readonly<Record<Id, number>>;
  /** Personnel currently performing an action/assignment (for highlighting). */
  readonly actingIds: readonly Id[];
  readonly captions: readonly string[];
}

/**
 * Computes what to display at logical time t. Pure: same inputs, same frame.
 */
export function frameAt(ctx: ExerciseContext, timeline: Timeline, t: number): VisualFrame {
  const time = Math.max(0, Math.min(t, timeline.durationMs));
  const appliedCount = appliedCountAt(timeline, time);
  const state = stateAfterEntries(ctx, timeline, appliedCount);
  const active: ActiveEntry[] = [];
  for (let i = appliedCount; i < timeline.entries.length; i++) {
    const e = timeline.entries[i] as TimelineEntry;
    if (e.startMs <= time && time < e.endMs) {
      active.push({ entry: e, progress: e.endMs > e.startMs ? (time - e.startMs) / (e.endMs - e.startMs) : 1 });
    }
  }

  const overrides: Record<Id, VisualOverride> = {};
  const pendingConnections: { connection: Connection; progress: number }[] = [];
  const fadingConnections: Record<Id, number> = {};
  const acting = new Set<Id>();
  const captions: string[] = [];

  for (const { entry, progress } of active) {
    const p = easeInOut(progress);
    const cmd = entry.command;
    if (entry.caption) captions.push(entry.caption);
    switch (cmd.type) {
      case 'MovePersonnel': {
        const obj = state.objects[cmd.personnelId];
        if (obj) overrides[obj.id] = { ...overrides[obj.id], position: lerpVec(obj.position, cmd.to, p) };
        break;
      }
      case 'MoveEquipment': {
        const obj = state.objects[cmd.equipmentId];
        if (obj) overrides[obj.id] = { ...overrides[obj.id], position: lerpVec(obj.position, cmd.to, p) };
        break;
      }
      case 'RotateObject': {
        const obj = state.objects[cmd.objectId];
        if (obj) overrides[obj.id] = { ...overrides[obj.id], rotation: lerpAngle(obj.rotation, cmd.rotation, p) };
        break;
      }
      case 'PickUpEquipment': {
        const person = state.objects[cmd.personnelId];
        const eq = state.objects[cmd.equipmentId];
        if (person && eq) {
          const target = carriedPosition(ctx, person.position, person.carrying.length);
          overrides[eq.id] = { ...overrides[eq.id], position: lerpVec(eq.position, target, p) };
        }
        acting.add(cmd.personnelId);
        break;
      }
      case 'PlaceEquipment': {
        const eq = state.objects[cmd.equipmentId];
        if (eq) {
          overrides[eq.id] = {
            ...overrides[eq.id],
            position: lerpVec(eq.position, cmd.at, p),
            ...(cmd.rotation !== undefined ? { rotation: lerpAngle(eq.rotation, cmd.rotation, p) } : {}),
          };
        }
        acting.add(cmd.personnelId);
        break;
      }
      case 'ConnectPorts':
        pendingConnections.push({
          connection: { id: cmd.connectionId ?? `pending:${entry.index}`, a: cmd.a, b: cmd.b },
          progress: p,
        });
        break;
      case 'DisconnectPorts':
        fadingConnections[cmd.connectionId] = 1 - p;
        break;
      case 'BeginAction':
        for (const id of cmd.actorIds) acting.add(id);
        break;
      case 'CompleteAction':
        for (const id of state.actions[cmd.actionId]?.actorIds ?? []) acting.add(id);
        break;
      case 'AssignRole':
        acting.add(cmd.personnelId);
        break;
      case 'SetObjectState':
        acting.add(cmd.objectId);
        break;
    }
  }

  // Carried items follow their carrier's displayed position.
  for (const id of state.objectOrder) {
    const obj = state.objects[id];
    const ov = obj ? overrides[id] : undefined;
    if (!obj || obj.kind !== 'personnel' || !ov?.position) continue;
    obj.carrying.forEach((itemId, slot) => {
      overrides[itemId] = { ...overrides[itemId], position: carriedPosition(ctx, ov.position as Vec2, slot) };
    });
  }

  const activeStepIds = [...new Set(active.map((a) => a.entry.stepId))];
  return {
    time,
    state,
    appliedCount,
    active,
    activeStepIds,
    overrides,
    pendingConnections,
    fadingConnections,
    actingIds: [...acting],
    captions,
  };
}

export function nextBoundary(timeline: Timeline, t: number): number {
  return timeline.boundaries.find((b) => b > t + 1e-6) ?? timeline.durationMs;
}

export function previousBoundary(timeline: Timeline, t: number): number {
  let prev = 0;
  for (const b of timeline.boundaries) {
    if (b < t - 1e-6) prev = b;
    else break;
  }
  return prev;
}
