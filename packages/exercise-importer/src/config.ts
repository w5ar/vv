import { z } from 'zod';

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
});
export type DatasetConfig = z.infer<typeof DatasetConfigSchema>;

export const PipelineConfigSchema = z.strictObject({
  datasets: z.array(DatasetConfigSchema),
  normalizedDir: z.string().min(1),
  exercisesDir: z.string().min(1),
});
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

export const CONFIG_FILE = 'content/pipeline.config.json';
