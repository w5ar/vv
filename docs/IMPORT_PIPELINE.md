# Import pipeline

`packages/exercise-importer` converts source materials into validated exercise JSON in six stages.
It never modifies source files and never silently assigns meaning: anything inferred is a
*proposal* with `provenance: derived` / `review.status: requires-review`, and every output points
back to a file, line, heading or SVG element. Excerpts quoted as sources are verified against the
source texts on every run.

```bash
pnpm import:all      # run A–F, write outputs
pnpm import:check    # run in memory; exit 1 if outputs are stale or any error diagnostic exists
```

## Datasets

`content/pipeline.config.json` lists the datasets processed in each run:

| Dataset | Source root | Content |
| --- | --- | --- |
| `source` | `content/source` | Authoritative materials: copy of `w5ar/VatrogasneVjezbe` (see SOURCE_ANALYSIS.md) |
| `synthetic` | `content/synthetic/source` | Synthetic test fixture (labelled everywhere) |

Each dataset has a source root, a review directory and an authoring directory, and an optional
`layout` telling stage A where things are:

```jsonc
"layout": {
  "symbols": ["simboli"],                                 // default ["symbols"]
  "diagrams": ["skice"],                                  // default ["diagrams"]
  "renderCopies": [{ "dir": "skice/ugradjeno", "of": "skice" }]   // generated copies of diagrams
}
```

`README.md` files inside source roots are ignored.

## Stage A — asset discovery (`stage-a-discover.ts`)

Scans the source root and classifies files: `symbol-svg` (under a symbols directory),
`diagram-svg` (under a diagrams directory, or SVGs elsewhere containing layers / `data-symbol`),
`procedure-md`, `raster-image`, `pdf`, `other`. Files in a render-copy directory are recorded with
`renderCopyOf` = the same-named file in the original directory (`asset.render-copy-orphan` if it
does not exist); they are verified in stage C instead of being analysed twice.

For each file: size, SHA-256, duplicates (same hash), and for SVG: width/height/viewBox, title and
description, element counts, groups, ids, referenced assets (external `href`s and `<use>` targets),
texts, what the sanitizer removed, parse errors, possible symbol identifiers. Markdown: title,
heading count, numbered items, links, images. Text files (Markdown, `.py`) are kept in memory for
excerpt verification.

Diagnostics: `source.empty`, `svg.malformed`, `svg.sanitized`, `asset.duplicate`,
`asset.unsupported-format` (raster/PDF are kept as references for manual work), `asset.unknown-type`.

Output: `content/normalized/<dataset>/inventory.json`.

## Stage B — symbol normalization (`stage-b-symbols.ts`)

Merges the inventory with the human-maintained `content/review/<dataset>/catalog.review.json`:

- **Reviewed entries** become catalog symbols as written (name, category, size, ports, anchors,
  rotation, visual states, `directionMarker`, `annotation`, semantics, provenance, review, sources).
  One SVG may back several symbol definitions; `elementId` + `viewBox` extract one symbol from a
  multi-symbol sheet.
