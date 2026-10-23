import { useCallback, useEffect, useMemo, useState } from 'react';
import { findSnap, validateConnection } from '@fds/connection-engine';
import type { Catalog, Diagnostic, Exercise, Id, Issue, PortRef } from '@fds/domain';
import type { Vec2 } from '@fds/geometry';
import { SceneCanvas, SymbolRegistryProvider, SymbolView, type ObjectHighlight, type SceneView } from '@fds/reactflow-renderer';
import { checkExercise, connectionWorld, createExerciseContext, createInitialState, objectName } from '@fds/simulation-engine';
import { Badge, ErrorView, IssueList, Loading, Panel, SyntheticBanner } from '../components/common';
import { edits, useEditor } from '../editor/editor-store';
import { href } from '../router';
import { connectionTargetHighlights, roleLabelFor } from '../scene-helpers';
import { drafts, repository, useExerciseBundle } from '../store/content';
import { rotationStep } from '../training/ContextPanel';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Palette({ catalog, onAddEquipment, onAddPersonnel }: { catalog: Catalog; onAddEquipment: (typeId: Id) => void; onAddPersonnel: (roleId: Id | null, symbolId: Id) => void }) {
  const personnelSymbol = catalog.roles.find((r) => r.symbolId)?.symbolId ?? catalog.symbols.find((s) => s.category.includes('osob'))?.id;
  return (
    <div className="palette" data-testid="palette">
      <h4>Oprema</h4>
      {catalog.equipmentTypes.map((t) => {
        const s = catalog.symbols.find((x) => x.id === t.symbolId);
        return (
          <button key={t.id} className="palette__item" onClick={() => onAddEquipment(t.id)} title={`Dodaj: ${t.name}`} data-testid={`palette-${t.id}`}>
            {s ? <SymbolView symbolId={s.id} width={28} height={(28 * s.size.height) / s.size.width} /> : null}
            <span>{t.name}</span>
          </button>
        );
      })}
      <h4>Osoblje</h4>
      {catalog.roles.map((r) => (
        <button
          key={r.id}
          className="palette__item"
          disabled={!(r.symbolId ?? personnelSymbol)}
          onClick={() => onAddPersonnel(r.id, (r.symbolId ?? personnelSymbol) as Id)}
          title={`Dodaj osobu s ulogom: ${r.name}`}
        >
          {r.symbolId ?? personnelSymbol ? <SymbolView symbolId={(r.symbolId ?? personnelSymbol) as Id} width={22} height={22} /> : null}
          <span>{r.name}</span>
        </button>
      ))}
    </div>
  );
}

