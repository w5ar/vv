import {
  parseExercise,
  type Catalog,
  type DiagramAnalysis,
  type Diagnostic,
  type Exercise,
  type InventoryItem,
  type ProcedureAnalysis,
  type StepCandidate,
} from '@fds/domain';
import { checkExercise, createExerciseContext, stateAt, type Timeline } from '@fds/simulation-engine';
import { angleDelta, distance } from '@fds/geometry';
import type { DatasetConfig } from './config';
import { stripComments } from './review-files';
import { joinRel } from './util';

/**
 * Stage F — exercise compilation. Resolves authoring conveniences into the
 * plain exercise schema, validates it and runs semantic/dynamic diagnostics:
 *
 * - `initialScene.fromDiagram` fills positions/rotations from a diagram stage
 *   (stage C), keeping the SVG element id as source reference;
 * - `steps[].source` pulls the verbatim step text from a Markdown candidate
 *   (stage D), so the wording is never retyped;
 * - stage diagrams are compared against the demonstration state at the
 *   stage's start/end (positions and connections).
 */

type Json = Record<string, unknown>;

export interface CompileContext {
  readonly dataset: DatasetConfig;
  readonly catalog: Catalog;
  readonly diagrams: readonly DiagramAnalysis[];
  readonly procedures: readonly ProcedureAnalysis[];
  readonly inventory: readonly InventoryItem[];
  /** sha256 of the authoring file text, recorded in build info. */
  readonly authoringSha256?: string | undefined;
}

export interface CompileOutput {
  readonly exercise: Exercise | null;
  readonly exerciseId: string;
  readonly diagnostics: Diagnostic[];
  /** candidate ids used by steps (for stage E). */
  readonly usedCandidates: { candidateId: string; stepId: string }[];
  readonly demoReachesCompletion: boolean;
  readonly tracedStepCount: number;
}

const POSITION_TOLERANCE = 2;
const ROTATION_TOLERANCE = 1;

function isObj(v: unknown): v is Json {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Prefixes dataset-relative `file` properties with the dataset source root. */
function prefixFiles(value: unknown, root: string): unknown {
  if (Array.isArray(value)) return value.map((v) => prefixFiles(v, root));
  if (!isObj(value)) return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === 'file' && typeof v === 'string' && !v.startsWith('content/') ? joinRel(root, v) : prefixFiles(v, root);
  }
  return out;
}

