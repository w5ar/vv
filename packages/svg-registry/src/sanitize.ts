import { DOMParser } from '@xmldom/xmldom';
import type { SvgElementNode, SvgNode } from './ast';
import {
  parseStylesheet,
  sanitizeDeclarations,
  selectorMatches,
  serializeDeclarations,
  isSafeCssValue,
  type CssRule,
  type Declaration,
} from './css';

/**
 * Parses SVG markup and converts it into a sanitized {@link SvgElementNode}
 * tree. Works identically in the browser and in Node (xmldom).
 *
 * Security model: allowlist of static SVG elements; every script vector is
 * removed (scripts, foreignObject, SMIL animation, event handler attributes,
 * javascript:/external URLs, unsafe CSS). The resulting tree is rendered as
 * React elements, never through innerHTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker',
  'image', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feFlood',
  'feComposite', 'feMerge', 'feMergeNode', 'feMorphology', 'feDropShadow',
]);

/** Elements whose children are kept while the element itself is removed. */
const UNWRAP_ELEMENTS = new Set(['a', 'switch']);

/** Elements whose text content is meaningful. */
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'textPath', 'title', 'desc']);

/** Attribute that records a removed relative `href` (e.g. `../simboli/n1.svg`) without loading it. */
export const EXTERNAL_HREF_ATTR = 'data-external-href';

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const DANGEROUS_VALUE = /(javascript:|vbscript:|data:text\/html)/i;

export interface SanitizeOptions {
  readonly maxLength?: number;
  readonly maxNodes?: number;
}

export interface SanitizeReport {
  /** `tag` or `tag@attribute` entries describing what was removed. */
  readonly removed: string[];
  /** External references (files/URLs) that were dropped from the tree. */
  readonly externalRefs: string[];
  readonly warnings: string[];
}

export type SanitizeResult =
  | { ok: true; root: SvgElementNode; report: SanitizeReport }
  | { ok: false; error: string; report: SanitizeReport };

interface XmlNode {
  nodeType: number;
  nodeValue: string | null;
  localName?: string | null;
  nodeName: string;
  namespaceURI?: string | null;
  childNodes: ArrayLike<XmlNode>;
  attributes?: ArrayLike<XmlAttr>;
}

interface XmlAttr {
  name: string;
  localName: string | null;
  prefix: string | null;
  namespaceURI: string | null;
  value: string;
}

function attrKey(attr: XmlAttr): { key: string | null; reason?: string } {
  const local = attr.localName ?? attr.name;
  const ns = attr.namespaceURI;
  if (attr.name === 'xmlns' || attr.prefix === 'xmlns') return { key: null };
  if (ns === XLINK_NS) return local === 'href' ? { key: 'href' } : { key: null, reason: attr.name };
  if (ns === XML_NS) return local === 'space' || local === 'lang' ? { key: `xml:${local}` } : { key: null, reason: attr.name };
  if (ns === INKSCAPE_NS) {
    if (local === 'label') return { key: 'data-label' };
    if (local === 'groupmode') return { key: 'data-groupmode' };
    return { key: null, reason: attr.name };
  }
  if (ns || attr.prefix) return { key: null, reason: attr.name };
  if (/^on/i.test(local)) return { key: null, reason: attr.name };
  return { key: local };
}

function cleanAttributes(tag: string, node: XmlNode, report: SanitizeReport): Record<string, string> {
  const attrs: Record<string, string> = {};
  const list = node.attributes;
  if (!list) return attrs;
  for (let i = 0; i < list.length; i++) {
    const attr = list[i] as XmlAttr;
    const { key, reason } = attrKey(attr);
    if (!key) {
      if (reason) report.removed.push(`${tag}@${reason}`);
      continue;
    }
    const value = attr.value;
    if (DANGEROUS_VALUE.test(value)) {
      report.removed.push(`${tag}@${key}`);
      continue;
    }
    if (key === 'href') {
      if (value.startsWith('#')) attrs.href = value;
      else if (tag === 'image' && SAFE_DATA_IMAGE.test(value)) attrs.href = value;
      else {
        report.removed.push(`${tag}@href`);
        report.externalRefs.push(value);
        // Keep relative file references as inert metadata (never loaded) for diagram analysis.
        if ((tag === 'image' || tag === 'use') && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//')) {
          attrs[EXTERNAL_HREF_ATTR] = value;
        }
      }
      continue;
    }
    if (key === 'style') {
      const { kept, removed } = sanitizeDeclarations(value);
      for (const r of removed) report.removed.push(`${tag}@style:${r}`);
      if (kept.length > 0) attrs.style = serializeDeclarations(kept);
      continue;
    }
    if (value.includes('url(') && !isSafeCssValue(value)) {
      report.removed.push(`${tag}@${key}`);
      continue;
    }
    attrs[key] = value;
  }
  return attrs;
}

