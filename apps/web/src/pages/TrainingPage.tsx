import { useCallback, useEffect, useMemo, useState } from 'react';
import { findSnap } from '@fds/connection-engine';
import type { Command, ExerciseResult, Id, PortRef, SimulationState } from '@fds/domain';
import { normalizeAngle, type Vec2 } from '@fds/geometry';
import { SceneCanvas, SymbolRegistryProvider, type ObjectHighlight, type SceneView } from '@fds/reactflow-renderer';
import { connectionWorld, evaluateAttempt, type ExerciseContext } from '@fds/simulation-engine';
import { Badge, ErrorView, IssueList, Loading, Panel, SyntheticBanner } from '../components/common';
import { EventLog, ProgressBar, StepList } from '../components/procedure';
import { describeEvent } from '../labels';
import { href } from '../router';
import { connectionTargetHighlights, highlightMap, roleLabelFor, stepFocus } from '../scene-helpers';
import { results, useExerciseBundle } from '../store/content';
import { ContextPanel, rotationStep } from '../training/ContextPanel';
import { ResultView } from '../training/ResultView';
import { useTrainingSession, type Feedback } from '../training/useTrainingSession';

function FeedbackView({ ctx, state, feedback }: { ctx: ExerciseContext; state: SimulationState; feedback: Feedback | null }) {
  if (!feedback) return <p className="muted">Izvedite radnju na sceni.</p>;
  const lines = feedback.events.map((e) => describeEvent(ctx, e, state)).filter((x): x is string => !!x);
  return (
    <div className={`feedback ${feedback.accepted ? 'feedback--ok' : 'feedback--error'}`} data-testid="feedback" data-accepted={feedback.accepted}>
      <strong>{feedback.accepted ? 'Radnja prihvaćena' : 'Radnja odbijena'}</strong>
      {lines.length > 0 ? (
        <ul>
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      <IssueList items={feedback.issues} />
    </div>
  );
}

function TrainingWorkspace({ ctx, mode, exerciseId }: { ctx: ExerciseContext; mode: 'training' | 'assessment'; exerciseId: string }) {
  const t = useTrainingSession(ctx);
  const { state } = t;
  const exercise = ctx.exercise;
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<Id | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<PortRef | null>(null);
  const [placingId, setPlacingId] = useState<Id | null>(null);
  const [hints, setHints] = useState(mode === 'training');
  const [flash, setFlash] = useState<Id[]>([]);
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [previousCount, setPreviousCount] = useState(0);

  const run = useCallback(
    (commands: Command[]) => {
      if (result) return;
      for (const c of commands) {
        const r = t.execute(c);
        if (!r.accepted) {
          setFlash(r.issues.flatMap((i) => i.objectIds ?? []));
          return;
        }
      }
      setFlash([]);
    },
    [t, result],
  );

  useEffect(() => {
    if (flash.length === 0) return;
    const timer = setTimeout(() => setFlash([]), 1800);
    return () => clearTimeout(timer);
  }, [flash]);

  const finish = useCallback(async () => {
    const r = evaluateAttempt(ctx, state, t.history, { mode, startedAt: t.startedAt, finishedAt: new Date().toISOString() });
    setPreviousCount((await results.listResults(exercise.id)).length);
    await results.saveResult(r);
    setResult(r);
  }, [ctx, state, t.history, t.startedAt, mode, exercise.id]);

  useEffect(() => {
    if (mode === 'assessment' && state.completed && !result) void finish();
  }, [mode, state.completed, result, finish]);

  const rotateSelected = useCallback(
    (dir: 1 | -1) => {
      const obj = selectedId ? state.objects[selectedId] : undefined;
      if (!obj) return;
      const step = rotationStep(ctx.catalog.symbols.get(obj.symbolId));
      if (step === null) return;
      run([{ type: 'RotateObject', objectId: obj.id, rotation: normalizeAngle(obj.rotation + dir * step) }]);
    },
    [selectedId, state, ctx, run],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'r' || e.key === 'R') rotateSelected(e.shiftKey ? -1 : 1);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectionId) {
        run([{ type: 'DisconnectPorts', connectionId: selectedConnectionId }]);
        setSelectedConnectionId(null);
      } else if (e.key === 'Escape') setPlacingId(null);
      else if (mode === 'training' && (e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        t.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotateSelected, selectedConnectionId, run, mode, t]);

  const placeAt = useCallback(
    (equipmentId: Id, at: Vec2) => {
      const eq = state.objects[equipmentId];
      if (!eq?.carriedBy) return;
      // Snap the dropped item so a compatible free port coincides, if one is close enough.
      const ground = { ...connectionWorld(state), objects: { ...state.objects, [equipmentId]: { ...eq, position: at } } };
      const snap = findSnap(ctx.catalog, ground, equipmentId, at, exercise.settings.snapDistance);
      run([{ type: 'PlaceEquipment', personnelId: eq.carriedBy, equipmentId, at: snap?.position ?? at }]);
      setPlacingId(null);
    },
    [state, ctx, exercise.settings.snapDistance, run],
  );

  const onMoveObject = useCallback(
    (id: Id, to: Vec2) => {
      const obj = state.objects[id];
      if (!obj) return;
      if (obj.kind === 'personnel') run([{ type: 'MovePersonnel', personnelId: id, to }]);
      else if (obj.carriedBy) placeAt(id, to);
      else run([{ type: 'MoveEquipment', equipmentId: id, to }]);
    },
    [state, run, placeAt],
  );

  const showSteps = mode === 'training' || exercise.assessment.showStepListDuringAssessment;
  const available = ctx.stepOrder.filter((id) => state.steps[id]?.status === 'available');

  const view = useMemo<SceneView>(() => {
    const focus = hints ? stepFocus(ctx, available) : { objects: new Set<Id>(), zones: new Set<Id>() };
    const highlights = highlightMap([
      ...[...focus.objects].map((id): [Id, ObjectHighlight] => [id, 'hint']),
      ...flash.map((id): [Id, ObjectHighlight] => [id, 'invalid']),
    ]);
    return {
      catalog: ctx.catalog,
      state,
      zones: exercise.initialScene.zones,
      annotations: exercise.initialScene.annotations,
      selectedIds: new Set(selectedId ? [selectedId] : []),
      selectedConnectionId,
      highlights,
      highlightedZoneIds: focus.zones,
      portHighlights: connectionTargetHighlights(ctx, state, connectingFrom),
      roleLabel: roleLabelFor(ctx),
      connectable: !result,
      draggable: () => !result,
    };
  }, [ctx, state, exercise, selectedId, selectedConnectionId, connectingFrom, hints, flash, available, result]);

  return (
    <div className="workspace">
      <div className="workspace__head">
        <div>
          <h1>
            {mode === 'assessment' ? 'Provjera znanja' : 'Vježbanje'}: {exercise.title}
          </h1>
          {exercise.synthetic ? <SyntheticBanner /> : null}
          {placingId ? (
            <div className="banner banner--info">Kliknite na scenu gdje treba odložiti opremu (Esc za odustajanje).</div>
          ) : null}
        </div>
        <div className="workspace__links">
          {mode === 'training' ? (
            <>
              <label className="toggle">
                <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} data-testid="hints-toggle" /> Savjeti
              </label>
              <button className="btn" onClick={t.undo} disabled={state.seq === 0 || !!result} title="Ctrl+Z">
                ↶ Poništi
              </button>
            </>
          ) : null}
          <button
            className="btn"
            onClick={() => {
              t.reset();
              setResult(null);
              setSelectedId(null);
            }}
          >
            ⟲ Ispočetka
          </button>
          {!result ? (
            <button className="btn btn--primary" onClick={() => void finish()} data-testid="finish">
              Završi {mode === 'assessment' ? 'provjeru' : 'vježbanje'}
            </button>
          ) : null}
          <a className="btn btn--ghost" href={href({ name: 'player', exerciseId })}>
            Demonstracija
          </a>
        </div>
      </div>
      <div className="workspace__body">
        <div className={`canvas-wrap ${placingId ? 'is-placing' : ''}`} data-testid="scene">
          <SceneCanvas
            view={view}
            fitBounds={exercise.initialScene.viewport}
            connectionRadius={exercise.settings.snapDistance}
            onSelectionChange={(sel) => {
              setSelectedId(sel.objectId);
              setSelectedConnectionId(sel.connectionId);
            }}
            onMoveObject={onMoveObject}
            onConnectPorts={(a, b) => run([{ type: 'ConnectPorts', a, b }])}
            onConnectGesture={setConnectingFrom}
            onPaneClick={(world) => {
              if (placingId) placeAt(placingId, world);
            }}
          />
          {state.completed ? (
            <div className="canvas-toast" data-testid="exercise-complete">
              🏁 Vježba je završena!
            </div>
          ) : null}
        </div>
        <aside className="sidebar">
          {result ? (
            <Panel>
              <ResultView ctx={ctx} result={result} previousCount={previousCount} />
            </Panel>
          ) : null}
          <Panel title="Povratna informacija">
            <FeedbackView ctx={ctx} state={state} feedback={t.feedback} />
          </Panel>
          <Panel title="Odabrano">
            <ContextPanel
              ctx={ctx}
              state={state}
              selectedId={selectedId}
              selectedConnectionId={selectedConnectionId}
              placingId={placingId}
              onCommand={run}
              onStartPlacing={setPlacingId}
            />
          </Panel>
          <Panel title="Napredak" actions={mode === 'assessment' ? <Badge tone="info">Provjera</Badge> : null}>
            <ProgressBar ctx={ctx} state={state} />
            {showSteps ? <StepList ctx={ctx} state={state} showHints={hints} /> : <p className="muted">Popis koraka skriven je tijekom provjere znanja.</p>}
          </Panel>
          <Panel title="Dnevnik">
            <EventLog ctx={ctx} state={state} entries={t.history} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

export function TrainingPage({ exerciseId, mode }: { exerciseId: string; mode: 'training' | 'assessment' }) {
  const bundle = useExerciseBundle(exerciseId);
  if (bundle.status === 'loading') return <Loading />;
  if (bundle.status === 'error') return <ErrorView message={bundle.message} diagnostics={bundle.diagnostics} />;
  return (
    <SymbolRegistryProvider registry={bundle.registry}>
      <TrainingWorkspace ctx={bundle.ctx} mode={mode} exerciseId={exerciseId} />
    </SymbolRegistryProvider>
  );
}
