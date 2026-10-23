import type { Catalog, DiagramAnalysis, DiagramConnection, DiagramInstance, Diagnostic, InventoryItem } from '@fds/domain';
import {
  EXTERNAL_HREF_ATTR,
  IDENTITY,
  applyMatrix,
  decompose,
  multiply,
  parseTransform,
  parseViewBox,
  textContent,
  type Matrix,
  type SvgElementNode,
} from '@fds/svg-registry';
import path from 'node:path';
import type { DiscoveredSvg } from './stage-a-discover';
import { normalizeName, slugify, toPosix } from './util';

/**
 * Stage C — exercise diagram analysis.
 *
 * Recognition priority (most reliable first):
 *  1. explicit metadata:
 *     - `data-symbol` / `data-instance` / `data-stage` / `data-connect-*` attributes, or
 *     - a group whose only drawing child references a symbol file
 *       (`<image href="../simboli/n1.svg">`) or a symbol definition (`<use href="#n1">`);
 *  2. heuristic: a group label (Inkscape label) equal to a catalog symbol name — flagged for review;
 *  3. unresolved: anything else is kept as-is and flagged.
 *
 * Stages are layers (`inkscape:groupmode="layer"`) or groups with `data-stage`; a diagram without
 * layers is one implicit stage named after the file. Instances are expected to be drawn centred on
 * the symbol pivot; their accumulated transform gives position and rotation. Direction markers
 * declared by personnel symbols are attached to the nearest person (facing). Free paths/lines are
 * recorded with endpoints and stroke width and classified with the reviewed line styles.
 */

const PRIMITIVES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'image']);
const LINE_TAGS = new Set(['path', 'line', 'polyline']);

function stageIdOf(n: SvgElementNode): string | null {
  if (n.tag !== 'g') return null;
  if (n.attrs['data-stage']) return n.attrs['data-stage'];
  if (n.attrs['data-groupmode'] === 'layer') return n.attrs.id ?? (n.attrs['data-label'] ? slugify(n.attrs['data-label']) : null);
  return null;
}

function countPrimitives(n: SvgElementNode): number {
  let c = PRIMITIVES.has(n.tag) ? 1 : 0;
  for (const ch of n.children) if (ch.type === 'element') c += countPrimitives(ch);
  return c;
}

function num(v: string | undefined, fallback = 0): number {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function strokeWidthOf(n: SvgElementNode, inherited: number | undefined): number | undefined {
  const fromStyle = /(?:^|;)\s*stroke-width\s*:\s*([0-9.]+)/.exec(n.attrs.style ?? '')?.[1];
  const v = fromStyle ?? n.attrs['stroke-width'];
  return v !== undefined ? num(v) : inherited;
}

function pathEndpoints(n: SvgElementNode): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (n.tag === 'line') {
    return { from: { x: num(n.attrs.x1), y: num(n.attrs.y1) }, to: { x: num(n.attrs.x2), y: num(n.attrs.y2) } };
  }
  const raw = n.tag === 'polyline' ? n.attrs.points : n.attrs.d;
  if (!raw) return null;
  // Absolute coordinates only (as produced by the source tools); relative paths are left unresolved.
  if (n.tag === 'path' && /[a-z]/.test(raw.replace(/e[-+]?\d/gi, ''))) return null;
  const nums = (raw.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 4) return null;
  return { from: { x: nums[0] as number, y: nums[1] as number }, to: { x: nums[nums.length - 2] as number, y: nums[nums.length - 1] as number } };
}

interface SymbolLookup {
  byFile: Map<string, string>;
  byStem: Map<string, string[]>;
  byName: Map<string, string>;
  ids: Set<string>;
}

function lookupFor(catalog: Catalog | null): SymbolLookup {
  const byFile = new Map<string, string>();
  const byStem = new Map<string, string[]>();
  const byName = new Map<string, string>();
  for (const s of catalog?.symbols ?? []) {
    byName.set(normalizeName(s.name), s.id);
    if (s.asset.elementId) continue;
    byFile.set(s.asset.path, s.id);
    const stem = path.posix.basename(s.asset.path, '.svg');
    byStem.set(stem, [...(byStem.get(stem) ?? []), s.id]);
  }
  return { byFile, byStem, byName, ids: new Set(catalog?.symbols.map((s) => s.id) ?? []) };
}

