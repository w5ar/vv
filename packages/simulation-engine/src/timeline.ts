import type { AudioPlan, Command, Connection, HoseLayout, Id, Issue, SimEvent, SimulationState, Voice } from '@fds/domain';
import { distance, lerpAngle, lerpVec, type Vec2 } from '@fds/geometry';
import type { ExerciseContext } from './context';
import { resolveLayFrom } from './commands';
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
 *
 * Sound (optional): audio cues are placed on the same logical time line. A step
 * lasts at least as long as its cues, an order cue starts together with its
 * action (which lasts at least as long as the order), and cues never overlap.
 */

export interface TimelineAudio {
  readonly mode: 'zapovijedi' | 'zapovijedi-opis';
  readonly plan: AudioPlan;
  /** Durations (ms) of the available clips; cues of clips without a duration are skipped. */
  readonly durations: ReadonlyMap<Id, number>;
}

export interface TimelineCue {
  readonly clipId: Id;
  readonly stepId: Id;
  readonly voice: Voice;
  readonly text: string;
  readonly actionId?: Id | undefined;
  readonly startMs: number;
  readonly endMs: number;
}

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
  /** Audio cues in time order (empty without sound). */
  readonly audio: readonly TimelineCue[];
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
    case 'LayHose':
    case 'RollUpHose':
      return command.personnelId ? [command.equipmentId, command.personnelId] : [command.equipmentId];
    case 'HandOverEquipment':
      return [command.fromId, command.toId, command.equipmentId];
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
    case 'LayHose':
      return Math.max(a.minMoveMs, (distance(resolveLayFrom(ctx, state, command), command.to) / a.hoseSpeed) * 1000);
    case 'RollUpHose': {
      const layout = state.objects[command.equipmentId]?.layout;
      return Math.max(a.minMoveMs, layout ? (distance(layout.a, layout.b) / a.hoseSpeed) * 1000 : 0);
    }
    case 'HandOverEquipment':
      return a.handOverMs;
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
export function compileTimeline(ctx: ExerciseContext, options: { snapshotInterval?: number; audio?: TimelineAudio } = {}): Timeline {
  const gap = ctx.exercise.animation.stepGapMs;
  const initialState = createInitialState(ctx);
  const audio = options.audio;
  const clips = new Map(audio?.plan.clips.map((c) => [c.id, c]) ?? []);
  const cues: TimelineCue[] = [];
  let audioFree = 0;

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
  /** Start of steps with sound (their first cue may begin before their first command). */
  const stepStart = new Map<Id, number>();
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

    // Audio cues of this step: order cues bound to their BeginAction, descriptions in between.
    const stepCues = (audio?.plan.steps[stepId] ?? []).filter(
      (c) => audio?.durations.has(c.clipId) && clips.has(c.clipId) && (audio.mode === 'zapovijedi-opis' || c.actionId !== undefined),
    );
    const bound = new Map<number, { clipId: Id; actionId: Id; before: Id[] }>();
    let pending: Id[] = [];
    for (const c of stepCues) {
      const at = c.actionId ? step.script.findIndex((sc) => sc.command.type === 'BeginAction' && sc.command.actionId === c.actionId) : -1;
      if (c.actionId && at >= 0 && !bound.has(at)) {
        bound.set(at, { clipId: c.clipId, actionId: c.actionId, before: pending });
        pending = [];
      } else pending.push(c.clipId);
    }
    if (stepCues.length > 0) start = Math.max(start, audioFree);
    let audioT = start;
    const playCue = (clipId: Id, at: number, actionId?: Id) => {
      const clip = clips.get(clipId);
      const d = Math.round(audio?.durations.get(clipId) ?? 0);
      if (!clip || d <= 0) return at;
      cues.push({ clipId, stepId, voice: clip.voice, text: clip.text, actionId, startMs: at, endMs: at + d });
      return at + d;
    };
    const orderEnd = new Map<Id, number>();

    let cursor = start;
    let prevStart = start;
    let end = start;
    for (const [i, sc] of step.script.entries()) {
      // Whole milliseconds keep the schedule exact for seeking and UI sliders.
      let duration = Math.round(sc.durationMs ?? defaultDuration(ctx, sim, sc.command));
      let s = (sc.withPrevious ? prevStart : cursor) + Math.round(sc.delayMs);
      const order = bound.get(i);
      if (order) {
        // The description before the order is finished first; the order is spoken as the action begins.
        for (const clipId of order.before) audioT = playCue(clipId, audioT);
        s = Math.max(s, audioT);
        audioT = playCue(order.clipId, s, order.actionId);
        orderEnd.set(order.actionId, audioT);
      }
      if (sc.command.type === 'CompleteAction') {
        const spoken = orderEnd.get(sc.command.actionId);
        if (spoken !== undefined) duration = Math.max(duration, spoken - s);
      }
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
    for (const clipId of pending) audioT = playCue(clipId, audioT);
    if (stepCues.length > 0) {
      end = Math.max(end, audioT);
      audioFree = audioT;
      stepStart.set(stepId, start);
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
  // A step's sound may start before and end after its commands; the window covers both.
  for (const [stepId, startMs] of stepStart) {
    const w = stepWindows[stepId];
    const endMs = stepEnd.get(stepId) ?? startMs;
    stepWindows[stepId] = w ? { startMs: Math.min(w.startMs, startMs), endMs: Math.max(w.endMs, endMs) } : { startMs, endMs };
  }
  const stageWindows: Record<Id, { startMs: number; endMs: number }> = {};
  for (const [stageId, stepIds] of ctx.stageSteps) {
    const ws = stepIds.map((id) => stepWindows[id]).filter((w): w is { startMs: number; endMs: number } => !!w);
    if (ws.length > 0) {
      stageWindows[stageId] = { startMs: Math.min(...ws.map((w) => w.startMs)), endMs: Math.max(...ws.map((w) => w.endMs)) };
    }
  }

  cues.sort((a, b) => a.startMs - b.startMs);
  const durationMs = Math.max(
    entries.reduce((m, e) => Math.max(m, e.endMs), 0),
    cues.reduce((m, c) => Math.max(m, c.endMs), 0),
  );
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
    audio: cues,
    snapshotInterval: interval,
    snapshots,
  };
}

/** The audio cue playing at logical time t, if any. */
export function cueAt(timeline: Timeline, t: number): TimelineCue | null {
  for (const c of timeline.audio) {
    if (c.startMs > t) break;
    if (t < c.endMs) return c;
  }
  return null;
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
  /** Hose being laid or rolled up: displayed extent. */
  readonly layout?: HoseLayout;
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
  /** Audio cue playing at this time (sound modes only). */
  readonly cue: TimelineCue | null;
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
        if (cmd.actorId) acting.add(cmd.actorId);
        break;
      case 'DisconnectPorts':
        fadingConnections[cmd.connectionId] = 1 - p;
        if (cmd.actorId) acting.add(cmd.actorId);
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
        if (cmd.actorId) acting.add(cmd.actorId);
        break;
      case 'LayHose': {
        const from = resolveLayFrom(ctx, state, cmd);
        overrides[cmd.equipmentId] = { ...overrides[cmd.equipmentId], layout: { a: from, b: lerpVec(from, cmd.to, p) } };
        if (cmd.personnelId) acting.add(cmd.personnelId);
        break;
      }
      case 'RollUpHose': {
        const layout = state.objects[cmd.equipmentId]?.layout;
        if (layout) overrides[cmd.equipmentId] = { ...overrides[cmd.equipmentId], layout: { a: layout.a, b: lerpVec(layout.b, layout.a, p) } };
        if (cmd.personnelId) acting.add(cmd.personnelId);
        break;
      }
      case 'HandOverEquipment': {
        const to = state.objects[cmd.toId];
        const eq = state.objects[cmd.equipmentId];
        if (to && eq) {
          const target = carriedPosition(ctx, to.position, to.carrying.length);
          overrides[eq.id] = { ...overrides[eq.id], position: lerpVec(eq.position, target, p) };
        }
        acting.add(cmd.fromId);
        acting.add(cmd.toId);
        break;
      }
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

  const cue = cueAt(timeline, time);
  const activeStepIds = [...new Set([...active.map((a) => a.entry.stepId), ...(cue ? [cue.stepId] : [])])];
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
    cue,
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
