# Source analysis

## Summary

**No source materials were available.** The repository `w5ar/vv` contained a single file,
`LICENSE` (GNU AGPL-3.0), at the initial commit `0a9cd94`. There were no SVG symbols, no exercise
diagrams and no Markdown procedures. Consequently:

- no symbols could be inventoried or given meanings;
- no exercise diagrams or stages could be analysed;
- no procedures, roles, equipment, actions, dependencies or connection rules could be extracted;
- **no real exercise could be converted**, so the MVP's single exercise is a labelled synthetic
  fixture.

Nothing in this repository should be read as a description of real firefighting practice.

## What was inspected

| Location | Result |
| --- | --- |
| Repository working tree and all branches (`main`, `claude/festive-faraday-ngdnyf`) | only `LICENSE` |
| Git history | one commit (`Initial commit`) |
| Container file system (uploads, home directories, temp) | no SVG or Markdown source files |
| Other repositories visible to the session (`slara`, `medrad`, `simplycompliant`) | not opened: names indicate unrelated projects and they are outside the task scope |

The import pipeline confirms this on every run: dataset `source` (`content/source`) has 0 files
and reports `source.empty` (see `content/normalized/source/REPORT.md`).

## Consequences and how the MVP handles them

1. **Pipeline built against conventions, verified with a synthetic dataset.** Stages A–F are
   generic: they inventory any SVG/Markdown files, propose symbols without meaning, extract diagram
   instances from explicit metadata (and flag heuristic/unresolved/flattened cases), and turn
   numbered Markdown items into step candidates with verbatim text and line numbers.
2. **Synthetic dataset** (`content/synthetic/`), marked as synthetic in file metadata
   (`data-synthetic="true"`, "SINTETIČKI" in titles/descriptions), in catalog/exercise JSON
   (`synthetic: true`, `provenance: "synthetic"`) and in the UI (banners and badges).
3. **No domain rules in code.** Compatibility rules, distances, criteria and step logic exist only as
   data with provenance; the synthetic values are explicitly test values.

## Synthetic inventory (for reference only — NOT source material)

| File | Type | Notes |
| --- | --- | --- |
| `symbols/vozilo.svg` | symbol | 120×60, two outlet groups (`izlaz-1`, `izlaz-2`) |
| `symbols/osoba.svg` | symbol | 32×32, direction arrow |
| `symbols/cijev.svg` | symbol | 80×12, `preserveAspectRatio="none"`; backs **two** symbol definitions (large/small coupling) |
| `symbols/razdjelnik.svg` | symbol | 40×48, uses a `<style>` sheet (tests CSS inlining) |
| `symbols/mlaznica.svg` | symbol | 36×16, group `mlaz` toggled by visual states |
| `symbols/oznake-list.svg` | symbol sheet | two symbols extracted by element id, shared `<defs>` gradient, nested transform |
| `diagrams/sinteticka-vjezba-01-faze.svg` | diagram | 2 Inkscape layers (stages), 22 metadata instances, 6 annotated connections, 1 heuristic and 1 unresolved group |
| `diagrams/sinteticki-ravni-crtez.svg` | diagram | paths only → flagged as flattened |
| `procedures/sinteticka-vjezba-01.md` | procedure | roles, equipment, 2 stage sections, 8 numbered steps, diagram image link |

Pipeline result on this dataset: 0 errors; warnings only for the intentionally unresolved group and
the flattened diagram; one informational `mapping.role-mismatch` (step 7's text mentions
*voditelju* as the recipient of the report — correctly flagged for human review).

## Patterns the pipeline expects from real materials

These are assumptions to be confirmed once materials exist (see OPEN_QUESTIONS.md):

- **Symbols**: one SVG per symbol, or symbol sheets with one identifiable group per symbol.
  A `<title>` with the Croatian name helps proposals.
- **Diagrams**: vector SVG where stages are layers and symbol instances are groups carrying
  `data-symbol` / `data-instance`. If real diagrams are exported as flat paths (common for
  CAD/Illustrator exports), they will be flagged `flattened` and need annotation (e.g. in Inkscape:
  group each symbol and set attributes via the XML editor) — automatic visual recognition was
  deliberately not attempted.
- **Procedures**: Markdown with headings per stage and numbered lists for steps, roles listed in a
  section titled *Sudionici/Uloge*, diagram links as images.

## What is needed to import a real exercise

1. The SVG symbol set (ideally the standard used by the training organisation) with names.
2. At least one complete exercise: its Markdown procedure and the diagrams of its stages.
3. Expert answers to the questions in OPEN_QUESTIONS.md (especially roles, coupling/port types and
   compatibility, and which orderings are mandatory).
