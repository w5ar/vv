import type { AssetType, Diagnostic, InventoryItem } from '@fds/domain';
import { inspectSvg, sanitizeSvg, type SvgElementNode } from '@fds/svg-registry';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatasetConfig } from './config';
import { fileSize, listFiles, readText, sha256, slugify } from './util';

/**
 * Stage A — asset discovery. Scans a dataset's source root, classifies every
 * file and records an inventory (dimensions, elements, groups, references,
 * duplicates, possible symbol identifiers). Nothing is interpreted
 * semantically at this stage.
 */

export interface DiscoveredSvg {
  readonly file: string;
  readonly text: string;
  readonly root: SvgElementNode | null;
}

export interface DiscoveryResult {
  readonly inventory: InventoryItem[];
  readonly svgs: Map<string, DiscoveredSvg>;
  readonly markdown: Map<string, string>;
  readonly diagnostics: Diagnostic[];
}

/** Files that document a folder rather than being source material. */
const IGNORED_NAMES = new Set(['readme.md', '.gitkeep']);

function classify(rel: string, sourceRoot: string, svgText?: string): AssetType {
  const ext = path.extname(rel).toLowerCase();
  const inner = rel.slice(sourceRoot.length + 1);
  const folder = inner.split('/')[0]?.toLowerCase() ?? '';
  if (ext === '.svg') {
    if (folder === 'symbols') return 'symbol-svg';
    if (folder === 'diagrams') return 'diagram-svg';
    // Outside the conventional folders: diagrams typically contain layers or symbol instances.
    return svgText && /data-symbol=|inkscape:groupmode="layer"/.test(svgText) ? 'diagram-svg' : 'symbol-svg';
  }
  if (ext === '.md' || ext === '.markdown') return 'procedure-md';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'].includes(ext)) return 'raster-image';
  if (ext === '.pdf') return 'pdf';
  return 'other';
}

function mdText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node) return (node.children as Nodes[]).map(mdText).join('');
  return '';
}

function markdownSummary(text: string) {
  const tree = fromMarkdown(text);
  let headings = 0;
  let numberedItems = 0;
  let title: string | undefined;
  const links: string[] = [];
  const images: string[] = [];
  const visit = (n: Nodes, orderedParent: boolean) => {
    if (n.type === 'heading') {
      headings++;
      if (n.depth === 1 && title === undefined) title = mdText(n).trim();
    }
    if (n.type === 'listItem' && orderedParent) numberedItems++;
    if (n.type === 'link') links.push(n.url);
    if (n.type === 'image') images.push(n.url);
    if ('children' in n) for (const c of n.children as Nodes[]) visit(c, n.type === 'list' ? n.ordered === true : false);
  };
  visit(tree, false);
  return { title, headings, numberedItems, links, images, synthetic: /SINTETI[ČC]KI/i.test(text) };
}

export async function discover(repoRoot: string, dataset: DatasetConfig): Promise<DiscoveryResult> {
  const diagnostics: Diagnostic[] = [];
  const files = (await listFiles(repoRoot, dataset.sourceRoot)).filter((f) => !IGNORED_NAMES.has(path.basename(f).toLowerCase()));
  const inventory: InventoryItem[] = [];
  const svgs = new Map<string, DiscoveredSvg>();
  const markdown = new Map<string, string>();

  for (const file of files) {
    const sizeBytes = await fileSize(repoRoot, file);
    const ext = path.extname(file).toLowerCase();
    const isText = ['.svg', '.md', '.markdown', '.txt', '.json'].includes(ext);
    const text = isText ? await readText(repoRoot, file) : undefined;
    const hash = sha256(text ?? (await readFile(path.join(repoRoot, file))));
    const assetType = classify(file, dataset.sourceRoot, text);
    const item: InventoryItem = { file, assetType, sizeBytes, sha256: hash, duplicateOf: [], possibleSymbolIds: [] };

    if (ext === '.svg' && text !== undefined) {
      const r = sanitizeSvg(text);
      if (r.ok) {
        const info = inspectSvg(r.root, r.report);
        item.svg = { ...info, groups: info.groups.map((g) => ({ ...g })) };
        const ids = new Set<string>([slugify(path.basename(file, '.svg'))]);
        if (r.root.attrs.id) ids.add(slugify(r.root.attrs.id));
        if (info.title) ids.add(slugify(info.title));
        if (assetType === 'symbol-svg') {
          for (const g of info.groups) if (g.depth === 1 && g.elementId) ids.add(slugify(g.elementId));
        }
        item.possibleSymbolIds = [...ids].filter(Boolean);
        if (info.removedBySanitizer.length > 0) {
          diagnostics.push({
            code: 'svg.sanitized',
            severity: 'info',
            stage: 'A',
            message: `${file}: sanitizator je uklonio ${info.removedBySanitizer.length} elemenata/atributa (${info.removedBySanitizer.slice(0, 5).join(', ')}).`,
            source: { file },
          });
        }
        svgs.set(file, { file, text, root: r.root });
      } else {
        item.svg = {
          elementCounts: {},
          groups: [],
          ids: [],
          referencedAssets: [],
          texts: [],
          removedBySanitizer: [],
          parseError: r.error,
          synthetic: false,
        };
        svgs.set(file, { file, text, root: null });
        diagnostics.push({ code: 'svg.malformed', severity: 'error', stage: 'A', message: `${file}: ${r.error}`, source: { file } });
      }
    } else if (assetType === 'procedure-md' && text !== undefined) {
      item.markdown = markdownSummary(text);
      markdown.set(file, text);
    } else if (assetType === 'raster-image' || assetType === 'pdf') {
      diagnostics.push({
        code: 'asset.unsupported-format',
        severity: 'warning',
        stage: 'A',
        message: `${file}: format ${ext} nije vektorski/tekstualni; zadržan je kao referenca i zahtijeva ručnu obradu.`,
        source: { file },
      });
    } else if (assetType === 'other') {
      diagnostics.push({ code: 'asset.unknown-type', severity: 'info', stage: 'A', message: `${file}: nepoznata vrsta datoteke.`, source: { file } });
    }
    inventory.push(item);
  }

  const byHash = new Map<string, string[]>();
  for (const item of inventory) byHash.set(item.sha256, [...(byHash.get(item.sha256) ?? []), item.file]);
  for (const item of inventory) {
    item.duplicateOf = (byHash.get(item.sha256) ?? []).filter((f) => f !== item.file);
    if (item.duplicateOf.length > 0) {
      diagnostics.push({
        code: 'asset.duplicate',
        severity: 'warning',
        stage: 'A',
        message: `${item.file} ima isti sadržaj kao: ${item.duplicateOf.join(', ')}.`,
        source: { file: item.file },
      });
    }
  }

  if (inventory.length === 0) {
    diagnostics.push({
      code: 'source.empty',
      severity: 'warning',
      stage: 'A',
      message: `U direktoriju ${dataset.sourceRoot} nema izvornih materijala (SVG simbola, crteža ni Markdown postupaka).`,
    });
  }
  return { inventory, svgs, markdown, diagnostics };
}
