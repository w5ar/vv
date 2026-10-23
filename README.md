# Simulator vatrogasnih vježbi — Fire Drill Simulator (MVP)

Web-based, interactive **2D schematic** simulator for firefighter training exercises.
One exercise definition drives three modes:

| Mode | Croatian UI | What it does |
| --- | --- | --- |
| Demonstration | *Demonstracija* | Plays the exercise automatically (play/pause/seek/step/speed), animating personnel, equipment and connections. |
| Interactive training | *Vježbanje* | The trainee performs the exercise; every action is validated with contextual feedback and optional hints. |
| Assessment | *Provjera znanja* | Same rules, no hints; records actions, order, incorrect operations and time, then evaluates exercise-defined criteria. |

Plus an **exercise library**, **symbol catalog**, **scene editor** (undo/redo) and **import review** screen.
The UI is in Croatian; code, identifiers and technical documentation are in English. The layout adapts
to tablets and phones (the scene above its panels), and every scene has a **Cijeli zaslon** (full
screen) button that shows the scene with its panels over the whole screen.

## Exercises

| Exercise | Source | Status |
| --- | --- | --- |
| **Vježba 1 – Vježba s dva „C” mlaza vode (šest vatrogasaca)** | `content/source/01-Vjezba-1.md`, sketches 11–15 | 6 stages, 47 steps; demonstration, training and assessment |
| **Vježba 2 – Vježba s jednim „C” mlazom vode (tri vatrogasca)** | `content/source/02-Vjezba-2.md`, sketches 16–19 | 5 stages, 15 steps; applies Vježba 1 where the text says *„kao u vježbi 1”* |
| **Vježba 3 – Vježba s usisnim cijevima (5 vatrogasaca)** | `content/source/03-Vjezba-3.md`, sketches 20–26 | 8 stages, 59 steps; suction line laid, joined while lifted, tied, carried into the water and connected to the pump |
| **Vježba 4 – Vježba s usisnim cijevima (3 vatrogasca)** | `content/source/04-Vjezba-4.md`, sketches 27–36 | 9 stages, 49 steps; the same with the navalna grupa and the strojar, applying Vježba 3 where the text refers to it |
| **Vježba 5 – Vježba s 2 „C” mlaza vode, opskrba vodom iz otvorenog nalazišta (6 vatrogasaca)** | `content/source/05-Vjezba-5.md`, sketches 37–41 | 6 stages, 95 steps; suction line as in Vježba 4 (vodna grupa and strojar), „B” line from the pump and two „C” jets as in Vježba 1 |
| **Vježba 6 – Vježba s 2 „C” mlaza vode, opskrba vodom iz hidrantske mreže (6 vatrogasaca)** | `content/source/06-Vjezba-6.md`, sketches 42–46 | 6 stages, 51 steps; two „B” hoses from the hydrant to the collecting head (*sabirnica*) on the pump, then as Vježbe 5 and 1 |
| **Vježba 7 – Vježba s 1 „C” mlazom vode, opskrba vodom iz otvorenog nalazišta (3 vatrogasca)** | `content/source/07-Vjezba-7.md`, sketches 47–51 | 7 stages, 67 steps; tanker (*autocisterna*): equipment taken from and returned to its compartments, „B” line and jet as in Vježba 2, suction line as in Vježba 4 once the tank is empty |
| **Vježba 8 – Vježba s 1 „C” mlazom vode, opskrba vodom iz hidrantske mreže (3 vatrogasca)** | `content/source/08-Vjezba-8.md`, sketches 52–53 | 5 stages, 17 steps; the strojar fills the tanker from the hydrant through one „B” hose, the navalna grupa works as in Vježba 7 |
| Vježbe 9–15 | `content/source/09-Vjezba-9.md` … `15-Vjezba-15.md`, sketches 54–77 | vendored and analysed (Pregled uvoza); not yet converted |
| Sintetička vježba 01 | `content/synthetic/` | **synthetic** test fixture, not firefighting practice |

The source materials are a copy of the repository `w5ar/VatrogasneVjezbe` (*Vatrogasni vježbovnik*:
introduction, legend, formation, exercises 1–15, SVG symbols, stage sketches and photographs) in
`content/source/`. Step texts and orders are quoted verbatim; positions come from the sketches.

> [!IMPORTANT]
> The linking of text, sketches and simulation commands was done by the development team and
> **awaits review by a firefighting expert** (`review.status: requires-review`). Interpretations
> the text does not state explicitly are listed in [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md);
> findings about the materials are in [`docs/SOURCE_ANALYSIS.md`](docs/SOURCE_ANALYSIS.md).

## Quick start

Requirements: Node.js ≥ 20.19 (tested with 22.x) and pnpm 10 (`corepack enable` provides it).

```bash
pnpm install
pnpm dev               # http://localhost:5173 — the web app
```

Everything runs in the browser; there is no backend.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Vite dev server for `apps/web`. |
| `pnpm build` / `pnpm preview` | Production build (static files in `apps/web/dist`) and local preview. |
| `pnpm import:all` | Run the import pipeline (stages A–F) and write `content/normalized/**` and `content/exercises/**`. |
| `pnpm import:check` | Same, in memory; fails if generated files are stale or any error diagnostic exists (CI). |
| `pnpm typecheck` | Strict TypeScript check of every package, the app, tests and configs. |
| `pnpm test` | Unit tests (Vitest). |
| `pnpm test:e2e` | End-to-end tests (Playwright, Chromium); starts the dev server automatically. |
| `pnpm check` | typecheck + unit tests + import check + build. |

Playwright is pinned to `1.56.1`. In environments without a bundled browser run
`pnpm exec playwright install chromium` once.

## Demonstration sound

