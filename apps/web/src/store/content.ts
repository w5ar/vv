import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { Catalog, Diagnostic, Exercise, ExerciseSummary, ImportReport } from '@fds/domain';
import { createExerciseContext, type ExerciseContext } from '@fds/simulation-engine';
import { SymbolRegistry } from '@fds/svg-registry';
import { BundledContentRepository, ContentLoadError } from '../data/bundled-repository';
import { LocalDraftRepository, LocalResultRepository } from '../data/local-storage';

export const repository = new BundledContentRepository();
export const drafts = new LocalDraftRepository();
export const results = new LocalResultRepository();

const registries = new Map<string, SymbolRegistry>();

/** One shared, cached symbol registry per catalog; all symbols are preloaded. */
export async function registryFor(catalog: Catalog): Promise<SymbolRegistry> {
  let r = registries.get(catalog.id);
  if (!r) {
    r = new SymbolRegistry(catalog, (path) => repository.getSvgAsset(path));
    registries.set(catalog.id, r);
  }
  await r.loadAll();
  return r;
}

interface LibraryState {
  summaries: ExerciseSummary[] | null;
  catalogIds: string[];
  report: ImportReport | null;
  error: string | null;
  load: () => Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  summaries: null,
  catalogIds: [],
  report: null,
  error: null,
  load: async () => {
    if (get().summaries) return;
    try {
      const [summaries, catalogIds, report] = await Promise.all([
        repository.listExercises(),
        repository.listCatalogIds(),
        repository.getImportReport().catch(() => null),
      ]);
      set({ summaries, catalogIds, report, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), summaries: [] });
    }
  },
}));

export type ExerciseBundle =
  | { status: 'loading' }
  | { status: 'error'; message: string; diagnostics: Diagnostic[] }
  | {
      status: 'ready';
      exercise: Exercise;
      catalog: Catalog;
      registry: SymbolRegistry;
      ctx: ExerciseContext;
      /** True when the exercise came from a local editor draft. */
      fromDraft: boolean;
    };

/** Loads an exercise, its catalog and preloaded symbols. */
export function useExerciseBundle(exerciseId: string, options: { preferDraft?: boolean } = {}): ExerciseBundle {
  const [bundle, setBundle] = useState<ExerciseBundle>({ status: 'loading' });
  const preferDraft = options.preferDraft ?? false;
  useEffect(() => {
    let alive = true;
    setBundle({ status: 'loading' });
    (async () => {
      const draft = preferDraft ? await drafts.loadDraft(exerciseId) : null;
      const exercise = draft ?? (await repository.getExercise(exerciseId));
      const catalog = await repository.getCatalog(exercise.catalogId);
      const registry = await registryFor(catalog);
      const ctx = createExerciseContext(exercise, catalog);
      if (alive) setBundle({ status: 'ready', exercise, catalog, registry, ctx, fromDraft: draft !== null });
    })().catch((e: unknown) => {
      if (!alive) return;
      setBundle({
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
        diagnostics: e instanceof ContentLoadError ? e.diagnostics : [],
      });
    });
    return () => {
      alive = false;
    };
  }, [exerciseId, preferDraft]);
  return bundle;
}
