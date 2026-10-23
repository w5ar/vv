import type { DatasetReport, Diagnostic } from '@fds/domain';

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '_(nema)_\n';
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n') + '\n';
}

function counts(diags: readonly Diagnostic[]): string {
  const e = diags.filter((d) => d.severity === 'error').length;
  const w = diags.filter((d) => d.severity === 'warning').length;
  const i = diags.filter((d) => d.severity === 'info').length;
  return `${e} grešaka, ${w} upozorenja, ${i} informacija`;
}

/** Human-readable Markdown report for one dataset (generated; do not edit). */
export function renderDatasetReport(ds: DatasetReport): string {
  const out: string[] = [];
  out.push(`# Izvješće o uvozu – ${ds.name}`, '');
  out.push('> Generirano naredbom `pnpm import:all`. Ne uređivati ručno.', '');
  if (ds.synthetic) out.push('> **SINTETIČKI SKUP PODATAKA** – nije izvorni materijal i ne opisuje stvarne vatrogasne postupke.', '');
  out.push(`- Izvorni direktorij: \`${ds.sourceRoot}\``);
  out.push(`- Datoteka: ${ds.inventory.length}`);
  out.push(`- Dijagnostika: ${counts(ds.diagnostics)}`, '');

  out.push('## A – Popis materijala', '');
  out.push(
    table(
      ['Datoteka', 'Vrsta', 'Veličina (B)', 'viewBox', 'Grupe', 'Duplikat od', 'Mogući id simbola'],
      ds.inventory.map((i) => [
        i.file,
        i.assetType,
        String(i.sizeBytes),
        i.svg?.viewBox?.join(' ') ?? (i.svg?.parseError ? `GREŠKA: ${i.svg.parseError}` : ''),
        String(i.svg?.groups.length ?? ''),
        i.duplicateOf.join(', '),
        i.possibleSymbolIds.join(', '),
      ]),
    ),
  );

  out.push('## B – Simboli', '');
  out.push(
    table(
      ['Id', 'Naziv', 'Izvor naziva', 'Kategorija', 'Datoteka', 'Element', 'Priključci', 'Pregled'],
      ds.symbols.map((s) => [s.proposedId, s.name, s.nameSource, s.category, s.file, s.elementId ?? '', String(s.portCount), s.reviewed ? s.reviewStatus : 'NEPREGLEDANO']),
    ),
  );

  out.push('## C – Crteži', '');
  for (const d of ds.diagrams) {
    out.push(`### ${d.file}`, '');
    if (d.title) out.push(`Naslov: ${d.title}`, '');
    out.push(`Faze: ${d.stages.map((s) => `${s.stageId}${s.label ? ` („${s.label}”)` : ''}`).join(', ') || '—'}`, '');
    if (d.flattened) out.push('**Ravni crtež** – nema prepoznatljivih instanci simbola.', '');
    out.push(
      table(
        ['Faza', 'Element', 'Instanca', 'Simbol', 'Položaj', 'Rotacija', 'Pouzdanost'],
        d.instances.map((i) => [
          i.stageId ?? '',
          i.elementId ?? '',
          i.instanceId ?? '',
          i.symbolId ?? i.rawRef ?? '?',
          i.position ? `${i.position.x}, ${i.position.y}` : '',
          i.rotation !== undefined ? `${i.rotation}°` : '',
          i.confidence,
        ]),
      ),
    );
    if (d.connections.length > 0) {
      out.push(table(['Faza', 'Od', 'Do', 'Pouzdanost'], d.connections.map((c) => [c.stageId ?? '', c.from ?? '?', c.to ?? '?', c.confidence])));
    }
  }

  out.push('## D – Postupci', '');
  for (const p of ds.procedures) {
    out.push(`### ${p.file}`, '');
    if (p.title) out.push(`Naslov: ${p.title}`, '');
    out.push(
      table(
        ['Kandidat', 'Redak', 'Tekst (doslovno)', 'Uloge', 'Oprema', 'Status'],
        p.steps.map((s) => [s.id, String(s.line), s.text, s.roleMentions.join(', '), s.equipmentMentions.join(', '), s.status]),
      ),
    );
  }

  out.push('## E – Povezivanje', '');
  out.push(
    table(
      ['Kandidat', 'Vježba', 'Koraci', 'Status', 'Razlog'],
      ds.mapping.map((m) => [m.candidateId, m.exerciseId ?? '', m.stepIds.join(', '), m.status, m.reason ?? '']),
    ),
  );

  out.push('## F – Kompilirane vježbe', '');
  out.push(
    table(
      ['Vježba', 'Izvor', 'Izlaz', 'Ispravno', 'Greške', 'Upozorenja', 'Koraci', 'Povezani s izvorom', 'Demonstracija završava'],
      ds.compiled.map((c) => [
        c.exerciseId,
        c.authoringFile,
        c.outputFile ?? '—',
        c.ok ? 'da' : 'ne',
        String(c.errorCount),
        String(c.warningCount),
        String(c.stepCount),
        String(c.tracedStepCount),
        c.demoReachesCompletion ? 'da' : 'ne',
      ]),
    ),
  );

  out.push('## Dijagnostika', '');
  out.push(
    table(
      ['Razina', 'Faza', 'Kod', 'Poruka', 'Izvor'],
      ds.diagnostics.map((d) => [
        d.severity,
        d.stage ?? '',
        d.code,
        d.message,
        d.source ? `${d.source.file}${d.source.line ? `:${d.source.line}` : ''}${d.source.anchor ? `#${d.source.anchor}` : ''}` : '',
      ]),
    ),
  );
  return out.join('\n');
}
