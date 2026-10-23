import {
  parseExercise,
  type Catalog,
  type DiagramAnalysis,
  type Diagnostic,
  type Exercise,
  type InventoryItem,
  type ProcedureAnalysis,
  type SimulationState,
  type Stage,
  type StepCandidate,
} from '@fds/domain';
import { checkExercise, createExerciseContext, stateAt, type Timeline } from '@fds/simulation-engine';
import { add, angleDelta, distance, type Vec2 } from '@fds/geometry';
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
 * - `initialScene.fromDiagram` + per-object `diagramKey` take positions from
 *   instances of diagrams without instance metadata (key `<symbol>@<x>,<y>`),
 *   optionally shifted by `translate` into the exercise frame;
 * - `{ "$diagramPoint": "<file>#<key>", "offset"?: {x,y} }` anywhere in the
 *   document is replaced by that diagram point (instance key, or
 *   `line:<index>:from|to`), and the reference is added to the step's sources;
 * - stage diagrams are compared against the demonstration state at the
 *   stage's start/end: positions and connections (`diagramScale: exact`) or
 *   which symbols are shown (`schematic`);
 * - the initial scene is checked against the procedure's participant and
 *   equipment lists.
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

interface PointRef {
  readonly file: string;
  readonly anchor: string;
}

/** Point of a diagram: an instance position (by key) or a line endpoint (`line:<i>:from|to`). */
function diagramPoint(diagram: DiagramAnalysis, key: string): Vec2 | null {
  const line = /^line:(\d+):(from|to)$/.exec(key);
  if (line) {
    const l = diagram.lines.find((x) => x.index === Number(line[1]));
    return l ? (line[2] === 'from' ? l.from : l.to) : null;
  }
  return diagram.instances.find((i) => i.key === key)?.position ?? null;
}

/** Replaces `$diagramPoint` placeholders; reports each resolved reference through `onRef`. */
function resolvePoints(
  value: unknown,
  ctx: CompileContext,
  onRef: (ref: PointRef) => void,
  report: (message: string) => void,
): unknown {
  if (Array.isArray(value)) return value.map((v) => resolvePoints(v, ctx, onRef, report));
  if (!isObj(value)) return value;
  if (typeof value.$diagramPoint === 'string') {
    const ref = value.$diagramPoint;
    const hash = ref.indexOf('#');
    const file = hash > 0 ? ref.slice(0, hash) : ref;
    const key = hash > 0 ? ref.slice(hash + 1) : '';
    const full = file.startsWith('content/') ? file : joinRel(ctx.dataset.sourceRoot, file);
    const diagram = ctx.diagrams.find((d) => d.file === full);
    const point = diagram ? diagramPoint(diagram, key) : null;
    if (!point) {
      report(`Točka „${ref}” nije pronađena među analiziranim crtežima.`);
      return { x: 0, y: 0 };
    }
    onRef({ file: full, anchor: key });
    const offset = isObj(value.offset) ? (value.offset as unknown as Vec2) : { x: 0, y: 0 };
    return add(point, offset);
  }
  const out: Json = {};
  for (const [k, v] of Object.entries(value)) out[k] = resolvePoints(v, ctx, onRef, report);
  return out;
}

