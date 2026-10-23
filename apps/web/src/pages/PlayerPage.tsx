import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioMode } from '@fds/domain';
import { SceneCanvas, SymbolRegistryProvider, type ObjectHighlight } from '@fds/reactflow-renderer';
import { compileTimeline, frameAt, objectName, type ExerciseContext, type Timeline } from '@fds/simulation-engine';
import { ErrorView, IssueList, Loading, Panel, SyntheticBanner } from '../components/common';
import { ProgressBar, StepList } from '../components/procedure';
import { describeEvent } from '../labels';
import { useCuePlayer, useDemoAudio, type DemoAudio } from '../player/useDemoAudio';
import { formatTime, usePlayback } from '../player/usePlayback';
import { href } from '../router';
import { highlightMap, roleLabelFor, stepFocus } from '../scene-helpers';
import { useExerciseBundle } from '../store/content';

function TimelineBar({ ctx, timeline, time, onSeek }: { ctx: ExerciseContext; timeline: Timeline; time: number; onSeek: (t: number) => void }) {
  const d = Math.max(1, timeline.durationMs);
  return (
    <div className="timeline">
      <div className="timeline__stages">
        {ctx.exercise.stages.map((s, i) => {
          const w = timeline.stageWindows[s.id];
          if (!w) return null;
          return (
            <button
              key={s.id}
              className={`timeline__stage timeline__stage--${i % 4}`}
              style={{ left: `${(w.startMs / d) * 100}%`, width: `${((w.endMs - w.startMs) / d) * 100}%` }}
              onClick={() => onSeek(w.startMs)}
              title={`${s.name} (${formatTime(w.startMs)} – ${formatTime(w.endMs)})`}
            >
              {s.name}
            </button>
          );
        })}
      </div>
      <input
        type="range"
        className="timeline__range"
        min={0}
        max={timeline.durationMs}
        step={1}
        value={Math.round(time)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Vremenska crta"
        data-testid="timeline-range"
      />
      <div className="timeline__marks" aria-hidden>
        {timeline.boundaries.map((b) => (
          <span key={b} style={{ left: `${(b / d) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function AudioStatus({ audio }: { audio: DemoAudio | null }) {
  if (!audio) return null;
  if (!audio.manifestFound) {
    return (
      <p className="muted small" data-testid="audio-status">
        Zvučni zapisi nisu generirani (<code>python3 tools/generate_audio.py</code>).
      </p>
    );
  }
  return (
    <p className="muted small" data-testid="audio-status">
      Zvučni zapisi: zapovijedi {audio.orders.ready}/{audio.orders.total}, opis {audio.descriptions.ready}/{audio.descriptions.total}
      {audio.stale > 0 ? ` · ${audio.stale} zastarjelih (tekst se promijenio, ponovno generirati)` : ''}
    </p>
  );
}

const EMPTY_URLS: ReadonlyMap<string, string> = new Map();

export function PlayerPage({ exerciseId }: { exerciseId: string }) {
  const bundle = useExerciseBundle(exerciseId);
  const ready = bundle.status === 'ready' ? bundle : null;
  const audio = useDemoAudio(ready?.exercise ?? null);
  const [mode, setMode] = useState<AudioMode>('none');
  const timeline = useMemo(() => {
    if (!ready) return null;
    const sound = mode !== 'none' && audio && audio.durations.size > 0 ? { mode, plan: audio.plan, durations: audio.durations } : undefined;
    return compileTimeline(ready.ctx, { audio: sound });
  }, [ready, mode, audio]);
  const pb = usePlayback(timeline);
  const frame = useMemo(() => (ready && timeline ? frameAt(ready.ctx, timeline, pb.time) : null), [ready, timeline, pb.time]);
  useCuePlayer(timeline, pb.time, pb.playing, pb.speed, audio?.urls ?? EMPTY_URLS);

  // Changing the sound mode recompiles the timeline; continue from the same step.
  const resumeStep = useRef<string | null>(null);
  const changeMode = (next: AudioMode) => {
    if (ready && frame) {
      resumeStep.current = frame.activeStepIds[0] ?? ready.ctx.stepOrder.find((id) => frame.state.steps[id]?.status !== 'completed') ?? null;
    }
    setMode(next);
  };
  const seekRef = useRef(pb.seek);
  seekRef.current = pb.seek;
  useEffect(() => {
    const stepId = resumeStep.current;
    resumeStep.current = null;
    const w = stepId ? timeline?.stepWindows[stepId] : undefined;
    if (w) seekRef.current(w.startMs);
  }, [timeline]);

  const pbRef = useRef(pb);
  pbRef.current = pb;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        pbRef.current.toggle();
      } else if (e.key === 'ArrowRight') pbRef.current.stepForward();
      else if (e.key === 'ArrowLeft') pbRef.current.stepBackward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const view = useMemo(() => {
    if (!ready || !frame) return null;
    const focus = stepFocus(ready.ctx, frame.activeStepIds);
    const highlights = highlightMap([
      ...[...focus.objects].map((id): [string, ObjectHighlight] => [id, 'active']),
      ...frame.actingIds.map((id): [string, ObjectHighlight] => [id, 'acting']),
    ]);
    return {
      catalog: ready.ctx.catalog,
      state: frame.state,
      zones: ready.exercise.initialScene.zones,
      annotations: ready.exercise.initialScene.annotations,
      overrides: frame.overrides,
      pendingConnections: frame.pendingConnections,
      fadingConnections: frame.fadingConnections,
      highlights,
      highlightedZoneIds: focus.zones,
      roleLabel: roleLabelFor(ready.ctx),
      connectable: false,
    };
  }, [ready, frame]);

  if (bundle.status === 'loading') return <Loading />;
  if (bundle.status === 'error') return <ErrorView message={bundle.message} diagnostics={bundle.diagnostics} />;
  if (!ready || !timeline || !frame || !view) return <Loading />;

  const { ctx, exercise } = ready;
  const recent = timeline.events
    .slice(0, frame.appliedCount)
    .flatMap((evs, i) => evs.map((e, j) => ({ key: `${i}-${j}`, text: describeEvent(ctx, e, frame.state) })))
    .filter((x) => x.text)
    .slice(-10)
    .reverse();
  const captions = frame.captions.length > 0 ? frame.captions : frame.activeStepIds.map((id) => ctx.steps.get(id)?.title ?? id);
  const cue = frame.cue;
  const speaker = (() => {
    if (!cue?.actionId) return null;
    const begin = timeline.entries.find((e) => e.command.type === 'BeginAction' && e.command.actionId === cue.actionId)?.command;
    const actorId = begin?.type === 'BeginAction' ? begin.actorIds[0] : undefined;
    return actorId ? objectName(ctx, frame.state.objects[actorId], actorId) : null;
  })();

  return (
    <SymbolRegistryProvider registry={ready.registry}>
      <div className="workspace">
        <div className="workspace__head">
          <div>
            <h1>Demonstracija: {exercise.title}</h1>
            {exercise.synthetic ? <SyntheticBanner /> : null}
          </div>
          <div className="workspace__links">
            <a className="btn" href={href({ name: 'training', exerciseId, mode: 'training' })}>
              Vježbanje
            </a>
            <a className="btn btn--ghost" href="#/">
              ← Knjižnica
            </a>
          </div>
        </div>
        {timeline.problems.length > 0 ? (
          <div className="banner banner--error">
            Demonstracijska skripta sadrži odbijene naredbe:
            <IssueList items={timeline.problems.flatMap((p) => p.issues)} />
          </div>
        ) : null}
        <div className="workspace__body">
          <div className="canvas-wrap" data-testid="scene">
            <SceneCanvas view={view} fitBounds={exercise.initialScene.viewport} />
            <div className="caption-overlay" aria-live="polite" data-testid="captions">
              {captions.map((c, i) => (
                <div key={i}>{c}</div>
              ))}
            </div>
            {cue?.voice === 'zapovijed' ? (
              <div className="subtitle" data-testid="subtitle">
                {speaker ? <span className="subtitle__speaker">{speaker}:</span> : null} „{cue.text}”
              </div>
            ) : null}
          </div>
          <aside className="sidebar">
            <Panel title="Reprodukcija">
              <div className="player-controls" role="toolbar" aria-label="Upravljanje reprodukcijom">
                <button className="btn" onClick={pb.restart} title="Ispočetka" aria-label="Ispočetka">
                  ⏮
                </button>
                <button className="btn" onClick={pb.stepBackward} title="Korak natrag (←)" aria-label="Korak natrag">
                  ⏪
                </button>
                <button className="btn btn--primary" onClick={pb.toggle} data-testid="play-toggle" aria-label={pb.playing ? 'Pauza' : 'Pokreni'}>
                  {pb.playing ? '⏸ Pauza' : '▶ Pokreni'}
                </button>
                <button className="btn" onClick={pb.stepForward} title="Korak naprijed (→)" aria-label="Korak naprijed" data-testid="step-forward">
                  ⏩
                </button>
                <label className="speed">
                  Zvuk{' '}
                  <select value={mode} onChange={(e) => changeMode(e.target.value as AudioMode)} aria-label="Zvuk" data-testid="audio-mode">
                    <option value="none">Bez zvuka</option>
                    <option value="zapovijedi" disabled={!audio || audio.orders.ready === 0}>
                      Zapovijedi
                    </option>
                    <option value="zapovijedi-opis" disabled={!audio || audio.descriptions.ready === 0}>
                      Zapovijedi i opis
                    </option>
                  </select>
                </label>
                <label className="speed">
                  Brzina{' '}
                  <select value={pb.speed} onChange={(e) => pb.setSpeed(Number(e.target.value))} aria-label="Brzina reprodukcije">
                    {[0.25, 0.5, 1, 2, 4, 8].map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="player-time" data-testid="player-time">
                {formatTime(pb.time)} / {formatTime(pb.duration)}
              </div>
              <AudioStatus audio={audio} />
              {cue?.voice === 'opis' ? (
                <p className="muted small" data-testid="narration">
                  🔊 Opis: {ctx.steps.get(cue.stepId)?.title ?? cue.stepId}
                </p>
              ) : null}
              <TimelineBar ctx={ctx} timeline={timeline} time={pb.time} onSeek={pb.seek} />
              <ProgressBar ctx={ctx} state={frame.state} />
              {frame.state.completed ? (
                <div className="banner banner--ok" data-testid="demo-complete">
                  Vježba je završena.
                </div>
              ) : null}
            </Panel>
            <Panel title="Koraci postupka">
              <StepList
                ctx={ctx}
                state={frame.state}
                activeStepIds={frame.activeStepIds}
                onStepClick={(id) => {
                  const w = timeline.stepWindows[id];
                  if (w) pb.seek(w.startMs);
                }}
              />
            </Panel>
            <Panel title="Događaji">
              {recent.length === 0 ? (
                <p className="muted">Još nema događaja.</p>
              ) : (
                <ul className="event-log">
                  {recent.map((r) => (
                    <li key={r.key} className="event">
                      {r.text}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </SymbolRegistryProvider>
  );
}
