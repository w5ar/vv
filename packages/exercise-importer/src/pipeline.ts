import {
  ImportReportSchema,
  parseCatalog,
  safeJsonParse,
  type Catalog,
  type CompiledExerciseInfo,
  type DatasetReport,
  type Diagnostic,
  type ImportReport,
} from '@fds/domain';
import { checkCatalog } from '@fds/simulation-engine';
import { prepareSymbolSvg } from '@fds/svg-registry';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE, PipelineConfigSchema, type DatasetConfig, type PipelineConfig } from './config';
import { collectSourceRefs, verifyExcerpts } from './excerpts';
import { renderDatasetReport } from './report';
import { CatalogReviewSchema, MappingReviewSchema, stripComments, type CatalogReview, type MappingReview } from './review-files';
import { discover } from './stage-a-discover';
import { normalizeSymbols } from './stage-b-symbols';
import { analyzeDiagrams } from './stage-c-diagrams';
import { analyzeProcedure, buildLexicon, extractLegend } from './stage-d-procedures';
import { buildMapping } from './stage-e-mapping';
import { compileExercise } from './stage-f-compile';
import { joinRel, listFiles, readText, sha256, stableJson } from './util';

export interface PipelineResult {
  readonly report: ImportReport;
  /** Repository-relative path -> file content to write. */
  readonly outputs: Map<string, string>;
}

async function readJson<T>(
  repoRoot: string,
  rel: string,
  parse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
  diagnostics: Diagnostic[],
  stage: string,
): Promise<T | null> {
  if (!existsSync(path.join(repoRoot, rel))) return null;
  const parsed = safeJsonParse(await readText(repoRoot, rel));
  if (!parsed.ok) {
    diagnostics.push({ code: 'json.invalid', severity: 'error', stage, message: `${rel}: neispravan JSON (${parsed.error}).`, source: { file: rel } });
    return null;
  }
  const r = parse(stripComments(parsed.value));
  if (!r.success) {
    for (const issue of r.error.issues) {
      diagnostics.push({
        code: 'schema.review',
        severity: 'error',
        stage,
        message: `${rel}: ${issue.path.map(String).join('.')}: ${issue.message}`,
        source: { file: rel },
        path: issue.path.map(String).join('.'),
      });
    }
    return null;
  }
  return r.data;
}

export async function loadConfig(repoRoot: string): Promise<PipelineConfig> {
  const parsed = safeJsonParse(await readText(repoRoot, CONFIG_FILE));
  if (!parsed.ok) throw new Error(`${CONFIG_FILE}: ${parsed.error}`);
  return PipelineConfigSchema.parse(parsed.value);
}

