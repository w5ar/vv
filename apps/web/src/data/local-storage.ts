import {
  ExerciseResultSchema,
  parseExercise,
  type DraftRepository,
  type Exercise,
  type ExerciseResult,
  type ResultRepository,
} from '@fds/domain';
import { z } from 'zod';

/** Browser-side persistence for editor drafts and run results (localStorage). */

const DRAFT_PREFIX = 'fds:draft:';
const RESULTS_PREFIX = 'fds:results:';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export class LocalDraftRepository implements DraftRepository {
  async loadDraft(exerciseId: string): Promise<Exercise | null> {
    const raw = storage()?.getItem(DRAFT_PREFIX + exerciseId);
    if (!raw) return null;
    try {
      const r = parseExercise(JSON.parse(raw));
      return r.ok ? r.value : null;
    } catch {
      return null;
    }
  }

  async saveDraft(exercise: Exercise): Promise<void> {
    storage()?.setItem(DRAFT_PREFIX + exercise.id, JSON.stringify(exercise));
  }

  async deleteDraft(exerciseId: string): Promise<void> {
    storage()?.removeItem(DRAFT_PREFIX + exerciseId);
  }

  async listDraftIds(): Promise<string[]> {
    const s = storage();
    if (!s) return [];
    const ids: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) ids.push(k.slice(DRAFT_PREFIX.length));
    }
    return ids.sort();
  }
}

export class LocalResultRepository implements ResultRepository {
  async saveResult(result: ExerciseResult): Promise<void> {
    const s = storage();
    if (!s) return;
    const list = await this.listResults(result.exerciseId);
    s.setItem(RESULTS_PREFIX + result.exerciseId, JSON.stringify([...list, result].slice(-20)));
  }

  async listResults(exerciseId: string): Promise<ExerciseResult[]> {
    const raw = storage()?.getItem(RESULTS_PREFIX + exerciseId);
    if (!raw) return [];
    try {
      const r = z.array(ExerciseResultSchema).safeParse(JSON.parse(raw));
      return r.success ? r.data : [];
    } catch {
      return [];
    }
  }
}