/** The single drawing child of a group that references a symbol (image file or `<use>`), if any. */
function symbolReference(g: SvgElementNode): SvgElementNode | null {
  const elements = g.children.filter((c): c is SvgElementNode => c.type === 'element' && c.tag !== 'title' && c.tag !== 'desc');
  if (elements.length !== 1) return null;
  const only = elements[0] as SvgElementNode;
  if (only.tag === 'image' && only.attrs[EXTERNAL_HREF_ATTR]) return only;
  if (only.tag === 'use' && only.attrs.href?.startsWith('#')) return only;
  return null;
}

export function analyzeDiagram(file: string, root: SvgElementNode, catalog: Catalog | null): { analysis: DiagramAnalysis; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const lookup = lookupFor(catalog);
  const symbols = new Map(catalog?.symbols.map((s) => [s.id, s]) ?? []);
  const implicitStage = slugify(path.posix.basename(file, '.svg'));

  const stages: DiagramAnalysis['stages'] = [];
  const instances: DiagramInstance[] = [];
  const labels: DiagramAnalysis['labels'] = [];
  const connections: DiagramConnection[] = [];
  const lines: DiagramAnalysis['lines'] = [];
  const notes: string[] = [];
  const keys = new Set<string>();
  let malformedTransforms = 0;
  let lineIndex = 0;

  const uniqueKey = (base: string) => {
    let k = base;
    for (let i = 2; keys.has(k); i++) k = `${base}#${i}`;
    keys.add(k);
    return k;
  };

  const resolve = (ref: SvgElementNode): { symbolId: string | null; rawRef: string; stem: string } => {
    if (ref.tag === 'image') {
      const raw = ref.attrs[EXTERNAL_HREF_ATTR] as string;
      const resolved = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(file), raw.split('#')[0] ?? raw)));
      return { symbolId: lookup.byFile.get(resolved) ?? null, rawRef: resolved, stem: path.posix.basename(resolved, '.svg') };
    }
    const id = (ref.attrs.href as string).slice(1);
    const matches = lookup.byStem.get(id) ?? [];
    return { symbolId: matches.length === 1 ? (matches[0] as string) : null, rawRef: `#${id}`, stem: id };
  };

  const visit = (n: SvgElementNode, parentMatrix: Matrix, stageId: string, explicitStage: boolean, insideInstance: boolean, depth: number, stroke: number | undefined) => {
    const parsed = parseTransform(n.attrs.transform);
    if (parsed === null) malformedTransforms++;
    const m = multiply(parentMatrix, parsed ?? IDENTITY);
    const sw = strokeWidthOf(n, stroke);
    const sid = stageIdOf(n);
    let currentStage = stageId;
    let isExplicit = explicitStage;
    let childDepth = depth + 1;
    if (sid) {
      currentStage = sid;
      isExplicit = true;
      childDepth = 1;
      stages.push({ stageId: sid, label: n.attrs['data-label'], elementId: n.attrs.id });
    }

    const from = n.attrs['data-connect-from'];
    const to = n.attrs['data-connect-to'];
    if (from || to) connections.push({ elementId: n.attrs.id, from, to, stageId: currentStage, confidence: from && to ? 'metadata' : 'unresolved' });

    if (!insideInstance && n.tag === 'text') {
      const t = textContent(n).replace(/\s+/g, ' ').trim();
      if (t) labels.push({ text: t, position: applyMatrix(m, { x: num(n.attrs.x), y: num(n.attrs.y) }), elementId: n.attrs.id, stageId: currentStage });
    }

    if (!insideInstance && LINE_TAGS.has(n.tag) && !from) {
      const ends = pathEndpoints(n);
      if (ends) {
        const styles = catalog?.equipmentTypes.filter((t) => t.depiction?.laidLineStrokeWidth !== undefined && sw !== undefined && Math.abs(t.depiction.laidLineStrokeWidth - sw) < 0.05) ?? [];
        lines.push({
          index: lineIndex,
          from: applyMatrix(m, ends.from),
          to: applyMatrix(m, ends.to),
          strokeWidth: sw,
          equipmentTypeId: styles.length === 1 ? styles[0]?.id : undefined,
          stageId: currentStage,
        });
      }
      lineIndex++;
    }

    let isInstance = false;
    if (n.tag === 'g' && !sid && !insideInstance) {
      const d = decompose(m);
      const base = { elementId: n.attrs.id, instanceId: n.attrs['data-instance'], stageId: currentStage };
      const ref = n.attrs['data-symbol'] ? null : symbolReference(n);
      if (n.attrs['data-symbol']) {
        isInstance = true;
        const rawRef = n.attrs['data-symbol'];
        const known = lookup.ids.has(rawRef);
        const position = { x: round(d.translate.x), y: round(d.translate.y) };
        instances.push({
          ...base,
          key: uniqueKey(n.attrs['data-instance'] ?? `${rawRef}@${round(position.x, 1)},${round(position.y, 1)}`),
          rawRef,
          symbolId: known ? rawRef : null,
          position,
          rotation: d.rotation,
          label: n.attrs['data-label'] ?? (textContent(n).trim() || undefined),
          confidence: known ? 'metadata' : 'unresolved',
        });
        if (!known) {
          diagnostics.push({ code: 'diagram.unknown-symbol', severity: 'warning', stage: 'C', message: `${file}: element ${n.attrs.id ?? '?'} navodi nepoznat simbol „${rawRef}”.`, source: { file, anchor: n.attrs.id } });
        }
      } else if (ref) {
        isInstance = true;
        const r = resolve(ref);
        const w = num(ref.attrs.width);
        const h = num(ref.attrs.height);
        const centre = applyMatrix(m, { x: num(ref.attrs.x) + w / 2, y: num(ref.attrs.y) + h / 2 });
        const position = { x: round(centre.x), y: round(centre.y) };
        const def = r.symbolId ? symbols.get(r.symbolId) : undefined;
        const scale = def && w > 0 ? round((w / def.size.width) * Math.abs(d.scaleX), 4) : undefined;
        instances.push({
          ...base,
          key: uniqueKey(`${r.stem}@${round(position.x, 1)},${round(position.y, 1)}`),
          rawRef: r.rawRef,
          symbolId: r.symbolId,
          position,
          rotation: d.rotation,
          ...(scale !== undefined && Math.abs(scale - 1) > 1e-3 ? { scale } : {}),
          confidence: r.symbolId ? 'metadata' : 'unresolved',
        });
        if (!r.symbolId) {
          diagnostics.push({
            code: 'diagram.unknown-symbol',
            severity: 'warning',
            stage: 'C',
            message: `${file}: referenca „${r.rawRef}” ne odgovara nijednom simbolu iz kataloga.`,
            source: { file },
          });
        }
      } else if (isExplicit && depth === 1) {
        isInstance = true;
        const label = n.attrs['data-label'];
        const match = label ? lookup.byName.get(normalizeName(label)) : undefined;
        const position = { x: round(d.translate.x), y: round(d.translate.y) };
        instances.push({
          ...base,
          key: uniqueKey(n.attrs.id ?? `grupa@${round(position.x, 1)},${round(position.y, 1)}`),
          symbolId: match ?? null,
          position,
          rotation: d.rotation,
          label: label ?? (textContent(n).trim() || undefined),
          confidence: match ? 'heuristic' : 'unresolved',
        });
        diagnostics.push({
          code: match ? 'diagram.heuristic-instance' : 'diagram.unresolved-instance',
          severity: match ? 'info' : 'warning',
          stage: 'C',
          message: match
            ? `${file}: grupa ${n.attrs.id ?? '?'} („${label}”) prepoznata je po nazivu kao ${match}; potrebna je provjera.`
            : `${file}: grupa ${n.attrs.id ?? '?'} nije prepoznata kao simbol; potrebna je ručna obrada.`,
          source: { file, anchor: n.attrs.id },
        });
      }
      if (isInstance && (d.skewed || Math.abs(Math.abs(d.scaleX) - 1) > 1e-3 || Math.abs(Math.abs(d.scaleY) - 1) > 1e-3)) {
        diagnostics.push({ code: 'diagram.scaled-instance', severity: 'warning', stage: 'C', message: `${file}: instanca ${n.attrs.id ?? '?'} je skalirana ili iskošena; položaj i rotacija su približni.`, source: { file, anchor: n.attrs.id } });
      }
    }

    for (const c of n.children) {
      if (c.type === 'element') visit(c, m, currentStage, isExplicit, insideInstance || isInstance, childDepth, sw);
    }
  };
  visit(root, IDENTITY, implicitStage, false, false, -1, undefined);
  if (stages.length === 0) stages.push({ stageId: implicitStage, label: undefined, elementId: undefined });

  // Attach direction markers (declared by personnel symbols) to the nearest person.
  const markerOwners = new Map<string, { symbolId: string; distance: number }[]>();
  for (const s of catalog?.symbols ?? []) {
    if (!s.directionMarker) continue;
    markerOwners.set(s.directionMarker.symbolId, [...(markerOwners.get(s.directionMarker.symbolId) ?? []), { symbolId: s.id, distance: s.directionMarker.distance }]);
  }
  for (const marker of instances) {
    const owners = marker.symbolId ? markerOwners.get(marker.symbolId) : undefined;
    if (!owners || !marker.position) continue;
    let best: { inst: DiagramInstance; err: number } | null = null;
    for (const inst of instances) {
      const owner = owners.find((o) => o.symbolId === inst.symbolId);
      if (!owner || !inst.position || inst.stageId !== marker.stageId) continue;
      const err = Math.abs(Math.hypot(inst.position.x - marker.position.x, inst.position.y - marker.position.y) - owner.distance);
      if (err < 6 && (!best || err < best.err)) best = { inst, err };
    }
    if (best) {
      marker.attachedTo = best.inst.key;
      best.inst.facing = marker.rotation ?? 0;
    } else {
      diagnostics.push({ code: 'diagram.unattached-marker', severity: 'info', stage: 'C', message: `${file}: oznaka smjera ${marker.key} nije pridružena nijednoj osobi.`, source: { file, anchor: marker.key } });
    }
  }

  const unclassified = lines.filter((l) => !l.equipmentTypeId).length;
  if (lines.length > 0) notes.push(`${lines.length} linija/putanja (${lines.length - unclassified} prepoznato prema stilu linije).`);
  if (malformedTransforms > 0) notes.push(`${malformedTransforms} neispravnih transform atributa zanemareno.`);
  const recognised = instances.filter((i) => i.confidence !== 'unresolved').length;
  const flattened = recognised === 0 && countPrimitives(root) > 0;
  if (flattened) {
    notes.push('Crtež ne sadrži prepoznatljive instance simbola (samo putanje); izvorni crtež je zadržan za ručni pregled.');
    diagnostics.push({ code: 'diagram.flattened', severity: 'warning', stage: 'C', message: `${file}: crtež je „ravan” (bez metapodataka o simbolima); prepoznavanje nije moguće bez ručnog označavanja.`, source: { file } });
  }
  const titleNode = root.children.find((c): c is SvgElementNode => c.type === 'element' && c.tag === 'title');
  return {
    analysis: {
      file,
      title: titleNode ? textContent(titleNode).trim() : undefined,
      viewBox: parseViewBox(root.attrs.viewBox),
      stages,
      instances,
      labels,
      connections,
      lines,
      renderCopies: [],
      flattened,
      notes,
    },
    diagnostics,
  };
}

