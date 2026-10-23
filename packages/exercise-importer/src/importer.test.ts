import { describe, expect, it } from 'vitest';
import { AudioPlanSchema, CatalogSchema, ExerciseSchema } from '@fds/domain';
import { sanitizeSvg } from '@fds/svg-registry';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './pipeline';
import { analyzeDiagram } from './stage-c-diagrams';
import { analyzeProcedure, buildLexicon } from './stage-d-procedures';
import { stripComments } from './review-files';
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
    const { analysis, diagnostics } = analyzeProcedure('content/x/procedures/postupak.md', md, buildLexicon(catalog, null), new Map());
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

describe('stage D – prose procedures (source convention)', () => {
  const md = `# Vježba

Ovu vježbu izvodi odjeljenje:

- vođa grupe (V₁),
- strojar (S).

Za izvođenje vježbe potrebna je oprema:

- 2 „C” mlaznice,
- 1 nepoznata sprava.

#### Polaganje

Vođa grupe (V₁) uzima mlaznicu i zapovijeda: **„Vodu daj!”**

![Skica 1](skice/a.svg)

**Skica 1** – *Položaj*

- strojar (S) otvara ventil.
`;
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    id: 'k',
    name: 'K',
    categories: [{ id: 'c', name: 'C' }],
    symbols: [{ id: 's.m', name: 'Mlaznica', category: 'c', asset: { path: 'm.svg' }, size: { width: 1, height: 1 } }],
    equipmentTypes: [{ id: 'et.m', name: 'Mlaznica', symbolId: 's.m' }],
    roles: [
      { id: 'role.v1', name: 'Vođa grupe' },
      { id: 'role.s', name: 'Strojar' },
    ],
  });
  const review = {
    terms: { roles: { 'role.v1': ['vođa grupe', 'V₁'], 'role.s': ['strojar', '(S)'] }, symbols: {}, equipment: { 'et.m': ['„C” mlaznice'] } },
  } as unknown as Parameters<typeof buildLexicon>[1];

  it('uses paragraphs and list items as candidates and extracts participants, equipment and orders', () => {
    const { analysis, diagnostics } = analyzeProcedure('content/x/vjezba.md', md, buildLexicon(catalog, review), new Map());
    expect(analysis.steps.map((c) => [c.id, c.kind])).toEqual([
      ['vjezba#vjezba/p1', 'paragraph'],
      ['vjezba#vjezba/p2', 'paragraph'],
      ['vjezba#polaganje/p1', 'paragraph'],
      ['vjezba#polaganje/l1', 'list-item'],
    ]);
    expect(analysis.participants.map((p) => [p.abbreviation, p.roleIds])).toEqual([
      ['V₁', ['role.v1']],
      ['S', ['role.s']],
    ]);
    expect(analysis.equipmentList.map((e) => [e.quantity, e.equipmentTypeIds])).toEqual([
      [2, ['et.m']],
      [1, []],
    ]);
    expect(analysis.orders).toEqual([{ text: 'Vodu daj!', line: 15, candidateId: 'vjezba#polaganje/p1' }]);
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain('mapping.unresolved-equipment');
    expect(diagnostics.find((d) => d.code === 'procedure.candidate-mode')?.message).toContain('odlomci');
  });

  it('keeps only numbered items when a document has numbered steps', () => {
    const { analysis } = analyzeProcedure('content/x/b.md', `# B\n\nUvod.\n\n1. Prvi korak.\n2. Drugi korak.\n`, buildLexicon(catalog, null), new Map());
    expect(analysis.steps.map((c) => c.kind)).toEqual(['numbered', 'numbered']);
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

describe('stage C – sketches with image references (source convention)', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 200">
    <g transform="translate(125,100)"><image href="../simboli/smjer.svg" x="-7" y="-2" width="14" height="4"/></g>
    <g transform="translate(100,100)"><image href="../simboli/osoba.svg" x="-20" y="-20" width="40" height="40"/></g>
    <g transform="translate(200,50) rotate(-90)"><image href="../simboli/kolut.svg" x="-36" y="-5" width="72" height="10"/></g>
    <path d="M10,10 L50,10 L50,80" fill="none" stroke="#1a1a1a" stroke-width="2.6"/>
  </svg>`;
  const sym = (id: string, file: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: id,
    category: 'c',
    asset: { path: `content/x/simboli/${file}` },
    size: { width: 40, height: 40 },
    ...extra,
  });
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    id: 'k',
    name: 'K',
    categories: [{ id: 'c', name: 'C' }],
    symbols: [
      sym('s.smjer', 'smjer.svg', { annotation: true }),
      sym('s.osoba', 'osoba.svg', { directionMarker: { symbolId: 's.smjer', distance: 25 } }),
      sym('s.kolut', 'kolut.svg'),
    ],
    equipmentTypes: [{ id: 'et.b', name: 'B', symbolId: 's.kolut', form: 'hose', hoseEnds: ['a', 'b'], depiction: { laidLineStrokeWidth: 2.6 } }],
  });

  it('resolves image references to symbols, attaches facing markers and classifies line styles', () => {
    const r = sanitizeSvg(svg);
    if (!r.ok) throw new Error(r.error);
    const { analysis } = analyzeDiagram('content/x/skice/s.svg', r.root, catalog);
    const person = analysis.instances.find((i) => i.symbolId === 's.osoba');
    expect(person).toMatchObject({ key: 'osoba@100,100', position: { x: 100, y: 100 }, facing: 0, confidence: 'metadata' });
    expect(analysis.instances.find((i) => i.symbolId === 's.smjer')?.attachedTo).toBe('osoba@100,100');
    expect(analysis.instances.find((i) => i.symbolId === 's.kolut')).toMatchObject({ key: 'kolut@200,50', rotation: 270 });
    expect(analysis.lines).toEqual([
      expect.objectContaining({ from: { x: 10, y: 10 }, to: { x: 50, y: 80 }, strokeWidth: 2.6, equipmentTypeId: 'et.b' }),
    ]);
  });
});

describe('review files', () => {
  it('strips comments but keeps authoring directives', () => {
    expect(stripComments({ $comment: 'x', a: [{ $note: 1, b: { $diagramPoint: 'f.svg#k', offset: { x: 1, y: 2 } } }] })).toEqual({
      a: [{ b: { $diagramPoint: 'f.svg#k', offset: { x: 1, y: 2 } } }],
    });
  });
});

describe('full pipeline on repository content', async () => {
  const { report, outputs } = await runPipeline(repoRoot);
  const synthetic = report.datasets.find((d) => d.id === 'synthetic')!;
  const source = report.datasets.find((d) => d.id === 'source')!;

  // Source exercises and the procedure file each one is built from.
  const SOURCE_EXERCISES = [
    ['vjezba-1-dva-c-mlaza', '01-Vjezba-1.md'],
    ['vjezba-2-jedan-c-mlaz', '02-Vjezba-2.md'],
    ['vjezba-3-usisne-cijevi', '03-Vjezba-3.md'],
    ['vjezba-4-usisne-cijevi', '04-Vjezba-4.md'],
    ['vjezba-5-otvoreno-nalaziste', '05-Vjezba-5.md'],
  ] as const;

  it('compiles the source exercises without errors and with full traceability', () => {
    expect(source.inventory.length).toBeGreaterThan(90);
    expect(source.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(source.compiled.map((c) => [c.exerciseId, c.ok, c.demoReachesCompletion, c.stepCount === c.tracedStepCount])).toEqual(
      SOURCE_EXERCISES.map(([id]) => [id, true, true, true]),
    );
    // Every step candidate is either mapped to a step or deliberately ignored with a reason.
    expect(source.mapping.filter((m) => m.status === 'unmapped')).toEqual([]);
    expect(source.diagnostics.map((d) => d.code)).not.toContain('mapping.unmapped-step');
    for (const [id, file] of SOURCE_EXERCISES) {
      const exercise = ExerciseSchema.parse(JSON.parse(outputs.get(`content/exercises/${id}.json`)!));
      expect(exercise.synthetic).toBe(false);
      expect(exercise.review.status).toBe('requires-review');
      for (const step of exercise.steps) {
        expect(step.sources[0]?.file).toBe(`content/source/${file}`);
        expect(step.text).toBe(step.sources[0]?.excerpt);
      }
      // Initial positions are traced to instances of the stage sketch.
      expect(exercise.initialScene.personnel.every((p) => p.sources.some((s) => s.file.includes('/skice/') && s.anchor?.includes('@')))).toBe(true);
    }
  });

  it('writes an audio plan per exercise: orders by action id, descriptions split at the quoted orders', () => {
    const plan = AudioPlanSchema.parse(JSON.parse(outputs.get('content/exercises/vjezba-1-dva-c-mlaza/zvuk.plan.json')!));
    const clip = (id: string) => plan.clips.find((c) => c.id === id);
    expect(clip('act.prvi-mlaz-naprijed')).toMatchObject({ voice: 'zapovijed', text: 'Za prvi mlaz s dvije „C” cijevi pravac …… naprijed!' });
    expect(plan.steps['zapovijed-za-navalu']).toEqual([
      { clipId: 'zapovijed-za-navalu' },
      { clipId: 'act.za-navalu', actionId: 'act.za-navalu' },
    ]);
    expect(clip('zapovijed-za-navalu')?.text).toMatch(/a zatim izdaje zapovijed koja glasi:$/);
    expect(plan.clips.filter((c) => c.voice === 'zapovijed')).toHaveLength(20);
    // Every spoken order is quoted from its sources, except the two resolved from „Prvi, odnosno drugi mlaz…”
    // (Vježba 1, and Vježba 5, which applies it).
    const notVerbatim = source.diagnostics.filter((d) => d.code === 'audio.speech-not-verbatim').map((d) => d.subjectId);
    expect(new Set(notVerbatim)).toEqual(new Set(['act.vodom-stoj-prvi', 'act.vodom-stoj-drugi']));
  });

  it('verifies all excerpts of source references against the source texts', () => {
    expect(source.diagnostics.filter((d) => d.code.startsWith('trace.'))).toEqual([]);
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
    dataset: { id: 'synthetic', name: 's', synthetic: true, sourceRoot: 'content/synthetic/source', reviewDir: '', authoringDir: '', layout: { symbols: ['symbols'], diagrams: ['diagrams'], renderCopies: [] } },
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

describe('stage F – source exercise checks', async () => {
  const { report } = await runPipeline(repoRoot);
  const ds = report.datasets.find((d) => d.id === 'source')!;
  const catalog = CatalogSchema.parse(JSON.parse(await readFile(path.join(repoRoot, 'content/exercises/catalogs/katalog-vjezbovnik.json'), 'utf8')));
  const ctx = {
    dataset: { id: 'source', name: 's', synthetic: false, sourceRoot: 'content/source', reviewDir: '', authoringDir: '', layout: { symbols: ['simboli'], diagrams: ['skice'], renderCopies: [] } },
    catalog,
    diagrams: ds.diagrams,
    procedures: ds.procedures,
    inventory: ds.inventory,
  };
  const authoring = JSON.parse(await readFile(path.join(repoRoot, 'content/authoring/source/vjezba-1.exercise.json'), 'utf8')) as Record<string, any>;
  const stepIndex = (id: string) => authoring.steps.findIndex((s: { id: string }) => s.id === id);

  it('resolves diagram keys with a frame translation and diagram points with traceable sources', () => {
    const r = compileExercise('v.exercise.json', structuredClone(authoring), ctx);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ex = r.exercise!;
    // Sketch 11 hydrant 330,430 shifted by (-180,-170) into the exercise frame.
    const hydrant = ex.initialScene.equipment.find((e) => e.id === 'hidrant')!;
    expect(hydrant.position).toEqual({ x: 150, y: 260 });
    expect(hydrant.sources).toContainEqual({ file: 'content/source/skice/01-skica-11.svg', anchor: 'podzemni-hidrant@330,430' });
    const z = ex.initialScene.personnel.find((p) => p.id === 'z')!;
    expect(z.rotation).toBe(270); // facing marker
    const step = ex.steps.find((s) => s.id === 'polaganje-b-prva')!;
    const lay = step.script.find((c) => c.command.type === 'LayHose')!.command as { to: unknown };
    expect(lay.to).toEqual({ x: 346.866, y: 350 });
    expect(step.sources).toContainEqual({ file: 'content/source/skice/01-skica-13.svg', anchor: 'spojnica-b@346.9,350' });
  });

  it('reports unknown diagram points and keys', () => {
    const broken = structuredClone(authoring);
    broken.initialScene.personnel[0].diagramKey = 'nema@1,1';
    broken.steps[stepIndex('nastavak')].script[0].command.to = { $diagramPoint: 'skice/01-skica-13.svg#nema@0,0' };
    const codes = compileExercise('v.exercise.json', broken, ctx).diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['mapping.unknown-diagram-key', 'mapping.unknown-diagram-point']));
  });

  it('compares schematic stages by what the sketch shows', () => {
    const tweaked = structuredClone(authoring);
    // Sketch 12 shows a laid „B” line; without laying any „B” hose the stage no longer matches it.
    for (const id of ['polaganje-b-prva', 'polaganje-b-druga']) {
      const i = stepIndex(id);
      tweaked.steps[i].script = tweaked.steps[i].script.filter((c: { command: { type: string } }) => c.command.type !== 'LayHose');
    }
    const r = compileExercise('v.exercise.json', tweaked, ctx);
    const mismatches = r.diagnostics.filter((d) => d.code === 'diagram.lines-mismatch' && d.message.includes('faza.za-navalu'));
    expect(mismatches.map((d) => d.subjectId)).toEqual(['et.tlacna-b-cijev']);
    // The unmodified exercise matches all its sketches.
    const clean = compileExercise('v.exercise.json', structuredClone(authoring), ctx);
    expect(clean.diagnostics.filter((d) => d.code.startsWith('diagram.'))).toEqual([]);
  });

  it('checks the initial scene against the participant and equipment lists', () => {
    const tweaked = structuredClone(authoring);
    tweaked.initialScene.equipment = tweaked.initialScene.equipment.filter((e: { id: string }) => e.id !== 'b3');
    tweaked.initialScene.personnel = tweaked.initialScene.personnel.filter((p: { id: string }) => p.id !== 'v2');
    const r = compileExercise('v.exercise.json', tweaked, ctx);
    const codes = r.diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['exercise.equipment-count-mismatch', 'exercise.participant-missing']));
    expect(r.diagnostics.find((d) => d.code === 'exercise.equipment-count-mismatch')?.source).toMatchObject({ line: 20 });
  });
});
