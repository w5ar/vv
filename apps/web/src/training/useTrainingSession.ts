import { useCallback, useMemo, useRef, useState } from 'react';
import type { Command, Issue, SimEvent } from '@fds/domain';
import { SimulationSession, type ExecutionResult, type ExerciseContext } from '@fds/simulation-engine';

export interface Feedback {
  readonly id: number;
  readonly command: Command;
  readonly accepted: boolean;
  readonly events: readonly SimEvent[];
  readonly issues: readonly Issue[];
}

/**
 * Interactive session state for training/assessment. The SimulationSession is
 * the single source of truth; React state only tracks a version counter and
 * the latest feedback. Logical time = milliseconds since the session started.
 */
export function useTrainingSession(ctx: ExerciseContext) {
  const session = useMemo(() => new SimulationSession(ctx), [ctx]);
  const [, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const startRef = useRef<{ perf: number; iso: string } | null>(null);
  const counter = useRef(0);

  const execute = useCallback(
    (command: Command): ExecutionResult => {
      startRef.current ??= { perf: performance.now(), iso: new Date().toISOString() };
      const time = Math.round(performance.now() - startRef.current.perf);
      const result = session.execute(command, time);
      setFeedback({ id: ++counter.current, command, accepted: result.accepted, events: result.events, issues: result.issues });
      setVersion((v) => v + 1);
      return result;
    },
    [session],
  );

  /** Executes several commands as one user gesture; stops at the first rejection. */
  const executeAll = useCallback(
    (commands: readonly Command[]): boolean => {
      for (const c of commands) if (!execute(c).accepted) return false;
      return true;
    },
    [execute],
  );

  const undo = useCallback(() => {
    if (session.undo()) {
      setFeedback(null);
      setVersion((v) => v + 1);
    }
  }, [session]);

  const reset = useCallback(() => {
    session.reset();
    startRef.current = null;
    setFeedback(null);
    setVersion((v) => v + 1);
  }, [session]);

  return {
    session,
    state: session.state,
    history: session.history,
    feedback,
    startedAt: startRef.current?.iso,
    execute,
    executeAll,
    undo,
    reset,
  };
}
