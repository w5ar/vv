import type { AudioManifest } from './audio';
import type { Catalog } from './catalog';
import type { Exercise, ExerciseSummary } from './exercise';
import type { ImportReport } from './import-report';
import type { ExerciseResult } from './results';

/**
 * Persistence boundaries. The browser MVP implements these with bundled JSON
 * files and localStorage. A future ASP.NET Core + SQL Server backend can
 * implement the same interfaces over HTTP without touching the engines,
 * which only ever receive already-validated domain objects.
 */

export interface ContentRepository {
  listExercises(): Promise<ExerciseSummary[]>;
  getExercise(id: string): Promise<Exercise>;
  getCatalog(id: string): Promise<Catalog>;
  /** Raw SVG text of a catalog asset; sanitized by the SVG registry before rendering. */
  getSvgAsset(path: string): Promise<string>;
  getImportReport(): Promise<ImportReport | null>;
  /** Generated demonstration sound of an exercise (`null` if none was generated). */
  getAudioManifest(exerciseId: string): Promise<AudioManifest | null>;
  /** URL of a generated clip file listed in the manifest (`null` if missing). */
  getAudioUrl(exerciseId: string, file: string): string | null;
}

/** Editor drafts (authoring work in progress). */
export interface DraftRepository {
  loadDraft(exerciseId: string): Promise<Exercise | null>;
  saveDraft(exercise: Exercise): Promise<void>;
  deleteDraft(exerciseId: string): Promise<void>;
  listDraftIds(): Promise<string[]>;
}

/** Results of training/assessment runs. */
export interface ResultRepository {
  saveResult(result: ExerciseResult): Promise<void>;
  listResults(exerciseId: string): Promise<ExerciseResult[]>;
}
