# Exercise authoring

Exercises are data. An author writes a JSON **authoring file**; the pipeline compiles it into the
exercise format used by all three modes. The authoring format *is* the exercise schema
(see DATA_MODEL.md) plus a few conveniences that preserve traceability.

The two source exercises are complete examples:
`content/authoring/source/vjezba-1.exercise.json` (47 steps) and `vjezba-2.exercise.json`
(15 steps, a text that refers to Vježba 1).

> Do not invent procedures, compatibility rules, distances or criteria. Everything domain-specific
> must come from the source materials (with `sources`) or be marked `provenance: "assumption"` /
> `review.status: "requires-review"` and listed in OPEN_QUESTIONS.md.

## Workflow

1. Put source files in the dataset's source root (`content/source/`; directories are configured by
   `layout` in `content/pipeline.config.json`) and run `pnpm import:all`.
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

Diagrams with instance metadata (`data-instance`):

```jsonc
"initialScene": {
  "fromDiagram": { "file": "diagrams/vjezba.svg", "stage": "faza-1" },
  "personnel": [{ "id": "clan-1", "symbolId": "…", "roleId": "…" }],   // no position: taken from the diagram
  "equipment": [{ "id": "razdjelnik", "typeId": "…" }]
}
```

Sketches without metadata (the source sketches): refer to the instance **key** shown in
*Pregled uvoza → Crteži* (`<symbol-file>@<x>,<y>`) and shift the sketch into the exercise frame:

```jsonc
"initialScene": {
  "fromDiagram": { "file": "skice/01-skica-11.svg", "translate": { "x": -180, "y": -170 } },
  "personnel": [{ "id": "z", "symbolId": "src.zapovjednik", "roleId": "role.zapovjednik", "diagramKey": "zapovjednik@250,430" }],
  "equipment": [{ "id": "hidrant", "typeId": "et.podzemni-hidrant", "diagramKey": "podzemni-hidrant@330,430" }]
}
```

Rotation comes from the instance (for personnel: their facing mark). The instance becomes a source
reference of the object. Explicit `position` / `rotation` values override the diagram.

### Points from diagrams in scripts

Anywhere in the file, a point can be taken from a sketch:

```jsonc
{ "command": { "type": "LayHose", "equipmentId": "b2", "personnelId": "v1",
               "to": { "$diagramPoint": "skice/01-skica-13.svg#spojnica-b@346.9,350" } } }
{ "command": { "type": "MovePersonnel", "personnelId": "z",
               "to": { "$diagramPoint": "skice/01-skica-12.svg#zapovjednik@896,380", "offset": { "x": -260, "y": 40 } } } }
```

`#line:<index>:from|to` takes a line endpoint. `offset` maps a sketch drawn in another frame into the
exercise frame. The compiler adds `{ file, anchor: <key> }` to the step's `sources`, so every
sketch-derived coordinate stays traceable. Points that no sketch shows are written as plain
`{ "x", "y" }` and are schematic.

### Verbatim step text from Markdown

```jsonc
{ "id": "korak-5", "source": "sinteticka-vjezba-01#faza-2-postavljanje-mlaznica/5", "title": "Prva grana s mlaznicom", … }
```

The compiler fills `text` with the exact Markdown wording and adds
`{ file, anchor: <candidate id>, line, lineEnd, excerpt }` to `sources`. Never retype source text.
Additional `sources` written in the step are kept after it — Vježba 2 uses them to cite the
Vježba 1 lines whose procedure a *„kao u vježbi 1”* paragraph applies:

```jsonc
{ "id": "b-vod", "source": "02-vjezba-2#polaganje-b-cijevnog-voda-u-cijevnom-sektoru-rada/p1",
  "sources": [{ "file": "01-Vjezba-1.md", "line": 49, "excerpt": "donju spojnicu priključuje na izlazni otvor hidrantskog nastavka" }], … }
```

Excerpts are verified on every import (`trace.excerpt-not-found` if the text is not on that line).
A long paragraph may back two steps (Vježba 2, `povratak-po-opremu` and `prvi-mlaz`) when a stage
sketch shows the situation in the middle of it.

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
- **Select interchangeable equipment by type**, so a trainee may use any of the three „B” hoses:
  `{ "type": "connected", "a": { "typeId": "et.tlacna-b-cijev", "portId": "donja" }, "b": { "objectId": "nastavak" } }`,
  `{ "type": "carrying", "personnelId": "v2", "typeId": "et.tlacna-c-cijev", "count": 2 }`,
  `{ "type": "laid", "typeId": "et.tlacna-c-cijev", "count": 2 }`. Use object ids only for unique items.
- **`dependsOn` encodes only orderings the source requires.** Steps without mutual dependencies
  may be performed in any order and play in parallel in the demonstration.
- **`script`** is only for the demonstration. Each scripted command must be valid at its time;
  the compiler runs the script and reports rejected commands. Use `withPrevious: true` for
  simultaneous commands within a step, `durationMs`/`delayMs` to adjust timing, `caption` for
  narration.
- Non-spatial actions (orders, reports) are `actions[]` executed with `BeginAction`/`CompleteAction`
  and checked with `actionCompleted`. Give actions that are spoken a `speech` with the **verbatim**
  words from the source (it is voiced in the demonstration; a step text quoting the same words is
  split there so the narrator does not repeat them). Speech that is not a verbatim quote of the
  action's sources is reported as `audio.speech-not-verbatim` for review. After changing texts, run
  `pnpm import:all` and `python3 tools/generate_audio.py`.
- Visual states (e.g. open/closed) are changed with `SetObjectState` and checked with `objectState`.
  The source symbols have no visual states, so opening valves is a procedural action there.
- **Hoses**: carry the coil, connect end A (`ConnectPorts` works while carried), then `LayHose` to
  the far end — it starts at the port end A is connected to. `HandOverEquipment` models *predaje
  gornju spojnicu*. Disconnect before `RollUpHose`. Give `actorId` / `personnelId` to show who acts.
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
{ "id": "faza.prvi-mlaz", "name": "Prvi mlaz", "diagram": { "file": "skice/01-skica-13.svg" }, "diagramMoment": "end", "diagramScale": "schematic" }
```

The compiler compares the demonstration state at the start/end of the stage with the diagram:
positions, rotations and connections (`exact`), or — for sketches that are not to scale — which
symbols and laid hose lines are shown (`schematic`). Transitions between diagrams are never
invented: they come only from the authored step scripts.

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
- [ ] No `mapping.unmapped-step` warnings left unexplained (map, or ignore in `mapping.review.json` with a reason).
- [ ] No `exercise.equipment-count-mismatch` / `exercise.participant-missing` against the procedure's lists.
- [ ] Interpretations that the text does not state are listed in OPEN_QUESTIONS.md.
- [ ] Diagram consistency warnings are resolved or explained.
- [ ] `synthetic: false` only for exercises built from authoritative materials.
- [ ] Review statuses updated (`verified` only after expert review).
