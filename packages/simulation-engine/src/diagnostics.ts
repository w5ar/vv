import { validateConnection } from '@fds/connection-engine';
import {
  commandObjectIds,
  walkCondition,
  type Catalog,
  type Command,
  type Condition,
  type Diagnostic,
  type Exercise,
  type Id,
  type SimulationState,
} from '@fds/domain';
import { evaluateCondition } from './conditions';
import { createExerciseContext, type ExerciseContext } from './context';
import { createInitialState } from './initial-state';
import { compileTimeline, stateAt, type Timeline } from './timeline';
import { connectionWorld } from './world';

/**
 * Static and dynamic consistency checks for an exercise against its catalog.
 * Used by the import pipeline (stage F) and the editor's live validation.
 */

function d(code: string, severity: Diagnostic['severity'], message: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code, severity, message, stage: 'F', ...extra };
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
}

export function checkCatalog(catalog: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const cats = new Set(catalog.categories.map((c) => c.id));
  const portTypes = new Set(catalog.portTypes.map((p) => p.id));
  const symbols = new Set(catalog.symbols.map((s) => s.id));
  for (const [kind, ids] of [
    ['symbol', catalog.symbols.map((s) => s.id)],
    ['portType', catalog.portTypes.map((p) => p.id)],
    ['equipmentType', catalog.equipmentTypes.map((e) => e.id)],
    ['role', catalog.roles.map((r) => r.id)],
    ['connectionRule', catalog.connectionRules.map((r) => r.id)],
  ] as const) {
    for (const id of duplicates(ids)) out.push(d('id.duplicate', 'error', `Dvostruki identifikator (${kind}): ${id}`, { subjectId: id }));
  }
  catalog.symbols.forEach((s, i) => {
    const path = `symbols[${i}]`;
    if (!cats.has(s.category)) {
      out.push(d('ref.unknown-category', 'error', `Simbol ${s.id}: nepoznata kategorija „${s.category}”.`, { path, subjectId: s.id }));
    }
    for (const dup of duplicates(s.ports.map((p) => p.id))) {
      out.push(d('id.duplicate', 'error', `Simbol ${s.id}: dvostruki priključak „${dup}”.`, { path, subjectId: s.id }));
    }
    s.ports.forEach((p, j) => {
      if (!portTypes.has(p.type)) {
        out.push(d('ref.unknown-port-type', 'error', `Simbol ${s.id}, priključak ${p.id}: nepoznata vrsta „${p.type}”.`, { path: `${path}.ports[${j}]`, subjectId: s.id }));
      }
      const { x, y } = p.position;
      if (x < 0 || y < 0 || x > s.size.width || y > s.size.height) {
        out.push(d('geometry.port-outside', 'warning', `Simbol ${s.id}, priključak ${p.id} nalazi se izvan granica simbola.`, { path: `${path}.ports[${j}]`, subjectId: s.id }));
      }
    });
    if (s.defaultState && !s.visualStates.some((v) => v.id === s.defaultState)) {
      out.push(d('ref.unknown-state', 'error', `Simbol ${s.id}: zadano stanje „${s.defaultState}” nije definirano.`, { path, subjectId: s.id }));
    }
    if (s.asset.elementId && !s.asset.viewBox) {
      out.push(d('asset.viewbox-required', 'warning', `Simbol ${s.id}: za element „${s.asset.elementId}” potrebno je navesti viewBox.`, { path, subjectId: s.id }));
    }
  });
  catalog.equipmentTypes.forEach((e, i) => {
    const path = `equipmentTypes[${i}]`;
    if (!symbols.has(e.symbolId)) {
      out.push(d('ref.unknown-symbol', 'error', `Vrsta opreme ${e.id}: nepoznat simbol „${e.symbolId}”.`, { path, subjectId: e.id }));
    }
    for (const ref of [e.laidSymbolId, e.depiction?.attachedSymbolId]) {
      if (ref && !symbols.has(ref)) out.push(d('ref.unknown-symbol', 'error', `Vrsta opreme ${e.id}: nepoznat simbol „${ref}”.`, { path, subjectId: e.id }));
    }
    if (e.form === 'hose') {
      const symbol = catalog.symbols.find((s) => s.id === e.symbolId);
      if (!e.hoseEnds) {
        out.push(d('catalog.hose-ends-missing', 'error', `Cijev ${e.id}: nisu navedeni krajevi (hoseEnds).`, { path, subjectId: e.id }));
      } else if (symbol) {
        for (const end of e.hoseEnds) {
          if (!symbol.ports.some((p) => p.id === end)) {
            out.push(d('ref.unknown-port', 'error', `Cijev ${e.id}: simbol nema priključak „${end}”.`, { path, subjectId: e.id }));
          }
        }
      }
    }
  });
  catalog.roles.forEach((r, i) => {
    if (r.symbolId && !symbols.has(r.symbolId)) {
      out.push(d('ref.unknown-symbol', 'error', `Uloga ${r.id}: nepoznat simbol „${r.symbolId}”.`, { path: `roles[${i}]`, subjectId: r.id }));
    }
  });
  catalog.connectionRules.forEach((r, i) => {
    for (const t of r.portTypes) {
      if (!portTypes.has(t)) {
        out.push(d('ref.unknown-port-type', 'error', `Pravilo spajanja ${r.id}: nepoznata vrsta priključka „${t}”.`, { path: `connectionRules[${i}]`, subjectId: r.id }));
      }
    }
  });
  return out;
}

