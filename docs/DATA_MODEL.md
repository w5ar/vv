# Data model

All types are defined once as **Zod schemas** in `packages/domain/src/*.ts`; TypeScript types are
inferred from them (`z.infer`). Every external JSON file (catalogs, exercises, import report, drafts,
results) is validated with these schemas at load time. Objects are strict: unknown keys are errors,
which catches typos in authored files.

Examples come from the source exercises (`content/authoring/source/…`, Vježba 1) or from the
**synthetic** dataset (`content/synthetic/…`), which illustrates format features the source
materials do not use; synthetic examples are not firefighting practice.

## Conventions

- **Identifiers** (`Id`): `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, technical, stable, English/ASCII.
  User-facing names (`name`, `title`, `label`) are separate Croatian fields.
- **Coordinates**: screen space, y down, logical units. Rotation in degrees, positive = clockwise.
- **Instance position** = world position of the symbol **pivot** (default: symbol centre).
- **Definitions vs instances**: the *catalog* holds reusable definitions (symbols, port types,
  rules, equipment types, roles); an *exercise* holds instances placed in a scene.

### Traceability fields (on every definition)

| Field | Values | Meaning |
| --- | --- | --- |
| `provenance` | `source` · `derived` · `synthetic` · `assumption` | taken from source · inferred (must be reviewed) · test fixture · technical default |
| `review` | `{ status: verified \| requires-review \| rejected, notes?, reviewedBy?, reviewedAt? }` | human review state; `rejected` rules are ignored by the engines |
| `sources` | `SourceRef[]` | `{ file, anchor?, line?, lineEnd?, excerpt? }` — repository-relative file, heading/SVG id/candidate id, verbatim excerpt |

## Catalog (`CatalogSchema`, `catalog.ts`)

```jsonc
{
  "schemaVersion": 1,
  "id": "katalog-sinteticki",
  "name": "Sintetički katalog (testni)",
  "synthetic": true,
  "categories":      [{ "id": "oprema", "name": "Oprema (sintetička kategorija)" }],
  "portTypes":       [{ "id": "pt.syn-veliki", "name": "Veliki spoj (sintetički)", "provenance": "synthetic", … }],
  "connectionRules": [{ "id": "pravilo.veliki-veliki", "portTypes": ["pt.syn-veliki", "pt.syn-veliki"], "effect": "allow", … }],
  "symbols":         [ /* SymbolDefinition */ ],
  "equipmentTypes":  [{ "id": "et.razdjelnik", "name": "Razdjelnik (sintetički)", "symbolId": "syn.razdjelnik", "portable": true }],
  "roles":           [{ "id": "role.voditelj", "name": "Voditelj (sintetička uloga)", "abbreviation": "V", "symbolId": "syn.osoba",
                        "responsibilities": ["Daje znak za početak."] }]
}
```

### SymbolDefinition

| Field | Description |
| --- | --- |
| `id`, `name` (Croatian), `category`, `description?` | identity |
| `asset` | `{ path, elementId?, viewBox? }` — SVG file; `elementId` selects one group of a multi-symbol sheet (then `viewBox` is required) |
| `size` | logical `{ width, height }` the SVG is fitted into |
| `pivot?` | local point placed at the instance position and used as rotation centre (default centre) |
| `anchors[]` | `{ id, position, label? }` named points (e.g. a hand position) |
| `ports[]` | `PortDefinition` (below) |
| `rotation` | `{ mode: "none" }` · `{ mode: "free" }` · `{ mode: "step", stepDegrees }` |
| `semantics` | free key/value properties (string/number/boolean) — only from reviewed sources |
| `visualStates[]` | `{ id, name, show[], hide[], opacity? }` — show/hide SVG elements by **original** id |
| `defaultState?` | id of a visual state |
| `directionMarker?` | `{ symbolId, distance }` — facing is shown by this marker symbol at `distance` from the centre instead of rotating the symbol (personnel in the source sketches); stage C reads facing from it |
| `annotation` | `true` for drawing elements that are not objects (coupling ticks, nozzle tips, facing marks); skipped when comparing stage diagrams |

### PortDefinition

| Field | Description |
| --- | --- |
| `id` | unique within the symbol |
| `type` | `PortType.id`; compatibility is decided only by `connectionRules` |
| `position` | symbol-local coordinates |
| `direction?` | outward direction in degrees (rotates with the instance) |
| `maxConnections` | default 1 |
| `flow` | `in` · `out` · `bidirectional` — descriptive only, no hydraulics |
| `label?` | Croatian label |

### EquipmentType

| Field | Description |
| --- | --- |
| `id`, `name`, `symbolId`, `description?` | identity; `symbolId` is the symbol shown on the ground or carried |
| `portable` | whether personnel can pick it up |
| `carry` | `beside` (default): a carried item is drawn compact beside its carrier · `held`: a bulky item (suction hose, strainer) is lifted where it lies — it keeps its place, size and rotation and moves with the carrier; held items joined to it that nobody carries move along (a strainer hanging on a lifted hose), unless they are also joined to parts someone else carries |
| `container` | vehicles (autocisterna, navalno vozilo): equipment can be stored in their compartments (`storedIn`, `StoreEquipment`) and taken from them |
| `form` | `rigid` (default) or `hose` — a flexible item shown as a coil until laid |
| `hoseEnds?` | hose only: `[endA, endB]` port ids; `LayHose` lays from end A to end B |
| `laidSymbolId?` | hose only: symbol stretched along the laid hose when no line style is given |
| `depiction?` | `{ laidLineStrokeWidth?, couplingSymbolId?, attachedSymbolId?, worn?, assembledLineStrokeWidth? }` — how diagrams draw the type: line width of a laid hose (stage C classifies lines by it; the renderer draws it), coupling tick at both ends, symbol drawn while attached (informational); `worn: { symbolId, distance }` — while carried, the item is drawn as that symbol behind the carrier (the breathing apparatus, *IA na leđima*); `assembledLineStrokeWidth` — diagrams may draw items of the type joined into one line (an assembled suction line) as a line of that width instead of symbols |

```jsonc
{ "id": "et.tlacna-b-cijev", "name": "Tlačna „B” cijev", "symbolId": "src.tlacna-b-cijev-kolut", "portable": true,
  "form": "hose", "hoseEnds": ["donja", "gornja"], "laidSymbolId": "src.tlacna-b-cijev",
  "depiction": { "laidLineStrokeWidth": 2.6, "couplingSymbolId": "src.spojnica-b" },
  "provenance": "derived", "sources": [{ "file": "content/source/alati/vatrogasni_simboli.py", "line": 319, "excerpt": "sw = 2.6 if tip == \"B\" else 1.3" }, …] }