async function runDataset(
  repoRoot: string,
  config: PipelineConfig,
  dataset: DatasetConfig,
  outputs: Map<string, string>,
  index: { catalogs: { id: string; file: string; synthetic: boolean }[]; exercises: { id: string; file: string; catalogId: string; synthetic: boolean }[] },
): Promise<DatasetReport> {
  const diagnostics: Diagnostic[] = [];

  // A
  const discovered = await discover(repoRoot, dataset);
  diagnostics.push(...discovered.diagnostics);

  // Review files
  const review: CatalogReview | null = await readJson(
    repoRoot,
    `${dataset.reviewDir}/catalog.review.json`,
    (v) => CatalogReviewSchema.safeParse(v),
    diagnostics,
    'B',
  );
  const mappingReview: MappingReview =
    (await readJson(repoRoot, `${dataset.reviewDir}/mapping.review.json`, (v) => MappingReviewSchema.safeParse(v), diagnostics, 'E')) ?? {
      ignored: [],
      ignoredFiles: [],
    };

  // Legend tables in Markdown name the symbols (used by B as a traceable naming source).
  const legend = [...discovered.markdown].flatMap(([file, text]) => extractLegend(file, text).map((l) => ({ ...l, source: file })));

  // B
  const symbols = normalizeSymbols(dataset, discovered.inventory, review, legend);
  diagnostics.push(...symbols.diagnostics);
  let catalog: Catalog | null = null;
  if (symbols.catalog) {
    const parsed = parseCatalog(symbols.catalog);
    if (parsed.ok) {
      catalog = parsed.value;
      diagnostics.push(...checkCatalog(catalog).map((d) => ({ ...d, stage: 'B' })));
      for (const s of catalog.symbols) {
        const svg = discovered.svgs.get(s.asset.path);
        if (!svg) continue;
        const prepared = prepareSymbolSvg(s, svg.text);
        if (!prepared.ok) {
          diagnostics.push({ code: 'symbol.prepare-failed', severity: 'error', stage: 'B', message: prepared.error, subjectId: s.id, source: { file: s.asset.path } });
        } else {
          for (const w of prepared.symbol.warnings) diagnostics.push({ code: 'symbol.prepare-warning', severity: 'warning', stage: 'B', message: w, subjectId: s.id });
        }
      }
      diagnostics.push(...verifyExcerpts(collectSourceRefs(catalog), discovered.texts, `Katalog ${catalog.id}`, 'B'));
      const file = `${config.exercisesDir}/catalogs/${catalog.id}.json`;
      outputs.set(file, stableJson(catalog));
      index.catalogs.push({ id: catalog.id, file, synthetic: catalog.synthetic });
    } else {
      diagnostics.push(...parsed.diagnostics.map((d) => ({ ...d, stage: 'B' })));
    }
  }

  // C
  const diagrams = analyzeDiagrams(discovered.inventory, discovered.svgs, catalog);
  diagnostics.push(...diagrams.diagnostics);

  // D
  const lexicon = buildLexicon(catalog, review);
  const knownFiles = new Map(discovered.inventory.map((i) => [i.file, i]));
  const procedures = [...discovered.markdown].map(([file, text]) => {
    const r = analyzeProcedure(file, text, lexicon, knownFiles);
    diagnostics.push(...r.diagnostics);
    return r.analysis;
  });

  // F (compile) — gathers candidate usage for E
  const usage = new Map<string, { exerciseId: string; stepId: string }[]>();
  const compiled: CompiledExerciseInfo[] = [];
  const authoringFiles = (await listFiles(repoRoot, dataset.authoringDir)).filter((f) => f.endsWith('.exercise.json'));
  for (const file of authoringFiles) {
    const authoringText = await readText(repoRoot, file);
    const parsed = safeJsonParse(authoringText);
    if (!parsed.ok) {
      diagnostics.push({ code: 'json.invalid', severity: 'error', stage: 'F', message: `${file}: neispravan JSON (${parsed.error}).`, source: { file } });
      compiled.push({ exerciseId: file, authoringFile: file, outputFile: null, ok: false, errorCount: 1, warningCount: 0, stepCount: 0, tracedStepCount: 0, demoReachesCompletion: false });
      continue;
    }
    if (!catalog) {
      diagnostics.push({ code: 'authoring.no-catalog', severity: 'error', stage: 'F', message: `${file}: katalog skupa ${dataset.id} nije dostupan.`, source: { file } });
      continue;
    }
    const result = compileExercise(file, parsed.value, {
      dataset,
      catalog,
      diagrams: diagrams.diagrams,
      procedures,
      inventory: discovered.inventory,
      authoringSha256: sha256(authoringText),
    });
    diagnostics.push(...result.diagnostics);
    if (result.exercise) diagnostics.push(...verifyExcerpts(collectSourceRefs(result.exercise), discovered.texts, `Vježba ${result.exercise.id}`, 'F'));
    for (const u of result.usedCandidates) {
      usage.set(u.candidateId, [...(usage.get(u.candidateId) ?? []), { exerciseId: result.exerciseId, stepId: u.stepId }]);
    }
    const errorCount = result.diagnostics.filter((d) => d.severity === 'error').length;
    let outputFile: string | null = null;
    if (result.exercise) {
      outputFile = `${config.exercisesDir}/${result.exercise.id}.json`;
      outputs.set(outputFile, stableJson(result.exercise));
      index.exercises.push({ id: result.exercise.id, file: outputFile, catalogId: result.exercise.catalogId, synthetic: result.exercise.synthetic });
    }
    compiled.push({
      exerciseId: result.exerciseId,
      authoringFile: file,
      outputFile,
      ok: errorCount === 0 && result.exercise !== null,
      errorCount,
      warningCount: result.diagnostics.filter((d) => d.severity === 'warning').length,
      stepCount: result.exercise?.steps.length ?? 0,
      tracedStepCount: result.tracedStepCount,
      demoReachesCompletion: result.demoReachesCompletion,
    });
  }

  // E
  const mapping = buildMapping({
    procedures,
    diagrams: diagrams.diagrams,
    usage,
    review: { ...mappingReview, ignoredFiles: mappingReview.ignoredFiles.map((f) => ({ ...f, file: joinRel(dataset.sourceRoot, f.file) })) },
  });
  diagnostics.push(...mapping.diagnostics);
  if (authoringFiles.length === 0 && procedures.length > 0) {
    diagnostics.push({
      code: 'authoring.none',
      severity: 'warning',
      stage: 'F',
      message: `Skup ${dataset.id}: nema datoteka *.exercise.json u ${dataset.authoringDir}; nijedna vježba nije kompilirana.`,
    });
  }

  const report: DatasetReport = {
    id: dataset.id,
    name: dataset.name,
    synthetic: dataset.synthetic,
    sourceRoot: dataset.sourceRoot,
    inventory: discovered.inventory,
    symbols: symbols.proposals,
    diagrams: diagrams.diagrams,
    procedures,
    mapping: mapping.entries,
    compiled,
    diagnostics,
  };

  const dir = `${config.normalizedDir}/${dataset.id}`;
  outputs.set(`${dir}/inventory.json`, stableJson(report.inventory));
  outputs.set(`${dir}/symbols.proposed.json`, stableJson(report.symbols));
  outputs.set(`${dir}/diagrams.json`, stableJson(report.diagrams));
  outputs.set(`${dir}/procedures.json`, stableJson(report.procedures));
  outputs.set(`${dir}/mapping.json`, stableJson(report.mapping));
  outputs.set(`${dir}/mapping.template.json`, stableJson(mapping.template));
  outputs.set(`${dir}/diagnostics.json`, stableJson(report.diagnostics));
  outputs.set(`${dir}/REPORT.md`, renderDatasetReport(report));
  return report;
}

export async function runPipeline(repoRoot: string, config?: PipelineConfig): Promise<PipelineResult> {
  const cfg = config ?? (await loadConfig(repoRoot));
  const outputs = new Map<string, string>();
  const index = { catalogs: [] as { id: string; file: string; synthetic: boolean }[], exercises: [] as { id: string; file: string; catalogId: string; synthetic: boolean }[] };
  const datasets: DatasetReport[] = [];
  for (const ds of cfg.datasets) datasets.push(await runDataset(repoRoot, cfg, ds, outputs, index));
  const report = ImportReportSchema.parse({ schemaVersion: 1, datasets });
  outputs.set(`${cfg.normalizedDir}/import-report.json`, stableJson(report));
  outputs.set(`${cfg.exercisesDir}/index.json`, stableJson(index));
  return { report, outputs };
}