function conditionRefs(ctx: ExerciseContext, state: SimulationState, cond: Condition, path: string, out: Diagnostic[]): void {
  const obj = (id: Id) => {
    if (!state.objects[id]) out.push(d('ref.unknown-object', 'error', `${path}: nepoznat objekt „${id}”.`, { path, subjectId: id }));
  };
  const type = (typeId: Id) => {
    if (!ctx.catalog.equipmentTypes.has(typeId)) out.push(d('ref.unknown-equipment-type', 'error', `${path}: nepoznata vrsta opreme „${typeId}”.`, { path }));
  };
  const port = (sel: { objectId?: Id | undefined; typeId?: Id | undefined; portId?: Id | undefined }) => {
    if (!sel.objectId && !sel.typeId) {
      out.push(d('condition.selector-empty', 'error', `${path}: odabir priključka mora navesti objekt ili vrstu opreme.`, { path }));
      return;
    }
    if (sel.typeId) type(sel.typeId);
    const symbolId = sel.objectId
      ? state.objects[sel.objectId]?.symbolId
      : sel.typeId
        ? ctx.catalog.equipmentTypes.get(sel.typeId)?.symbolId
        : undefined;
    if (sel.objectId && !state.objects[sel.objectId]) return obj(sel.objectId);
    if (sel.portId && symbolId && !ctx.catalog.getPort(symbolId, sel.portId)) {
      const subject = sel.objectId ?? sel.typeId ?? '';
      out.push(d('ref.unknown-port', 'error', `${path}: „${subject}” nema priključak „${sel.portId}”.`, { path, subjectId: subject }));
    }
  };
  walkCondition(cond, (c) => {
    switch (c.type) {
      case 'stepCompleted':
        if (!ctx.steps.has(c.stepId)) out.push(d('ref.unknown-step', 'error', `${path}: nepoznat korak „${c.stepId}”.`, { path }));
        break;
      case 'actionCompleted':
      case 'actionActive':
        if (!ctx.actions.has(c.actionId)) out.push(d('ref.unknown-action', 'error', `${path}: nepoznata radnja „${c.actionId}”.`, { path }));
        break;
      case 'connected':
        port(c.a);
        port(c.b);
        break;
      case 'portFree':
        port(c.port);
        break;
      case 'linked':
        obj(c.a);
        obj(c.b);
        break;
      case 'inZone':
        obj(c.objectId);
        if (!ctx.zones.has(c.zoneId)) out.push(d('ref.unknown-zone', 'error', `${path}: nepoznata zona „${c.zoneId}”.`, { path }));
        break;
      case 'near':
        obj(c.objectId);
        obj(c.targetId);
        break;
      case 'carrying':
        obj(c.personnelId);
        if (c.equipmentId) obj(c.equipmentId);
        if (c.typeId) type(c.typeId);
        break;
      case 'placed':
        obj(c.equipmentId);
        break;
      case 'laid': {
        if (!c.equipmentId && !c.typeId) {
          out.push(d('condition.selector-empty', 'error', `${path}: uvjet „laid” mora navesti cijev ili vrstu cijevi.`, { path }));
          break;
        }
        if (c.equipmentId) obj(c.equipmentId);
        if (c.typeId) type(c.typeId);
        const o = c.equipmentId ? state.objects[c.equipmentId] : undefined;
        const typeId = c.typeId ?? o?.typeId;
        const et = typeId ? ctx.catalog.equipmentTypes.get(typeId) : undefined;
        if (et && et.form !== 'hose') out.push(d('ref.not-hose', 'error', `${path}: „${c.equipmentId ?? c.typeId}” nije cijev.`, { path }));
        break;
      }
      case 'hasRole':
        obj(c.personnelId);
        if (!ctx.catalog.roles.has(c.roleId)) out.push(d('ref.unresolved-role', 'error', `${path}: nepoznata uloga „${c.roleId}”.`, { path }));
        break;
      case 'objectState':
      case 'rotation':
        obj(c.objectId);
        break;
      default:
        break;
    }
  });
}