```

### ConnectionRule

`{ id, portTypes: [a, b], effect: "allow" | "deny", message? }` — unordered pair; a `deny` always wins;
without an `allow` rule the pair is incompatible.

## Exercise (`ExerciseSchema`, `exercise.ts`)

| Field | Description |
| --- | --- |
| `schemaVersion: 1`, `id`, `title`, `summary?`, `description?`, `language: "hr"` | identity |
| `synthetic` | **true for fixtures not based on source materials** (shown as a banner in every mode) |
| `catalogId` | catalog the instances refer to |
| `metadata` | `{ tags[], level?, estimatedDurationMin?, authors[], version? }` |
| `provenance`, `review`, `sources` | traceability |
| `settings` | simulation mechanics (technical assumptions, see below) |
| `animation` | demonstration timing defaults |
| `roles[]` | exercise-specific roles (added to catalog roles) |
| `actions[]` | procedural (non-spatial) actions |
| `initialScene` | personnel, equipment, connections, zones, annotations, viewport |
| `stages[]` | ordered stages with optional diagram reference |
| `steps[]` | procedural steps (partial order) |
| `rules[]` | command preconditions and prohibited overlaps |
| `completion` | required steps + optional final condition |
| `assessment` | exercise-specific criteria |
| `build?` | written by the compiler: source file, source hashes, diagnostics |

### Settings (technical assumptions — not doctrine)

| Setting | Default | Meaning |
| --- | --- | --- |
| `pickUpDistance` | 70 | max distance person ↔ equipment rectangle for `PickUpEquipment` |
| `placeDistance` | 90 | max distance person ↔ target point for `PlaceEquipment` |
| `snapDistance` | 24 | snap radius in the editor/UI |
| `connectionMaxDistance` | `null` | if set, ports must be at most this far apart to connect |
| `maxCarriedPerPerson` | `null` | carrying capacity |
| `orderPolicy` | `warn` | `warn` · `reject` · `ignore` actions that complete a locked step |
| `equipmentMovePolicy` | `non-portable-only` | portable equipment changes place only by being carried |
| `carryOffset` | `{x: 22, y: -18}` | logical offset of carried items (the renderer draws them compactly beside the carrier) |

Animation defaults (`animation`) include `moveSpeed`, `hoseSpeed` (laying/rolling, units/s),
per-command durations (`pickUpMs`, `placeMs`, `connectMs`, `handOverMs`, …), `actionMs` and
`stepGapMs`; they affect only the demonstration.

### Scene instances (`scene.ts`)

```jsonc
// PersonnelInstance
{ "id": "clan-1", "label": "Član 1", "symbolId": "syn.osoba", "roleId": "role.clan-1",
  "position": { "x": 250, "y": 230 }, "rotation": 0,
  "sources": [{ "file": "content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg", "anchor": "f1-clan-1" }] }