function convert(
  node: XmlNode,
  report: SanitizeReport,
  styles: string[],
  counter: { n: number; max: number },
  parentTag: string,
): SvgNode[] {
  if (++counter.n > counter.max) throw new Error(`SVG ima previše čvorova (> ${counter.max}).`);
  if (node.nodeType === 3 || node.nodeType === 4) {
    const value = node.nodeValue ?? '';
    if (parentTag === 'style') {
      styles.push(value);
      return [];
    }
    if (TEXT_ELEMENTS.has(parentTag)) return value ? [{ type: 'text', value }] : [];
    return [];
  }
  if (node.nodeType !== 1) return [];
  const ns = node.namespaceURI ?? null;
  const tag = node.localName ?? node.nodeName;
  const children = () => {
    const out: SvgNode[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      out.push(...convert(node.childNodes[i] as XmlNode, report, styles, counter, tag));
    }
    return out;
  };
  if (ns !== null && ns !== SVG_NS) {
    report.removed.push(node.nodeName);
    return [];
  }
  if (tag === 'style') {
    children();
    return [];
  }
  if (UNWRAP_ELEMENTS.has(tag)) {
    report.removed.push(`${tag} (sadržaj zadržan)`);
    return children();
  }
  if (!ALLOWED_ELEMENTS.has(tag)) {
    report.removed.push(tag);
    return [];
  }
  return [{ type: 'element', tag, attrs: cleanAttributes(tag, node, report), children: children() }];
}

function inlineStyles(root: SvgElementNode, rules: CssRule[]): SvgElementNode {
  if (rules.length === 0) return root;
  const visit = (n: SvgElementNode): SvgElementNode => {
    const classes = (n.attrs.class ?? '').split(/\s+/).filter(Boolean);
    const matched: { decls: Declaration[]; specificity: number; order: number }[] = [];
    for (const rule of rules) {
      for (const sel of rule.selectors) {
        if (selectorMatches(sel, n.tag, n.attrs.id, classes)) {
          matched.push({ decls: rule.declarations, specificity: sel.specificity, order: rule.order });
        }
      }
    }
    let attrs = n.attrs;
    if (matched.length > 0) {
      matched.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
      const merged = new Map<string, string>();
      for (const m of matched) for (const d of m.decls) merged.set(d.property, d.value);
      // Inline style declared on the element keeps precedence.
      for (const d of sanitizeDeclarations(n.attrs.style ?? '').kept) merged.set(d.property, d.value);
      attrs = { ...n.attrs, style: serializeDeclarations([...merged].map(([property, value]) => ({ property, value }))) };
    }
    return {
      ...n,
      attrs,
      children: n.children.map((c) => (c.type === 'element' ? visit(c) : c)),
    };
  };
  return visit(root);
}

export function sanitizeSvg(text: string, options: SanitizeOptions = {}): SanitizeResult {
  const report: SanitizeReport = { removed: [], externalRefs: [], warnings: [] };
  const maxLength = options.maxLength ?? 5_000_000;
  if (text.length > maxLength) return { ok: false, error: `SVG je prevelik (${text.length} znakova).`, report };
  if (!/<svg[\s>]/i.test(text)) return { ok: false, error: 'Datoteka ne sadrži <svg> element.', report };

  let doc: { documentElement: XmlNode | null };
  try {
    doc = new DOMParser({
      onError: (level: string, message: string) => {
        if (level === 'warning') report.warnings.push(message);
        else throw new Error(message);
      },
    }).parseFromString(text, 'image/svg+xml') as unknown as { documentElement: XmlNode | null };
  } catch (e) {
    return { ok: false, error: `Neispravan SVG/XML: ${e instanceof Error ? e.message : String(e)}`, report };
  }
  const rootXml = doc.documentElement;
  if (!rootXml || (rootXml.localName ?? rootXml.nodeName) !== 'svg') {
    return { ok: false, error: 'Korijenski element nije <svg>.', report };
  }
  const styles: string[] = [];
  let converted: SvgNode[];
  try {
    converted = convert(rootXml, report, styles, { n: 0, max: options.maxNodes ?? 50_000 }, '');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), report };
  }
  let root = converted[0];
  if (!root || root.type !== 'element') return { ok: false, error: 'Korijenski <svg> element je uklonjen.', report };
  if (styles.length > 0) {
    const sheet = parseStylesheet(styles.join('\n'));
    for (const u of sheet.unsupported) report.warnings.push(`CSS pravilo nije podržano i uklonjeno je: ${u}`);
    root = inlineStyles(root, sheet.rules);
  }
  return { ok: true, root, report };
}
