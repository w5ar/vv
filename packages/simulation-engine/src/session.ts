import type { Command, HistoryEntry, SimulationState } from '@fds/domain';
import type { ExerciseContext } from './context';
import { executeCommand, type ExecutionResult } from './engine';
import { createInitialState } from './initial-state';

export interface TimedCommand {
  readonly command: Command;
  readonly time?: number | undefined;
}

/**
 * Replays commands from the initial state. Rejected commands are recorded in
 * the history and skipped, exactly as they were during the original run, so
 * replaying a recorded attempt always reproduces the same final state.
 */
export function replay(
  ctx: ExerciseContext,
  commands: readonly TimedCommand[],
  from: SimulationState = createInitialState(ctx),
): { state: SimulationState; history: HistoryEntry[] } {
  let state = from;
  const history: HistoryEntry[] = [];
  commands.forEach(({ command, time }, attempt) => {
    const result = executeCommand(ctx, state, command, time ?? state.time);
    history.push(toEntry(attempt, command, result, time ?? state.time));
    state = result.state;
  });
  return { state, history };
}

function toEntry(attempt: number, command: Command, result: ExecutionResult, time: number): HistoryEntry {
  return {
    attempt,
    seq: result.accepted ? result.state.seq : null,
    time,
    command,
    accepted: result.accepted,
    events: result.events,
    issues: result.issues,
  };
}

export interface SessionOptions {
  /** Take a full-state snapshot every N accepted commands (default 10). */
  readonly snapshotInterval?: number;
}

/**
 * Stateful wrapper used by interactive modes: keeps the authoritative state,
 * the attempt history (accepted and rejected commands) and periodic
 * snapshots for fast deterministic reconstruction.
 */
export class SimulationSession {
  readonly ctx: ExerciseContext;
  readonly initialState: SimulationState;
  private readonly snapshotInterval: number;
  private current: SimulationState;
  private entries: HistoryEntry[] = [];
  /** snapshots[k] = state after k * interval accepted commands. */
  private snapshots: SimulationState[];

  constructor(ctx: ExerciseContext, options: SessionOptions = {}) {
    this.ctx = ctx;
    this.snapshotInterval = Math.max(1, options.snapshotInterval ?? 10);
    this.initialState = createInitialState(ctx);
    this.current = this.initialState;
    this.snapshots = [this.initialState];
  }

  get state(): SimulationState {
    return this.current;
  }

  get history(): readonly HistoryEntry[] {
    return this.entries;
  }

  get acceptedCommands(): TimedCommand[] {
    return this.entries.filter((e) => e.accepted).map((e) => ({ command: e.command, time: e.time }));
  }

  execute(command: Command, time?: number): ExecutionResult {
    const t = time ?? this.current.time;
    const result = executeCommand(this.ctx, this.current, command, t);
    this.entries = [...this.entries, toEntry(this.entries.length, command, result, t)];
    if (result.accepted) {
      this.current = result.state;
      if (this.current.seq % this.snapshotInterval === 0) this.snapshots = [...this.snapshots, this.current];
    }
    return result;
  }

  /** State after `seq` accepted commands, reconstructed from the nearest snapshot. */
  stateAtSeq(seq: number): SimulationState {
    const accepted = this.acceptedCommands;
    const target = Math.max(0, Math.min(seq, accepted.length));
    const k = Math.min(Math.floor(target / this.snapshotInterval), this.snapshots.length - 1);
    const base = this.snapshots[k] ?? this.initialState;
    return replay(this.ctx, accepted.slice(base.seq, target), base).state;
  }

  /** Reverts the last accepted command by deterministic replay. Rejected attempts stay in history. */
  undo(): boolean {
    if (this.current.seq === 0) return false;
    const target = this.current.seq - 1;
    this.current = this.stateAtSeq(target);
    // Drop the most recent accepted entry and everything after it.
    let idx = -1;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]?.accepted) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) this.entries = this.entries.slice(0, idx);
    this.snapshots = this.snapshots.filter((s) => s.seq <= target);
    return true;
  }

  reset(): void {
    this.current = this.initialState;
    this.entries = [];
    this.snapshots = [this.initialState];
  }
}
