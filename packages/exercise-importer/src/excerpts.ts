import type { Diagnostic, SourceRef } from '@fds/domain';

/**
 * Traceability guard: every `excerpt` in a source reference must occur verbatim (ignoring
 * whitespace differences) in the referenced file, and a given `line` must lie inside the file.
 */

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

export function collectSourceRefs(value: unknown, out: SourceRef[] = []): SourceRef[] {
  if (Array.isArray(value)) for (const v of value) collectSourceRefs(v, out);
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.file === 'string' && (typeof o.excerpt === 'string' || typeof o.line === 'number')) out.push(o as unknown as SourceRef);
    for (const v of Object.values(o)) if (v && typeof v === 'object') collectSourceRefs(v, out);
  }
  return out;
}

export function verifyExcerpts(refs: readonly SourceRef[], texts: ReadonlyMap<string, string>, origin: string, stage: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.file}|${r.line ?? ''}|${r.excerpt ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = texts.get(r.file);
    if (text === undefined) continue; // non-text or external file: existence is checked elsewhere
    const lines = text.split(/\r?\n/);
    if (r.line !== undefined && r.line > lines.length) {
      out.push({ code: 'trace.line-out-of-range', severity: 'error', stage, message: `${origin}: ${r.file} nema redak ${r.line}.`, source: r });
      continue;
    }
    if (r.excerpt === undefined) continue;
    const needle = normalize(r.excerpt);
    const scope = r.line !== undefined ? normalize(lines.slice(r.line - 1, (r.lineEnd ?? r.line) + 0).join(' ')) : normalize(text);
    if (!scope.includes(needle) && !normalize(text).includes(needle)) {
      out.push({ code: 'trace.excerpt-not-found', severity: 'error', stage, message: `${origin}: citat „${r.excerpt.slice(0, 80)}” ne postoji u ${r.file}.`, source: r });
    } else if (r.line !== undefined && !scope.includes(needle)) {
      out.push({ code: 'trace.excerpt-wrong-line', severity: 'warning', stage, message: `${origin}: citat „${r.excerpt.slice(0, 60)}” nije u retku ${r.line} datoteke ${r.file}.`, source: r });
    }
  }
  return out;
}
