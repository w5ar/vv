import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioManifest, AudioPlan, Exercise, Id } from '@fds/domain';
import { buildAudioPlan, cueAt, type Timeline } from '@fds/simulation-engine';
import { repository } from '../store/content';

export interface DemoAudio {
  readonly plan: AudioPlan;
  /** Durations of clips that were generated for the current texts. */
  readonly durations: ReadonlyMap<Id, number>;
  readonly urls: ReadonlyMap<Id, string>;
  readonly manifestFound: boolean;
  readonly orders: { readonly total: number; readonly ready: number };
  readonly descriptions: { readonly total: number; readonly ready: number };
  /** Clips generated for an older text (regenerate them). */
  readonly stale: number;
}

/** Loads the generated speech of an exercise and keeps only clips that match the current plan. */
export function useDemoAudio(exercise: Exercise | null): DemoAudio | null {
  const plan = useMemo(() => (exercise ? buildAudioPlan(exercise).plan : null), [exercise]);
  const [manifest, setManifest] = useState<AudioManifest | null | undefined>(undefined);
  useEffect(() => {
    if (!exercise) return;
    let alive = true;
    setManifest(undefined);
    repository.getAudioManifest(exercise.id).then(
      (m) => alive && setManifest(m),
      () => alive && setManifest(null),
    );
    return () => {
      alive = false;
    };
  }, [exercise]);

  return useMemo(() => {
    if (!exercise || !plan || manifest === undefined) return null;
    const durations = new Map<Id, number>();
    const urls = new Map<Id, string>();
    let stale = 0;
    for (const clip of plan.clips) {
      const entry = manifest?.clips[clip.id];
      if (!entry) continue;
      if (entry.hash !== clip.hash) {
        stale++;
        continue;
      }
      const url = repository.getAudioUrl(exercise.id, entry.file);
      if (!url) continue;
      durations.set(clip.id, entry.durationMs);
      urls.set(clip.id, url);
    }
    const count = (voice: 'opis' | 'zapovijed') => {
      const clips = plan.clips.filter((c) => c.voice === voice);
      return { total: clips.length, ready: clips.filter((c) => durations.has(c.id)).length };
    };
    return { plan, durations, urls, manifestFound: !!manifest, orders: count('zapovijed'), descriptions: count('opis'), stale };
  }, [exercise, plan, manifest]);
}

/**
 * Plays the audio cue at the current logical time. Audio follows the playhead: it starts at the
 * right offset after a seek, pauses with the player, follows the speed and is re-synchronised
 * when it drifts.
 */
export function useCuePlayer(timeline: Timeline | null, time: number, playing: boolean, speed: number, urls: ReadonlyMap<Id, string>) {
  const elements = useRef(new Map<Id, HTMLAudioElement>());
  const current = useRef<{ key: string; el: HTMLAudioElement } | null>(null);

  useEffect(() => {
    const els = elements.current;
    return () => {
      for (const el of els.values()) el.pause();
      els.clear();
      current.current = null;
    };
  }, [urls]);

  useEffect(() => {
    const element = (clipId: Id) => {
      let el = elements.current.get(clipId);
      if (!el) {
        const url = urls.get(clipId);
        if (!url) return null;
        el = new Audio(url);
        el.preload = 'auto';
        elements.current.set(clipId, el);
      }
      return el;
    };
    const cue = timeline && playing ? cueAt(timeline, time) : null;
    const key = cue ? `${cue.clipId}@${cue.startMs}` : null;
    if (current.current && current.current.key !== key) {
      current.current.el.pause();
      current.current = null;
    }
    if (!cue || !key) return;
    const el = element(cue.clipId);
    if (!el) return;
    const offset = Math.max(0, (time - cue.startMs) / 1000);
    el.playbackRate = speed;
    if (!current.current) {
      el.currentTime = offset;
      current.current = { key, el };
      void el.play().catch(() => undefined);
      // Warm up the next clip so it starts without delay.
      const next = timeline?.audio.find((c) => c.startMs >= cue.endMs);
      if (next) element(next.clipId);
    } else if (!el.paused && Math.abs(el.currentTime - offset) > 0.5 * Math.max(1, speed)) {
      el.currentTime = offset;
    }
  }, [timeline, time, playing, speed, urls]);
}
