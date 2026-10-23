import {
  indexCatalog,
  type Catalog,
  type CatalogIndex,
  type Exercise,
  type Id,
  type ProceduralAction,
  type Stage,
  type Step,
  type Zone,
} from '@fds/domain';

/**
 * Pre-computed lookup structure for one exercise + catalog pair.
 * Built once and shared by all engine functions; never mutated.
 */
export interface ExerciseContext {
  readonly exercise: Exercise;
  readonly catalog: CatalogIndex;
  readonly steps: ReadonlyMap<Id, Step>;
  /** Steps in a deterministic topological order (declaration order breaks ties). */
  readonly stepOrder: readonly Id[];
  /** Step ids participating in a dependency cycle or depending on unknown steps. */
  readonly invalidDependencySteps: readonly Id[];
  readonly actions: ReadonlyMap<Id, ProceduralAction>;
  readonly zones: ReadonlyMap<Id, Zone>;
  readonly stages: ReadonlyMap<Id, Stage>;
  readonly stageSteps: ReadonlyMap<Id, readonly Id[]>;
  readonly requiredStepIds: readonly Id[];
}

function byId<T extends { id: Id }>(items: readonly T[]): Map<Id, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** Kahn's algorithm with declaration order as tie-breaker. */
export function topologicalStepOrder(steps: readonly Step[]): { order: Id[]; invalid: Id[] } {
  const ids = new Set(steps.map((s) => s.id));
  const indegree = new Map<Id, number>();
  const dependents = new Map<Id, Id[]>();
  const invalid = new Set<Id>();
  for (const s of steps) {
    indegree.set(s.id, 0);
    dependents.set(s.id, []);
  }
  for (const s of steps) {
    for (const d of s.dependsOn) {
      if (!ids.has(d)) {
        invalid.add(s.id);
        continue;
      }
      indegree.set(s.id, (indegree.get(s.id) ?? 0) + 1);
      dependents.get(d)?.push(s.id);
    }
  }
  const declIndex = new Map(steps.map((s, i) => [s.id, i]));
  const ready = steps.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  const order: Id[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (declIndex.get(a) ?? 0) - (declIndex.get(b) ?? 0));
    const next = ready.shift() as Id;
    order.push(next);
    for (const dep of dependents.get(next) ?? []) {
      const n = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, n);
      if (n === 0) ready.push(dep);
    }
  }
  for (const s of steps) {
    if (!order.includes(s.id)) {
      invalid.add(s.id);
      order.push(s.id);
    }
  }
  return { order, invalid: [...invalid] };
}

export function createExerciseContext(exercise: Exercise, catalog: Catalog): ExerciseContext {
  const { order, invalid } = topologicalStepOrder(exercise.steps);
  const stageSteps = new Map<Id, Id[]>();
  for (const stage of exercise.stages) stageSteps.set(stage.id, []);
  for (const step of exercise.steps) {
    if (step.stageId) stageSteps.get(step.stageId)?.push(step.id);
  }
  const requiredStepIds =
    exercise.completion.requiredSteps === 'all'
      ? exercise.steps.filter((s) => !s.optional).map((s) => s.id)
      : [...exercise.completion.requiredSteps];
  return {
    exercise,
    catalog: indexCatalog(catalog, exercise.roles),
    steps: byId(exercise.steps),
    stepOrder: order,
    invalidDependencySteps: invalid,
    actions: byId(exercise.actions),
    zones: byId(exercise.initialScene.zones),
    stages: byId(exercise.stages),
    stageSteps,
    requiredStepIds,
  };
}
