import type { z } from 'zod';
import { CatalogSchema, type Catalog } from './catalog';
import { ExerciseSchema, type Exercise } from './exercise';
import type { Diagnostic } from './issues';

export type ParseResult<T> = { ok: true; value: T; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] };

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${String(seg)}` : String(seg);
  }
  return out || '(root)';
}

/** Validates unknown JSON against a schema and converts Zod issues into diagnostics. */
export function parseWithDiagnostics<S extends z.ZodType>(
  schema: S,
  input: unknown,
  code: string,
): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data, diagnostics: [] };
  return {
    ok: false,
    diagnostics: result.error.issues.map((issue) => ({
      code,
      severity: 'error' as const,
      stage: 'schema',
      path: formatPath(issue.path),
      message: `${formatPath(issue.path)}: ${issue.message}`,
    })),
  };
}

export function parseExercise(input: unknown): ParseResult<Exercise> {
  return parseWithDiagnostics(ExerciseSchema, input, 'schema.exercise');
}

export function parseCatalog(input: unknown): ParseResult<Catalog> {
  return parseWithDiagnostics(CatalogSchema, input, 'schema.catalog');
}

/** Parses JSON text without throwing. */
export function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
