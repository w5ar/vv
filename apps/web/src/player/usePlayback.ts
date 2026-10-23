import { useCallback, useEffect, useRef, useState } from 'react';
import { nextBoundary, previousBoundary, type Timeline } from '@fds/simulation-engine';

/**
 * Visual playback clock. Maps wall-clock time (requestAnimationFrame) to
 * logical timeline time, scaled by `speed`. Only the logical time is kept;
 * all displayed state is derived from it, so pause/seek/step are always
 * consistent.
 */
export function usePlayback(timeline: Timeline | null) {
  const duration = timeline?.durationMs ?? 0;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeRef = useRef(0);
  timeRef.current = time;

  // A recompiled timeline (e.g. with sound) may be shorter than the current position.
  useEffect(() => {
    if (timeRef.current > duration) {
      timeRef.current = duration;
      setTime(duration);
    }
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // The first frame's timestamp can precede the moment playback started.
      const dt = Math.max(0, now - last);
      last = now;
      const next = Math.min(duration, timeRef.current + dt * speed);
      timeRef.current = next;
      setTime(next);
      if (next >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(duration, t));
      timeRef.current = clamped;
      setTime(clamped);
    },
    [duration],
  );

  const play = useCallback(() => {
    if (timeRef.current >= duration) seek(0);
    setPlaying(true);
  }, [duration, seek]);

  return {
    time,
    duration,
    playing,
    speed,
    setSpeed,
    play,
    pause: useCallback(() => setPlaying(false), []),
    toggle: useCallback(() => (playing ? setPlaying(false) : play()), [playing, play]),
    restart: useCallback(() => {
      setPlaying(false);
      seek(0);
    }, [seek]),
    seek,
    stepForward: useCallback(() => {
      setPlaying(false);
      if (timeline) seek(nextBoundary(timeline, timeRef.current));
    }, [timeline, seek]),
    stepBackward: useCallback(() => {
      setPlaying(false);
      if (timeline) seek(previousBoundary(timeline, timeRef.current));
    }, [timeline, seek]),
  };
}

export function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
