# Import pipeline

`packages/exercise-importer` converts source materials into validated exercise JSON in six stages.
It never modifies source files and never silently assigns meaning: anything inferred is a
*proposal* with `provenance: derived` / `review.status: requires-review`, and every output points
back to a file, line, heading or SVG element.

```bash
pnpm import:all      # run A–F, write outputs
pnpm import:check    # run in memory; exit 1 if outputs are stale or any error diagnostic exists
```

## Datasets

`content/pipeline.config.json` lists the datasets processed in each run:

| Dataset | Source root | Status |
| --- | --- | --- |
| `source` | `content/source` | **Authoritative materials — currently empty** |
| `synthetic` | `content/synthetic/source` | Synthetic test fixture (labelled everywhere) |

Each dataset has a source root (`symbols/`, `diagrams/`, `procedures/`), a review directory and an
authoring directory. `README.md` files inside source roots are ignored.

## Stage A — asset discovery (`stage-a-discover.ts`)

Scans the source root and classifies files: `symbol-svg` (in `symbols/`), `diagram-svg` (in
`diagrams/`, or SVGs elsewhere containing layers / `data-symbol`), `procedure-md`, `raster-image`,
`pdf`, `other`.

For each file: size, SHA-256, duplicates (same hash), and for SVG: width/height/viewBox, title and
description, element counts, groups (id, Inkscape label, depth, child count, layer flag, `data-*`
attributes), ids, referenced assets (external `href`s and `<use>` targets), texts, what the
sanitizer removed, parse errors, possible symbol identifiers (file name, root id, title, top-level
group ids). Markdown: title, heading count, numbered items, links, images.

Diagnostics: `source.empty`, `svg.malformed`, `svg.sanitized`, `asset.duplicate`,
`asset.unsupported-format` (raster/PDF are kept as references for manual work), `asset.unknown-type`.

Output: `content/normalized/<dataset>/inventory.json`.

## Stage B — symbol normalization (`stage-b-symbols.ts`)

Merges the inventory with the human-maintained `content/review/<dataset>/catalog.review.json`:

- **Reviewed entries** become catalog symbols as written (name, category, size, ports, anchors,
  rotation, visual states, semantics, provenance, review, sources). One SVG may back several symbol
  definitions; `elementId` + `viewBox` extract one symbol from a multi-symbol sheet.
- **Unreviewed SVGs** become proposals: id `src.<file-slug>`, name only from `<title>` or file name,
  category `nerazvrstano` (unclassified), no ports, `requires-review`. They are visible in the
  catalog but carry no semantics.

The review file also contains port types, connection rules, equipment types, roles and a `terms`
lexicon (see stage D). Keys starting with `$` are comments.

Each symbol is prepared with the SVG registry (sanitize → extract → viewBox → namespace) to catch
broken assets early. Without a review file no catalog is produced (`review.missing-catalog`).

Outputs: `symbols.proposed.json`, `content/exercises/catalogs/<catalogId>.json`.
Diagnostics: `symbol.missing-asset`, `symbol.missing-element`, `symbol.unreviewed`,
`symbol.prepare-failed`, catalog checks (`ref.unknown-category`, `ref.unknown-port-type`,
`geometry.port-outside`, `id.duplicate`, …).

## Stage C — diagram analysis (`stage-c-diagrams.ts`)

Recognition priority, most reliable first:

1. **Explicit metadata** (preferred):
   - stage layer: `<g inkscape:groupmode="layer" inkscape:label="…">` or `<g data-stage="faza-1">`
   - symbol instance: `<g data-symbol="<catalog symbol id>" data-instance="<object id>" transform="…">`
     drawn in symbol-local coordinates **centred on the pivot**
   - connection: any element with `data-connect-from="obj#port" data-connect-to="obj#port"`
2. **Heuristic**: a direct child group of a stage layer whose label equals a catalog symbol name
   (ignoring parenthetical qualifiers) — reported as `diagram.heuristic-instance` for review.
3. **Unresolved**: other direct child groups — `diagram.unresolved-instance`.

Positions and rotations come from the accumulated transform matrix (`translate`, `rotate`,
`matrix`, `scale`, `skew`); scaled or skewed instances are flagged. Texts become labels with
positions. A diagram with drawing primitives but no recognised instances is **flattened**
(`diagram.flattened`): the original is kept and shown in the review screen, no recognition is
attempted from pixels.

Example (synthetic):

```xml
<g id="faza-2" inkscape:groupmode="layer" inkscape:label="Faza 2 – završni raspored" data-stage="faza-2">
  <line data-connect-from="vozilo#izlaz-1" data-connect-to="cijev-velika#kraj-a" …/>
  <g id="f2-razdjelnik" data-symbol="syn.razdjelnik" data-instance="razdjelnik" transform="translate(560 300)">…</g>
</g>
```

