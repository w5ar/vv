import { commandObjectIds, commandPortKeys, type Command, type CommandMatcher, type Id, type Issue, type ObjectSelector, type ObjectState, type SimulationState } from '@fds/domain';
import { placementsOverlap } from '@fds/geometry';
import { evaluateCondition } from './conditions';
import type { ExerciseContext } from './context';
import { categoryOf, objectName, placementOfObject } from './world';

export function commandMatches(matcher: CommandMatcher, command: Command): boolean {
  if (!matcher.commandTypes.includes(command.type)) return false;
  if (matcher.objectIds && !commandObjectIds(command).some((id) => matcher.objectIds?.includes(id))) return false;
  if (matcher.portKeys && !commandPortKeys(command).some((k) => matcher.portKeys?.includes(k))) return false;
  if (matcher.actionIds) {
    const actionId = command.type === 'BeginAction' || command.type === 'CompleteAction' ? command.actionId : undefined;
    if (!actionId || !matcher.actionIds.includes(actionId)) return false;
  }
  return true;
}

/** Evaluates exercise command-precondition rules against the state *before* the command. */
export function checkCommandRules(ctx: ExerciseContext, state: SimulationState, command: Command): Issue[] {
  const issues: Issue[] = [];
  for (const rule of ctx.exercise.rules) {
    if (rule.type !== 'commandPrecondition' || rule.review.status === 'rejected') continue;
    if (!commandMatches(rule.when, command)) continue;
    if (!evaluateCondition(ctx, state, rule.requires)) {
      issues.push({
        code: 'rule.precondition',
        severity: rule.severity,
        message: rule.message,
        ruleId: rule.id,
        objectIds: commandObjectIds(command),
      });
    }
  }
  return issues;
}

export function selectorMatches(ctx: ExerciseContext, selector: ObjectSelector, obj: ObjectState): boolean {
  if (selector.objectIds && !selector.objectIds.includes(obj.id)) return false;
  if (selector.symbolIds && !selector.symbolIds.includes(obj.symbolId)) return false;
  if (selector.kinds && !selector.kinds.includes(obj.kind)) return false;
  if (selector.categories) {
    const cat = categoryOf(ctx, obj);
    if (!cat || !selector.categories.includes(cat)) return false;
  }
  return true;
}

/**
 * Checks prohibited-overlap rules for objects whose placement changed.
 * Overlap is allowed unless a `noOverlap` rule covers the pair; carried
 * equipment is ignored because it is "on" its carrier.
 */
export function checkOverlapRules(ctx: ExerciseContext, state: SimulationState, changedIds: readonly Id[]): Issue[] {
  const issues: Issue[] = [];
  const rules = ctx.exercise.rules.filter((r) => r.type === 'noOverlap' && r.review.status !== 'rejected');
  if (rules.length === 0) return issues;
  for (const id of changedIds) {
    const obj = state.objects[id];
    if (!obj || obj.carriedBy) continue;
    const placement = placementOfObject(ctx, obj);
    if (!placement) continue;
    for (const rule of rules) {
      if (rule.type !== 'noOverlap') continue;
      const inA = selectorMatches(ctx, rule.groupA, obj);
      const inB = selectorMatches(ctx, rule.groupB, obj);
      if (!inA && !inB) continue;
      for (const otherId of state.objectOrder) {
        if (otherId === id) continue;
        const other = state.objects[otherId];
        if (!other || other.carriedBy) continue;
        const pairMatches =
          (inA && selectorMatches(ctx, rule.groupB, other)) || (inB && selectorMatches(ctx, rule.groupA, other));
        if (!pairMatches) continue;
        const otherPlacement = placementOfObject(ctx, other);
        if (otherPlacement && placementsOverlap(placement, otherPlacement)) {
          issues.push({
            code: 'rule.overlap',
            severity: rule.severity,
            message: `${rule.message} (${objectName(ctx, obj)} / ${objectName(ctx, other)})`,
            ruleId: rule.id,
            objectIds: [id, otherId],
          });
        }
      }
    }
  }
  return issues;
}