- **Names from a legend**: Markdown tables whose cells contain `![name](simboli/x.svg)` images are
  read as a legend (stage D's `extractLegend`). A symbol without a reviewed name takes the legend
  name with a line reference (`nameSource: "legend"`).
- **Unreviewed SVGs** become proposals: id `src.<file-slug>`, name from the legend, `<title>` or
  file name, category `nerazvrstano`, no ports, `requires-review`. They carry no semantics.
- **Ignored assets** (`ignoredAssets: [{ file, reason }]`, e.g. a sprite sheet duplicating the
  single files) are reported as `symbol.ignored`.

The review file also contains port types, connection rules, equipment types, roles and a `terms`
lexicon (roles, symbols, equipment — see stage D). Keys starting with `$` are comments.
Source references in the review file are verified (`trace.excerpt-not-found`,
`trace.line-out-of-range` are errors; `trace.excerpt-wrong-line` is a warning).

Outputs: `symbols.proposed.json`, `content/exercises/catalogs/<catalogId>.json`.
Diagnostics: `symbol.missing-asset`, `symbol.missing-element`, `symbol.unreviewed`,
`symbol.prepare-failed`, `review.unknown-ignored-asset`, catalog checks (`ref.unknown-category`,
`ref.unknown-port-type`, `geometry.port-outside`, `catalog.hose-ends-missing`, `id.duplicate`, …).

## Stage C — diagram analysis (`stage-c-diagrams.ts`)

Recognition priority, most reliable first:

1. **Explicit metadata**:
   - stage layer: `<g inkscape:groupmode="layer" inkscape:label="…">` or `<g data-stage="faza-1">`;
     a diagram without layers is one implicit stage named after the file;
   - symbol instance: `<g data-symbol="<catalog symbol id>" data-instance="<object id>" transform="…">`;
   - **symbol reference**: a group containing `<image href="../simboli/x.svg">` (resolved relative to
     the diagram and matched to the catalog symbol with that asset path) or `<use href="#x">`
     (matched by file stem). The referenced drawing must be centred on the group origin
     (`x = -width/2`, `y = -height/2`), which is how the source sketches are generated;
   - connection: any element with `data-connect-from="obj#port" data-connect-to="obj#port"`.
2. **Heuristic**: a direct child group of a stage layer whose label equals a catalog symbol name —
   `diagram.heuristic-instance`, for review.
3. **Unresolved**: other direct child groups — `diagram.unresolved-instance`.

Every instance gets a deterministic **key**: `data-instance` if present, else
`<symbol-file-stem>@<x>,<y>` (one decimal), e.g. `n1@877.2,115.8`. Authoring files refer to
sketch instances by this key.

Further analysis:

- Positions, rotations and uniform scale come from the accumulated transform matrix.
- **Facing markers**: a symbol whose catalog entry declares `directionMarker { symbolId, distance }`
  (personnel) is given `facing` from the nearest marker instance at that distance; the marker
  instance gets `attachedTo` (`diagram.unattached-marker` otherwise).
- **Lines** (`path`, `line`, `polyline` in absolute coordinates) are recorded with endpoints and
  stroke width; a width matching an equipment type's `depiction.laidLineStrokeWidth` (±0.05)
  classifies the line as that laid hose type.
- **Render copies** are compared with their original by the set of `symbol@position` signatures
  (`diagram.render-copy-mismatch`).
- A diagram with drawing primitives but no recognised instances is **flattened**
  (`diagram.flattened`); no recognition from pixels is attempted.

Output: `diagrams.json`.

## Stage D — procedure analysis (`stage-d-procedures.ts`)

Parses Markdown with `mdast-util-from-markdown`, preserving headings and a section tree
(`id` = transliterated slug), paragraphs and list items with verbatim text and line numbers, and
produces:

- **Step candidates**, in one of two modes per document (reported as `procedure.candidate-mode`):
  - documents with numbered list items: only numbered items, id
    `<file-slug>#<section-slug>/<number>`;
  - prose documents (the source exercises): every paragraph `/p<i>` and unordered list item
    `/l<i>` of a section, except image-only paragraphs, figure captions (`**Skica 11** – …`), tables,
    and items recognised as participant or equipment list entries (below).
- **Orders**: bold quotations `**„…”**` (split on `” „`), linked to their candidate.
- **Participants**: list items `naziv (KRATICA),` → `{ text, abbreviation, roleIds }`
  (`mapping.unresolved-role` if no role matches).
- **Equipment list**: list items starting with a quantity (`3 „B” tlačne cijevi,`) →
  `{ quantity, text, equipmentTypeIds }` matched through `terms.equipment`
  (`mapping.unresolved-equipment`, info).
- **Diagram references** (links/images) resolved against the inventory; references to render copies
  get `canonicalFile` = the original sketch (`procedure.unresolved-reference` otherwise).
- **Legend** tables (see stage B).
- Role and equipment mentions, detected **only** from an explicit lexicon: catalog names plus
  `terms.*` from the review file. There is no morphological guessing — inflected forms
  (*zapovjedniku*, *strojara*) must be listed explicitly; abbreviations that could be prepositions
  are listed with parentheses (`(S)`).

Candidates are **proposals**; they become steps only through an authoring file (stage E/F).

Output: `procedures.json`.

## Stage E — mapping and review (`stage-e-mapping.ts`)

Links candidates to authored steps (`steps[].source` in authoring files) and to
`content/review/<dataset>/mapping.review.json`:

```jsonc
{
  "ignoredFiles": [{ "file": "00-1-Uvod.md", "reason": "Uvod u vježbovnik; ne opisuje radnje vježbe." }],
  "ignored": [{ "candidateId": "01-vjezba-1#…/p2", "reason": "Uvod u popis opreme; …" }]
}
```

Every candidate ends up `mapped`, `ignored` (with a reason) or `unmapped` (`mapping.unmapped-step`
warning — missing steps are never inferred). `mapping.template.json` contains skeleton step entries
for unmapped candidates, with `$todo` markers where a human must define conditions and scripts.

Outputs: `mapping.json`, `mapping.template.json`.

## Stage F — exercise compilation (`stage-f-compile.ts`)

For every `content/authoring/<dataset>/*.exercise.json`:

1. Strip comment keys (`$comment` and other `$` keys except directives); prefix dataset-relative
   `file` paths with the source root.
2. Resolve **diagram points**: `{ "$diagramPoint": "skice/01-skica-13.svg#n1@877.2,115.8", "offset"?: {x,y} }`
   anywhere in the document becomes that instance position (or `#line:<i>:from|to` for a line
   endpoint) plus the offset; the reference is added to the owning step's or object's `sources`
   (`mapping.unknown-diagram-point`).
3. **Initial scene from a diagram**: `initialScene.fromDiagram: { file, stage?, translate? }`. Objects
   with `diagramKey` take position (+ `translate`) and rotation (facing marker, else instance
   rotation) from that instance; objects without it use `data-instance` = object id in `stage`.
   The instance becomes a source reference (`mapping.unknown-diagram-key`,
   `mapping.missing-position`, `diagram.symbol-mismatch`).
4. `steps[].source: "<candidate id>"` — the compiler copies the **verbatim** text into `text` and
   adds a source reference with line range and excerpt (`mapping.unknown-candidate`,
   `trace.text-overridden`, `mapping.role-mismatch` (info)).
5. Validate against `ExerciseSchema` (`schema.exercise` with JSON paths).
6. Semantic and dynamic checks (`checkExercise`): unknown symbols/objects/types/roles/zones/ports/
   steps, duplicate ids, dependency cycles, invalid initial connections, `layout` on non-hoses,
   demonstration commands that are rejected (`demo.command-rejected`), steps the demo does not
   complete, unreachable completion (`completion.unreachable`), steps whose condition already holds
   when they unlock (`step.complete-on-unlock`) or initially (`step.trivially-complete`), concurrent
   animation of one object by different steps, steps without source references.
7. **Stage diagrams**: the demonstration state at the stage's start/end is compared with the
   stage's diagram (its only stage, or the layer named in `anchor`):
   - `diagramScale: "exact"` — positions, rotations and drawn connections
     (`diagram.position-mismatch`, `diagram.rotation-mismatch`, `diagram.connection-missing`, …);
   - `diagramScale: "schematic"` (the source sketches) — per symbol, objects on the ground must be
     drawn and carried ones may be (`free ≤ drawn ≤ free + carried`; personnel exactly), annotation
     symbols and facing marks are skipped; laid hoses are compared with the diagram's lines of that
     type (`diagram.count-mismatch`, `diagram.lines-mismatch`).
8. **Procedure lists**: the initial scene is compared with the participant and equipment lists of the
   exercise's own procedure (the first Markdown file in its `sources`):
   `exercise.equipment-count-mismatch`, `exercise.participant-missing`, `exercise.extra-personnel`.
9. Verify every source excerpt of the compiled exercise against the source texts (`trace.*`).
10. Write `content/exercises/<id>.json` with `build` info (authoring file, SHA-256 of all referenced
    sources, diagnostics) and update `content/exercises/index.json`.
11. Write the **audio plan** `content/exercises/<id>/zvuk.plan.json` (DATA_MODEL.md, *Demonstration
    sound*) for `tools/generate_audio.py`; `audio.order-not-in-text` (info) marks orders that the step
    text does not quote verbatim, `audio.speech-not-verbatim` (info) spoken words that are not a quote
    of the action's sources.

## Outputs

```
content/normalized/
  import-report.json              ← consumed by the "Pregled uvoza" screen
  <dataset>/inventory.json  symbols.proposed.json  diagrams.json  procedures.json
            mapping.json    mapping.template.json  diagnostics.json  REPORT.md
content/exercises/
  index.json  <exercise>.json  catalogs/<catalog>.json
  <exercise>/zvuk.plan.json              ← input of tools/generate_audio.py
  <exercise>/<clip>.webm  zvuk.json      ← written by tools/generate_audio.py (not by the pipeline)
```

All outputs are deterministic (no timestamps), so `pnpm import:check` can detect stale files in CI.

## Current results

- `source`: 97 files (52 symbols + sprite, 18 sketches + 18 verified render copies, 5 Markdown files,
  1 photo, 2 scripts); 108 step candidates — 58 mapped, 50 ignored with reasons; **2 exercises
  compiled with 0 errors**: Vježba 1 (47 steps, demonstration 3:22 with 312 commands) and
  Vježba 2 (15 steps, 2:37 with 209 commands), both matching all their stage sketches. The only
  warning is the raster photo. See `content/normalized/source/REPORT.md`.
- `synthetic`: 9 files, 8 symbols, 2 diagrams (one flattened), 1 procedure with 8 numbered steps —
  all mapped; 1 exercise with 0 errors whose demonstration matches both diagram layers exactly.