Output: `diagrams.json`.

## Stage D — procedure analysis (`stage-d-procedures.ts`)

Parses Markdown with `mdast-util-from-markdown`, preserving:

- headings and a section tree (`id` = transliterated slug, `path`, line);
- paragraphs and list items (verbatim source text + line);
- **numbered list items → step candidates** with stable ids
  `<file-slug>#<section-slug>/<number>` (e.g. `sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/5`),
  verbatim text, line range, section path;
- links/images to diagrams, resolved against the inventory (`procedure.unresolved-reference`);
- role and equipment mentions, detected **only** from an explicit lexicon: normalized catalog names
  plus `terms.roles` / `terms.symbols` from the review file (no morphological guessing — Croatian
  inflections such as *voditelju* must be listed explicitly);
- in sections titled *uloge / sudionici / sastav*, bold leading terms that match no catalog role
  are reported as `mapping.unresolved-role`.

Candidates are **proposals**; they become steps only through an authoring file (stage E/F).

Output: `procedures.json`.

## Stage E — mapping and review (`stage-e-mapping.ts`)

Links candidates to authored steps (`steps[].source` in authoring files) and to
`content/review/<dataset>/mapping.review.json`:

```json
{ "ignored": [{ "candidateId": "…#napomene/1", "reason": "Napomena, nije korak postupka." }] }
```

Every candidate ends up `mapped`, `ignored` (with a reason) or `unmapped` (`mapping.unmapped-step`
warning — missing steps are never inferred). `mapping.template.json` contains skeleton step entries
for unmapped candidates, with `$todo` markers where a human must define conditions and scripts.

Outputs: `mapping.json`, `mapping.template.json`.

## Stage F — exercise compilation (`stage-f-compile.ts`)

For every `content/authoring/<dataset>/*.exercise.json`:

1. Strip `$comment` keys; prefix dataset-relative `file` paths with the source root.
2. `initialScene.fromDiagram: { file, stage }` — objects without `position` get position and rotation
   from the diagram instance with the same `data-instance` in that stage; the SVG element id is
   added to the object's `sources` (`mapping.missing-position` if absent,
   `diagram.symbol-mismatch` if the diagram names another symbol).
3. `steps[].source: "<candidate id>"` — the compiler copies the **verbatim** text into `text` and
   adds a source reference with line range and excerpt (`mapping.unknown-candidate`,
   `trace.text-overridden`, `mapping.role-mismatch`).
4. Validate against `ExerciseSchema` (`schema.exercise` with JSON paths).
5. Semantic and dynamic checks (`checkExercise`): unknown symbols/objects/roles/zones/ports/steps,
   duplicate ids, dependency cycles (`step.dependency-cycle`), unknown dependencies, invalid
   initial connections, demonstration commands that are rejected (`demo.command-rejected`),
   steps the demo does not complete, unreachable completion (`completion.unreachable`), concurrent
   animation of one object, steps without source references (`trace.missing-source`).
6. Diagram consistency: for each stage with a diagram, the demonstration state at the stage's
   start/end is compared with the diagram layer — positions/rotations (`diagram.position-mismatch`,
   `diagram.rotation-mismatch`), connections drawn but not in the state
   (`diagram.connection-missing`, i.e. unspecified connections) and vice versa.
7. Write `content/exercises/<id>.json` with `build` info (authoring file, SHA-256 of all referenced
   sources, diagnostics) and update `content/exercises/index.json`.

Unsupported commands (unknown `type`) fail schema validation in step 4.

## Outputs

```
content/normalized/
  import-report.json              ← consumed by the "Pregled uvoza" screen
  <dataset>/inventory.json  symbols.proposed.json  diagrams.json  procedures.json
            mapping.json    mapping.template.json  diagnostics.json  REPORT.md
content/exercises/
  index.json  <exercise>.json  catalogs/<catalog>.json
```

All outputs are deterministic (no timestamps), so `pnpm import:check` can detect stale files in CI.

## Current results

- `source`: 0 files → `source.empty` warning. Nothing to import.
- `synthetic`: 9 files, 8 symbols (all reviewed as synthetic), 2 diagrams (one with two stage
  layers: 22 metadata instances + 1 heuristic + 1 unresolved; one flattened), 1 procedure with 8 numbered
  steps — all 8 mapped and traced; 1 exercise compiled with 0 errors; the demonstration
  (34 commands, 20.3 s) reaches completion and matches both diagram layers exactly.
  See `content/normalized/synthetic/REPORT.md`.