export function compileExercise(authoringFile: string, raw: unknown, ctx: CompileContext): CompileOutput {
  const diagnostics: Diagnostic[] = [];
  const at = (code: string, severity: Diagnostic['severity'], message: string, extra: Partial<Diagnostic> = {}): void => {
    diagnostics.push({ code, severity, message, stage: 'F', source: { file: authoringFile }, ...extra });
  };
  const doc = prefixFiles(stripComments(raw), ctx.dataset.sourceRoot);
  if (!isObj(doc)) {
    at('authoring.invalid', 'error', `${authoringFile}: datoteka nije JSON objekt.`);
    return { exercise: null, exerciseId: authoringFile, diagnostics, usedCandidates: [], demoReachesCompletion: false, tracedStepCount: 0 };
  }
  const exerciseId = typeof doc.id === 'string' ? doc.id : authoringFile;

  // 1. Initial scene positions from a diagram stage.
  const scene = isObj(doc.initialScene) ? { ...doc.initialScene } : null;
  if (scene && isObj(scene.fromDiagram)) {
    const ref = scene.fromDiagram as { file?: string; stage?: string };
    delete scene.fromDiagram;
    const diagram = ctx.diagrams.find((d) => d.file === ref.file);
    if (!diagram) {
      at('mapping.unknown-diagram', 'error', `Crtež ${ref.file} nije pronađen među analiziranim crtežima.`);
    } else {
      const instances = diagram.instances.filter((i) => i.stageId === ref.stage && i.instanceId);
      const resolve = (obj: Json, kind: 'personnel' | 'equipment'): Json => {
        if (isObj(obj.position)) return obj;
        const inst = instances.find((i) => i.instanceId === obj.id);
        if (!inst?.position) {
          at('mapping.missing-position', 'error', `Objekt ${String(obj.id)} nema položaj, a nije pronađen u fazi ${ref.stage} crteža ${ref.file}.`, {
            subjectId: String(obj.id),
          });
          return obj;
        }
        const expectedSymbol =
          kind === 'personnel'
            ? obj.symbolId
            : ctx.catalog.equipmentTypes.find((t) => t.id === obj.typeId)?.symbolId;
        if (inst.symbolId && expectedSymbol && inst.symbolId !== expectedSymbol) {
          at('diagram.symbol-mismatch', 'warning', `Objekt ${String(obj.id)}: crtež navodi simbol ${inst.symbolId}, a vježba ${String(expectedSymbol)}.`, {
            subjectId: String(obj.id),
          });
        }
        const sources = Array.isArray(obj.sources) ? obj.sources : [];
        return {
          ...obj,
          position: inst.position,
          rotation: obj.rotation ?? inst.rotation ?? 0,
          sources: [...sources, { file: diagram.file, anchor: inst.elementId ?? inst.instanceId }],
        };
      };
      if (Array.isArray(scene.personnel)) scene.personnel = scene.personnel.map((p) => (isObj(p) ? resolve(p, 'personnel') : p));
      if (Array.isArray(scene.equipment)) scene.equipment = scene.equipment.map((e) => (isObj(e) ? resolve(e, 'equipment') : e));
    }
    doc.initialScene = scene;
  }

  // 2. Verbatim step text from Markdown candidates.
  const candidates = new Map<string, StepCandidate>();
  for (const p of ctx.procedures) for (const c of p.steps) candidates.set(c.id, c);
  const usedCandidates: { candidateId: string; stepId: string }[] = [];
  let traced = 0;
  if (Array.isArray(doc.steps)) {
    doc.steps = doc.steps.map((s) => {
      if (!isObj(s)) return s;
      const step = { ...s };
      const sourceId = typeof step.source === 'string' ? step.source : undefined;
      delete step.source;
      if (sourceId) {
        usedCandidates.push({ candidateId: sourceId, stepId: String(step.id) });
        const c = candidates.get(sourceId);
        if (!c) {
          at('mapping.unknown-candidate', 'error', `Korak ${String(step.id)}: kandidat ${sourceId} ne postoji u analiziranim postupcima.`, {
            subjectId: String(step.id),
          });
        } else {
          traced++;
          if (typeof step.text === 'string' && step.text !== c.text) {
            at('trace.text-overridden', 'warning', `Korak ${String(step.id)}: ručno upisani tekst zamijenjen je izvornim tekstom iz ${c.file}:${c.line}.`, {
              subjectId: String(step.id),
            });
          }
          step.text = c.text;
          const existing = Array.isArray(step.sources) ? step.sources : [];
          step.sources = [{ file: c.file, anchor: c.id, line: c.line, lineEnd: c.lineEnd, excerpt: c.text }, ...existing];
          const actors = Array.isArray(step.actorRoleIds) ? (step.actorRoleIds as string[]) : [];
          const missing = c.roleMentions.filter((r) => !actors.includes(r));
          if (missing.length > 0) {
            at('mapping.role-mismatch', 'info', `Korak ${String(step.id)}: izvorni tekst spominje uloge ${missing.join(', ')} koje nisu među izvršiteljima koraka.`, {
              subjectId: String(step.id),
            });
          }
        }
      }
      return step;
    });
  }

  // 3. Schema validation.
  const parsed = parseExercise(doc);
  if (!parsed.ok) {
    for (const d of parsed.diagnostics) diagnostics.push({ ...d, stage: 'F', source: { file: authoringFile } });
    return { exercise: null, exerciseId, diagnostics, usedCandidates, demoReachesCompletion: false, tracedStepCount: traced };
  }

  // 4. Semantic + dynamic checks.
  const check = checkExercise(parsed.value, ctx.catalog);
  for (const d of check.diagnostics) diagnostics.push({ ...d, source: d.source ?? { file: authoringFile } });
  if (check.timeline) diagnostics.push(...compareWithDiagrams(parsed.value, ctx, check.timeline));

  const referenced = new Set<string>([authoringFile]);
  const collect = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'file' && typeof x === 'string') referenced.add(x);
        else collect(x);
      }
    }
  };
  collect(doc);
  const sourceHashes: Record<string, string> = {};
  for (const f of [...referenced].sort()) {
    const item = ctx.inventory.find((i) => i.file === f);
    if (item) sourceHashes[f] = item.sha256;
    else if (f === authoringFile && ctx.authoringSha256) sourceHashes[f] = ctx.authoringSha256;
  }
  const exercise: Exercise = {
    ...parsed.value,
    build: { compiledFrom: authoringFile, sourceHashes, diagnostics: diagnostics.map((d) => ({ ...d })) },
  };
  return { exercise, exerciseId, diagnostics, usedCandidates, demoReachesCompletion: check.demoReachesCompletion, tracedStepCount: traced };
}

