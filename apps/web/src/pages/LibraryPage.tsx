import { useEffect, useState } from 'react';
import { Badge, ErrorView, Loading, TraceBadges } from '../components/common';
import { href } from '../router';
import { drafts, useLibrary } from '../store/content';

export function LibraryPage() {
  const { summaries, report, error, load } = useLibrary();
  const [draftIds, setDraftIds] = useState<string[]>([]);
  useEffect(() => {
    void load();
    void drafts.listDraftIds().then(setDraftIds);
  }, [load]);

  if (error) return <ErrorView message={error} />;
  if (!summaries) return <Loading />;
  const sourceDataset = report?.datasets.find((d) => !d.synthetic);
  const noSources = !sourceDataset || sourceDataset.inventory.length === 0;

  return (
    <div className="page">
      <h1>Knjižnica vježbi</h1>
      {noSources ? (
        <div className="banner banner--warn" role="note" data-testid="no-sources-banner">
          <strong>Izvorni materijali nisu dostupni.</strong> Direktorij <code>content/source</code> je prazan: nije bilo SVG simbola, crteža
          vježbi ni Markdown postupaka. Zato knjižnica sadrži samo <strong>sintetički</strong> primjer koji služi za provjeru simulatora. Pogledajte{' '}
          <a href={href({ name: 'import' })}>Pregled uvoza</a> i <code>docs/OPEN_QUESTIONS.md</code>.
        </div>
      ) : null}
      {summaries.some((s) => !s.synthetic && s.reviewStatus !== 'verified') ? (
        <div className="banner banner--info" role="note" data-testid="review-banner">
          Vježbe iz izvornih materijala (<code>content/source</code>) povezuju tekst postupka, skice i simulacijske naredbe. Povezivanje je izradio razvojni
          tim i <strong>čeka stručnu provjeru</strong>; otvorena pitanja navedena su u <code>docs/OPEN_QUESTIONS.md</code>.
        </div>
      ) : null}
      {summaries.length === 0 ? <p className="muted">Nema kompiliranih vježbi. Pokrenite „pnpm import:all”.</p> : null}
      <div className="cards">
        {summaries.map((s) => (
          <article key={s.id} className="card" data-testid={`exercise-${s.id}`}>
            <header className="card__head">
              <h2>{s.title}</h2>
              <div className="card__badges">
                {s.synthetic ? <Badge tone="synthetic">SINTETIČKI</Badge> : null}
                <TraceBadges provenance={s.provenance} review={{ status: s.reviewStatus }} />
                {draftIds.includes(s.id) ? <Badge tone="info">Lokalni nacrt</Badge> : null}
              </div>
            </header>
            {s.summary ? <p>{s.summary}</p> : null}
            <dl className="card__meta">
              <div>
                <dt>Faze</dt>
                <dd>{s.stageCount}</dd>
              </div>
              <div>
                <dt>Koraci</dt>
                <dd>{s.stepCount}</dd>
              </div>
              <div>
                <dt>Katalog</dt>
                <dd>
                  <a href={href({ name: 'catalog', catalogId: s.catalogId })}>{s.catalogId}</a>
                </dd>
              </div>
              <div>
                <dt>Oznake</dt>
                <dd>{s.tags.join(', ') || '—'}</dd>
              </div>
            </dl>
            <footer className="card__actions">
              <a className="btn btn--primary" href={href({ name: 'player', exerciseId: s.id })}>
                ▶ Demonstracija
              </a>
              <a className="btn" href={href({ name: 'training', exerciseId: s.id, mode: 'training' })}>
                Vježbanje
              </a>
              <a className="btn" href={href({ name: 'training', exerciseId: s.id, mode: 'assessment' })}>
                Provjera znanja
              </a>
              <a className="btn btn--ghost" href={href({ name: 'editor', exerciseId: s.id })}>
                Uređivač
              </a>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