// EquipmentInstance
{ "id": "mlaznica-1", "typeId": "et.mlaznica", "position": {…}, "rotation": 0, "state": "zatvorena", "carriedBy": null }
// EquipmentInstance stored in a vehicle's compartments (no position needed in authoring files)
{ "id": "u1", "typeId": "et.usisna-cijev", "storedIn": "ac" }
// EquipmentInstance of a hose that is already laid at the start (layout only for form "hose")
{ "id": "b1", "typeId": "et.tlacna-b-cijev", "position": {…}, "layout": { "a": { "x": 120, "y": 282 }, "b": { "x": 346.9, "y": 350 } } }
// Connection (logical, stored in domain state)
{ "id": "spoj-1", "a": { "objectId": "vozilo", "portId": "izlaz-1" }, "b": { "objectId": "cijev-velika", "portId": "kraj-a" } }
// Zone
{ "id": "zona.cilj", "name": "Ciljno područje (sintetičko)", "shape": { "type": "rect", "rect": { "x": 800, "y": 180, "width": 200, "height": 240 } } }
```

### Stage

`{ id, name, description?, diagram?: SourceRef, diagramMoment: "start" | "end", diagramScale: "exact" | "schematic" }`
— the diagram (file + optional layer anchor) depicts the situation at the start or end of the
stage; the compiler compares it with the demonstration state at that moment: positions
(`exact`) or only which symbols and laid lines are shown (`schematic`, for sketches that are not
to scale).

### Step

| Field | Description |
| --- | --- |
| `id`, `title` | identity (Croatian title) |
| `text?` | **verbatim** wording from the source (filled by the compiler from a Markdown candidate) |
| `stageId?` | stage |
| `actorRoleIds[]` | roles performing the step (documentation + highlighting) |
| `dependsOn[]` | steps that must be completed first (partial order; empty = available at start) |
| `optional` | excluded from `completion.requiredSteps: "all"` |
| `completedWhen` | `Condition` — what must be true for the step to count as done |
| `hint?` | training hint |
| `script[]` | demonstration: `{ command, durationMs?, delayMs, withPrevious, caption? }` |

### ProceduralAction

`{ id, name, actorRoleIds[], minActors, requires?: Condition, durationMs?, speech? }` — e.g. a signal,
an order or a report. Executed with `BeginAction` / `CompleteAction`. `speech` holds the words spoken
aloud, verbatim from the source (`„Za prvi mlaz s dvije „C” cijevi pravac …… naprijed!”`); it is voiced
in demonstrations with sound.

### Rules

```jsonc
{ "type": "commandPrecondition", "id": "pravilo.otvaranje-nakon-znaka",
  "when": { "commandTypes": ["SetObjectState"], "objectIds": ["mlaznica-1", "mlaznica-2"] },
  "requires": { "type": "actionCompleted", "actionId": "act.znak-otvaranja" },
  "severity": "error", "message": "Mlaznice se otvaraju tek nakon znaka voditelja (sintetičko pravilo)." }

{ "type": "noOverlap", "id": "pravilo.osoba-ne-na-vozilu",
  "groupA": { "kinds": ["personnel"] }, "groupB": { "objectIds": ["vozilo"] },
  "severity": "error", "message": "Osoba ne smije biti postavljena na vozilo (sintetičko pravilo)." }
```

Matchers: `commandTypes` (required), `objectIds`, `portKeys` (`objectId#portId`), `actionIds`.
Selectors: `objectIds`, `symbolIds`, `categories`, `kinds`.

