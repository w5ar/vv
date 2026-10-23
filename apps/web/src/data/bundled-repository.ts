import {
  AudioManifestSchema,
  ImportReportSchema,
  parseCatalog,
  parseExercise,
  summarizeExercise,
  type AudioManifest,
  type Catalog,
  type ContentRepository,
  type Diagnostic,
  type Exercise,
  type ExerciseSummary,
  type ImportReport,
} from '@fds/domain';
import { z } from 'zod';

/**
 * ContentRepository backed by the repository's JSON/SVG files, bundled by
 * Vite (lazy chunks). All JSON is validated with Zod at load time. A future
 * HTTP implementation (ASP.NET Core API) would implement the same interface.
 */

type Loader<T> = () => Promise<T>;

const jsonModules = import.meta.glob<unknown>('../../../../content/exercises/**/*.json', { import: 'default' });
const reportModules = import.meta.glob<unknown>('../../../../content/normalized/import-report.json', { import: 'default' });
const svgModules = import.meta.glob<string>(
  ['../../../../content/source/**/*.svg', '../../../../content/synthetic/source/**/*.svg'],
  { query: '?raw', import: 'default' },
);

// Generated speech clips (tools/generate_audio.py): only their URLs are bundled; files are emitted as assets.
const audioUrls = import.meta.glob<string>('../../../../content/exercises/*/*.webm', { query: '?url', import: 'default', eager: true });

function byRepoPath<T>(modules: Record<string, Loader<T>>): Map<string, Loader<T>> {
  const out = new Map<string, Loader<T>>();
  for (const [key, loader] of Object.entries(modules)) {
    const idx = key.indexOf('content/');
    out.set(idx >= 0 ? key.slice(idx) : key, loader);
  }
  return out;
}

const IndexSchema = z.object({
  catalogs: z.array(z.object({ id: z.string(), file: z.string(), synthetic: z.boolean() })),
  exercises: z.array(z.object({ id: z.string(), file: z.string(), catalogId: z.string(), synthetic: z.boolean() })),
});

export class ContentLoadError extends Error {
  constructor(
    message: string,
    readonly diagnostics: Diagnostic[] = [],
  ) {
    super(message);
  }
}

export class BundledContentRepository implements ContentRepository {
  private readonly json = byRepoPath(jsonModules);
  private readonly svg = byRepoPath(svgModules);
  private readonly report = byRepoPath(reportModules);
  private readonly audio = new Map(Object.entries(audioUrls).map(([k, url]) => [k.slice(k.indexOf('content/')), url]));
  private indexPromise: Promise<z.infer<typeof IndexSchema>> | null = null;
  private readonly exercises = new Map<string, Promise<Exercise>>();
  private readonly catalogs = new Map<string, Promise<Catalog>>();

  private loadJson(path: string): Promise<unknown> {
    const loader = this.json.get(path);
    if (!loader) return Promise.reject(new ContentLoadError(`Datoteka ${path} nije pronađena.`));
    return loader();
  }

  private index() {
    this.indexPromise ??= this.loadJson('content/exercises/index.json').then((raw) => {
      const r = IndexSchema.safeParse(raw);
      if (!r.success) throw new ContentLoadError('content/exercises/index.json nije ispravan. Pokrenite „pnpm import:all”.');
      return r.data;
    });
    return this.indexPromise;
  }

  async listExercises(): Promise<ExerciseSummary[]> {
    const idx = await this.index();
    const out: ExerciseSummary[] = [];
    for (const e of idx.exercises) {
      try {
        out.push(summarizeExercise(await this.getExercise(e.id)));
      } catch {
        out.push({
          id: e.id,
          title: `${e.id} (neispravna datoteka)`,
          synthetic: e.synthetic,
          catalogId: e.catalogId,
          reviewStatus: 'requires-review',
          provenance: 'derived',
          stageCount: 0,
          stepCount: 0,
          tags: [],
        });
      }
    }
    return out;
  }

  getExercise(id: string): Promise<Exercise> {
    let p = this.exercises.get(id);
    if (!p) {
      p = this.index().then(async (idx) => {
        const entry = idx.exercises.find((e) => e.id === id);
        if (!entry) throw new ContentLoadError(`Vježba „${id}” ne postoji.`);
        const r = parseExercise(await this.loadJson(entry.file));
        if (!r.ok) throw new ContentLoadError(`Vježba „${id}” nije ispravna prema shemi.`, r.diagnostics);
        return r.value;
      });
      this.exercises.set(id, p);
    }
    return p;
  }

  getCatalog(id: string): Promise<Catalog> {
    let p = this.catalogs.get(id);
    if (!p) {
      p = this.index().then(async (idx) => {
        const entry = idx.catalogs.find((c) => c.id === id);
        if (!entry) throw new ContentLoadError(`Katalog „${id}” ne postoji.`);
        const r = parseCatalog(await this.loadJson(entry.file));
        if (!r.ok) throw new ContentLoadError(`Katalog „${id}” nije ispravan prema shemi.`, r.diagnostics);
        return r.value;
      });
      this.catalogs.set(id, p);
    }
    return p;
  }

  async listCatalogIds(): Promise<string[]> {
    return (await this.index()).catalogs.map((c) => c.id);
  }

  getSvgAsset(path: string): Promise<string> {
    const loader = this.svg.get(path);
    if (!loader) return Promise.reject(new ContentLoadError(`SVG datoteka ${path} nije pronađena.`));
    return loader();
  }

  async getImportReport(): Promise<ImportReport | null> {
    const loader = this.report.get('content/normalized/import-report.json');
    if (!loader) return null;
    const r = ImportReportSchema.safeParse(await loader());
    if (!r.success) throw new ContentLoadError('Izvješće o uvozu nije ispravno. Pokrenite „pnpm import:all”.');
    return r.data;
  }

  async getAudioManifest(exerciseId: string): Promise<AudioManifest | null> {
    const loader = this.json.get(`content/exercises/${exerciseId}/zvuk.json`);
    if (!loader) return null;
    const r = AudioManifestSchema.safeParse(await loader());
    if (!r.success) throw new ContentLoadError(`content/exercises/${exerciseId}/zvuk.json nije ispravan. Ponovno pokrenite tools/generate_audio.py.`);
    return r.data;
  }

  getAudioUrl(exerciseId: string, file: string): string | null {
    return this.audio.get(`content/exercises/${exerciseId}/${file}`) ?? null;
  }

  /** Paths of all bundled SVG files (for the import review screen). */
  svgPaths(): string[] {
    return [...this.svg.keys()].sort();
  }
}
