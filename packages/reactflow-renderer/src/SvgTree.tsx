import { createElement, type CSSProperties, type ReactNode } from 'react';
import type { SvgElementNode, SvgNode } from '@fds/svg-registry';

/**
 * Renders a sanitized SVG syntax tree as React elements. No markup string is
 * ever injected into the DOM; only attributes that survived sanitization are
 * passed, converted to React's prop naming.
 */

const SPECIAL: Record<string, string> = {
  class: 'className',
  'xml:space': 'xmlSpace',
  'xml:lang': 'xmlLang',
};

function camel(name: string): string {
  return name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

export function styleObject(style: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const part of style.split(';')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const prop = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!prop || !value) continue;
    out[prop.startsWith('--') ? prop : camel(prop)] = value;
  }
  return out as CSSProperties;
}

export function reactProps(attrs: Readonly<Record<string, string>>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') props.style = styleObject(v);
    else if (k.startsWith('data-') || k.startsWith('aria-')) props[k] = v;
    else props[SPECIAL[k] ?? camel(k)] = v;
  }
  return props;
}

function renderNode(node: SvgNode, key: number): ReactNode {
  if (node.type === 'text') return node.value;
  return createElement(node.tag, { key, ...reactProps(node.attrs) }, ...node.children.map((c, i) => renderNode(c, i)));
}

export interface SvgTreeProps {
  readonly root: SvgElementNode;
  readonly className?: string;
  readonly title?: string;
}

export function SvgTree({ root, className, title }: SvgTreeProps) {
  const props = reactProps(root.attrs);
  return createElement(
    'svg',
    {
      ...props,
      xmlns: 'http://www.w3.org/2000/svg',
      className: [props.className as string | undefined, className].filter(Boolean).join(' ') || undefined,
      role: 'img',
      'aria-label': title,
      focusable: 'false',
    },
    ...root.children.map((c, i) => renderNode(c, i)),
  );
}
