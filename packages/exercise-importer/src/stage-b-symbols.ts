import type { CatalogInput, Diagnostic, InventoryItem, ProcedureAnalysis, SymbolDefinitionInput, SymbolProposal } from '@fds/domain';
import path from 'node:path';
import type { DatasetConfig } from './config';
import { UNCLASSIFIED_CATEGORY, type CatalogReview } from './review-files';
import { joinRel, slugify } from './util';

/**
 * Stage B — symbol normalization. Combines discovered symbol SVGs with the
 * reviewed catalog file. Reviewed entries become catalog symbols as-is.
 * SVGs without a review entry become *proposals*: they get a technical id,
 * a name taken only from the SVG title or file name, the "unclassified"
 * category and no ports — no semantic meaning is assigned.
 */

export interface SymbolStageResult {
  readonly proposals: SymbolProposal[];
  /** Catalog input ready for validation, or null when no review file exists. */
  readonly catalog: CatalogInput | null;
  readonly diagnostics: Diagnostic[];
}

export function normalizeSymbols(
  dataset: DatasetConfig,
  inventory: readonly InventoryItem[],
  review: CatalogReview | null,
  legend: readonly (ProcedureAnalysis['legend'][number] & { source: string })[] = [],
): SymbolStageResult {
  const diagnostics: Diagnostic[] = [];
  const ignoredAssets = new Map((review?.ignoredAssets ?? []).map((a) => [joinRel(dataset.sourceRoot, a.file), a.reason]));
  const proposals: SymbolProposal[] = [];
  const symbolFiles = inventory.filter((i) => i.assetType === 'symbol-svg');
  const reviewed = review?.symbols ?? [];
  const symbols: SymbolDefinitionInput[] = [];
  const prefix = dataset.synthetic ? 'syn' : 'src';

  for (const r of reviewed) {
    const file = joinRel(dataset.sourceRoot, r.file);
    const item = inventory.find((i) => i.file === file);
    if (!item) {
      diagnostics.push({
        code: 'symbol.missing-asset',
        severity: 'error',
        stage: 'B',
        message: `Simbol ${r.id}: datoteka ${file} ne postoji među izvornim materijalima.`,
        subjectId: r.id,
      });
      continue;
    }
    if (item.svg?.parseError) {
      diagnostics.push({ code: 'symbol.malformed-asset', severity: 'error', stage: 'B', message: `Simbol ${r.id}: ${item.svg.parseError}`, subjectId: r.id });
    }
    if (r.elementId && !item.svg?.ids.includes(r.elementId)) {
      diagnostics.push({
        code: 'symbol.missing-element',
        severity: 'error',
        stage: 'B',
        message: `Simbol ${r.id}: element „${r.elementId}” ne postoji u ${file}.`,
        subjectId: r.id,
      });
    }
    const vb = r.viewBox ?? (item.svg?.viewBox as [number, number, number, number] | undefined);
    const size = r.size ?? (vb ? { width: vb[2], height: vb[3] } : { width: 64, height: 64 });
    symbols.push({
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description,
      asset: { path: file, ...(r.elementId ? { elementId: r.elementId } : {}), ...(r.viewBox ? { viewBox: r.viewBox } : {}) },
      size,
      pivot: r.pivot,
      anchors: r.anchors,
      ports: r.ports,
      rotation: r.rotation,
      semantics: r.semantics,
      visualStates: r.visualStates,
      defaultState: r.defaultState,
      directionMarker: r.directionMarker,
      annotation: r.annotation,
      provenance: r.provenance,
      review: r.review,
      sources: r.sources.length > 0 ? r.sources : [{ file, ...(r.elementId ? { anchor: r.elementId } : {}) }],
    });
    proposals.push({
      proposedId: r.id,
      file,
      elementId: r.elementId,
      name: r.name,
      nameSource: 'review',
      category: r.category,
      reviewStatus: r.review.status,
      reviewed: true,
      portCount: r.ports.length,
      notes: [],
    });
  }

  for (const item of symbolFiles) {
    if (reviewed.some((r) => joinRel(dataset.sourceRoot, r.file) === item.file)) continue;
    const ignoredReason = ignoredAssets.get(item.file);
    if (ignoredReason) {
      diagnostics.push({ code: 'symbol.ignored', severity: 'info', stage: 'B', message: `${item.file}: zanemareno pri pregledu – ${ignoredReason}`, source: { file: item.file } });
      continue;
    }
    const base = path.basename(item.file, '.svg');
    const title = item.svg?.title;
    const id = `${prefix}.${slugify(base) || 'simbol'}`;
    const legendEntry = legend.find((l) => l.file === item.file);
    const vb = item.svg?.viewBox;
    const notes = ['Značenje, kategorija i priključci nisu provjereni (prijedlog bez semantike).'];
    if (!vb) notes.push('SVG nema viewBox; pretpostavljena veličina 64×64.');
    if (item.svg?.parseError) notes.push(`Neispravan SVG: ${item.svg.parseError}`);
    proposals.push({
      proposedId: id,
      file: item.file,
      name: legendEntry?.name || title || base,
      nameSource: legendEntry ? 'legend' : title ? 'title' : 'filename',
      ...(legendEntry ? { nameRef: { file: legendEntry.source, line: legendEntry.line, excerpt: legendEntry.name } } : {}),
      category: UNCLASSIFIED_CATEGORY,
      reviewStatus: 'requires-review',
      reviewed: false,
      portCount: 0,
      notes,
    });
    diagnostics.push({
      code: 'symbol.unreviewed',
      severity: 'warning',
      stage: 'B',
      message: `${item.file}: simbol nije pregledan; predložen kao „${id}” bez semantičkog značenja.`,
      source: { file: item.file },
      subjectId: id,
    });
    if (!item.svg?.parseError) {
      symbols.push({
        id,
        name: legendEntry?.name || title || base,
        category: UNCLASSIFIED_CATEGORY,
        asset: { path: item.file },
        size: vb ? { width: vb[2] ?? 64, height: vb[3] ?? 64 } : { width: 64, height: 64 },
        provenance: 'derived',
        review: { status: 'requires-review', notes: 'Automatski prijedlog iz faze B.' },
        sources: [{ file: item.file }, ...(legendEntry ? [{ file: legendEntry.source, line: legendEntry.line, excerpt: legendEntry.name }] : [])],
      });
    }
  }
  for (const [file] of ignoredAssets) {
    if (!inventory.some((i) => i.file === file)) {
      diagnostics.push({ code: 'review.unknown-ignored-asset', severity: 'warning', stage: 'B', message: `Zanemarena datoteka ${file} ne postoji.` });
    }
  }

  if (!review) {
    if (symbolFiles.length > 0) {
      diagnostics.push({
        code: 'review.missing-catalog',
        severity: 'warning',
        stage: 'B',
        message: `Skup ${dataset.id}: ne postoji ${dataset.reviewDir}/catalog.review.json; katalog se ne generira dok simboli ne budu pregledani.`,
      });
    }
    return { proposals, catalog: null, diagnostics };
  }

  const categories = review.categories.some((c) => c.id === UNCLASSIFIED_CATEGORY)
    ? review.categories
    : [...review.categories, { id: UNCLASSIFIED_CATEGORY, name: 'Nerazvrstano (čeka pregled)' }];
  const withSourceRoot = <T extends { sources: { file: string }[] }>(x: T): T => ({
    ...x,
    sources: x.sources.map((s) => ({ ...s, file: s.file.startsWith('content/') ? s.file : joinRel(dataset.sourceRoot, s.file) })),
  });
  const catalog: CatalogInput = {
    schemaVersion: 1,
    id: review.catalogId,
    name: review.name,
    description: review.description,
    synthetic: review.synthetic,
    categories,
    portTypes: review.portTypes.map(withSourceRoot),
    connectionRules: review.connectionRules.map(withSourceRoot),
    symbols,
    equipmentTypes: review.equipmentTypes.map(withSourceRoot),
    roles: review.roles.map(withSourceRoot),
  };
  return { proposals, catalog, diagnostics };
}
