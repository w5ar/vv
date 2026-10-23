import { describe, expect, it } from 'vitest';
import { CatalogSchema, ExerciseSchema } from '@fds/domain';
import { sanitizeSvg } from '@fds/svg-registry';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './pipeline';
import { analyzeDiagram } from './stage-c-diagrams';
import { analyzeProcedure, buildLexicon } from './stage-d-procedures';
import { compileExercise } from './stage-f-compile';
import { findRepoRoot, slugify } from './util';

const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

describe('slugify', () => {
  it('transliterates Croatian letters', () => {
    expect(slugify('Faza 2 – Postavljanje mlaznica')).toBe('faza-2-postavljanje-mlaznica');
    expect(slugify('Čišćenje ždrijela đ')).toBe('ciscenje-zdrijela-d');
  });
});

describe('stage D – procedures', () => {
  const md = `# Postupak

## Sudionici i uloge

- **Voditelj** – vodi.
- **Nepoznata uloga** – nešto.

## Tijek

3. Voditelj daje znak; vidi [crtež](../diagrams/a.svg).
4. Drugi korak s **naglaskom**.
`;
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    id: 'k',
    name: 'K',
    roles: [{ id: 'role.v', name: 'Voditelj (test)' }],
  });

  it('extracts numbered steps verbatim with stable ids and line numbers', () => {
    const { analysis, diagnostics } = analyzeProcedure('content/x/procedures/postupak.md', md, buildLexicon(catalog, null), new Set());
    expect(analysis.title).toBe('Postupak');
    expect(analysis.steps.map((s) => s.id)).toEqual(['postupak#tijek/3', 'postupak#tijek/4']);
    expect(analysis.steps[0]).toMatchObject({ line: 10, roleMentions: ['role.v'], sectionPath: ['Postupak', 'Tijek'] });
    expect(analysis.steps[1]?.text).toBe('Drugi korak s **naglaskom**.');
    expect(analysis.diagramRefs[0]).toMatchObject({ target: '../diagrams/a.svg', resolvedFile: null });
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain('procedure.unresolved-reference');
    expect(diagnostics.find((d) => d.code === 'mapping.unresolved-role')?.message).toContain('Nepoznata uloga');
  });
});

