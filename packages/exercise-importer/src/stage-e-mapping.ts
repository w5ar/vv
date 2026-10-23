import type { DiagramAnalysis, Diagnostic, MappingEntry, ProcedureAnalysis } from '@fds/domain';
import type { MappingReview } from './review-files';

/**
 * Stage E — mapping and review. Links Markdown step candidates to authored
 * exercise steps. Unmapped candidates are reported (never silently turned
 * into steps); a template with skeleton entries is generated for reviewers.
 */

export interface MappingInput {
  readonly procedures: readonly ProcedureAnalysis[];
  readonly diagrams: readonly DiagramAnalysis[];
  /** candidateId -> [exerciseId, stepId][] gathered while compiling authoring files. */
  readonly usage: ReadonlyMap<string, { exerciseId: string; stepId: string }[]>;
  readonly review: MappingReview;
}

export interface MappingResult {
  readonly entries: MappingEntry[];
  readonly template: unknown;
  readonly diagnostics: Diagnostic[];
}

export function buildMapping(input: MappingInput): MappingResult {
  const diagnostics: Diagnostic[] = [];
  const entries: MappingEntry[] = [];
  const ignored = new Map(input.review.ignored.map((i) => [i.candidateId, i.reason]));
  const allCandidates = input.procedures.flatMap((p) => p.steps);
  const known = new Set(allCandidates.map((c) => c.id));

  for (const candidate of allCandidates) {
    const uses = input.usage.get(candidate.id) ?? [];
    if (uses.length > 0) {
      candidate.status = 'mapped';
      candidate.mappedTo = uses.map((u) => `${u.exerciseId}/${u.stepId}`);
      entries.push({ candidateId: candidate.id, exerciseId: uses[0]?.exerciseId, stepIds: uses.map((u) => u.stepId), status: 'mapped' });
    } else if (ignored.has(candidate.id)) {
      candidate.status = 'ignored';
      entries.push({ candidateId: candidate.id, stepIds: [], status: 'ignored', reason: ignored.get(candidate.id) });
    } else {
      entries.push({ candidateId: candidate.id, stepIds: [], status: 'unmapped' });
      diagnostics.push({
        code: 'mapping.unmapped-step',
        severity: 'warning',
        stage: 'E',
        message: `Kandidat koraka ${candidate.id} („${candidate.text.slice(0, 80)}”) nije povezan ni s jednim korakom vježbe.`,
        source: { file: candidate.file, line: candidate.line, anchor: candidate.id, excerpt: candidate.text },
      });
    }
  }
  for (const id of ignored.keys()) {
    if (!known.has(id)) {
      diagnostics.push({ code: 'mapping.unknown-ignored', severity: 'warning', stage: 'E', message: `Zanemareni kandidat ${id} ne postoji.` });
    }
  }
  for (const [id, uses] of input.usage) {
    if (!known.has(id)) {
      for (const u of uses) {
        diagnostics.push({
          code: 'mapping.unknown-candidate',
          severity: 'error',
          stage: 'E',
          message: `Korak ${u.exerciseId}/${u.stepId} upućuje na nepostojeći kandidat ${id}.`,
          subjectId: u.stepId,
        });
      }
    }
  }

  const unmapped = allCandidates.filter((c) => c.status === 'unmapped');
  const template = {
    $comment:
      'Predložak za ručnu obradu. Svaki unos je NEPROVJEREN prijedlog: completedWhen, dependsOn i script moraju se popuniti prema izvornom postupku.',
    steps: unmapped.map((c) => ({
      id: `korak-${c.number ?? c.line}`,
      source: c.id,
      title: c.text.replace(/\*\*/g, '').slice(0, 60),
      $roleMentions: c.roleMentions,
      $equipmentMentions: c.equipmentMentions,
      dependsOn: [],
      completedWhen: { $todo: 'definirati uvjet završetka' },
      script: [],
    })),
  };
  return { entries, template, diagnostics };
}