function EditorWorkspace({ catalog, exerciseId }: { catalog: Catalog; exerciseId: string }) {
  const { draft, past, future, dirty, apply, undo, redo, markSaved, discard } = useEditor();
  const [unlocked, setUnlocked] = useState(false);
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<Id | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<PortRef | null>(null);
  const [snap, setSnap] = useState(true);
  const [autoConnect, setAutoConnect] = useState(false);
  const [portLabels, setPortLabels] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const ctx = useMemo(() => (draft ? createExerciseContext(draft, catalog) : null), [draft, catalog]);
  const state = useMemo(() => (ctx ? createInitialState(ctx) : null), [ctx]);

  // Live validation of the draft (debounced): schema-level data is already typed; run semantic + demo checks.
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => setDiagnostics(checkExercise(draft, catalog).diagnostics), 250);
    return () => clearTimeout(t);
  }, [draft, catalog]);

  const edit = useCallback(
    (label: string, fn: (e: Exercise) => Exercise) => {
      if (!unlocked) {
        setMessage('Uređivanje je zaključano. Kliknite „Omogući uređivanje”.');
        return;
      }
      setMessage(null);
      apply(label, fn);
    },
    [unlocked, apply],
  );

  const onMoveObject = useCallback(
    (id: Id, to: Vec2) => {
      if (!ctx || !state) return;
      let position = to;
      let connect: { a: PortRef; b: PortRef } | null = null;
      if (snap) {
        const s = findSnap(ctx.catalog, connectionWorld(state), id, to, ctx.exercise.settings.snapDistance);
        if (s) {
          position = s.position;
          if (autoConnect) connect = { a: s.ownPort, b: s.targetPort };
        }
      }
      edit('move', (e) => {
        const moved = edits.move(e, id, position);
        return connect ? edits.connect(moved, connect.a, connect.b) : moved;
      });
    },
    [ctx, state, snap, autoConnect, edit],
  );

  const onConnect = useCallback(
    (a: PortRef, b: PortRef) => {
      if (!ctx || !state) return;
      const problems = validateConnection(ctx.catalog, connectionWorld(state), a, b, { maxDistance: ctx.exercise.settings.connectionMaxDistance });
      setIssues(problems);
      if (problems.length === 0) edit('connect', (e) => edits.connect(e, a, b));
    },
    [ctx, state, edit],
  );

  const rotate = useCallback(
    (dir: 1 | -1) => {
      const obj = selectedId && state ? state.objects[selectedId] : undefined;
      if (!obj || !ctx) return;
      const step = rotationStep(ctx.catalog.symbols.get(obj.symbolId));
      if (step === null) {
        setMessage('Ovaj simbol nije moguće rotirati.');
        return;
      }
      edit('rotate', (e) => edits.rotate(e, obj.id, obj.rotation + dir * step));
    },
    [selectedId, state, ctx, edit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'r' || e.key === 'R') rotate(e.shiftKey ? -1 : 1);
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedConnectionId) edit('disconnect', (x) => edits.disconnect(x, selectedConnectionId));
        else if (selectedId) {
          edit('remove', (x) => edits.remove(x, selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, rotate, edit, selectedId, selectedConnectionId]);

  const view = useMemo<SceneView | null>(() => {
    if (!ctx || !state || !draft) return null;
    const invalid = new Map<Id, ObjectHighlight>();
    for (const i of issues) for (const id of i.objectIds ?? []) invalid.set(id, 'invalid');
    return {
      catalog: ctx.catalog,
      state,
      zones: draft.initialScene.zones,
      annotations: draft.initialScene.annotations,
      selectedIds: new Set(selectedId ? [selectedId] : []),
      selectedConnectionId,
      highlights: invalid,
      portHighlights: connectionTargetHighlights(ctx, state, connectingFrom),
      roleLabel: roleLabelFor(ctx),
      connectable: unlocked,
      draggable: () => unlocked,
      showPortLabels: portLabels,
    };
  }, [ctx, state, draft, selectedId, selectedConnectionId, connectingFrom, unlocked, issues, portLabels]);

  if (!draft || !ctx || !state || !view) return <Loading />;
  const selected = selectedId ? state.objects[selectedId] : undefined;
  const instance = selected
    ? (draft.initialScene.personnel.find((p) => p.id === selected.id) ?? draft.initialScene.equipment.find((q) => q.id === selected.id))
    : undefined;
  const center = draft.initialScene.viewport
    ? { x: draft.initialScene.viewport.x + draft.initialScene.viewport.width / 2, y: draft.initialScene.viewport.y + draft.initialScene.viewport.height / 2 }
    : { x: 0, y: 0 };
  const addAt = (): Vec2 => ({ x: center.x + (draft.initialScene.equipment.length % 5) * 12, y: center.y + (draft.initialScene.personnel.length % 5) * 12 });
  const errors = diagnostics?.filter((d) => d.severity === 'error') ?? [];

  return (
    <div className="workspace">
      <div className="workspace__head">
        <div>
          <h1>Uređivač: {draft.title}</h1>
          {draft.synthetic ? <SyntheticBanner /> : null}
          {message ? <div className="banner banner--info">{message}</div> : null}
        </div>
        <div className="workspace__links">
          <button className={`btn ${unlocked ? 'is-active' : 'btn--primary'}`} onClick={() => setUnlocked((u) => !u)} data-testid="unlock">
            {unlocked ? '🔓 Uređivanje omogućeno' : '🔒 Omogući uređivanje'}
          </button>
          <button className="btn" onClick={undo} disabled={past.length === 0} title="Ctrl+Z" data-testid="undo">
            ↶ Poništi
          </button>
          <button className="btn" onClick={redo} disabled={future.length === 0} title="Ctrl+Y" data-testid="redo">
            ↷ Ponovi
          </button>
          <button
            className="btn"
            onClick={() =>
              void drafts.saveDraft(draft).then(() => {
                markSaved();
                setMessage('Nacrt je spremljen u preglednik.');
              })
            }
            disabled={!dirty}
          >
            Spremi nacrt
          </button>
          <button className="btn" onClick={() => download(`${draft.id}.json`, `${JSON.stringify(draft, null, 2)}\n`)}>
            Izvezi JSON
          </button>
          <button
            className="btn btn--ghost"
            onClick={() =>
              void drafts.deleteDraft(exerciseId).then(() => {
                discard();
                setMessage('Nacrt je odbačen; prikazana je kompilirana vježba.');
              })
            }
          >
            Odbaci nacrt
          </button>
        </div>
      </div>
      <div className="workspace__body">
        <aside className="sidebar sidebar--left">
          <Panel title="Paleta">{unlocked ? <Palette catalog={catalog} onAddEquipment={(typeId) => edit('add', (e) => edits.addEquipment(e, typeId, addAt()))} onAddPersonnel={(roleId, symbolId) => edit('add', (e) => edits.addPersonnel(e, symbolId, roleId, addAt()))} /> : <p className="muted">Omogućite uređivanje za dodavanje objekata.</p>}</Panel>
          <Panel title="Prikaz">
            <label className="toggle">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Privlačenje priključaka ({ctx.exercise.settings.snapDistance})
            </label>
            <label className="toggle">
              <input type="checkbox" checked={autoConnect} onChange={(e) => setAutoConnect(e.target.checked)} disabled={!snap} /> Automatski spoji pri privlačenju
            </label>
            <label className="toggle">
              <input type="checkbox" checked={portLabels} onChange={(e) => setPortLabels(e.target.checked)} /> Oznake priključaka
            </label>
            <button className="btn btn--small" onClick={() => setFitKey((k) => k + 1)}>
              Prilagodi prikaz
            </button>
          </Panel>
        </aside>
        <div className="canvas-wrap" data-testid="scene">
          <SceneCanvas
            view={view}
            fitBounds={draft.initialScene.viewport}
            fitKey={fitKey}
            connectionRadius={ctx.exercise.settings.snapDistance}
            showMiniMap
            onSelectionChange={(s) => {
              setSelectedId(s.objectId);
              setSelectedConnectionId(s.connectionId);
            }}
            onMoveObject={onMoveObject}
            onConnectPorts={onConnect}
            onConnectGesture={setConnectingFrom}
          />
        </div>
        <aside className="sidebar">
          <Panel title="Svojstva">
            {selected && instance ? (
              <div className="context" data-testid="inspector">
                <h3>{objectName(ctx, selected)}</h3>
                <p className="muted">
                  <code>{selected.id}</code>
                </p>
                <label className="field">
                  Oznaka
                  <input
                    defaultValue={instance.label ?? ''}
                    key={`${selected.id}:${instance.label ?? ''}`}
                    onBlur={(e) => edit('label', (x) => edits.setLabel(x, selected.id, e.target.value))}
                    disabled={!unlocked}
                  />
                </label>
                {selected.kind === 'personnel' ? (
                  <label className="field">
                    Uloga
                    <select value={selected.roleId ?? ''} onChange={(e) => edit('role', (x) => edits.setRole(x, selected.id, e.target.value || null))} disabled={!unlocked}>
                      <option value="">— bez uloge —</option>
                      {[...ctx.catalog.roles.values()].map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="field-row">
                  <label className="field">
                    X
                    <input
                      type="number"
                      value={Math.round(selected.position.x)}
                      onChange={(e) => edit('move', (x) => edits.move(x, selected.id, { x: Number(e.target.value), y: selected.position.y }))}
                      disabled={!unlocked}
                    />
                  </label>
                  <label className="field">
                    Y
                    <input
                      type="number"
                      value={Math.round(selected.position.y)}
                      onChange={(e) => edit('move', (x) => edits.move(x, selected.id, { x: selected.position.x, y: Number(e.target.value) }))}
                      disabled={!unlocked}
                    />
                  </label>
                  <label className="field">
                    Rotacija
                    <input type="number" value={Math.round(selected.rotation)} readOnly />
                  </label>
                </div>
                <div className="btn-row">
                  <button className="btn btn--small" onClick={() => rotate(-1)} disabled={!unlocked} data-testid="editor-rotate-left">
                    ⟲
                  </button>
                  <button className="btn btn--small" onClick={() => rotate(1)} disabled={!unlocked} data-testid="editor-rotate-right">
                    ⟳
                  </button>
                  <button
                    className="btn btn--small btn--danger"
                    onClick={() => {
                      edit('remove', (x) => edits.remove(x, selected.id));
                      setSelectedId(null);
                    }}
                    disabled={!unlocked}
                  >
                    Ukloni
                  </button>
                </div>
                <h4>Izvori</h4>
                {instance.sources.length === 0 ? (
                  <p className="muted">Nema poveznice na izvor (ručno dodano).</p>
                ) : (
                  <ul className="sources">
                    {instance.sources.map((s, i) => (
                      <li key={i}>
                        <code>
                          {s.file}
                          {s.anchor ? `#${s.anchor}` : ''}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : selectedConnectionId ? (
              <div className="context">
                <h3>Spoj</h3>
                <code>{selectedConnectionId}</code>
                <div>
                  <button className="btn btn--small" onClick={() => edit('disconnect', (x) => edits.disconnect(x, selectedConnectionId))} disabled={!unlocked}>
                    Ukloni spoj
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted">Odaberite objekt ili spoj. Povlačenjem premještate objekte, Delete uklanja, R rotira.</p>
            )}
            <IssueList items={issues} />
          </Panel>
          <Panel title="Faze">
            <ol className="stage-editor">
              {draft.stages.map((s) => (
                <li key={s.id}>
                  <input
                    defaultValue={s.name}
                    key={`${s.id}:${s.name}`}
                    onBlur={(e) => edit('stage', (x) => edits.renameStage(x, s.id, e.target.value))}
                    disabled={!unlocked}
                    aria-label={`Naziv faze ${s.id}`}
                  />
                  <div className="muted">
                    {ctx.stageSteps.get(s.id)?.length ?? 0} koraka
                    {s.diagram ? ` · crtež: ${s.diagram.file.split('/').pop()}${s.diagram.anchor ? `#${s.diagram.anchor}` : ''} (${s.diagramMoment === 'start' ? 'početak' : 'kraj'})` : ''}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Provjera nacrta" actions={diagnostics ? <Badge tone={errors.length ? 'error' : 'ok'}>{errors.length ? `${errors.length} grešaka` : 'Ispravno'}</Badge> : null}>
            {diagnostics ? <IssueList items={diagnostics.filter((d) => d.severity !== 'info')} empty="Nema grešaka ni upozorenja." /> : <Loading label="Provjera…" />}
            <p className="muted">
              Promjene vrijede samo za ovaj nacrt u pregledniku. Za trajnu izmjenu ažurirajte datoteku u <code>content/authoring</code> i pokrenite <code>pnpm import:all</code>.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

export function EditorPage({ exerciseId }: { exerciseId: string }) {
  const bundle = useExerciseBundle(exerciseId, { preferDraft: true });
  const load = useEditor((s) => s.load);
  const [baseLoaded, setBaseLoaded] = useState(false);
  useEffect(() => {
    if (bundle.status !== 'ready') return;
    let alive = true;
    // Undo history is per editing session; the compiled exercise is the "discard" baseline.
    void repository.getExercise(exerciseId).then((base) => {
      if (!alive) return;
      load(base, bundle.fromDraft ? bundle.exercise : null);
      setBaseLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [bundle, exerciseId, load]);
  if (bundle.status === 'loading') return <Loading />;
  if (bundle.status === 'error') return <ErrorView message={bundle.message} diagnostics={bundle.diagnostics} />;
  if (!baseLoaded) return <Loading />;
  return (
    <SymbolRegistryProvider registry={bundle.registry}>
      {bundle.fromDraft ? (
        <div className="banner banner--info page-banner">
          Učitan je lokalni nacrt iz preglednika. <a href={href({ name: 'player', exerciseId })}>Demonstracija</a> i vježbanje koriste kompiliranu vježbu.
        </div>
      ) : null}
      <EditorWorkspace catalog={bundle.catalog} exerciseId={exerciseId} />
    </SymbolRegistryProvider>
  );
}

