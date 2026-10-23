/**
 * Very small CSS utilities used by the sanitizer:
 * - sanitizing declaration values (no external url(), no script vectors)
 * - parsing simple stylesheets so `<style>` rules can be inlined per element
 *   instead of being injected globally into the page.
 */

const DANGEROUS_CSS = /(expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import)/i;

export interface Declaration {
  readonly property: string;
  readonly value: string;
}

export function parseDeclarations(text: string): Declaration[] {
  const out: Declaration[] = [];
  for (const part of text.split(';')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const property = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (property && value) out.push({ property, value });
  }
  return out;
}

export function serializeDeclarations(decls: readonly Declaration[]): string {
  return decls.map((d) => `${d.property}:${d.value}`).join(';');
}

/** True if the value only references internal fragments (url(#id)). */
function urlsAreInternal(value: string): boolean {
  const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (!(m[2] ?? '').startsWith('#')) return false;
  }
  return true;
}

export function isSafeCssValue(value: string): boolean {
  return !DANGEROUS_CSS.test(value) && urlsAreInternal(value);
}

/** Removes unsafe declarations; returns kept declarations and removed property names. */
export function sanitizeDeclarations(text: string): { kept: Declaration[]; removed: string[] } {
  const kept: Declaration[] = [];
  const removed: string[] = [];
  for (const d of parseDeclarations(text)) {
    if (isSafeCssValue(d.value) && !d.property.startsWith('-moz-binding')) kept.push(d);
    else removed.push(d.property);
  }
  return { kept, removed };
}

export type SimpleSelector =
  | { kind: 'tag'; tag: string; specificity: number }
  | { kind: 'class'; className: string; tag?: string | undefined; specificity: number }
  | { kind: 'id'; id: string; specificity: number };

export interface CssRule {
  readonly selectors: SimpleSelector[];
  readonly declarations: Declaration[];
  readonly order: number;
}

export interface ParsedStylesheet {
  readonly rules: CssRule[];
  /** Selectors or at-rules that could not be inlined. */
  readonly unsupported: string[];
}

function parseSelector(raw: string): SimpleSelector | null {
  const s = raw.trim();
  let m = /^#([A-Za-z_][\w-]*)$/.exec(s);
  if (m) return { kind: 'id', id: m[1] as string, specificity: 100 };
  m = /^([A-Za-z][\w-]*)?\.([A-Za-z_][\w-]*)$/.exec(s);
  if (m) return { kind: 'class', className: m[2] as string, tag: m[1], specificity: m[1] ? 11 : 10 };
  m = /^([A-Za-z][\w-]*)$/.exec(s);
  if (m) return { kind: 'tag', tag: m[1] as string, specificity: 1 };
  return null;
}

/** Parses a stylesheet supporting simple selectors only (`tag`, `.class`, `tag.class`, `#id`). */
export function parseStylesheet(css: string): ParsedStylesheet {
  const rules: CssRule[] = [];
  const unsupported: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let order = 0;
  while ((m = re.exec(text)) !== null) {
    const selectorText = (m[1] ?? '').trim();
    if (selectorText.startsWith('@')) {
      unsupported.push(selectorText);
      continue;
    }
    const { kept } = sanitizeDeclarations(m[2] ?? '');
    const selectors: SimpleSelector[] = [];
    for (const part of selectorText.split(',')) {
      const sel = parseSelector(part);
      if (sel) selectors.push(sel);
      else unsupported.push(part.trim());
    }
    if (selectors.length > 0 && kept.length > 0) rules.push({ selectors, declarations: kept, order: order++ });
  }
  if (/@import|@font-face|@media|@keyframes/i.test(text)) {
    for (const at of text.match(/@[a-z-]+/gi) ?? []) if (!unsupported.includes(at)) unsupported.push(at);
  }
  return { rules, unsupported };
}

export function selectorMatches(sel: SimpleSelector, tag: string, id: string | undefined, classes: readonly string[]): boolean {
  switch (sel.kind) {
    case 'tag':
      return sel.tag === tag;
    case 'id':
      return sel.id === id;
    case 'class':
      return classes.includes(sel.className) && (!sel.tag || sel.tag === tag);
  }
}
