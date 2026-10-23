import { z } from 'zod';
import { IdSchema, SourceRefSchema } from './common';

/**
 * Issues are produced by the simulation engine when validating commands.
 * Diagnostics are produced by the import pipeline and exercise compiler.
 * Both carry a stable English `code` and a Croatian, user-facing `message`.
 */

export const IssueSeveritySchema = z.enum(['error', 'warning', 'info']);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const IssueSchema = z.strictObject({
  code: z.string(),
  severity: IssueSeveritySchema,
  message: z.string(),
  objectIds: z.array(IdSchema).optional(),
  portKeys: z.array(z.string()).optional(),
  stepId: IdSchema.optional(),
  ruleId: IdSchema.optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const DiagnosticSchema = z.strictObject({
  code: z.string(),
  severity: IssueSeveritySchema,
  message: z.string(),
  /** Pipeline stage that produced the diagnostic (A–F) or `schema`/`runtime`. */
  stage: z.string().optional(),
  /** JSON path inside the checked document, e.g. `steps[2].completedWhen`. */
  path: z.string().optional(),
  source: SourceRefSchema.optional(),
  subjectId: z.string().optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export function hasErrors(items: readonly { severity: IssueSeverity }[]): boolean {
  return items.some((i) => i.severity === 'error');
}
