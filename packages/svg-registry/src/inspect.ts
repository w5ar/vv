import { textContent, walk, type SvgElementNode } from './ast';
import type { SanitizeReport } from './sanitize';

export interface SvgGroupSummary {
  readonly elementId?: string | undefined;
  readonly label?: string | undefined;
  readonly depth: number;
  readonly childCount: number;
  readonly isLayer: boolean;
  readonly dataAttributes: Record<string, string>;
}

export interface SvgSummary {
  readonly width?: string | undefined;
  readonly height?: string | undefined;
  readonly viewBox?: number[] | undefined;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly elementCounts: Record<string, number>;
  readonly groups: SvgGroupSummary[];
  readonly ids: string[];
  readonly referencedAssets: string[];
  readonly texts: string[];
  readonly removedBySanitizer: string[];
  /** Root carries `data-synthetic="true"` (synthetic fixture marker). */
  readonly synthetic: boolean;
}

export function parseViewBox(value: string | undefined): [number, number, number, number] | undefined {
  if (!value) return undefined;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, w, h] = parts as [number, number, number, number];
  return w > 0 && h > 0 ? [x, y, w, h] : undefined;
}

function dataAttributes(n: SvgElementNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(n.attrs)) if (k.startsWith('data-') && k !== 'data-label' && k !== 'data-groupmode') out[k] = v;
  return out;
}

/** Collects inventory information from a sanitized SVG tree. */
export function inspectSvg(root: SvgElementNode, report?: SanitizeReport): SvgSummary {
  const elementCounts: Record<string, number> = {};
  const groups: SvgGroupSummary[] = [];
  const ids: string[] = [];
  const texts: string[] = [];
  const internalUseRefs: string[] = [];
  let title: string | undefined;
  let description: string | undefined;
  walk(root, (n, ancestors) => {
    elementCounts[n.tag] = (elementCounts[n.tag] ?? 0) + 1;
    if (n.attrs.id) ids.push(n.attrs.id);
    if (n.tag === 'g') {
      groups.push({
        elementId: n.attrs.id,
        label: n.attrs['data-label'],
        depth: ancestors.length,
        childCount: n.children.filter((c) => c.type === 'element').length,
        isLayer: n.attrs['data-groupmode'] === 'layer',
        dataAttributes: dataAttributes(n),
      });
    }
    if (n.tag === 'title' && ancestors.length === 1 && title === undefined) title = textContent(n).trim();
    if (n.tag === 'desc' && ancestors.length === 1 && description === undefined) description = textContent(n).trim();
    if (n.tag === 'text') {
      const t = textContent(n).replace(/\s+/g, ' ').trim();
      if (t) texts.push(t);
    }
    if (n.tag === 'use' && n.attrs.href) internalUseRefs.push(n.attrs.href);
  });
  return {
    width: root.attrs.width,
    height: root.attrs.height,
    viewBox: parseViewBox(root.attrs.viewBox),
    title,
    description,
    elementCounts,
    groups,
    ids,
    referencedAssets: [...new Set([...(report?.externalRefs ?? []), ...internalUseRefs])],
    texts,
    removedBySanitizer: [...new Set(report?.removed ?? [])],
    synthetic: root.attrs['data-synthetic'] === 'true',
  };
}