### Completion and assessment

```jsonc
"completion": { "requiredSteps": "all", "finalCondition": { … } },
"assessment": {
  "criteria": [
    { "type": "allRequiredStepsCompleted", "id": "kriterij.koraci", "label": "Svi koraci su izvršeni" },
    { "type": "maxRejectedCommands", "id": "kriterij.pogreske", "label": "Najviše 5 odbijenih radnji", "limit": 5 },
    { "type": "maxOrderDeviations", "id": "kriterij.redoslijed", "label": "Bez odstupanja od redoslijeda", "limit": 0 }
    // also: { "type": "timeLimitMs", "limit": … }
  ],
  "showStepListDuringAssessment": false
}
```

No criteria ⇒ the result is a report only (`passed: null`). There are no implicit penalties.

## Conditions (`conditions.ts`)

| Type | Holds when |
| --- | --- |
| `all` / `any` / `not` | boolean composition |
| `stepCompleted` `{stepId}` | step status is completed |
| `actionCompleted` / `actionActive` `{actionId}` | procedural action state |
| `connected` `{a, b}` | a direct connection exists; each side is `{objectId?, typeId?, portId?}` — a specific object or **any equipment of a type** (interchangeable items such as hoses), omitted port = any port |
| `linked` `{a, b}` | objects reachable through a chain of connections (graph reachability only) |
| `portFree` `{port}` | port has no connection |
| `inZone` `{objectId, zoneId}` | object position inside zone |
| `near` `{objectId, targetId, maxDistance}` | distance to the target's rotated rectangle |
| `carrying` `{personnelId, equipmentId?, typeId?, count?}` | person carries at least `count` (default 1) items: that item, items of that type, or anything |
| `placed` `{equipmentId}` | equipment is on the ground: neither carried nor stored |
| `stored` `{equipmentId?, typeId?, containerId?, count?}` | that item, or at least `count` items of the type, are stored in `containerId` (or in any container) |
| `laid` `{equipmentId?, typeId?, count?}` | that hose is laid, or at least `count` hoses of the type are laid |
| `hasRole` `{personnelId, roleId}` | role assignment |
| `objectState` `{objectId, state}` | visual/semantic state |
| `rotation` `{objectId, angle, tolerance}` | orientation |

## Commands (`commands.ts`)

| Command | Intrinsic validation | Effect / events |
| --- | --- | --- |
| `MovePersonnel {personnelId, to}` | personnel exists | position; carried items follow · `PersonnelMoved` |
| `MoveEquipment {equipmentId, to}` | not carried; portable only if `equipmentMovePolicy = any` | `EquipmentMoved` |
| `RotateObject {objectId, rotation}` | symbol rotation policy (none/step/free) | `ObjectRotated` |
| `PickUpEquipment {personnelId, equipmentId}` | portable, not carried, within `pickUpDistance` (of the container when stored), capacity | `EquipmentPickedUp {containerId?}`; a held item stays where it is |
| `PlaceEquipment {personnelId, equipmentId, at, rotation?}` | carried by that person, `at` within `placeDistance` (held items: their footprint at `at`) | `EquipmentPlaced` |
| `StoreEquipment {personnelId, equipmentId, containerId}` | carried by that person, container type, no connections, within `placeDistance` of the container | `EquipmentStored`; the item leaves the scene |
| `ConnectPorts {a, b, connectionId?, actorId?}` | connection engine (existence, same object, duplicate, compatibility, capacity, distance); actor exists | `PortsConnected` |
| `DisconnectPorts {connectionId, actorId?}` | connection exists | `PortsDisconnected` |
| `LayHose {equipmentId, personnelId?, from?, to}` | hose type, not yet laid | lays the hose from `from` (default: the port connected to end A, else the carrier, else the coil) to `to`; releases it from the carrier; its end ports move to the line's ends · `HoseLaid` |
| `RollUpHose {equipmentId, personnelId?, at?}` | laid, **no connections** | back to a coil at `at` (default end A) · `HoseRolledUp` |
| `HandOverEquipment {fromId, toId, equipmentId}` | giver carries it, both within `pickUpDistance`, receiver capacity | `EquipmentHandedOver` |
| `AssignRole {personnelId, roleId \| null}` | role exists | `RoleAssigned` |
| `BeginAction {actionId, actorIds}` | defined, not active/completed, actors' roles, `minActors`, `requires` | `ActionBegan` |
| `CompleteAction {actionId}` | action active | `ActionCompleted` |
| `SetObjectState {objectId, state, actorId?}` | state defined on the symbol | `ObjectStateChanged` |