/** Compares demonstration states with stage diagrams (positions, rotations, connections). */
export function compareWithDiagrams(exercise: Exercise, ctx: CompileContext, timeline: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const ectx = createExerciseContext(exercise, ctx.catalog);
  for (const stage of exercise.stages) {
    if (!stage.diagram) continue;
    const diagram = ctx.diagrams.find((d) => d.file === stage.diagram?.file);
    const source = { file: stage.diagram.file, anchor: stage.diagram.anchor };
    if (!diagram) {
      out.push({ code: 'diagram.missing', severity: 'error', stage: 'F', message: `Faza ${stage.id}: crtež ${stage.diagram.file} nije pronađen.`, source });
      continue;
    }
    const layerId = stage.diagram.anchor;
    if (layerId && !diagram.stages.some((s) => s.stageId === layerId)) {
      out.push({ code: 'diagram.missing-stage', severity: 'error', stage: 'F', message: `Faza ${stage.id}: crtež nema sloj/fazu „${layerId}”.`, source });
      continue;
    }
    const window = timeline.stageWindows[stage.id];
    if (!window) {
      out.push({ code: 'diagram.stage-without-demo', severity: 'info', stage: 'F', message: `Faza ${stage.id} nema demonstracijskih naredbi za usporedbu s crtežom.`, source });
      continue;
    }
    const time = stage.diagramMoment === 'start' ? window.startMs : window.endMs;
    const state = stateAt(ectx, timeline, time);
    const moment = stage.diagramMoment === 'start' ? 'početku' : 'kraju';
    const instances = diagram.instances.filter((i) => i.stageId === layerId && i.instanceId);
    for (const inst of instances) {
      const obj = state.objects[inst.instanceId as string];
      if (!obj) {
        out.push({
          code: 'diagram.instance-not-in-exercise',
          severity: 'warning',
          stage: 'F',
          message: `Faza ${stage.id}: instanca „${inst.instanceId}” s crteža ne postoji u vježbi.`,
          source: { file: diagram.file, anchor: inst.elementId },
        });
        continue;
      }
      if (inst.position && distance(inst.position, obj.position) > POSITION_TOLERANCE) {
        out.push({
          code: 'diagram.position-mismatch',
          severity: 'warning',
          stage: 'F',
          message: `Faza ${stage.id} (na ${moment}): ${obj.id} je na (${Math.round(obj.position.x)}, ${Math.round(obj.position.y)}), a na crtežu na (${Math.round(inst.position.x)}, ${Math.round(inst.position.y)}).`,
          source: { file: diagram.file, anchor: inst.elementId },
          subjectId: obj.id,
        });
      }
      if (inst.rotation !== undefined && Math.abs(angleDelta(inst.rotation, obj.rotation)) > ROTATION_TOLERANCE && !obj.carriedBy) {
        out.push({
          code: 'diagram.rotation-mismatch',
          severity: 'warning',
          stage: 'F',
          message: `Faza ${stage.id}: rotacija ${obj.id} (${obj.rotation}°) razlikuje se od crteža (${inst.rotation}°).`,
          source: { file: diagram.file, anchor: inst.elementId },
          subjectId: obj.id,
        });
      }
    }
    const diagramConnections = diagram.connections.filter((c) => c.stageId === layerId && c.confidence === 'metadata');
    const key = (a: string, b: string) => [a, b].sort().join('|');
    const stateKeys = new Set(
      state.connectionOrder.map((id) => {
        const c = state.connections[id];
        return c ? key(`${c.a.objectId}#${c.a.portId}`, `${c.b.objectId}#${c.b.portId}`) : '';
      }),
    );
    const diagramKeys = new Set(diagramConnections.map((c) => key(c.from as string, c.to as string)));
    for (const c of diagramConnections) {
      if (!stateKeys.has(key(c.from as string, c.to as string))) {
        out.push({
          code: 'diagram.connection-missing',
          severity: 'warning',
          stage: 'F',
          message: `Faza ${stage.id}: spoj ${c.from} – ${c.to} s crteža ne postoji u stanju vježbe na ${moment} faze.`,
          source: { file: diagram.file, anchor: c.elementId },
        });
      }
    }
    if (diagramConnections.length > 0) {
      for (const k of stateKeys) {
        if (k && !diagramKeys.has(k)) {
          out.push({
            code: 'diagram.connection-not-in-diagram',
            severity: 'warning',
            stage: 'F',
            message: `Faza ${stage.id}: spoj ${k.replace('|', ' – ')} postoji u vježbi, ali nije prikazan na crtežu.`,
            source,
          });
        }
      }
    }
    for (const id of state.objectOrder) {
      if (!instances.some((i) => i.instanceId === id)) {
        out.push({
          code: 'diagram.object-not-in-diagram',
          severity: 'info',
          stage: 'F',
          message: `Faza ${stage.id}: objekt ${id} nije označen na crtežu.`,
          source,
          subjectId: id,
        });
      }
    }
  }
  return out;
}