function commandRefs(state: SimulationState, command: Command, path: string, out: Diagnostic[]): void {
  for (const id of commandObjectIds(command)) {
    if (!state.objects[id]) out.push(d('ref.unknown-object', 'error', `${path}: naredba ${command.type} koristi nepoznat objekt „${id}”.`, { path, subjectId: id }));
  }
}

export interface ExerciseCheck {
  readonly diagnostics: Diagnostic[];
  readonly timeline: Timeline | null;
  readonly demoReachesCompletion: boolean;
}

export function checkExercise(exercise: Exercise, catalog: Catalog): ExerciseCheck {
  const out: Diagnostic[] = [];
  if (exercise.catalogId !== catalog.id) {
    out.push(d('ref.catalog-mismatch', 'error', `Vježba traži katalog „${exercise.catalogId}”, a učitan je „${catalog.id}”.`));
  }
  const ctx = createExerciseContext(exercise, catalog);
  const scene = exercise.initialScene;

  for (const [kind, ids] of [
    ['object', [...scene.personnel.map((p) => p.id), ...scene.equipment.map((e) => e.id)]],
    ['zone', scene.zones.map((z) => z.id)],
    ['connection', scene.connections.map((c) => c.id)],
    ['step', exercise.steps.map((s) => s.id)],
    ['stage', exercise.stages.map((s) => s.id)],
    ['action', exercise.actions.map((a) => a.id)],
    ['rule', exercise.rules.map((r) => r.id)],
  ] as const) {
    for (const id of duplicates(ids)) out.push(d('id.duplicate', 'error', `Dvostruki identifikator (${kind}): ${id}`, { subjectId: id }));
  }

  scene.personnel.forEach((p, i) => {
    const path = `initialScene.personnel[${i}]`;
    if (!ctx.catalog.symbols.has(p.symbolId)) out.push(d('ref.unknown-symbol', 'error', `Osoba ${p.id}: nepoznat simbol „${p.symbolId}”.`, { path, subjectId: p.id }));
    if (p.roleId && !ctx.catalog.roles.has(p.roleId)) out.push(d('ref.unresolved-role', 'error', `Osoba ${p.id}: nepoznata uloga „${p.roleId}”.`, { path, subjectId: p.id }));
  });
  scene.equipment.forEach((e, i) => {
    const path = `initialScene.equipment[${i}]`;
    const type = ctx.catalog.equipmentTypes.get(e.typeId);
    if (!type) out.push(d('ref.unknown-equipment-type', 'error', `Oprema ${e.id}: nepoznata vrsta „${e.typeId}”.`, { path, subjectId: e.id }));
    const symbol = type ? ctx.catalog.symbols.get(type.symbolId) : undefined;
    if (e.state && symbol && !symbol.visualStates.some((v) => v.id === e.state)) {
      out.push(d('ref.unknown-state', 'error', `Oprema ${e.id}: nepoznato stanje „${e.state}”.`, { path, subjectId: e.id }));
    }
    if (e.carriedBy && !scene.personnel.some((p) => p.id === e.carriedBy)) {
      out.push(d('ref.unknown-object', 'error', `Oprema ${e.id}: nositelj „${e.carriedBy}” ne postoji.`, { path, subjectId: e.id }));
    }
    if (e.layout && type && type.form !== 'hose') {
      out.push(d('scene.layout-not-hose', 'error', `Oprema ${e.id}: raspored (layout) dopušten je samo za cijevi.`, { path, subjectId: e.id }));
    }
    if (e.layout && e.carriedBy) {
      out.push(d('scene.layout-carried', 'error', `Oprema ${e.id}: položena cijev ne može se istodobno nositi.`, { path, subjectId: e.id }));
    }
  });

  // Initial connections are validated incrementally with the connection engine.
  const initial = createInitialState(ctx);
  {
    const base = { ...initial, connections: {}, connectionOrder: [] as Id[] };
    let world = connectionWorld(base);
    scene.connections.forEach((c, i) => {
      const issues = validateConnection(ctx.catalog, world, c.a, c.b);
      for (const issue of issues) {
        out.push(d(issue.code, 'error', `Početni spoj ${c.id}: ${issue.message}`, { path: `initialScene.connections[${i}]`, subjectId: c.id }));
      }
      world = { ...world, connections: [...world.connections, c] };
    });
  }

  for (const id of ctx.invalidDependencySteps) {
    const step = ctx.steps.get(id);
    const unknown = step?.dependsOn.filter((dep) => !ctx.steps.has(dep)) ?? [];
    if (unknown.length > 0) {
      out.push(d('step.unknown-dependency', 'error', `Korak ${id} ovisi o nepostojećim koracima: ${unknown.join(', ')}.`, { subjectId: id }));
    } else {
      out.push(d('step.dependency-cycle', 'error', `Korak ${id} je dio kružne ovisnosti (nemoguć redoslijed).`, { subjectId: id }));
    }
  }

  exercise.steps.forEach((step, i) => {
    const path = `steps[${i}]`;
    if (step.stageId && !ctx.stages.has(step.stageId)) {
      out.push(d('ref.unknown-stage', 'error', `Korak ${step.id}: nepoznata faza „${step.stageId}”.`, { path, subjectId: step.id }));
    }
    for (const r of step.actorRoleIds) {
      if (!ctx.catalog.roles.has(r)) out.push(d('ref.unresolved-role', 'error', `Korak ${step.id}: nepoznata uloga „${r}”.`, { path, subjectId: step.id }));
    }
    conditionRefs(ctx, initial, step.completedWhen, `${path}.completedWhen`, out);
    step.script.forEach((sc, j) => commandRefs(initial, sc.command, `${path}.script[${j}]`, out));
    if (step.script.length === 0) {
      out.push(d('demo.missing-script', 'warning', `Korak ${step.id} nema demonstracijsku skriptu.`, { path, subjectId: step.id }));
    }
    if (step.sources.length === 0) {
      out.push(d('trace.missing-source', 'warning', `Korak ${step.id} nema poveznicu na izvornu dokumentaciju.`, { path, subjectId: step.id }));
    }
    // Steps with dependencies are checked against the demonstration state when they unlock (below).
    if (step.dependsOn.length === 0 && evaluateCondition(ctx, initial, step.completedWhen)) {
      out.push(d('step.trivially-complete', 'warning', `Uvjet koraka ${step.id} ispunjen je već u početnom stanju.`, { path, subjectId: step.id }));
    }
  });

  exercise.actions.forEach((a, i) => {
    const path = `actions[${i}]`;
    for (const r of a.actorRoleIds) {
      if (!ctx.catalog.roles.has(r)) out.push(d('ref.unresolved-role', 'error', `Radnja ${a.id}: nepoznata uloga „${r}”.`, { path, subjectId: a.id }));
    }
    if (a.requires) conditionRefs(ctx, initial, a.requires, `${path}.requires`, out);
  });

  exercise.rules.forEach((r, i) => {
    const path = `rules[${i}]`;
    if (r.type === 'commandPrecondition') {
      conditionRefs(ctx, initial, r.requires, `${path}.requires`, out);
      for (const id of r.when.objectIds ?? []) {
        if (!initial.objects[id]) out.push(d('ref.unknown-object', 'warning', `${path}: pravilo se odnosi na nepoznat objekt „${id}”.`, { path }));
      }
    } else {
      for (const id of [...(r.groupA.objectIds ?? []), ...(r.groupB.objectIds ?? [])]) {
        if (!initial.objects[id]) out.push(d('ref.unknown-object', 'warning', `${path}: pravilo se odnosi na nepoznat objekt „${id}”.`, { path }));
      }
    }
  });

  if (exercise.completion.requiredSteps !== 'all') {
    for (const id of exercise.completion.requiredSteps) {
      if (!ctx.steps.has(id)) out.push(d('ref.unknown-step', 'error', `Uvjet završetka: nepoznat korak „${id}”.`, { path: 'completion.requiredSteps' }));
    }
  }
  if (exercise.completion.finalCondition) {
    conditionRefs(ctx, initial, exercise.completion.finalCondition, 'completion.finalCondition', out);
  }

  // Dynamic check: the demonstration script must be executable and reach completion.
  let timeline: Timeline | null = null;
  let demoReachesCompletion = false;
  if (!out.some((x) => x.severity === 'error' && x.code.startsWith('step.'))) {
    timeline = compileTimeline(ctx);
    for (const p of timeline.problems) {
      for (const issue of p.issues) {
        out.push(
          d('demo.command-rejected', 'error', `Demonstracija, korak ${p.stepId}, naredba ${p.command.type}: ${issue.message}`, {
            subjectId: p.stepId,
          }),
        );
      }
    }
    const final = timeline.finalState;
    for (const id of ctx.stepOrder) {
      if (final.steps[id]?.status !== 'completed' && ctx.steps.get(id)?.script.length) {
        out.push(d('demo.step-not-completed', 'error', `Demonstracija ne dovršava korak ${id}.`, { subjectId: id }));
      }
    }
    // A step whose condition already holds when it becomes available completes without any action.
    for (const step of exercise.steps) {
      const w = timeline.stepWindows[step.id];
      if (step.dependsOn.length === 0 || !w) continue;
      const before = stateAt(ctx, timeline, w.startMs);
      if (before.steps[step.id]?.status === 'completed') {
        out.push(d('step.complete-on-unlock', 'warning', `Uvjet koraka ${step.id} ispunjen je već prije njegove demonstracijske skripte.`, { subjectId: step.id }));
      }
    }
    demoReachesCompletion = final.completed;
    if (!final.completed) {
      out.push(d('completion.unreachable', 'error', 'Demonstracija ne dostiže uvjet završetka vježbe.'));
    }
    // Overlapping animations of the same object indicate an inconsistent script.
    const entries = timeline.entries;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        // Parallel commands inside one step (`withPrevious`) are authored deliberately.
        if (!a || !b || a.stepId === b.stepId || b.startMs >= a.endMs || a.startMs >= b.endMs) continue;
        const shared = a.animates.filter((id) => b.animates.includes(id));
        if (shared.length > 0) {
          out.push(
            d('demo.concurrent-animation', 'warning', `Naredbe u koracima ${a.stepId} i ${b.stepId} istodobno animiraju: ${shared.join(', ')}.`, {
              subjectId: a.stepId,
            }),
          );
        }
      }
    }
  }
  return { diagnostics: out, timeline, demoReachesCompletion };
}
