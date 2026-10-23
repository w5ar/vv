import { describe, expect, it } from 'vitest';
import { SymbolDefinitionSchema, type Catalog, CatalogSchema } from '@fds/domain';
import {
  SymbolRegistry,
  decompose,
  findById,
  inspectSvg,
  namespaceIds,
  parseTransform,
  prepareSymbolSvg,
  sanitizeSvg,
  serializeSvg,
  withVisualState,
  type SvgElementNode,
} from './index';

const MALICIOUS = `<?xml version="1.0"?>
<!DOCTYPE svg [ <!ENTITY x "boom"> ]>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 10 10" onload="alert(1)">
  <script>alert(2)</script>
  <foreignObject><div>html</div></foreignObject>
  <g id="layer1" inkscape:label="Sloj 1" inkscape:groupmode="layer" onclick="evil()">
    <rect id="r" width="10" height="10" style="fill:red;background:url(http://evil/x.png)" />
    <a xlink:href="javascript:alert(3)"><circle id="c" r="2"/></a>
    <use xlink:href="other.svg#sym" />
    <use href="#r" />
    <image href="https://example.com/a.png" />
    <animate attributeName="href" to="javascript:alert(4)" />
  </g>
</svg>`;

describe('sanitizeSvg', () => {
  it('removes script vectors and records what was removed', () => {
    const r = sanitizeSvg(MALICIOUS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = serializeSvg(r.root);
    expect(out).not.toMatch(/script|foreignObject|onload|onclick|javascript|animate|evil|http:/i);
    expect(r.report.removed).toEqual(expect.arrayContaining(['script', 'foreignObject', 'svg@onload', 'g@onclick', 'animate']));
    expect(r.report.externalRefs).toEqual(expect.arrayContaining(['other.svg#sym', 'https://example.com/a.png']));
    // <a> is unwrapped, its child kept; inkscape label/groupmode preserved as data attributes
    expect(findById(r.root, 'c')).not.toBeNull();
    const layer = findById(r.root, 'layer1')?.node;
    expect(layer?.attrs['data-label']).toBe('Sloj 1');
    expect(layer?.attrs['data-groupmode']).toBe('layer');
    // Safe style declarations are kept, unsafe ones dropped.
    expect(findById(r.root, 'r')?.node.attrs.style).toBe('fill:red');
  });

  it('handles malformed input gracefully', () => {
    expect(sanitizeSvg('<svg><g></svg>').ok).toBe(false);
    expect(sanitizeSvg('not xml at all').ok).toBe(false);
    expect(sanitizeSvg('<html><svg/></html>').ok).toBe(false);
    expect(sanitizeSvg('').ok).toBe(false);
  });

  it('inlines simple <style> rules per element instead of leaking global CSS', () => {
    const r = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">
      <style>.a{fill:#f00} rect.a{stroke:#000} #x{fill:#00f} g > rect{fill:pink} @import url(evil.css);</style>
      <rect class="a"/><rect id="x" class="a" style="opacity:.5"/></svg>`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rects = r.root.children.filter((c): c is SvgElementNode => c.type === 'element' && c.tag === 'rect');
    expect(rects[0]?.attrs.style).toBe('fill:#f00;stroke:#000');
    expect(rects[1]?.attrs.style).toBe('fill:#00f;stroke:#000;opacity:.5');
    expect(serializeSvg(r.root)).not.toContain('<style');
    expect(r.report.warnings.join(' ')).toContain('g > rect');
  });

  it('rejects oversized input', () => {
    expect(sanitizeSvg('<svg/>', { maxLength: 3 }).ok).toBe(false);
  });
});

describe('ids and transforms', () => {
  it('namespaces ids and rewrites internal references, keeping the original id', () => {
    const r = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1"/></defs>
      <rect id="a" fill="url(#g1)"/><use href="#a"/></svg>`);
    if (!r.ok) throw new Error(r.error);
    const ns = namespaceIds(r.root, 'sym-x');
    const out = serializeSvg(ns);
    expect(out).toContain('id="sym-x__g1"');
    expect(out).toContain('fill="url(#sym-x__g1)"');
    expect(out).toContain('href="#sym-x__a"');
    expect(out).toContain('data-src-id="a"');
  });

  it('parses and decomposes transforms', () => {
    const m = parseTransform('translate(100 50) rotate(90)');
    expect(m).not.toBeNull();
    const dcp = decompose(m!);
    expect(dcp.translate).toEqual({ x: 100, y: 50 });
    expect(dcp.rotation).toBe(90);
    expect(dcp.scaleX).toBeCloseTo(1);
    const around = decompose(parseTransform('rotate(180, 10, 10)')!);
    expect(around.translate.x).toBeCloseTo(20);
    expect(around.translate.y).toBeCloseTo(20);
    expect(parseTransform('rotate(abc)')).toBeNull();
    expect(parseTransform('garbage')).toBeNull();
  });
});

const symbolDef = (extra: Record<string, unknown> = {}) =>
  SymbolDefinitionSchema.parse({
    id: 'sym.test',
    name: 'Test',
    category: 'cat',
    asset: { path: 'x.svg' },
    size: { width: 20, height: 10 },
    visualStates: [{ id: 'off', name: 'Isključeno', hide: ['lamp'] }],
    ...extra,
  });

describe('prepareSymbolSvg', () => {
  it('normalizes the viewBox from width/height and sizes the root to its box', () => {
    const r = prepareSymbolSvg(symbolDef(), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect id="lamp"/></svg>');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.symbol.viewBox).toEqual([0, 0, 40, 20]);
    expect(r.symbol.root.attrs.width).toBe('100%');
    const off = withVisualState(r.symbol, symbolDef().visualStates[0]);
    expect(findById(off, 'lamp', 'data-src-id')?.node.attrs.display).toBe('none');
  });

  it('extracts one symbol from a multi-symbol sheet with ancestor transforms and defs', () => {
    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <defs><marker id="m"/></defs>
      <g transform="translate(100 0)"><g id="second"><rect width="10" height="10"/></g></g></svg>`;
    const r = prepareSymbolSvg(symbolDef({ asset: { path: 'sheet.svg', elementId: 'second', viewBox: [100, 0, 50, 50] } }), sheet);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = serializeSvg(r.symbol.root);
    expect(out).toContain('viewBox="100 0 50 50"');
    expect(out).toContain('transform="translate(100 0)"');
    expect(out).toContain('data-src-id="m"');
  });

  it('reports missing elements and unparsable files', () => {
    expect(prepareSymbolSvg(symbolDef({ asset: { path: 'x.svg', elementId: 'nope' } }), '<svg xmlns="http://www.w3.org/2000/svg"/>').ok).toBe(false);
    expect(prepareSymbolSvg(symbolDef(), '<svg').ok).toBe(false);
  });
});

describe('inspectSvg', () => {
  it('summarizes groups, layers, texts and references', () => {
    const r = sanitizeSvg(MALICIOUS);
    if (!r.ok) throw new Error(r.error);
    const info = inspectSvg(r.root, r.report);
    expect(info.viewBox).toEqual([0, 0, 10, 10]);
    expect(info.groups[0]).toMatchObject({ elementId: 'layer1', label: 'Sloj 1', isLayer: true });
    expect(info.elementCounts.use).toBe(2);
    expect(info.referencedAssets).toEqual(expect.arrayContaining(['other.svg#sym', '#r']));
  });
});

describe('SymbolRegistry', () => {
  const catalog: Catalog = CatalogSchema.parse({
    schemaVersion: 1,
    id: 'cat',
    name: 'Test',
    categories: [{ id: 'cat', name: 'Kategorija' }],
    symbols: [
      { id: 'ok', name: 'OK', category: 'cat', asset: { path: 'ok.svg' }, size: { width: 10, height: 10 } },
      { id: 'broken', name: 'Pokvaren', category: 'cat', asset: { path: 'broken.svg' }, size: { width: 10, height: 10 } },
      { id: 'missing', name: 'Nedostaje', category: 'cat', asset: { path: 'missing.svg' }, size: { width: 10, height: 10 } },
    ],
  });
  const files: Record<string, string> = {
    'ok.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="5"/></svg>',
    'broken.svg': '<svg><unclosed></svg>',
  };
  const loader = async (path: string) => {
    const f = files[path];
    if (f === undefined) throw new Error('ENOENT');
    return f;
  };

  it('loads, caches and reports per-symbol errors without throwing', async () => {
    let calls = 0;
    const registry = new SymbolRegistry(catalog, async (p) => {
      calls++;
      return loader(p);
    });
    const all = await registry.loadAll();
    expect(all.map((s) => s.status)).toEqual(['ready', 'error', 'error']);
    await registry.load('ok');
    expect(calls).toBe(3);
    expect(registry.peek('ok')?.status).toBe('ready');
    await expect(registry.load('unknown')).rejects.toThrow();
  });
});