function withSources(obj: Json, refs: readonly PointRef[]): Json {
  if (refs.length === 0) return obj;
  const existing = Array.isArray(obj.sources) ? (obj.sources as Json[]) : [];
  const seen = new Set(existing.map((r) => `${String(r.file)}#${String(r.anchor ?? '')}`));
  const added = refs.filter((r) => {
    const k = `${r.file}#${r.anchor}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { ...obj, sources: [...existing, ...added] };
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

  // 0. Diagram point references (per step / scene object, so sources stay attached to their owner).
  const pointError = (message: string) => at('mapping.unknown-diagram-point', 'error', message);
  const resolveOwned = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((item) => {
          if (!isObj(item)) return item;
          const refs: PointRef[] = [];
          const resolved = resolvePoints(item, ctx, (r) => refs.push(r), pointError) as Json;
          return withSources(resolved, refs);
        })
      : list;
  doc.steps = resolveOwned(doc.steps);
  if (isObj(doc.initialScene)) {
    const sc = { ...doc.initialScene };
    sc.personnel = resolveOwned(sc.personnel);
    sc.equipment = resolveOwned(sc.equipment);
    doc.initialScene = resolvePoints(sc, ctx, () => undefined, pointError);
  }
  for (const k of Object.keys(doc)) {
    if (k !== 'steps' && k !== 'initialScene') doc[k] = resolvePoints(doc[k], ctx, () => undefined, pointError);
  }

  // 1. Initial scene positions from a diagram stage.
  const scene = isObj(doc.initialScene) ? { ...doc.initialScene } : null;
  if (scene && isObj(scene.fromDiagram)) {
    const ref = scene.fromDiagram as { file?: string; stage?: string; translate?: Vec2 };
    delete scene.fromDiagram;
    const diagram = ctx.diagrams.find((d) => d.file === ref.file);
    const translate = isObj(ref.translate) ? ref.translate : { x: 0, y: 0 };
    if (!diagram) {
      at('mapping.unknown-diagram', 'error', `Crtež ${ref.file} nije pronađen među analiziranim crtežima.`);
    } else {
      const instances = diagram.instances.filter((i) => i.stageId === ref.stage && i.instanceId);
      const resolve = (input: Json, kind: 'personnel' | 'equipment'): Json => {
        const { diagramKey, ...obj } = input;
        if (typeof diagramKey === 'string') {
          // Diagrams without instance metadata: match by deterministic instance key.
          const inst = diagram.instances.find((i) => i.key === diagramKey);
          if (!inst?.position) {
            at('mapping.unknown-diagram-key', 'error', `Objekt ${String(obj.id)}: instanca „${diagramKey}” nije pronađena na crtežu ${diagram.file}.`, {
              subjectId: String(obj.id),
            });
            return obj;
          }
          const expected = kind === 'personnel' ? obj.symbolId : ctx.catalog.equipmentTypes.find((t) => t.id === obj.typeId)?.symbolId;
          if (inst.symbolId && expected && inst.symbolId !== expected) {
            at('diagram.symbol-mismatch', 'warning', `Objekt ${String(obj.id)}: crtež navodi simbol ${inst.symbolId}, a vježba ${String(expected)}.`, {
              subjectId: String(obj.id),
            });
          }
          const sources = Array.isArray(obj.sources) ? obj.sources : [];
          return {
            ...obj,
            position: isObj(obj.position) ? obj.position : add(inst.position, translate),
            rotation: obj.rotation ?? inst.facing ?? inst.rotation ?? 0,
            sources: [...sources, { file: diagram.file, anchor: inst.key }],
          };
        }
        if (isObj(obj.position)) return obj;
        // Equipment stored in a vehicle is not drawn; it takes the vehicle's position below.
        if (typeof obj.storedIn === 'string') return obj;
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
      if (Array.isArray(scene.equipment)) {
        const equipment = scene.equipment.map((e) => (isObj(e) ? resolve(e, 'equipment') : e));
        const byId = new Map(equipment.filter(isObj).map((e) => [e.id, e]));
        scene.equipment = equipment.map((e) => {
          if (!isObj(e) || typeof e.storedIn !== 'string' || isObj(e.position)) return e;
          const container = byId.get(e.storedIn);
          if (container && isObj(container.position)) return { ...e, position: container.position };
          at('mapping.missing-position', 'error', `Objekt ${String(e.id)} je spremljen u „${e.storedIn}”, a taj objekt nema položaj.`, { subjectId: String(e.id) });
          return e;
        });
      }
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
  diagnostics.push(...checkAgainstProcedures(parsed.value, ctx));
  diagnostics.push(...checkSpeech(parsed.value));

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
    const layerId = stage.diagram.anchor ?? (diagram.stages.length === 1 ? diagram.stages[0]?.stageId : undefined);
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
    if (stage.diagramScale === 'schematic') {
      out.push(...compareSchematic(stage, diagram, layerId, state, ctx, moment));
      continue;
    }
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

/**
 * Schematic comparison: the diagram is not to scale, so only *what* it shows is compared.
 * Per symbol: objects on the ground must be shown, and carried objects may or may not be
 * drawn (`free <= shown <= free + carried`); personnel counts must match exactly. Items joined
 * into an assembled line (`depiction.assembledLineStrokeWidth`, e.g. a suction line) may be drawn
 * as symbols or as that line, so they count like carried ones, as do connected items of a type
 * with `depiction.optionalWhenConnected` (a rope bag); a connected item counts as its
 * `depiction.attachedSymbolId` (a nozzle tip, a marker that is not counted); stored equipment is not drawn.
 * Laid hoses are compared with the diagram's line styles (shown iff laid).
 */
function compareSchematic(
  stage: Stage,
  diagram: DiagramAnalysis,
  layerId: string | undefined,
  state: SimulationState,
  ctx: CompileContext,
  moment: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const source = { file: diagram.file };
  const symbols = new Map(ctx.catalog.symbols.map((s) => [s.id, s]));
  const types = new Map(ctx.catalog.equipmentTypes.map((t) => [t.id, t]));
  const shown = new Map<string, number>();
  for (const inst of diagram.instances) {
    if (layerId && inst.stageId !== layerId) continue;
    if (!inst.symbolId || inst.attachedTo || symbols.get(inst.symbolId)?.annotation) continue;
    shown.set(inst.symbolId, (shown.get(inst.symbolId) ?? 0) + 1);
  }
  const free = new Map<string, number>();
  const carried = new Map<string, number>();
  const personnel = new Set<string>();
  const laid = new Map<string, number>();
  const connections = Object.values(state.connections);
  const assembled = (id: string, typeId: string | null) =>
    !!typeId &&
    types.get(typeId)?.depiction?.assembledLineStrokeWidth !== undefined &&
    connections.some((c) => {
      const other = c.a.objectId === id ? c.b.objectId : c.b.objectId === id ? c.a.objectId : null;
      return other !== null && state.objects[other]?.typeId === typeId;
    });
  const isConnected = (id: string) => connections.some((c) => c.a.objectId === id || c.b.objectId === id);
  const optionalConnected = (id: string, typeId: string | null) =>
    !!typeId && types.get(typeId)?.depiction?.optionalWhenConnected === true && isConnected(id);
  for (const id of state.objectOrder) {
    const obj = state.objects[id];
    if (!obj || obj.storedIn) continue;
    if (obj.layout && obj.typeId) {
      laid.set(obj.typeId, (laid.get(obj.typeId) ?? 0) + 1);
      continue;
    }
    if (obj.kind === 'personnel') personnel.add(obj.symbolId);
    // A connected item is drawn as its attached symbol (a nozzle tip); a marker is not counted.
    const attached = obj.typeId ? types.get(obj.typeId)?.depiction?.attachedSymbolId : undefined;
    const drawnAs = attached && isConnected(obj.id) ? attached : obj.symbolId;
    if (symbols.get(drawnAs)?.annotation) continue;
    const optional = obj.carriedBy || assembled(obj.id, obj.typeId) || optionalConnected(obj.id, obj.typeId);
    const bucket = optional ? carried : free;
    bucket.set(drawnAs, (bucket.get(drawnAs) ?? 0) + 1);
  }
  const symbolIds = [...new Set([...shown.keys(), ...free.keys(), ...carried.keys()])].sort();
  for (const symbolId of symbolIds) {
    const d = shown.get(symbolId) ?? 0;
    const f = free.get(symbolId) ?? 0;
    const c = carried.get(symbolId) ?? 0;
    const name = symbols.get(symbolId)?.name ?? symbolId;
    const ok = personnel.has(symbolId) ? d === f : f <= d && d <= f + c;
    if (!ok) {
      out.push({
        code: 'diagram.count-mismatch',
        severity: 'warning',
        stage: 'F',
        message: `Faza ${stage.id} (na ${moment}): „${name}” – na crtežu ${d}, u vježbi ${f}${c > 0 ? ` (+${c} nošeno)` : ''}.`,
        source,
        subjectId: symbolId,
      });
    }
  }
  for (const type of ctx.catalog.equipmentTypes) {
    if (type.form !== 'hose' || type.depiction?.laidLineStrokeWidth === undefined) continue;
    const lines = diagram.lines.filter((l) => l.equipmentTypeId === type.id && (!layerId || !l.stageId || l.stageId === layerId)).length;
    const hoses = laid.get(type.id) ?? 0;
    if ((lines > 0) !== (hoses > 0) || lines > hoses) {
      out.push({
        code: 'diagram.lines-mismatch',
        severity: 'warning',
        stage: 'F',
        message: `Faza ${stage.id} (na ${moment}): ${types.get(type.id)?.name ?? type.id} – položenih vodova na crtežu ${lines}, položenih cijevi u vježbi ${hoses}.`,
        source,
        subjectId: type.id,
      });
    }
  }
  return out;
}

/**
 * Initial scene against the participant and equipment lists of the exercise's own procedure:
 * the first Markdown file among the exercise's top-level sources (further ones are references).
 */
export function checkAgainstProcedures(exercise: Exercise, ctx: CompileContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  const primary = exercise.sources.find((s) => s.file.endsWith('.md'))?.file;
  const files = new Set(primary ? [primary] : []);
  const scene = exercise.initialScene;
  for (const proc of ctx.procedures) {
    if (!files.has(proc.file)) continue;
    for (const item of proc.equipmentList) {
      const source = { file: proc.file, line: item.line, excerpt: item.text };
      if (item.equipmentTypeIds.length !== 1) {
        out.push({ code: 'exercise.equipment-unmapped', severity: 'info', stage: 'F', message: `Stavka opreme „${item.text}” nije povezana s jednom vrstom opreme.`, source });
        continue;
      }
      const typeId = item.equipmentTypeIds[0] as string;
      const n = scene.equipment.filter((e) => e.typeId === typeId).length;
      // An item without a number („prijenosna motorna vatrogasna pumpa,”) only has to be present.
      if (item.quantity === undefined ? n === 0 : n !== item.quantity) {
        out.push({
          code: 'exercise.equipment-count-mismatch',
          severity: 'warning',
          stage: 'F',
          message:
            item.quantity === undefined
              ? `Popis opreme navodi „${item.text}”, a početna scena je nema.`
              : `Popis opreme navodi ${item.quantity} × „${item.text}”, a početna scena ima ${n}.`,
          source,
          subjectId: typeId,
        });
      }
    }
    const listed = new Set(proc.participants.flatMap((p) => p.roleIds));
    for (const p of proc.participants) {
      if (p.roleIds.length > 0 && !scene.personnel.some((x) => x.roleId && p.roleIds.includes(x.roleId))) {
        out.push({
          code: 'exercise.participant-missing',
          severity: 'warning',
          stage: 'F',
          message: `Sudionik „${p.text}” iz ${proc.file} nema osobu u početnoj sceni.`,
          source: { file: proc.file, line: p.line, excerpt: p.text },
        });
      }
    }
    if (proc.participants.length > 0) {
      for (const person of scene.personnel) {
        if (person.roleId && !listed.has(person.roleId)) {
          out.push({
            code: 'exercise.extra-personnel',
            severity: 'warning',
            stage: 'F',
            message: `Osoba ${person.id} (uloga ${person.roleId}) nije među sudionicima navedenima u ${proc.file}.`,
            subjectId: person.id,
          });
        }
      }
    }
  }
  return out;
}

/** Spoken words should be quoted from the action's sources; anything else is reported for review. */
export function checkSpeech(exercise: Exercise): Diagnostic[] {
  const plain = (t: string) => t.replace(/[*„”"“]/g, '').replace(/\s+/g, ' ').trim();
  const out: Diagnostic[] = [];
  for (const action of exercise.actions) {
    if (!action.speech) continue;
    const speech = plain(action.speech);
    if (action.sources.some((s) => s.excerpt && plain(s.excerpt).includes(speech))) continue;
    out.push({
      code: 'audio.speech-not-verbatim',
      severity: 'info',
      stage: 'F',
      message: `Radnja ${action.id}: izgovor „${action.speech}” nije doslovni navod iz izvora radnje; provjeriti.`,
      subjectId: action.id,
    });
  }
  return out;
}
