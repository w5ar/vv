import { commandObjectIds, conditionObjectIds, portRefKey, walkCondition, type Id, type PortRef, type SimulationState } from '@fds/domain';
import { evaluateTargets } from '@fds/connection-engine';
import type { ObjectHighlight, PortHighlight } from '@fds/reactflow-renderer';
import { connectionWorld, type ExerciseContext } from '@fds/simulation-engine';

/** Objects and zones relevant to the given steps (for highlighting). */
export function stepFocus(ctx: ExerciseContext, stepIds: readonly Id[]): { objects: Set<Id>; zones: Set<Id> } {
  const objects = new Set<Id>();
  const zones = new Set<Id>();
  for (const id of stepIds) {
    const step = ctx.steps.get(id);
    if (!step) continue;
    for (const o of conditionObjectIds(step.completedWhen)) objects.add(o);
    for (const sc of step.script) for (const o of commandObjectIds(sc.command)) objects.add(o);
    walkCondition(step.completedWhen, (c) => {
      if (c.type === 'inZone') zones.add(c.zoneId);
    });
  }
  return { objects, zones };
}

export function highlightMap(entries: Iterable<[Id, ObjectHighlight]>): Map<Id, ObjectHighlight> {
  const out = new Map<Id, ObjectHighlight>();
  const rank: Record<ObjectHighlight, number> = { hint: 0, active: 1, acting: 2, invalid: 3 };
  for (const [id, h] of entries) {
    const prev = out.get(id);
    if (!prev || rank[h] > rank[prev]) out.set(id, h);
  }
  return out;
}

/** Port highlights while a connection gesture starts from `source`: valid targets vs others. */
export function connectionTargetHighlights(ctx: ExerciseContext, state: SimulationState, source: PortRef | null): Map<string, PortHighlight> {
  const out = new Map<string, PortHighlight>();
  if (!source) return out;
  out.set(portRefKey(source), 'source');
  for (const t of evaluateTargets(ctx.catalog, connectionWorld(state), source, { maxDistance: ctx.exercise.settings.connectionMaxDistance })) {
    out.set(portRefKey(t.port.ref), t.valid ? 'valid' : 'invalid');
  }
  return out;
}

export function roleLabelFor(ctx: ExerciseContext): (roleId: Id) => string {
  return (roleId) => {
    const r = ctx.catalog.roles.get(roleId);
    return r?.abbreviation ?? r?.name ?? roleId;
  };
}
