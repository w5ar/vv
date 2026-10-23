import type { SymbolDefinition, VisualState } from '@fds/domain';
import { el, findById, type SvgElementNode } from './ast';
import { applyVisibility, namespaceIds } from './ids';
import { parseViewBox } from './inspect';
import { sanitizeSvg, type SanitizeReport } from './sanitize';

export interface PreparedSymbol {
  readonly symbolId: string;
  readonly root: SvgElementNode;
  readonly viewBox: [number, number, number, number];
  readonly report: SanitizeReport;
  readonly warnings: string[];
}

export type PrepareResult = { ok: true; symbol: PreparedSymbol } | { ok: false; symbolId: string; error: string };

function numeric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^\s*([0-9.]+)\s*(px)?\s*$/.exec(value);
  return m ? Number(m[1]) : undefined;
}

/**
 * Turns raw SVG markup into a renderable symbol: sanitizes it, optionally
 * extracts one element from a multi-symbol sheet (keeping `<defs>` and
 * ancestor transforms), normalizes the viewBox and namespaces ids.
 */
export function prepareSymbolSvg(definition: SymbolDefinition, svgText: string): PrepareResult {
  const sanitized = sanitizeSvg(svgText);
  if (!sanitized.ok) return { ok: false, symbolId: definition.id, error: sanitized.error };
  const warnings: string[] = [...sanitized.report.warnings];
  const source = sanitized.root;
  let content: SvgElementNode = source;
  let viewBox = definition.asset.viewBox as [number, number, number, number] | undefined;

  if (definition.asset.elementId) {
    const found = findById(source, definition.asset.elementId);
    if (!found) {
      return { ok: false, symbolId: definition.id, error: `Element „${definition.asset.elementId}” nije pronađen u ${definition.asset.path}.` };
    }
    const defs = source.children.filter((c): c is SvgElementNode => c.type === 'element' && c.tag === 'defs');
    const transforms = found.ancestors
      .slice(1)
      .map((a) => a.attrs.transform)
      .filter((t): t is string => !!t);
    const wrapped = transforms.length > 0 ? el('g', { transform: transforms.join(' ') }, [found.node]) : found.node;
    content = el('svg', {}, [...defs, wrapped]);
    if (!viewBox) {
      warnings.push(`Simbol ${definition.id}: viewBox nije naveden za element; koristi se viewBox izvorne datoteke.`);
    }
  }

  viewBox ??= parseViewBox(source.attrs.viewBox);
  if (!viewBox) {
    const w = numeric(source.attrs.width);
    const h = numeric(source.attrs.height);
    if (w && h) viewBox = [0, 0, w, h];
  }
  if (!viewBox) {
    viewBox = [0, 0, definition.size.width, definition.size.height];
    warnings.push(`Simbol ${definition.id}: SVG nema viewBox ni dimenzije; pretpostavljena je logička veličina.`);
  }

  const { width: _w, height: _h, x: _x, y: _y, viewBox: _vb, ...rootAttrs } = content.attrs;
  const normalized: SvgElementNode = {
    ...content,
    attrs: {
      ...rootAttrs,
      viewBox: viewBox.join(' '),
      width: '100%',
      height: '100%',
      preserveAspectRatio: content.attrs.preserveAspectRatio ?? source.attrs.preserveAspectRatio ?? 'xMidYMid meet',
    },
  };
  return {
    ok: true,
    symbol: {
      symbolId: definition.id,
      root: namespaceIds(normalized, `sym-${definition.id}`),
      viewBox,
      report: sanitized.report,
      warnings,
    },
  };
}

/** Returns the tree for a given visual state (or the unmodified tree). */
export function withVisualState(symbol: PreparedSymbol, state: VisualState | undefined): SvgElementNode {
  if (!state) return symbol.root;
  return applyVisibility(symbol.root, state.show, state.hide, state.opacity);
}
