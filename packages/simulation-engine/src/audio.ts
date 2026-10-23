import { textHash, type AudioClip, type AudioCue, type AudioPlan, type Exercise, type Id, type Voice } from '@fds/domain';

/**
 * Audio plan of an exercise: which clips to synthesize and in which order each step plays them.
 *
 * - Every action with `speech` that a step's demonstration script begins gets an order clip
 *   (`<action-id>`, voice `zapovijed`), played when the action begins.
 * - The step's verbatim text is the description (`<step-id>`, voice `opis`). Where the text quotes
 *   an order that the step performs, the description is split there and the order voice speaks
 *   it instead of the narrator (`<step-id>`, `<step-id>-2`, `<step-id>-3`, …).
 * - Steps that share one source paragraph (several steps of a paragraph that refers to another
 *   exercise) narrate it once, in the first of them; the others play only their orders.
 *
 * The plan is pure data derived from the exercise, so the import pipeline and the player always
 * agree on it.
 */

const SUBSCRIPTS: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

/** Markdown text → plain text for speech: no emphasis markers, links reduced to their text, plain digits. */
export function speakable(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*+/g, '')
    .replace(/[₀-₉]/g, (c) => SUBSCRIPTS[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Characters ignored when matching a spoken order inside a step text (emphasis and quotation marks). */
const IGNORED = new Set(['*', '„', '”', '"', '“']);

/** Finds `speech` in `text` from `from` on, ignoring emphasis and quotes; returns the original range incl. surrounding marks. */
function findQuote(text: string, speech: string, from: number): { start: number; end: number } | null {
  const chars: string[] = [];
  const index: number[] = [];
  for (let i = from; i < text.length; i++) {
    const c = text[i] as string;
    if (IGNORED.has(c)) continue;
    chars.push(c);
    index.push(i);
  }
  const needle = [...speech].filter((c) => !IGNORED.has(c)).join('').trim();
  if (!needle) return null;
  const at = chars.join('').indexOf(needle);
  if (at < 0) return null;
  let start = index[at] as number;
  let end = (index[at + needle.length - 1] as number) + 1;
  while (start > from && IGNORED.has(text[start - 1] as string)) start--;
  while (end < text.length && IGNORED.has(text[end] as string)) end++;
  return { start, end };
}

/** A description segment worth speaking (not just punctuation left over around a quote). */
function segmentText(raw: string): string | null {
  const t = speakable(raw).replace(/^[\s.,;:!?–-]+/, '').trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : null;
}

export interface AudioPlanIssue {
  readonly code: string;
  readonly message: string;
  readonly stepId?: Id | undefined;
  readonly actionId?: Id | undefined;
}

export function buildAudioPlan(exercise: Exercise): { plan: AudioPlan; issues: AudioPlanIssue[] } {
  const issues: AudioPlanIssue[] = [];
  const actions = new Map(exercise.actions.map((a) => [a.id, a]));
  const clips = new Map<Id, AudioClip>();
  const addClip = (id: Id, voice: Voice, text: string) => {
    if (!clips.has(id)) clips.set(id, { id, voice, text, hash: textHash(`${voice}\n${text}`) });
  };
  const actionIds = new Set(exercise.actions.map((a) => a.id));
  const steps: Record<Id, AudioCue[]> = {};
  const narrated = new Set<string>();

  for (const step of exercise.steps) {
    // Orders the step performs, in script order.
    const orders: Id[] = [];
    for (const sc of step.script) {
      if (sc.command.type !== 'BeginAction') continue;
      const action = actions.get(sc.command.actionId);
      if (action?.speech && !orders.includes(action.id)) orders.push(action.id);
    }
    // Description, split where it quotes those orders.
    const text = step.text && !narrated.has(step.text) ? step.text : '';
    if (text) narrated.add(text);
    const base = actionIds.has(step.id) ? `${step.id}.opis` : step.id;
    const cues: AudioCue[] = [];
    let segments = 0;
    const narrate = (raw: string) => {
      const t = segmentText(raw);
      if (!t) return;
      segments++;
      const id = segments === 1 ? base : `${base}-${segments}`;
      addClip(id, 'opis', t);
      cues.push({ clipId: id });
    };
    // Orders the text does not quote are spoken after the description that precedes the next
    // quoted order (or after the whole description).
    let pointer = 0;
    let deferred: Id[] = [];
    const flush = () => {
      for (const id of deferred) cues.push({ clipId: id, actionId: id });
      deferred = [];
    };
    for (const actionId of orders) {
      const speech = (actions.get(actionId)?.speech ?? '') as string;
      addClip(actionId, 'zapovijed', speakable(speech));
      const quote = text ? findQuote(text, speech, pointer) : null;
      if (quote) {
        narrate(text.slice(pointer, quote.start));
        pointer = quote.end;
        flush();
        cues.push({ clipId: actionId, actionId });
        continue;
      }
      if (text) {
        issues.push({
          code: 'audio.order-not-in-text',
          message: `Korak ${step.id}: zapovijed „${speakable(speech)}” (${actionId}) nije doslovno u tekstu koraka; izgovara se nakon pripadajućeg dijela opisa.`,
          stepId: step.id,
          actionId,
        });
      }
      deferred.push(actionId);
    }
    if (text) narrate(text.slice(pointer));
    flush();
    if (cues.length > 0) steps[step.id] = cues;
  }

  const plan: AudioPlan = {
    schemaVersion: 1,
    exerciseId: exercise.id,
    synthetic: exercise.synthetic,
    clips: [...clips.values()],
    steps,
  };
  return { plan, issues };
}
