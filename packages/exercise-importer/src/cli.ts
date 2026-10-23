#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runPipeline } from './pipeline';
import { findRepoRoot } from './util';

/**
 * Import pipeline CLI.
 *
 *   pnpm import:all            run stages A–F and write outputs
 *   pnpm import:check          run in memory; fail if outputs are stale or errors exist
 *   pnpm import all --quiet    less output
 */
async function main(argv: string[]): Promise<number> {
  const [command = 'all', ...flags] = argv;
  if (command !== 'all') {
    console.error(`Nepoznata naredba „${command}”. Koristite: all [--check] [--quiet]`);
    return 2;
  }
  const check = flags.includes('--check');
  const quiet = flags.includes('--quiet');
  const repoRoot = findRepoRoot();
  const { report, outputs } = await runPipeline(repoRoot);

  let stale = 0;
  for (const [rel, content] of [...outputs].sort(([a], [b]) => a.localeCompare(b))) {
    const abs = path.join(repoRoot, rel);
    const current = existsSync(abs) ? await readFile(abs, 'utf8') : null;
    if (current === content) continue;
    if (check) {
      stale++;
      console.error(`ZASTARJELO: ${rel}`);
    } else {
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      if (!quiet) console.log(`zapisano: ${rel}`);
    }
  }

  let errors = 0;
  for (const ds of report.datasets) {
    const e = ds.diagnostics.filter((d) => d.severity === 'error');
    const w = ds.diagnostics.filter((d) => d.severity === 'warning');
    errors += e.length;
    console.log(
      `[${ds.id}] datoteka: ${ds.inventory.length}, simbola: ${ds.symbols.length}, crteža: ${ds.diagrams.length}, postupaka: ${ds.procedures.length}, vježbi: ${ds.compiled.length} — greške: ${e.length}, upozorenja: ${w.length}`,
    );
    if (!quiet) for (const d of e) console.log(`  GREŠKA ${d.code}: ${d.message}`);
  }
  if (check && stale > 0) {
    console.error(`${stale} generiranih datoteka nije ažurno. Pokrenite: pnpm import:all`);
    return 1;
  }
  return errors > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : e);
    process.exit(1);
  },
);
