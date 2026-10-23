# Simulator vatrogasnih vježbi — Fire Drill Simulator (MVP)

Web-based, interactive **2D schematic** simulator for firefighter training exercises.
One exercise definition drives three modes:

| Mode | Croatian UI | What it does |
| --- | --- | --- |
| Demonstration | *Demonstracija* | Plays the exercise automatically (play/pause/seek/step/speed), animating personnel, equipment and connections. |
| Interactive training | *Vježbanje* | The trainee performs the exercise; every action is validated with contextual feedback and optional hints. |
| Assessment | *Provjera znanja* | Same rules, no hints; records actions, order, incorrect operations and time, then evaluates exercise-defined criteria. |

Plus an **exercise library**, **symbol catalog**, **scene editor** (undo/redo) and **import review** screen.
The UI is in Croatian; code, identifiers and technical documentation are in English.

> [!IMPORTANT]
> **No source materials were present in this repository** when the MVP was built
> (only `LICENSE`). There were no SVG symbols, exercise diagrams or Markdown
> procedures to analyse. Therefore **no real exercise could be imported**. All
> content shipped here is a clearly labelled **synthetic** dataset
> (`content/synthetic/`) whose only purpose is to exercise every subsystem.
> It is *not* firefighting doctrine. See [`docs/SOURCE_ANALYSIS.md`](docs/SOURCE_ANALYSIS.md)
> and [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

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
content/
  source/{symbols,diagrams,procedures}/   authoritative source materials (EMPTY — add yours here)
  synthetic/source/…                      SYNTHETIC test dataset (not authoritative)
  review/<dataset>/                       human review files (catalog curation, mapping)
  authoring/<dataset>/                    exercise authoring files (*.exercise.json)
  normalized/                             generated pipeline reports (do not edit)
  exercises/                              generated, validated exercises + catalogs (do not edit)
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

## Adding the real source materials

1. Copy SVG symbols to `content/source/symbols/`, exercise diagrams to `content/source/diagrams/`
   and Markdown procedures to `content/source/procedures/`.
2. Run `pnpm import:all` and open **Pregled uvoza**: you get an inventory, symbol proposals
   (without assigned meaning), diagram recognition results and step candidates with verbatim text.
3. Curate `content/review/source/catalog.review.json` (names, categories, ports, compatibility
   rules, roles — all with source references) and write an exercise in
   `content/authoring/source/<id>.exercise.json`.
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
