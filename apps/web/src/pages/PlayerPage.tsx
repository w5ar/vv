import { useEffect, useMemo, useRef } from 'react';
import { SceneCanvas, SymbolRegistryProvider, type ObjectHighlight } from '@fds/reactflow-renderer';
import { compileTimeline, frameAt, type ExerciseContext, type Timeline } from '@fds/simulation-engine';
import { ErrorView, IssueList, Loading, Panel, SyntheticBanner } from '../components/common';
import { ProgressBar, StepList } from '../components/procedure';
import { describeEvent } from '../labels';
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

export function PlayerPage({ exerciseId }: { exerciseId: string }) {
  const bundle = useExerciseBundle(exerciseId);
  const ready = bundle.status === 'ready' ? bundle : null;
  const timeline = useMemo(() => (ready ? compileTimeline(ready.ctx) : null), [ready]);
  const pb = usePlayback(timeline);
  const frame = useMemo(() => (ready && timeline ? frameAt(ready.ctx, timeline, pb.time) : null), [ready, timeline, pb.time]);

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
