# Open questions

Items that require a decision by the project owner or confirmation by a firefighting domain expert.
Nothing listed here has been decided in code; where the MVP needed a value, it is a configurable
technical default with `provenance: "assumption"` or part of the synthetic fixture.

## Blocking

**Q0. Where are the source materials?** The brief states the repository contains SVG symbols,
vector exercise diagrams and Markdown procedures. The repository contained only `LICENSE`
(see SOURCE_ANALYSIS.md). Until materials are added to `content/source/`, no real exercise can be
imported and none of the domain questions below can be answered from sources.

## Symbols and catalog

1. Which symbol standard applies (e.g. an HVZ standard set, an internal set)? Is there an
   authoritative list of names and categories?
2. Are symbols delivered as one file per symbol or as sheets? Do they have stable ids?
3. Which symbols have connection points, where exactly, and how many connections each port allows?
4. Which coupling/port types exist and **which combinations are compatible** (including adapters)?
   The engine connects only declared pairs; no rule exists for real equipment yet.
5. Which symbols may be rotated, and in which steps (free, 90°, 45°)? May symbols be mirrored?
   (Mirroring is not implemented.)
6. Which visual states matter for training (e.g. valve open/closed, nozzle open/closed, line charged)?
7. Personnel: one symbol per role, or one personnel symbol plus role badge (current approach)?

## Roles and personnel

8. Official Croatian role names and abbreviations; can one person hold several roles; may roles be
   reassigned during an exercise (`AssignRole` exists)?
9. Which actions are restricted to which roles?
10. Spoken orders/reports: should they be modelled as procedural actions (current approach), and is
    the exact wording part of the assessment?

## Procedures and ordering

11. Which step orderings are mandatory and which steps may be performed in parallel or in any order?
12. Should out-of-order actions be rejected, accepted with a warning (current default `warn`), or
    ignored — per exercise or globally?
13. Are there alternative valid ways to complete a step (e.g. any free outlet)? Who decides?
14. What defines a stage boundary, and do diagrams show the start or end of a stage?
15. Are there completion conditions beyond "all steps done" (e.g. final equipment state)?
16. Should completed steps be "un-completed" if later undone (currently latched)?

## Spatial mechanics (current technical defaults)

| Setting | Default | Question |
| --- | --- | --- |
| `pickUpDistance` | 70 units | Is proximity relevant at all in a schematic exercise? |
| `placeDistance` | 90 units | Same. |
| `connectionMaxDistance` | none (synthetic exercise: 220) | Must ports be near each other to connect, or is a connection purely logical? |
| `maxCarriedPerPerson` | none (synthetic: 2) | Carrying limits per role/equipment? |
| `equipmentMovePolicy` | `non-portable-only` | May trainees drag equipment directly, or must it always be carried? |
| `noOverlap` rules | none by default | Which overlaps are prohibited (e.g. personnel on vehicles)? |
| Scene unit | 1 unit ≈ 1 SVG px | Should scenes use a real scale (metres)? |

## Assessment

17. Which criteria and thresholds are used to evaluate an exercise (time limits, max errors,
    mandatory steps)? The MVP has no default penalties.
18. Should attempts be stored per trainee (requires accounts/backend) and exported?
19. Should hints be available in assessment (currently no) and should the step list be shown
    (configurable, default no)?

## Import conventions

20. Can real diagrams be annotated with `data-symbol` / `data-instance` / `data-stage` /
    `data-connect-*` (or Inkscape labels)? If they are flat exports, who annotates them?
21. Markdown structure: are steps numbered lists, and are roles listed in a dedicated section?
22. Croatian inflection: role/equipment mentions are matched only through an explicit lexicon.
    Should a domain glossary with inflected forms be maintained (`terms` in the review file)?

## Requires human review in the current repository

- Everything under `content/synthetic/` and `content/review/synthetic/` — synthetic by design.
- The command vocabulary (DATA_MODEL.md) is generic and must be validated against real
  procedures (e.g. are "charge line", "lay hose along path", "set up equipment at vehicle" needed?).
- Default animation timings (`moveSpeed` 140 units/s, connect 800 ms, …) — presentation only.

## Recommended next steps

1. Add the real materials and run `pnpm import:all`; review inventory and symbol proposals.
2. Fill `content/review/source/catalog.review.json` with expert-reviewed ports and rules.
3. Annotate one exercise's diagrams (if flat) and author it; iterate until diagnostics are clean.
4. Replace the synthetic exercise in the library once a real one exists (keep the synthetic
   dataset for tests).
5. Then: per-trainee results via an ASP.NET Core backend implementing the persistence interfaces,
   richer editing of steps/scripts in the editor, and frame-by-frame video export from `frameAt`.