The demonstration player offers **Zvuk: Bez zvuka / Zapovijedi / Zapovijedi i opis**. Orders and
reports are spoken by a strict male voice when they are given; with *opis*, a female narrator reads
each step's verbatim text, and the quoted orders in it are spoken by the order voice instead. A
paragraph shared by several steps (*„kao u vježbi 1”*) is read once, at the first of them. Each
step then lasts at least as long as its sound, and voices never overlap.

The clips are generated locally with OpenAI text-to-speech and committed with the content:

```bash
cp .env.example .env                       # enter OPENAI_API_KEY (.env is not committed)
python3 tools/generate_audio.py --dry-run  # what would be generated, characters to send
python3 tools/generate_audio.py            # all exercises; or: python3 tools/generate_audio.py vjezba-1-dva-c-mlaza
```

Requirements: Python ≥ 3.9 (standard library only) and `ffmpeg`/`ffprobe`. The script reads the
audio plans written by `pnpm import:all` and saves `content/exercises/<exercise-id>/<clip-id>.webm`
(e.g. `content/exercises/vjezba-1-dva-c-mlaza/act.prvi-mlaz-naprijed.webm` for an order,
`…/prvi-mlaz.webm` for a step description) plus `zvuk.json` with the durations. Unchanged clips are
skipped on later runs; after editing an exercise, run `pnpm import:all` and the script again
(`--clean` removes clips that are no longer used). Voices, model and speaking instructions can be
changed in `.env` (see `.env.example`). The player ignores clips whose text has changed since they
were generated and says so.

## Deployment (GitHub Pages)

Every commit pushed to `main` is deployed to GitHub Pages by
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): it runs the typecheck,
unit tests and `import:check`, builds `apps/web` and publishes `apps/web/dist`. Pushes to other
branches are not deployed. The site is served at `https://<owner>.github.io/<repository>/`
(here `https://w5ar.github.io/vv/`); the build uses a relative base path and hash routes, so no
per-repository configuration is needed.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Repository layout

```
apps/web/                    React + Vite application (screens, stores, persistence adapters)
packages/
  domain/                    Zod schemas = types for catalog, scene, conditions, commands, exercise,
                             state, events, results, import report; persistence interfaces
  geometry/                  vectors, rotation, placements, bounds, SAT overlap, proximity
  connection-engine/         port world positions, declared compatibility, constraints, snapping
  simulation-engine/         deterministic command/event engine, step state machine, sessions,
                             replay/snapshots, demonstration timeline, assessment, diagnostics
  svg-registry/              SVG sanitizer → JSON AST, CSS inlining, id namespacing, symbol registry
  reactflow-renderer/        React Flow nodes/edges derived from domain state, SVG rendering
  exercise-importer/         Node CLI: import pipeline stages A–F
tools/generate_audio.py      speech generator for demonstration sound (OpenAI TTS)
content/
  source/                                 authoritative source materials (copy of w5ar/VatrogasneVjezbe):
                                          *.md, simboli/, skice/ (+ ugradjeno/), slike/, alati/
  synthetic/source/…                      SYNTHETIC test dataset (not authoritative)
  review/<dataset>/                       human review files (catalog curation, mapping)
  authoring/<dataset>/                    exercise authoring files (*.exercise.json)
  normalized/                             generated pipeline reports (do not edit)
  exercises/                              generated, validated exercises + catalogs (do not edit);
                                          exercises/<id>/: audio plan (pipeline) and generated sound (tools/)
  pipeline.config.json                    datasets processed by the pipeline
docs/                        architecture and process documentation
tests/e2e/                   Playwright tests
```

## Routes

| URL | Screen |
| --- | --- |
| `#/` | Knjižnica vježbi — exercise library |
| `#/katalog` | Katalog simbola — symbols, ports, anchors, rotation, states, rules |
| `#/uredivac/<id>` | Uređivač — scene editor (unlock, drag, rotate, connect, undo/redo, draft, JSON export) |
| `#/demonstracija/<id>` | Demonstration player |
| `#/vjezbanje/<id>` | Interactive training |
| `#/provjera/<id>` | Assessment |
| `#/uvoz` | Pregled uvoza — import review |

## Updating the source materials and adding exercises

1. Update `content/source/` from the source repository (never edit the files by hand; record the
   commit in `content/source/README.md`). Directories are configured in `content/pipeline.config.json`.
2. Run `pnpm import:all` and open **Pregled uvoza**: inventory, symbols (names from the legend),
   sketch analysis (instances, facing, laid lines), step candidates with verbatim text and the
   mapping status of every candidate.
3. Curate `content/review/source/catalog.review.json` (ports, compatibility rules, equipment types,
   roles — all with source references) and write `content/authoring/source/<id>.exercise.json`;
   ignore non-step paragraphs with a reason in `content/review/source/mapping.review.json`.
4. Run `pnpm import:all` again until diagnostics are clean; the exercise appears in the library.

Details: [`docs/IMPORT_PIPELINE.md`](docs/IMPORT_PIPELINE.md) and [`docs/EXERCISE_AUTHORING.md`](docs/EXERCISE_AUTHORING.md).

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, boundaries and design decisions
- [DATA_MODEL.md](docs/DATA_MODEL.md) — domain model and JSON schemas
- [IMPORT_PIPELINE.md](docs/IMPORT_PIPELINE.md) — conversion of source materials (stages A–F)
- [EXERCISE_AUTHORING.md](docs/EXERCISE_AUTHORING.md) — adding and editing exercises
- [SOURCE_ANALYSIS.md](docs/SOURCE_ANALYSIS.md) — findings about the provided materials
- [OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) — ambiguities requiring domain-expert confirmation

## License

AGPL-3.0 — see [LICENSE](LICENSE).
