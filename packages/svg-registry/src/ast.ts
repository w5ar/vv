/**
 * Minimal, JSON-serializable SVG syntax tree. Rendering works from this tree
 * (never from raw markup), so only sanitized elements and attributes can
 * reach the DOM.
 */
export interface SvgElementNode {
  readonly type: 'element';
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly SvgNode[];
}

export interface SvgTextNode {
  readonly type: 'text';
  readonly value: string;
}

export type SvgNode = SvgElementNode | SvgTextNode;

export function el(tag: string, attrs: Record<string, string> = {}, children: SvgNode[] = []): SvgElementNode {
  return { type: 'element', tag, attrs, children };
}

export function walk(node: SvgNode, visit: (n: SvgElementNode, ancestors: readonly SvgElementNode[]) => void): void {
  const rec = (n: SvgNode, ancestors: SvgElementNode[]) => {
    if (n.type !== 'element') return;
    visit(n, ancestors);
    const next = [...ancestors, n];
    for (const c of n.children) rec(c, next);
  };
  rec(node, []);
}

/** Returns a new tree with `fn` applied bottom-up to every element. */
export function mapElements(node: SvgElementNode, fn: (n: SvgElementNode) => SvgElementNode): SvgElementNode {
  const children = node.children.map((c) => (c.type === 'element' ? mapElements(c, fn) : c));
  return fn({ ...node, children });
}

export function findById(node: SvgElementNode, id: string, attr = 'id'): { node: SvgElementNode; ancestors: SvgElementNode[] } | null {
  let found: { node: SvgElementNode; ancestors: SvgElementNode[] } | null = null;
  walk(node, (n, ancestors) => {
    if (!found && n.attrs[attr] === id) found = { node: n, ancestors: [...ancestors] };
  });
  return found;
}

export function textContent(node: SvgNode): string {
  if (node.type === 'text') return node.value;
  return node.children.map(textContent).join('');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Serializes the tree back to SVG markup (used for previews, exports and tests). */
export function serializeSvg(node: SvgNode): string {
  if (node.type === 'text') return escapeXml(node.value);
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(serializeSvg).join('')}</${node.tag}>`;
}
