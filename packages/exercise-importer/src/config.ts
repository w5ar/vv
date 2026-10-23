import { z } from 'zod';

export const DatasetLayoutSchema = z.strictObject({
  /** Dataset-relative directories holding individual symbol SVGs. */
  symbols: z.array(z.string()).default(['symbols']),
  /** Dataset-relative directories holding exercise diagrams (stage sketches). */
  diagrams: z.array(z.string()).default(['diagrams']),
  /**
   * Generated copies of diagrams (e.g. with embedded symbols for Markdown viewers):
   * files in `dir` mirror files of the same name in `of`. Copies are verified, not analysed twice.
   */
  renderCopies: z.array(z.strictObject({ dir: z.string(), of: z.string() })).default([]),
});
export type DatasetLayout = z.infer<typeof DatasetLayoutSchema>;

export const DatasetConfigSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  synthetic: z.boolean(),
  /** Repository-relative directory with `symbols/`, `diagrams/`, `procedures/`. */
  sourceRoot: z.string().min(1),
  /** Human-maintained review files (catalog.review.json, mapping.review.json). */
  reviewDir: z.string().min(1),
  /** Exercise authoring files (*.exercise.json). */
  authoringDir: z.string().min(1),
  layout: DatasetLayoutSchema.default(DatasetLayoutSchema.parse({})),
});
export type DatasetConfig = z.infer<typeof DatasetConfigSchema>;

export const PipelineConfigSchema = z.strictObject({
  datasets: z.array(DatasetConfigSchema),
  normalizedDir: z.string().min(1),
  exercisesDir: z.string().min(1),
});
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

export const CONFIG_FILE = 'content/pipeline.config.json';
