import type { Catalog, DiagramAnalysis, DiagramConnection, DiagramInstance, Diagnostic, InventoryItem } from '@fds/domain';
import {
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
import type { DiscoveredSvg } from './stage-a-discover';
import { normalizeName, slugify } from './util';

/**
 * Stage C — exercise diagram analysis.
 *
 * Recognition priority (most reliable first):
 *  1. explicit metadata: `data-symbol`, `data-instance`, `data-stage`,
 *     `data-connect-from` / `data-connect-to` attributes;
 *  2. heuristic: a group label (Inkscape label) equal to a catalog symbol name
 *     (ignoring parenthetical qualifiers) — flagged for review;
 *  3. unresolved: anything else is kept as-is and flagged.
 *
 * Stages are layers (`inkscape:groupmode="layer"`) or groups with `data-stage`.
 * Instance groups are expected to be drawn in symbol-local coordinates centred
 * on the symbol pivot; their accumulated transform gives position/rotation.
 */

const PRIMITIVES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'image']);

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

export function analyzeDiagram(file: string, root: SvgElementNode, catalog: Catalog | null): { analysis: DiagramAnalysis; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const symbolIds = new Set(catalog?.symbols.map((s) => s.id) ?? []);
  const byName = new Map<string, string>();
  for (const s of catalog?.symbols ?? []) byName.set(normalizeName(s.name), s.id);

  const stages: DiagramAnalysis['stages'] = [];
  const instances: DiagramInstance[] = [];
  const labels: DiagramAnalysis['labels'] = [];
  const connections: DiagramConnection[] = [];
  const notes: string[] = [];
  let malformedTransforms = 0;

  const visit = (n: SvgElementNode, parentMatrix: Matrix, stageId: string | undefined, insideInstance: boolean, depthInStage: number) => {
    const parsed = parseTransform(n.attrs.transform);
    if (parsed === null) malformedTransforms++;
    const m = multiply(parentMatrix, parsed ?? IDENTITY);
    const sid = stageIdOf(n);
    let currentStage = stageId;
    let depth = depthInStage + 1;
    if (sid) {
      currentStage = sid;
      depth = 0;
      stages.push({ stageId: sid, label: n.attrs['data-label'], elementId: n.attrs.id });
    }

    const from = n.attrs['data-connect-from'];
    const to = n.attrs['data-connect-to'];
    if (from || to) {
      connections.push({ elementId: n.attrs.id, from, to, stageId: currentStage, confidence: from && to ? 'metadata' : 'unresolved' });
    }

    if (n.tag === 'text' && !insideInstance) {
      const t = textContent(n).replace(/\s+/g, ' ').trim();
      if (t) {
        const x = Number(n.attrs.x ?? 0);
        const y = Number(n.attrs.y ?? 0);
        labels.push({
          text: t,
          position: Number.isFinite(x) && Number.isFinite(y) ? applyMatrix(m, { x, y }) : undefined,
          elementId: n.attrs.id,
          stageId: currentStage,
        });
      }
    }

    let isInstance = false;
    if (n.tag === 'g' && !sid && !insideInstance) {
      const rawRef = n.attrs['data-symbol'];
      const label = n.attrs['data-label'];
      const d = decompose(m);
      const base = {
        elementId: n.attrs.id,
        instanceId: n.attrs['data-instance'],
        stageId: currentStage,
        position: { x: Math.round(d.translate.x * 1000) / 1000, y: Math.round(d.translate.y * 1000) / 1000 },
        rotation: d.rotation,
      };
      const innerText = n.children
        .filter((c): c is SvgElementNode => c.type === 'element' && c.tag === 'text')
        .map((c) => textContent(c).trim())
        .filter(Boolean)
        .join(' ');
      if (rawRef) {
        isInstance = true;
        const known = symbolIds.has(rawRef);
        instances.push({ ...base, rawRef, symbolId: known ? rawRef : null, label: label ?? (innerText || undefined), confidence: known ? 'metadata' : 'unresolved' });
        if (!known) {
          diagnostics.push({
            code: 'diagram.unknown-symbol',
            severity: 'warning',
            stage: 'C',
            message: `${file}: element ${n.attrs.id ?? '?'} navodi nepoznat simbol „${rawRef}”.`,
            source: { file, anchor: n.attrs.id },
          });
        }
        if (d.skewed || Math.abs(d.scaleX - 1) > 1e-3 || Math.abs(d.scaleY - 1) > 1e-3) {
          diagnostics.push({
            code: 'diagram.scaled-instance',
            severity: 'warning',
            stage: 'C',
            message: `${file}: instanca ${n.attrs.id ?? '?'} je skalirana ili iskošena; položaj i rotacija su približni.`,
            source: { file, anchor: n.attrs.id },
          });
        }
      } else if (depth === 1 && currentStage !== undefined) {
        // Direct child group of a stage layer without metadata.
        isInstance = true;
        const match = label ? byName.get(normalizeName(label)) : undefined;
        instances.push({ ...base, symbolId: match ?? null, label: label ?? (innerText || undefined), confidence: match ? 'heuristic' : 'unresolved' });
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
    }

    for (const c of n.children) {
      if (c.type === 'element') visit(c, m, currentStage, insideInstance || isInstance, depth);
    }
  };
  visit(root, IDENTITY, undefined, false, -1);

  if (malformedTransforms > 0) notes.push(`${malformedTransforms} neispravnih transform atributa zanemareno.`);
  const recognised = instances.filter((i) => i.confidence !== 'unresolved').length;
  const flattened = recognised === 0 && countPrimitives(root) > 0;
  if (flattened) {
    notes.push('Crtež ne sadrži prepoznatljive instance simbola (samo putanje); izvorni crtež je zadržan za ručni pregled.');
    diagnostics.push({
      code: 'diagram.flattened',
      severity: 'warning',
      stage: 'C',
      message: `${file}: crtež je „ravan” (bez metapodataka o simbolima); prepoznavanje nije moguće bez ručnog označavanja.`,
      source: { file },
    });
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
      flattened,
      notes,
    },
    diagnostics,
  };
}

export function analyzeDiagrams(
  inventory: readonly InventoryItem[],
  svgs: ReadonlyMap<string, DiscoveredSvg>,
  catalog: Catalog | null,
): { diagrams: DiagramAnalysis[]; diagnostics: Diagnostic[] } {
  const diagrams: DiagramAnalysis[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const item of inventory) {
    if (item.assetType !== 'diagram-svg') continue;
    const svg = svgs.get(item.file);
    if (!svg?.root) continue;
    const r = analyzeDiagram(item.file, svg.root, catalog);
    diagrams.push(r.analysis);
    diagnostics.push(...r.diagnostics);
  }
  return { diagrams, diagnostics };
}
