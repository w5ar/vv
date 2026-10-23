# Exercise authoring

Exercises are data. An author writes a JSON **authoring file**; the pipeline compiles it into the
exercise format used by all three modes. The authoring format *is* the exercise schema
(see DATA_MODEL.md) plus two conveniences that preserve traceability.

> Do not invent procedures, compatibility rules, distances or criteria. Everything domain-specific
> must come from the source materials (with `sources`) or be marked `provenance: "assumption"` /
> `review.status: "requires-review"` and listed in OPEN_QUESTIONS.md.

## Workflow

1. Put source files in `content/source/{symbols,diagrams,procedures}/` and run `pnpm import:all`.
2. In **Pregled uvoza** review the inventory, symbol proposals, diagram recognition and step
   candidates (with their stable ids and verbatim text).
3. Curate `content/review/source/catalog.review.json`: categories, symbols with ports and visual
   states, port types, **connection rules with sources**, equipment types, roles, terminology
   lexicon (`terms`).
4. Create `content/authoring/source/<exercise-id>.exercise.json` (start from
   `content/normalized/source/mapping.template.json`, or copy the synthetic example's structure).
5. Run `pnpm import:all` until there are no errors; review warnings.
6. Open the exercise in the library: check the demonstration, then try training and assessment.

## Authoring conveniences

### Positions from a diagram

```jsonc
"initialScene": {
  "fromDiagram": { "file": "diagrams/vjezba.svg", "stage": "faza-1" },
  "personnel": [{ "id": "clan-1", "symbolId": "…", "roleId": "…" }],   // no position: taken from the diagram
  "equipment": [{ "id": "razdjelnik", "typeId": "…" }]
}
```

The diagram group must carry `data-instance="clan-1"` inside the `faza-1` layer. The SVG element id
becomes a source reference of the object. Explicit `position` values override the diagram.

### Verbatim step text from Markdown

```jsonc
{ "id": "korak-5", "source": "sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/5", "title": "Prva grana s mlaznicom", … }
```

The compiler fills `text` with the exact Markdown wording and adds
`{ file, anchor: <candidate id>, line, lineEnd, excerpt }` to `sources`. Never retype source text.

## Writing steps

```jsonc
{
  "id": "korak-4",
  "source": "<candidate id>",
  "title": "Spajanje velike cijevi na razdjelnik",
  "stageId": "faza-1",
  "actorRoleIds": ["role.clan-2"],
  "dependsOn": ["korak-2", "korak-3"],          // partial order
  "completedWhen": { "type": "connected",
                     "a": { "objectId": "cijev-velika", "portId": "kraj-b" },
                     "b": { "objectId": "razdjelnik", "portId": "ulaz" } },
  "hint": "Spojite kraj B velike cijevi na ulaz razdjelnika.",
  "script": [ { "command": { "type": "ConnectPorts", "a": {…}, "b": {…}, "connectionId": "spoj-2" } } ]
}
```

Guidelines:

- **`completedWhen` describes the result, not the motion.** Training accepts any command sequence
  that reaches it. Use `linked` or omit `portId` when several ways are valid (e.g. any outlet);
  use `any` for explicit alternatives.
- **`dependsOn` encodes only orderings the source requires.** Steps without mutual dependencies
  may be performed in any order and play in parallel in the demonstration.
- **`script`** is only for the demonstration. Each scripted command must be valid at its time;
  the compiler runs the script and reports rejected commands. Use `withPrevious: true` for
  simultaneous commands within a step, `durationMs`/`delayMs` to adjust timing, `caption` for
  narration.
- Non-spatial actions (orders, reports) are `actions[]` executed with `BeginAction`/`CompleteAction`
  and checked with `actionCompleted`.
- Visual states (e.g. open/closed) are changed with `SetObjectState` and checked with `objectState`.
- Zones (`initialScene.zones`) give `inZone` conditions a named area.

## Rules

- `commandPrecondition`: "command X on objects Y is only allowed when condition Z holds"
  (evaluated before the command). Use `severity: "warning"` to allow with a warning.
- `noOverlap`: prohibited overlap between two groups (by object ids, symbols, categories, kinds).
  Everything else may overlap.
- Order of steps is governed by `settings.orderPolicy` (`warn` / `reject` / `ignore`).

Each rule needs `sources` (or `provenance: "assumption"` + review) and a Croatian `message`.

## Stages and diagrams

```jsonc
{ "id": "faza-2", "name": "Faza 2 – …", "diagram": { "file": "diagrams/x.svg", "anchor": "faza-2" }, "diagramMoment": "end" }
```

The compiler compares the demonstration state at the start/end of the stage with the diagram
layer and warns about position, rotation and connection differences. Transitions between diagrams
are never invented: they come only from the authored step scripts.

## Assessment

Add only criteria that the source (or the training organisation) defines:
`allRequiredStepsCompleted`, `maxRejectedCommands`, `maxOrderDeviations`, `timeLimitMs`. Without
criteria the result is a report without pass/fail.

## The editor

`#/uredivac/<id>` edits the **initial scene** (positions, rotations, labels, roles, added/removed
objects, initial connections) and stage names. Click **Omogući uređivanje** first. Features: drag,
`R`/`Shift+R` rotate, Delete, snapping of compatible ports (optional auto-connect), click or drag
between ports to connect (validated by the connection engine), undo/redo (`Ctrl+Z`, `Ctrl+Y`),
live diagnostics, draft saved in the browser, JSON export.

Drafts are local to the browser. To make a change permanent, copy the changed values (or the
exported file) into the authoring file and run `pnpm import:all` — the compiled file in
`content/exercises/` is generated and must not be edited by hand.

## Reviewer checklist

- [ ] Every step has a source reference with verbatim text (`tracedStepCount == stepCount`).
- [ ] Every symbol, port type, connection rule, role and rule has `sources` or is an explicit assumption.
- [ ] No `mapping.unmapped-step` warnings left unexplained (map or ignore with a reason).
- [ ] Diagram consistency warnings are resolved or explained.
- [ ] `synthetic: false` only for exercises built from authoritative materials.
- [ ] Review statuses updated (`verified` only after expert review).