function signature(a: DiagramAnalysis): string[] {
  return a.instances.map((i) => `${i.symbolId ?? i.rawRef}@${Math.round(i.position?.x ?? 0)},${Math.round(i.position?.y ?? 0)}`).sort();
}

export function analyzeDiagrams(
  inventory: readonly InventoryItem[],
  svgs: ReadonlyMap<string, DiscoveredSvg>,
  catalog: Catalog | null,
): { diagrams: DiagramAnalysis[]; diagnostics: Diagnostic[] } {
  const diagrams: DiagramAnalysis[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const item of inventory) {
    if (item.assetType !== 'diagram-svg' || item.renderCopyOf) continue;
    const svg = svgs.get(item.file);
    if (!svg?.root) continue;
    const r = analyzeDiagram(item.file, svg.root, catalog);
    diagrams.push(r.analysis);
    diagnostics.push(...r.diagnostics);
  }
  // Render copies must show exactly the same symbol instances as their originals.
  for (const item of inventory) {
    if (!item.renderCopyOf) continue;
    const original = diagrams.find((d) => d.file === item.renderCopyOf);
    const svg = svgs.get(item.file);
    if (!original || !svg?.root) continue;
    const copy = analyzeDiagram(item.file, svg.root, catalog).analysis;
    const a = signature(original).join('|');
    const b = signature(copy).join('|');
    if (a === b) original.renderCopies.push(item.file);
    else {
      diagnostics.push({
        code: 'diagram.render-copy-mismatch',
        severity: 'warning',
        stage: 'C',
        message: `${item.file} ne prikazuje iste instance kao ${original.file} (${copy.instances.length} prema ${original.instances.length}).`,
        source: { file: item.file },
      });
    }
  }
  return { diagrams, diagnostics };
}
