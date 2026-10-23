import { z } from 'zod';
import { IdSchema } from './common';

/**
 * Sound for demonstrations. The *audio plan* (derived from an exercise by the simulation engine
 * and written by the import pipeline) lists the clips to synthesize; the *audio manifest* is
 * written by the speech generator (`tools/generate_audio.py`) next to the clips and records
 * their durations. Both live in `content/exercises/<exercise-id>/`.
 */

/** `opis`: description of a step (narrator); `zapovijed`: spoken order or report. */
export const VoiceSchema = z.enum(['opis', 'zapovijed']);
export type Voice = z.infer<typeof VoiceSchema>;

/** What the demonstration plays: nothing, orders only, or orders with step descriptions. */
export type AudioMode = 'none' | 'zapovijedi' | 'zapovijedi-opis';

export const AudioClipSchema = z.strictObject({
  /** File name without extension: `<id>.webm`. Step id for descriptions, action id for orders. */
  id: IdSchema,
  voice: VoiceSchema,
  /** Text to speak (markup removed). */
  text: z.string().min(1),
  /** Hash of voice + text; a generated clip is current only while the hashes match. */
  hash: z.string().min(1),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

/** One cue of a step, played in order. Cues with `actionId` start together with that action. */
export const AudioCueSchema = z.strictObject({
  clipId: IdSchema,
  actionId: IdSchema.optional(),
});
export type AudioCue = z.infer<typeof AudioCueSchema>;

export const AudioPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  exerciseId: IdSchema,
  synthetic: z.boolean(),
  clips: z.array(AudioClipSchema),
  /** Cues per step id, in playing order. */
  steps: z.record(z.string(), z.array(AudioCueSchema)),
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;

export const AudioManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  exerciseId: IdSchema,
  clips: z.record(
    z.string(),
    z.strictObject({
      file: z.string().min(1),
      durationMs: z.number().int().positive(),
      voice: VoiceSchema,
      hash: z.string().min(1),
      model: z.string().optional(),
      voiceName: z.string().optional(),
    }),
  ),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

/** Deterministic 53-bit string hash (cyrb53), hex. Used only to detect changed clip texts. */
export function textHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
