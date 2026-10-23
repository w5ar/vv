import { useEffect, useMemo, useState } from 'react';
import { compatiblePortTypes } from '@fds/connection-engine';
import type { Catalog, SymbolDefinition } from '@fds/domain';
import { SymbolRegistryProvider, SymbolView } from '@fds/reactflow-renderer';
import type { SymbolRegistry } from '@fds/svg-registry';
import { Badge, ErrorView, Loading, Panel, TraceBadges } from '../components/common';
import { href } from '../router';
import { registryFor, repository, useLibrary } from '../store/content';

function fit(width: number, height: number, box: number): { w: number; h: number; scale: number } {
  const scale = Math.min(box / width, box / height);
  return { w: width * scale, h: height * scale, scale };
}

function rotationLabel(s: SymbolDefinition): string {
  switch (s.rotation.mode) {
    case 'none':
      return 'Nije dopuštena';
    case 'free':
      return 'Slobodna';
    case 'step':
      return `U koracima od ${s.rotation.stepDegrees}°`;
  }
}

function SymbolDetail({ catalog, symbol }: { catalog: Catalog; symbol: SymbolDefinition }) {
  const [state, setState] = useState<string | null>(symbol.defaultState ?? null);
  useEffect(() => setState(symbol.defaultState ?? null), [symbol]);
  const { w, h, scale } = fit(symbol.size.width, symbol.size.height, 260);
  const portType = (id: string) => catalog.portTypes.find((p) => p.id === id);
  const pivot = symbol.pivot ?? { x: symbol.size.width / 2, y: symbol.size.height / 2 };
  const usedBy = catalog.equipmentTypes.filter((e) => e.symbolId === symbol.id);
  const roles = catalog.roles.filter((r) => r.symbolId === symbol.id);
  return (
    <div className="symbol-detail" data-testid="symbol-detail">
      <header className="symbol-detail__head">
        <h2>{symbol.name}</h2>
        <TraceBadges provenance={symbol.provenance} review={symbol.review} />
      </header>
      <div className="symbol-detail__preview">
        <div className="symbol-stage" style={{ width: w, height: h }}>
          <SymbolView symbolId={symbol.id} width={w} height={h} visualState={state} />
          <svg className="symbol-overlay" width={w} height={h} viewBox={`0 0 ${symbol.size.width} ${symbol.size.height}`} aria-hidden>
            <rect x={0} y={0} width={symbol.size.width} height={symbol.size.height} className="symbol-overlay__bounds" />
            <path
              d={`M ${pivot.x - 4 / scale} ${pivot.y} H ${pivot.x + 4 / scale} M ${pivot.x} ${pivot.y - 4 / scale} V ${pivot.y + 4 / scale}`}
              className="symbol-overlay__pivot"
            />
            {symbol.anchors.map((a) => (
              <rect key={a.id} x={a.position.x - 3 / scale} y={a.position.y - 3 / scale} width={6 / scale} height={6 / scale} className="symbol-overlay__anchor" />
            ))}
            {symbol.ports.map((p) => (
              <g key={p.id}>
                <circle cx={p.position.x} cy={p.position.y} r={5 / scale} className="symbol-overlay__port" />
                <text x={p.position.x} y={p.position.y - 8 / scale} fontSize={10 / scale} textAnchor="middle" className="symbol-overlay__text">
                  {p.label ?? p.id}
                </text>
              </g>
            ))}
          </svg>
        </div>
        {symbol.visualStates.length > 0 ? (
          <div className="state-switch" role="group" aria-label="Vizualna stanja">
            {symbol.visualStates.map((v) => (
              <button key={v.id} className={`btn btn--small ${state === v.id ? 'is-active' : ''}`} onClick={() => setState(v.id)}>
                {v.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <dl className="kv">
        <dt>Identifikator</dt>
        <dd>
          <code>{symbol.id}</code>
        </dd>
        <dt>Kategorija</dt>
        <dd>{catalog.categories.find((c) => c.id === symbol.category)?.name ?? symbol.category}</dd>
        <dt>Logička veličina</dt>
        <dd>
          {symbol.size.width} × {symbol.size.height}
        </dd>
        <dt>Rotacija</dt>
        <dd>{rotationLabel(symbol)}</dd>
        <dt>SVG datoteka</dt>
        <dd>
          <code>{symbol.asset.path}</code>
          {symbol.asset.elementId ? (
            <>
              {' '}
              → element <code>#{symbol.asset.elementId}</code>
            </>
          ) : null}
        </dd>
        {usedBy.length > 0 ? (
          <>
            <dt>Vrste opreme</dt>
            <dd>{usedBy.map((e) => `${e.name}${e.portable ? ' (prijenosno)' : ''}`).join(', ')}</dd>
          </>
        ) : null}
        {roles.length > 0 ? (
          <>
            <dt>Uloge</dt>
            <dd>{roles.map((r) => r.name).join(', ')}</dd>
          </>
        ) : null}
        {Object.keys(symbol.semantics).length > 0 ? (
          <>
            <dt>Svojstva</dt>
            <dd>
              {Object.entries(symbol.semantics)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(', ')}
            </dd>
          </>
        ) : null}
        {symbol.review.notes ? (
          <>
            <dt>Napomena</dt>
            <dd>{symbol.review.notes}</dd>
          </>
        ) : null}
      </dl>
      <h3>Priključci</h3>
      {symbol.ports.length === 0 ? (
        <p className="muted">Simbol nema priključaka.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Priključak</th>
              <th>Vrsta</th>
              <th>Položaj</th>
              <th>Smjer</th>
              <th>Najviše spojeva</th>
              <th>Kompatibilno s</th>
            </tr>
          </thead>
          <tbody>
            {symbol.ports.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.label ?? p.id} <code>{p.id}</code>
                </td>
                <td>{portType(p.type)?.name ?? p.type}</td>
                <td>
                  {p.position.x}, {p.position.y}
                </td>
                <td>{p.direction !== undefined ? `${p.direction}°` : '—'}</td>
                <td>{p.maxConnections}</td>
                <td>
                  {compatiblePortTypes(catalog.connectionRules, p.type)
                    .map((t) => portType(t)?.name ?? t)
                    .join(', ') || <span className="muted">nema pravila</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {symbol.sources.length > 0 ? (
        <>
          <h3>Izvori</h3>
          <ul className="sources">
            {symbol.sources.map((s, i) => (
              <li key={i}>
                <code>
                  {s.file}
                  {s.anchor ? `#${s.anchor}` : ''}
                </code>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function CatalogPage({ catalogId }: { catalogId?: string | undefined }) {
  const { catalogIds, load } = useLibrary();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [registry, setRegistry] = useState<SymbolRegistry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => void load(), [load]);
  const activeId = catalogId ?? catalogIds[0];
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    setCatalog(null);
    repository
      .getCatalog(activeId)
      .then(async (c) => {
        const r = await registryFor(c);
        if (!alive) return;
        setCatalog(c);
        setRegistry(r);
        setSelected(c.symbols[0]?.id ?? null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [activeId]);

  const symbols = useMemo(() => (catalog?.symbols ?? []).filter((s) => !category || s.category === category), [catalog, category]);
  if (error) return <ErrorView message={error} />;
  if (!activeId) return <div className="page"><h1>Katalog simbola</h1><p className="muted">Nema kataloga.</p></div>;
  if (!catalog || !registry) return <Loading />;
  const selectedSymbol = catalog.symbols.find((s) => s.id === selected);

  return (
    <SymbolRegistryProvider registry={registry}>
      <div className="page">
        <div className="page__title">
          <h1>Katalog simbola</h1>
          {catalog.synthetic ? <Badge tone="synthetic">SINTETIČKI KATALOG</Badge> : null}
        </div>
        <div className="toolbar">
          {catalogIds.length > 1 ? (
            <label>
              Katalog{' '}
              <select value={activeId} onChange={(e) => (window.location.hash = href({ name: 'catalog', catalogId: e.target.value }))}>
                {catalogIds.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
          ) : (
            <span>
              <strong>{catalog.name}</strong>
            </span>
          )}
          <label>
            Kategorija{' '}
            <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="category-filter">
              <option value="">Sve</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">
            {catalog.symbols.length} simbola · {catalog.portTypes.length} vrsta priključaka · {catalog.connectionRules.length} pravila spajanja
          </span>
        </div>
        {catalog.description ? <p className="muted">{catalog.description}</p> : null}
        <div className="catalog">
          <div className="symbol-grid" data-testid="symbol-grid">
            {symbols.map((s) => {
              const { w, h } = fit(s.size.width, s.size.height, 72);
              return (
                <button key={s.id} className={`symbol-card ${selected === s.id ? 'is-selected' : ''}`} onClick={() => setSelected(s.id)} data-testid={`symbol-${s.id}`}>
                  <div className="symbol-card__preview">
                    <SymbolView symbolId={s.id} width={w} height={h} visualState={s.defaultState} />
                  </div>
                  <div className="symbol-card__name">{s.name}</div>
                  <div className="symbol-card__meta">
                    {s.ports.length > 0 ? `${s.ports.length} prik.` : ''} {s.review.status !== 'verified' ? '· za provjeru' : ''}
                  </div>
                </button>
              );
            })}
          </div>
          <Panel className="catalog__detail">{selectedSymbol ? <SymbolDetail catalog={catalog} symbol={selectedSymbol} /> : <p>Odaberite simbol.</p>}</Panel>
        </div>
        <Panel title="Pravila spajanja">
          <table className="table">
            <thead>
              <tr>
                <th>Pravilo</th>
                <th>Vrste priključaka</th>
                <th>Učinak</th>
                <th>Podrijetlo</th>
              </tr>
            </thead>
            <tbody>
              {catalog.connectionRules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.id}</code>
                  </td>
                  <td>{r.portTypes.map((t) => catalog.portTypes.find((p) => p.id === t)?.name ?? t).join(' ↔ ')}</td>
                  <td>{r.effect === 'allow' ? 'Dopušteno' : 'Zabranjeno'}</td>
                  <td>
                    <TraceBadges provenance={r.provenance} review={r.review} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </SymbolRegistryProvider>
  );
}