A laid hose cannot be picked up, moved or rotated (`hose.laid`). Stored equipment cannot be moved,
rotated, connected or laid until it is taken out (`equipment.stored`).

Plus exercise rules and the order policy (see ARCHITECTURE.md). Procedural events:
`StepAvailable`, `StepCompleted {outOfOrder}`, `StageCompleted`, `ExerciseCompleted`,
`OrderDeviation {missingStepIds}`, `RuleWarning`.

The vocabulary is generic. The hose, hand-over and actor additions were introduced for the source
exercises (laying „B”/„C” lines, *predaje gornju spojnicu*); held items and storage for the exercises
with suction lines and vehicles (*podignu usisnu cijev*, *opremu odlažu u spremnike vozila*). None of
them contains exercise-specific logic.

## Demonstration sound (`audio.ts`)

Both files live in `content/exercises/<exercise-id>/`.

**Audio plan** (`zvuk.plan.json`, written by the import pipeline from `buildAudioPlan(exercise)`):

```jsonc
{ "schemaVersion": 1, "exerciseId": "vjezba-1-dva-c-mlaza", "synthetic": false,
  "clips": [
    { "id": "zapovijed-za-navalu", "voice": "opis", "text": "Kada je odjeljenje postrojeno, … koja glasi:", "hash": "…" },
    { "id": "act.za-navalu", "voice": "zapovijed", "text": "Požar pravac …… voda – hidrant, …, za navalu pripremi!", "hash": "…" } ],
  "steps": { "zapovijed-za-navalu": [ { "clipId": "zapovijed-za-navalu" }, { "clipId": "act.za-navalu", "actionId": "act.za-navalu" } ] } }
```

- Order clips: one per action with `speech` that a step's script begins; id = action id.
- Description clips (voice `opis`): the step text with markup removed, split where it quotes an order
  the step performs; ids `<step-id>`, `<step-id>-2`, …
- Cues of a step play in order; a cue with `actionId` starts with that action.
- `hash` (of voice + text) tells whether a generated clip still matches the current text.

**Audio manifest** (`zvuk.json`, written by `tools/generate_audio.py`):
`{ schemaVersion: 1, exerciseId, clips: { <clip id>: { file, durationMs, voice, hash, model?, voiceName? } } }`.
The player uses only clips whose `hash` matches the plan.

## Simulation state (`state.ts`)

Plain JSON, never mutated:

```ts
{ seq, time,                         // accepted command count, logical ms
  objects: Record<Id, ObjectState>,  // kind, symbolId, position, rotation, roleId, typeId,
  objectOrder: Id[],                 //   carriedBy, carrying[], storedIn, visualState, layout ({a, b} | null)
  connections: Record<Id, Connection>, connectionOrder: Id[],
  actions: Record<Id, { status: 'active' | 'completed', actorIds, startedAt, completedAt? }>,
  steps: Record<Id, { status: 'locked' | 'available' | 'completed', completedAt?, completedSeq?, outOfOrder? }>,
  completed, completedAt? }
```

`HistoryEntry` = `{ attempt, seq, time, command, accepted, events, issues }`.

## Issues and diagnostics (`issues.ts`)

- `Issue` (engine): `{ code, severity, message, objectIds?, portKeys?, stepId?, ruleId? }`
- `Diagnostic` (pipeline): `{ code, severity, message, stage?, path?, source?, subjectId? }`

## Exercise result (`results.ts`)

`{ exerciseId, mode, startedAt?, finishedAt?, durationMs, completed, attempts, acceptedCommands,
completedSteps[{stepId, seq, outOfOrder}], missingSteps[], orderDeviations[], rejectedCommands[],
warnings[], criteria[{id, label, passed, actual, limit?}], passed: boolean | null }`

## Import report (`import-report.ts`)

`{ schemaVersion: 1, datasets: DatasetReport[] }` with, per dataset: `inventory` (stage A),
`symbols` (B), `diagrams` (C), `procedures` (D), `mapping` (E), `compiled` (F), `diagnostics`.
See IMPORT_PIPELINE.md.
