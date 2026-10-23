import type { Command, Issue, SimEvent, SimulationState } from '@fds/domain';
import { applyIntrinsic, validateIntrinsic } from './commands';
import type { ExerciseContext } from './context';
import { advanceProcedure, findOrderDeviations } from './procedure';
import { checkCommandRules, checkOverlapRules } from './rules';

export type ExecutionResult =
  | { accepted: true; state: SimulationState; events: SimEvent[]; issues: Issue[] }
  | { accepted: false; state: SimulationState; events: []; issues: Issue[] };

function stepTitle(ctx: ExerciseContext, id: string): string {
  return ctx.steps.get(id)?.title ?? id;
}

/**
 * Validates and executes one command. Pure and deterministic: the result
 * depends only on (context, state, command, time).
 *
 * Pipeline:
 *  1. intrinsic validation (existence, carrying, proximity, port rules)
 *  2. exercise command-precondition rules (on the state before the command)
 *  3. tentative application
 *  4. prohibited-overlap rules (on the state after the command)
 *  5. order policy (actions that satisfy a step whose dependencies are incomplete)
 *  6. procedural progression (step state machine, stage/exercise completion)
 *
 * Rejected commands leave the state untouched.
 */
export function executeCommand(
  ctx: ExerciseContext,
  state: SimulationState,
  command: Command,
  time: number = state.time,
): ExecutionResult {
  const reject = (issues: Issue[]): ExecutionResult => ({ accepted: false, state, events: [], issues });

  const intrinsic = validateIntrinsic(ctx, state, command);
  if (intrinsic.some((i) => i.severity === 'error')) return reject(intrinsic);

  const ruleIssues = checkCommandRules(ctx, state, command);
  if (ruleIssues.some((i) => i.severity === 'error')) return reject([...intrinsic, ...ruleIssues]);

  const timed: SimulationState = { ...state, time: Math.max(state.time, time) };
  const applied = applyIntrinsic(ctx, timed, command);
  const next: SimulationState = { ...applied.state, seq: state.seq + 1 };

  const overlap = checkOverlapRules(ctx, next, applied.moved);
  if (overlap.some((i) => i.severity === 'error')) return reject([...intrinsic, ...ruleIssues, ...overlap]);

  const warnings: Issue[] = [...intrinsic, ...ruleIssues, ...overlap];
  const events: SimEvent[] = [...applied.events];
  for (const w of warnings) {
    if (w.ruleId) events.push({ type: 'RuleWarning', ruleId: w.ruleId, message: w.message });
  }

  const policy = ctx.exercise.settings.orderPolicy;
  const deviations = policy === 'ignore' ? [] : findOrderDeviations(ctx, state, next);
  if (deviations.length > 0) {
    const orderIssues: Issue[] = deviations.map((d) => ({
      code: 'order.dependencies-missing',
      severity: policy === 'reject' ? 'error' : 'warning',
      message: `Korak „${stepTitle(ctx, d.stepId)}” izvodi se prije koraka: ${d.missingStepIds.map((s) => `„${stepTitle(ctx, s)}”`).join(', ')}.`,
      stepId: d.stepId,
    }));
    if (policy === 'reject') return reject([...warnings, ...orderIssues]);
    warnings.push(...orderIssues);
    for (const d of deviations) events.push({ type: 'OrderDeviation', stepId: d.stepId, missingStepIds: d.missingStepIds });
  }

  const progressed = advanceProcedure(ctx, state, next, deviations);
  return { accepted: true, state: progressed.state, events: [...events, ...progressed.events], issues: warnings };
}

/** Validation without execution (used for previews and highlighting). */
export function canExecute(ctx: ExerciseContext, state: SimulationState, command: Command): { ok: boolean; issues: Issue[] } {
  const result = executeCommand(ctx, state, command);
  return { ok: result.accepted, issues: result.issues };
}
