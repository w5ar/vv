import type { Id, SimEvent, SimulationState, StepRuntime } from '@fds/domain';
import { evaluateCondition } from './conditions';
import type { ExerciseContext } from './context';

/**
 * Procedural progression as an explicit state machine per step:
 *
 *   locked ──(all dependsOn completed)──▶ available ──(completedWhen holds)──▶ completed
 *
 * Completion is latched: later state changes never revert a completed step.
 * A locked step whose condition becomes true is reported as an order
 * deviation (see {@link findOrderDeviations}) and completes as soon as its
 * dependencies are completed, if its condition still holds then.
 */

export function dependenciesMet(ctx: ExerciseContext, state: SimulationState, stepId: Id): boolean {
  const step = ctx.steps.get(stepId);
  if (!step) return false;
  return step.dependsOn.every((d) => state.steps[d]?.status === 'completed');
}

export function missingDependencies(ctx: ExerciseContext, state: SimulationState, stepId: Id): Id[] {
  const step = ctx.steps.get(stepId);
  if (!step) return [];
  return step.dependsOn.filter((d) => state.steps[d]?.status !== 'completed');
}

export interface OrderDeviation {
  readonly stepId: Id;
  readonly missingStepIds: Id[];
}

/**
 * Locked steps whose completion condition became true between `prev` and `next`.
 * These represent actions performed before the procedure allows them.
 */
export function findOrderDeviations(ctx: ExerciseContext, prev: SimulationState, next: SimulationState): OrderDeviation[] {
  const out: OrderDeviation[] = [];
  for (const id of ctx.stepOrder) {
    const rt = next.steps[id];
    const step = ctx.steps.get(id);
    if (!rt || !step || rt.status !== 'locked') continue;
    if (dependenciesMet(ctx, next, id)) continue;
    const before = evaluateCondition(ctx, prev, step.completedWhen);
    const after = evaluateCondition(ctx, next, step.completedWhen);
    if (!before && after) out.push({ stepId: id, missingStepIds: missingDependencies(ctx, next, id) });
  }
  return out;
}

export function isStageComplete(ctx: ExerciseContext, state: SimulationState, stageId: Id): boolean {
  const ids = ctx.stageSteps.get(stageId) ?? [];
  const required = ids.filter((id) => !ctx.steps.get(id)?.optional);
  return required.length > 0 && required.every((id) => state.steps[id]?.status === 'completed');
}

export function isExerciseComplete(ctx: ExerciseContext, state: SimulationState): boolean {
  if (!ctx.requiredStepIds.every((id) => state.steps[id]?.status === 'completed')) return false;
  const final = ctx.exercise.completion.finalCondition;
  return final ? evaluateCondition(ctx, state, final) : true;
}

/**
 * Advances step statuses to a fixpoint after a state change and emits
 * StepAvailable / StepCompleted / StageCompleted / ExerciseCompleted events.
 */
export function advanceProcedure(
  ctx: ExerciseContext,
  prev: SimulationState,
  next: SimulationState,
  deviations: readonly OrderDeviation[],
): { state: SimulationState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const steps: Record<Id, StepRuntime> = { ...next.steps };
  for (const d of deviations) {
    const rt = steps[d.stepId];
    if (rt && rt.status === 'locked') steps[d.stepId] = { ...rt, outOfOrder: true };
  }

  let working: SimulationState = { ...next, steps };
  let changed = true;
  let guard = 0;
  while (changed && guard++ <= ctx.stepOrder.length + 1) {
    changed = false;
    for (const id of ctx.stepOrder) {
      const step = ctx.steps.get(id);
      const rt = steps[id] ?? { status: 'locked' as const };
      if (!step || rt.status === 'completed') continue;
      if (ctx.invalidDependencySteps.includes(id) || !dependenciesMet(ctx, working, id)) continue;
      if (rt.status === 'locked') {
        steps[id] = { ...rt, status: 'available' };
        events.push({ type: 'StepAvailable', stepId: id });
        changed = true;
      }
      working = { ...working, steps };
      if (evaluateCondition(ctx, working, step.completedWhen)) {
        const outOfOrder = steps[id]?.outOfOrder === true;
        steps[id] = { status: 'completed', completedAt: next.time, completedSeq: next.seq, outOfOrder };
        events.push({ type: 'StepCompleted', stepId: id, outOfOrder });
        changed = true;
      }
      working = { ...working, steps };
    }
  }

  for (const stageId of ctx.stages.keys()) {
    if (!isStageComplete(ctx, prev, stageId) && isStageComplete(ctx, working, stageId)) {
      // Initial-state completion (prev === next) is also reported once.
      events.push({ type: 'StageCompleted', stageId });
    }
  }

  if (!working.completed && isExerciseComplete(ctx, working)) {
    working = { ...working, completed: true, completedAt: next.time };
    events.push({ type: 'ExerciseCompleted' });
  }
  return { state: working, events };
}
