import type { ReactNode } from 'react';
import type { Diagnostic, Issue, Provenance, Review } from '@fds/domain';
import { PROVENANCE, REVIEW, SEVERITY } from '../labels';

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'error' | 'synthetic'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function TraceBadges({ provenance, review }: { provenance: Provenance; review: Review }) {
  const tone = provenance === 'synthetic' ? 'synthetic' : provenance === 'source' ? 'ok' : 'warn';
  return (
    <>
      <Badge tone={tone}>{PROVENANCE[provenance]}</Badge>{' '}
      <Badge tone={review.status === 'verified' ? 'ok' : review.status === 'rejected' ? 'error' : 'warn'} title={review.notes}>
        {REVIEW[review.status]}
      </Badge>
    </>
  );
}

export function SyntheticBanner({ what = 'Ova vježba' }: { what?: string }) {
  return (
    <div className="banner banner--synthetic" role="note" data-testid="synthetic-banner">
      <strong>SINTETIČKI PRIMJER.</strong> {what} nije izrađena iz izvornih materijala i ne opisuje stvarni vatrogasni postupak. Služi samo
      za provjeru rada simulatora.
    </div>
  );
}

export function IssueList({ items, empty }: { items: readonly (Issue | Diagnostic)[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="issues">
      {items.map((i, idx) => (
        <li key={idx} className={`issue issue--${i.severity}`}>
          <span className="issue__sev">{SEVERITY[i.severity]}</span>
          <span className="issue__msg">{i.message}</span>
          <code className="issue__code">{i.code}</code>
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className ?? ''}`}>
      {title || actions ? (
        <header className="panel__head">
          {title ? <h2>{title}</h2> : <span />}
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Loading({ label = 'Učitavanje…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorView({ message, diagnostics = [] }: { message: string; diagnostics?: readonly Diagnostic[] }) {
  return (
    <div className="error-view" role="alert">
      <h2>Učitavanje nije uspjelo</h2>
      <p>{message}</p>
      <IssueList items={diagnostics} />
    </div>
  );
}
