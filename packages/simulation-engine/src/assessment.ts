import type { CriterionResult, ExerciseResult, HistoryEntry, Issue, SimulationState } from '@fds/domain';
import type { ExerciseContext } from './context';

export interface ResultMeta {
  readonly mode: 'training' | 'assessment';
  readonly startedAt?: string | undefined;
  readonly finishedAt?: string | undefined;
}

/**
 * Builds a structured result from an attempt history. Scoring is limited to
 * the exercise's own `assessment.criteria`; without criteria the result is
 * a report only (`passed: null`). No implicit penalties are applied.
 */
export function evaluateAttempt(
  ctx: ExerciseContext,
  finalState: SimulationState,
  history: readonly HistoryEntry[],
  meta: ResultMeta,
): ExerciseResult {
  const completedSteps = ctx.stepOrder
    .map((id) => ({ id, rt: finalState.steps[id] }))
    .filter((s) => s.rt?.status === 'completed')
    .map((s) => ({ stepId: s.id, seq: s.rt?.completedSeq ?? 0, outOfOrder: s.rt?.outOfOrder === true }))
    .sort((a, b) => a.seq - b.seq);
  const missingSteps = ctx.requiredStepIds.filter((id) => finalState.steps[id]?.status !== 'completed');

  const orderDeviations = history.flatMap((h) =>
    h.events.flatMap((e) => (e.type === 'OrderDeviation' ? [{ stepId: e.stepId, missingStepIds: e.missingStepIds, attempt: h.attempt }] : [])),
  );
  const rejectedCommands = history
    .filter((h) => !h.accepted)
    .map((h) => ({ attempt: h.attempt, command: h.command, issues: [...h.issues] }));
  const warnings = history.flatMap((h) =>
    h.accepted ? h.issues.filter((i) => i.severity === 'warning').map((issue: Issue) => ({ attempt: h.attempt, issue })) : [],
  );

  const times = history.map((h) => h.time);
  const durationMs = times.length > 0 ? Math.max(...times) - Math.min(...times) : 0;

  const criteria: CriterionResult[] = ctx.exercise.assessment.criteria.map((c) => {
    switch (c.type) {
      case 'allRequiredStepsCompleted':
        return { id: c.id, label: c.label, passed: missingSteps.length === 0, actual: completedSteps.length, limit: ctx.requiredStepIds.length };
      case 'maxRejectedCommands':
        return { id: c.id, label: c.label, passed: rejectedCommands.length <= c.limit, actual: rejectedCommands.length, limit: c.limit };
      case 'maxOrderDeviations':
        return { id: c.id, label: c.label, passed: orderDeviations.length <= c.limit, actual: orderDeviations.length, limit: c.limit };
      case 'timeLimitMs':
        return { id: c.id, label: c.label, passed: durationMs <= c.limit, actual: durationMs, limit: c.limit };
    }
  });

  return {
    exerciseId: ctx.exercise.id,
    mode: meta.mode,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
    durationMs,
    completed: finalState.completed,
    attempts: history.length,
    acceptedCommands: history.filter((h) => h.accepted).length,
    completedSteps,
    missingSteps,
    orderDeviations,
    rejectedCommands,
    warnings,
    criteria,
    passed: criteria.length > 0 ? criteria.every((c) => c.passed) : null,
  };
}