describe('stage C – diagrams', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
    <g id="L1" inkscape:groupmode="layer" inkscape:label="Faza A" transform="translate(10 0)">
      <g id="a" data-symbol="s.known" data-instance="obj-1" transform="translate(100 50) rotate(90)"><rect/></g>
      <g id="b" data-symbol="s.unknown"><rect/></g>
      <g id="c" inkscape:label="Poznati (sintetički)"><rect/></g>
      <line data-connect-from="obj-1#p" data-connect-to="obj-2#q"/>
      <text x="5" y="6">Natpis</text>
    </g></svg>`;
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    id: 'k',
    name: 'K',
    categories: [{ id: 'c', name: 'C' }],
    symbols: [{ id: 's.known', name: 'Poznati', category: 'c', asset: { path: 'x.svg' }, size: { width: 1, height: 1 } }],
  });

  it('prefers metadata, flags heuristic and unresolved instances, accumulates transforms', () => {
    const r = sanitizeSvg(svg);
    if (!r.ok) throw new Error(r.error);
    const { analysis, diagnostics } = analyzeDiagram('d.svg', r.root, catalog);
    expect(analysis.stages).toEqual([{ stageId: 'L1', label: 'Faza A', elementId: 'L1' }]);
    const [a, b, c] = analysis.instances;
    expect(a).toMatchObject({ instanceId: 'obj-1', symbolId: 's.known', confidence: 'metadata', position: { x: 110, y: 50 }, rotation: 90 });
    expect(b).toMatchObject({ symbolId: null, rawRef: 's.unknown', confidence: 'unresolved' });
    expect(c).toMatchObject({ symbolId: 's.known', confidence: 'heuristic' });
    expect(analysis.connections[0]).toMatchObject({ from: 'obj-1#p', to: 'obj-2#q', stageId: 'L1', confidence: 'metadata' });
    expect(analysis.labels[0]).toMatchObject({ text: 'Natpis', position: { x: 15, y: 6 } });
    expect(analysis.flattened).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['diagram.unknown-symbol', 'diagram.heuristic-instance']));
  });
});

describe('full pipeline on repository content', async () => {
  const { report, outputs } = await runPipeline(repoRoot);
  const synthetic = report.datasets.find((d) => d.id === 'synthetic')!;
  const source = report.datasets.find((d) => d.id === 'source')!;

  it('reports the empty authoritative source directory explicitly', () => {
    expect(source.inventory).toEqual([]);
    expect(source.diagnostics.map((d) => d.code)).toContain('source.empty');
  });

  it('compiles the synthetic exercise without errors and with full traceability', () => {
    expect(synthetic.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(synthetic.compiled).toHaveLength(1);
    const info = synthetic.compiled[0]!;
    expect(info).toMatchObject({ ok: true, stepCount: 8, tracedStepCount: 8, demoReachesCompletion: true });
    expect(synthetic.mapping.every((m) => m.status === 'mapped')).toBe(true);
    const exercise = ExerciseSchema.parse(JSON.parse(outputs.get('content/exercises/sinteticka-vjezba-01.json')!));
    expect(exercise.synthetic).toBe(true);
    for (const step of exercise.steps) {
      expect(step.sources[0]?.file).toBe('content/synthetic/source/procedures/sinteticka-vjezba-01.md');
      expect(step.text).toBe(step.sources[0]?.excerpt);
    }
    // Initial positions come from the diagram's first stage layer.
    const vehicle = exercise.initialScene.equipment.find((e) => e.id === 'vozilo');
    expect(vehicle?.sources[0]).toEqual({ file: 'content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg', anchor: 'f1-vozilo' });
  });

  it('flags flattened diagrams and heuristic recognition for review', () => {
    const codes = synthetic.diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['diagram.flattened', 'diagram.heuristic-instance', 'diagram.unresolved-instance']));
  });

  it('produces deterministic outputs', async () => {
    const again = await runPipeline(repoRoot);
    expect([...again.outputs.entries()]).toEqual([...outputs.entries()]);
  });
});

describe('stage F – compile diagnostics', async () => {
  const { report } = await runPipeline(repoRoot);
  const ds = report.datasets.find((d) => d.id === 'synthetic')!;
  const catalog = CatalogSchema.parse(JSON.parse(await readFile(path.join(repoRoot, 'content/exercises/catalogs/katalog-sinteticki.json'), 'utf8')));
  const ctx = {
    dataset: { id: 'synthetic', name: 's', synthetic: true, sourceRoot: 'content/synthetic/source', reviewDir: '', authoringDir: '' },
    catalog,
    diagrams: ds.diagrams,
    procedures: ds.procedures,
    inventory: ds.inventory,
  };
  // Free-form authoring JSON, mutated by the tests below.
  const authoring = JSON.parse(await readFile(path.join(repoRoot, 'content/authoring/synthetic/sinteticka-vjezba-01.exercise.json'), 'utf8')) as Record<string, any>;

  it('detects diagram position mismatches and unknown candidates', () => {
    const tweaked = structuredClone(authoring);
    // Move the final placement of the distributor away from the diagram's final position.
    tweaked.steps[1].script[2].command.at = { x: 570, y: 300 };
    tweaked.steps[0].source = 'sinteticka-vjezba-01#ne-postoji/1';
    const r = compileExercise('a.exercise.json', tweaked, ctx);
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toContain('diagram.position-mismatch');
    expect(codes).toContain('mapping.unknown-candidate');
  });

  it('reports schema errors for invalid authoring data without throwing', () => {
    const broken = structuredClone(authoring);
    broken.steps[0].completedWhen = { type: 'teleported' };
    const r = compileExercise('b.exercise.json', broken, ctx);
    expect(r.exercise).toBeNull();
    expect(r.diagnostics.some((d) => d.code === 'schema.exercise' && d.path?.startsWith('steps[0].completedWhen'))).toBe(true);
  });

  it('reports missing diagram positions', () => {
    const broken = structuredClone(authoring);
    broken.initialScene.personnel.push({ id: 'duh', symbolId: 'syn.osoba' });
    const r = compileExercise('c.exercise.json', broken, ctx);
    expect(r.diagnostics.map((d) => d.code)).toContain('mapping.missing-position');
  });
});
