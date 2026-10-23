import { z } from 'zod';
import { CommandSchema } from './commands';
import { IdSchema } from './common';
import { IssueSchema } from './issues';

/** Outcome of an interactive or assessment run. Persistable. */
export const CriterionResultSchema = z.strictObject({
  id: IdSchema,
  label: z.string(),
  passed: z.boolean(),
  actual: z.number(),
  limit: z.number().optional(),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const ExerciseResultSchema = z.strictObject({
  exerciseId: IdSchema,
  mode: z.enum(['training', 'assessment']),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  /** Logical duration between the first and last attempt (ms). */
  durationMs: z.number().nonnegative().optional(),
  completed: z.boolean(),
  attempts: z.number().int().nonnegative(),
  acceptedCommands: z.number().int().nonnegative(),
  completedSteps: z.array(z.strictObject({ stepId: IdSchema, seq: z.number().int(), outOfOrder: z.boolean() })),
  missingSteps: z.array(IdSchema),
  orderDeviations: z.array(z.strictObject({ stepId: IdSchema, missingStepIds: z.array(IdSchema), attempt: z.number().int() })),
  rejectedCommands: z.array(z.strictObject({ attempt: z.number().int(), command: CommandSchema, issues: z.array(IssueSchema) })),
  warnings: z.array(z.strictObject({ attempt: z.number().int(), issue: IssueSchema })),
  /** Exercise-specific criteria; empty when the exercise defines none. */
  criteria: z.array(CriterionResultSchema),
  /** `null` when the exercise defines no criteria (report-only). */
  passed: z.boolean().nullable(),
});
export type ExerciseResult = z.infer<typeof ExerciseResultSchema>;
