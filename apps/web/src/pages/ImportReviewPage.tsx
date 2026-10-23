import { useEffect, useMemo, useState } from 'react';
import type { DatasetReport, DiagramAnalysis, IssueSeverity } from '@fds/domain';
import { SvgTree } from '@fds/reactflow-renderer';
import { applyVisibility, sanitizeSvg, type SvgElementNode } from '@fds/svg-registry';
import { Badge, ErrorView, IssueList, Loading, Panel } from '../components/common';
import { ASSET_TYPE, CONFIDENCE, MAPPING_STATUS, REVIEW, SEVERITY } from '../labels';
import { repository, useLibrary } from '../store/content';

type Tab = 'inventory' | 'symbols' | 'diagrams' | 'procedures' | 'mapping' | 'compiled' | 'diagnostics';
const TABS: { id: Tab; label: string }[] = [
  { id: 'inventory', label: 'A · Materijali' },
  { id: 'symbols', label: 'B · Simboli' },
  { id: 'diagrams', label: 'C · Crteži' },
  { id: 'procedures', label: 'D · Postupci' },
  { id: 'mapping', label: 'E · Povezivanje' },
  { id: 'compiled', label: 'F · Vježbe' },
  { id: 'diagnostics', label: 'Dijagnostika' },
];

function DiagramPreview({ diagram }: { diagram: DiagramAnalysis }) {
  const [root, setRoot] = useState<SvgElementNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(diagram.stages[0]?.stageId ?? null);
  useEffect(() => {
    let alive = true;
    repository
      .getSvgAsset(diagram.file)
      .then((text) => {
        const r = sanitizeSvg(text);
        if (!alive) return;
        if (r.ok) setRoot(r.root);
        else setError(r.error);
      })
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [diagram.file]);
  const shown = useMemo(() => {
    if (!root) return null;
    const stageEls = diagram.stages.map((s) => s.elementId).filter((x): x is string => !!x);
    const current = diagram.stages.find((s) => s.stageId === stage)?.elementId;
    return applyVisibility(root, current ? [current] : [], stageEls.filter((id) => id !== current));
  }, [root, diagram.stages, stage]);
  if (error) return <p className="issue issue--error">{error}</p>;
  if (!shown) return <Loading />;
  const vb = diagram.viewBox ?? [0, 0, 100, 100];
  const instances = diagram.instances.filter((i) => !stage || i.stageId === stage);
  return (
    <div className="diagram-preview">
      {diagram.stages.length > 0 ? (
        <div className="btn-row">
          {diagram.stages.map((s) => (
            <button key={s.stageId} className={`btn btn--small ${stage === s.stageId ? 'is-active' : ''}`} onClick={() => setStage(s.stageId)}>
              {s.label ?? s.stageId}
            </button>
          ))}
        </div>
      ) : null}
      <div className="diagram-preview__stage">
        <SvgTree root={{ ...shown, attrs: { ...shown.attrs, width: '100%', height: '100%' } }} title={diagram.title} />
        <svg className="diagram-preview__overlay" viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden>
          {instances.map((i, k) =>
            i.position ? (
              <circle key={k} cx={i.position.x} cy={i.position.y} r={Math.max(vb[2] ?? 100, vb[3] ?? 100) / 120} className={`marker marker--${i.confidence}`}>
                <title>{`${i.instanceId ?? i.elementId ?? '?'} → ${i.symbolId ?? 'neprepoznato'} (${CONFIDENCE[i.confidence]})`}</title>
              </circle>
            ) : null,
          )}
        </svg>
      </div>
      <p className="muted">
        Oznake: <span className="dot dot--metadata" /> metapodaci · <span className="dot dot--heuristic" /> heuristika · <span className="dot dot--unresolved" /> neprepoznato
      </p>
    </div>
  );
}

function DatasetView({ ds }: { ds: DatasetReport }) {
  const [tab, setTab] = useState<Tab>('inventory');
  const [severity, setSeverity] = useState<IssueSeverity | ''>('');
  const counts = (s: IssueSeverity) => ds.diagnostics.filter((d) => d.severity === s).length;
  return (
    <div data-testid={`dataset-${ds.id}`}>
      <div className="dataset-summary">
        <h2>
          {ds.name} {ds.synthetic ? <Badge tone="synthetic">SINTETIČKI</Badge> : <Badge tone="info">Izvorni</Badge>}
        </h2>
        <p className="muted">
          <code>{ds.sourceRoot}</code> · {ds.inventory.length} datoteka · {ds.symbols.length} simbola · {ds.diagrams.length} crteža · {ds.procedures.length} postupaka ·{' '}
          {ds.compiled.length} vježbi · {counts('error')} grešaka, {counts('warning')} upozorenja
        </p>
        {ds.inventory.length === 0 ? (
          <div className="banner banner--warn">
            U ovom direktoriju nema izvornih materijala. Dodajte SVG simbole, crteže i Markdown postupke u <code>{ds.sourceRoot}</code> te pokrenite{' '}
            <code>pnpm import:all</code>.
          </div>
        ) : null}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'inventory' ? (
        <table className="table">
          <thead>
            <tr>
              <th>Datoteka</th>
              <th>Vrsta</th>
              <th>Veličina</th>
              <th>Dimenzije / viewBox</th>
              <th>Elementi</th>
              <th>Grupe</th>
              <th>Reference</th>
              <th>Duplikati</th>
              <th>Mogući id</th>
            </tr>
          </thead>
          <tbody>
            {ds.inventory.map((i) => (
              <tr key={i.file}>
                <td>
                  <code>{i.file}</code> {i.svg?.synthetic || i.markdown?.synthetic ? <Badge tone="synthetic">sint.</Badge> : null}
                </td>
                <td>{ASSET_TYPE[i.assetType]}</td>
                <td>{i.sizeBytes} B</td>
                <td>{i.svg?.parseError ? <span className="issue--error">{i.svg.parseError}</span> : (i.svg?.viewBox?.join(' ') ?? (i.svg ? `${i.svg.width ?? '?'}×${i.svg.height ?? '?'}` : '—'))}</td>
                <td>{i.svg ? Object.entries(i.svg.elementCounts).map(([k, v]) => `${k}:${v}`).join(' ') : i.markdown ? `naslovi: ${i.markdown.headings}, koraci: ${i.markdown.numberedItems}` : ''}</td>
                <td>{i.svg?.groups.length ?? ''}</td>
                <td>{(i.svg?.referencedAssets ?? i.markdown?.images ?? []).join(', ')}</td>
                <td>{i.duplicateOf.join(', ')}</td>
                <td>{i.possibleSymbolIds.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {tab === 'symbols' ? (
        <table className="table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Naziv</th>
              <th>Izvor naziva</th>
              <th>Kategorija</th>
              <th>Datoteka / element</th>
              <th>Priključci</th>
              <th>Pregled</th>
              <th>Napomene</th>
            </tr>
          </thead>
          <tbody>
            {ds.symbols.map((s) => (
              <tr key={`${s.proposedId}:${s.file}:${s.elementId ?? ''}`}>
                <td>
                  <code>{s.proposedId}</code>
                </td>
                <td>{s.name}</td>
                <td>{s.nameSource}</td>
                <td>{s.category}</td>
                <td>
                  <code>{s.file}</code>
                  {s.elementId ? <code>#{s.elementId}</code> : null}
                </td>
                <td>{s.portCount}</td>
                <td>{s.reviewed ? <Badge tone={s.reviewStatus === 'verified' ? 'ok' : 'warn'}>{REVIEW[s.reviewStatus]}</Badge> : <Badge tone="error">Nepregledano</Badge>}</td>
                <td>{s.notes.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {tab === 'diagrams' ? (
        ds.diagrams.length === 0 ? (
          <p className="muted">Nema crteža.</p>
        ) : (
          ds.diagrams.map((d) => (
            <Panel key={d.file} title={<code>{d.file}</code>} actions={d.flattened ? <Badge tone="warn">Ravni crtež</Badge> : null}>
              {d.title ? <p>{d.title}</p> : null}
              {d.notes.map((n, i) => (
                <p key={i} className="muted">
                  {n}
                </p>
              ))}
              <div className="diagram-layout">
                <DiagramPreview diagram={d} />
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Faza</th>
                      <th>Instanca</th>
                      <th>Simbol</th>
                      <th>Položaj</th>
                      <th>Rot.</th>
                      <th>Pouzdanost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.instances.map((i, k) => (
                      <tr key={k}>
                        <td>{i.stageId}</td>
                        <td>
                          <code>{i.instanceId ?? i.elementId ?? '?'}</code>
                          {i.label ? ` ${i.label}` : ''}
                        </td>
                        <td>{i.symbolId ?? <span className="muted">{i.rawRef ?? '—'}</span>}</td>
                        <td>{i.position ? `${i.position.x}, ${i.position.y}` : ''}</td>
                        <td>{i.rotation ?? ''}</td>
                        <td>
                          <Badge tone={i.confidence === 'metadata' ? 'ok' : i.confidence === 'heuristic' ? 'warn' : 'error'}>{CONFIDENCE[i.confidence]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.connections.length > 0 ? (
                <>
                  <h4>Spojevi na crtežu</h4>
                  <ul className="list">
                    {d.connections.map((c, k) => (
                      <li key={k}>
                        [{c.stageId}] <code>{c.from}</code> – <code>{c.to}</code> ({CONFIDENCE[c.confidence]})
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {d.labels.length > 0 ? (
                <p className="muted">
                  Natpisi: {d.labels.map((l) => `„${l.text}”`).join(', ')}
                </p>
              ) : null}
            </Panel>
          ))
        )
      ) : null}
      {tab === 'procedures' ? (
        ds.procedures.length === 0 ? (
          <p className="muted">Nema postupaka.</p>
        ) : (
          ds.procedures.map((p) => (
            <Panel key={p.file} title={<code>{p.file}</code>}>
              {p.title ? <h3>{p.title}</h3> : null}
              <h4>Odjeljci</h4>
              <ul className="list">
                {p.sections
                  .filter((s) => s.level > 0)
                  .map((s) => (
                    <li key={s.id} style={{ paddingLeft: (s.level - 1) * 12 }}>
                      {s.heading} <span className="muted">(redak {s.line})</span>
                    </li>
                  ))}
              </ul>
              <h4>Kandidati za korake (doslovni tekst)</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Kandidat</th>
                    <th>Redak</th>
                    <th>Tekst</th>
                    <th>Uloge</th>
                    <th>Oprema</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {p.steps.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <code>{s.id}</code>
                      </td>
                      <td>{s.line}</td>
                      <td>{s.text}</td>
                      <td>{s.roleMentions.join(', ')}</td>
                      <td>{s.equipmentMentions.join(', ')}</td>
                      <td>
                        <Badge tone={s.status === 'mapped' ? 'ok' : s.status === 'ignored' ? 'neutral' : 'warn'}>{MAPPING_STATUS[s.status]}</Badge>
                        {s.mappedTo.length > 0 ? <div className="muted">{s.mappedTo.join(', ')}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ))
        )
      ) : null}
      {tab === 'mapping' ? (
        <table className="table">
          <thead>
            <tr>
              <th>Kandidat</th>
              <th>Vježba</th>
              <th>Koraci</th>
              <th>Status</th>
              <th>Razlog</th>
            </tr>
          </thead>
          <tbody>
            {ds.mapping.map((m) => (
              <tr key={m.candidateId}>
                <td>
                  <code>{m.candidateId}</code>
                </td>
                <td>{m.exerciseId}</td>
                <td>{m.stepIds.join(', ')}</td>
                <td>
                  <Badge tone={m.status === 'mapped' ? 'ok' : m.status === 'ignored' ? 'neutral' : 'warn'}>{MAPPING_STATUS[m.status]}</Badge>
                </td>
                <td>{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {tab === 'compiled' ? (
        <table className="table">
          <thead>
            <tr>
              <th>Vježba</th>
              <th>Izvorna datoteka</th>
              <th>Izlaz</th>
              <th>Stanje</th>
              <th>Koraci</th>
              <th>Povezani s izvorom</th>
              <th>Demonstracija završava</th>
            </tr>
          </thead>
          <tbody>
            {ds.compiled.map((c) => (
              <tr key={c.authoringFile}>
                <td>{c.exerciseId}</td>
                <td>
                  <code>{c.authoringFile}</code>
                </td>
                <td>
                  <code>{c.outputFile ?? '—'}</code>
                </td>
                <td>
                  <Badge tone={c.ok ? 'ok' : 'error'}>{c.ok ? 'Ispravno' : `${c.errorCount} grešaka`}</Badge> {c.warningCount ? <Badge tone="warn">{c.warningCount} upoz.</Badge> : null}
                </td>
                <td>{c.stepCount}</td>
                <td>{c.tracedStepCount}</td>
                <td>{c.demoReachesCompletion ? 'da' : 'ne'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {tab === 'diagnostics' ? (
        <>
          <div className="toolbar">
            <label>
              Razina{' '}
              <select value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity | '')}>
                <option value="">Sve</option>
                {(['error', 'warning', 'info'] as const).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY[s]} ({counts(s)})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <IssueList items={ds.diagnostics.filter((d) => !severity || d.severity === severity)} empty="Nema dijagnostike." />
        </>
      ) : null}
    </div>
  );
}

export function ImportReviewPage() {
  const { report, error, load } = useLibrary();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => void load(), [load]);
  if (error) return <ErrorView message={error} />;
  if (!report) return <Loading label="Učitavanje izvješća o uvozu…" />;
  const ds = report.datasets.find((d) => d.id === active) ?? report.datasets[0];
  return (
    <div className="page">
      <h1>Pregled uvoza</h1>
      <p className="muted">
        Rezultati cjevovoda za uvoz (faze A–F). Generira se naredbom <code>pnpm import:all</code>; svaka stavka vodi natrag na izvornu datoteku.
      </p>
      <div className="tabs tabs--datasets">
        {report.datasets.map((d) => (
          <button key={d.id} className={`tab ${ds?.id === d.id ? 'is-active' : ''}`} onClick={() => setActive(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
      {ds ? <DatasetView key={ds.id} ds={ds} /> : <p>Nema skupova podataka.</p>}
    </div>
  );
}
