import { mapElements, walk, type SvgElementNode } from './ast';

/** Attribute that keeps the original SVG id after namespacing. */
export const SOURCE_ID_ATTR = 'data-src-id';

export function cssSafeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Prefixes every `id` so several inline SVGs can coexist in one document,
 * and rewrites internal references (`href="#id"`, `url(#id)`). The original
 * id is preserved in `data-src-id` for traceability and visual states.
 */
export function namespaceIds(root: SvgElementNode, prefix: string): SvgElementNode {
  const ids = new Set<string>();
  walk(root, (n) => {
    if (n.attrs.id) ids.add(n.attrs.id);
  });
  if (ids.size === 0) return root;
  const p = cssSafeId(prefix);
  const map = (id: string) => (ids.has(id) ? `${p}__${cssSafeId(id)}` : id);
  const rewriteUrls = (value: string) => value.replace(/url\(\s*(['"]?)#([^'")]+)\1\s*\)/g, (_m, _q, id: string) => `url(#${map(id)})`);
  return mapElements(root, (n) => {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.attrs)) {
      if (k === 'id') {
        attrs.id = map(v);
        attrs[SOURCE_ID_ATTR] = v;
      } else if (k === 'href' && v.startsWith('#')) {
        attrs.href = `#${map(v.slice(1))}`;
      } else if (v.includes('url(')) {
        attrs[k] = rewriteUrls(v);
      } else {
        attrs[k] = v;
      }
    }
    return { ...n, attrs };
  });
}

/**
 * Applies a visual state by hiding/showing elements identified by their
 * original ids (`data-src-id`, or `id` when the tree is not namespaced).
 */
export function applyVisibility(root: SvgElementNode, show: readonly string[], hide: readonly string[], opacity?: number): SvgElementNode {
  if (show.length === 0 && hide.length === 0 && opacity === undefined) return root;
  const showSet = new Set(show);
  const hideSet = new Set(hide);
  const mapped = mapElements(root, (n) => {
    const id = n.attrs[SOURCE_ID_ATTR] ?? n.attrs.id;
    if (!id) return n;
    if (hideSet.has(id)) return { ...n, attrs: { ...n.attrs, display: 'none' } };
    if (showSet.has(id)) {
      const { display: _display, ...rest } = n.attrs;
      return { ...n, attrs: { ...rest, display: 'inline' } };
    }
    return n;
  });
  return opacity === undefined ? mapped : { ...mapped, attrs: { ...mapped.attrs, opacity: String(opacity) } };
}
