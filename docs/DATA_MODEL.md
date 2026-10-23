# Data model

All types are defined once as **Zod schemas** in `packages/domain/src/*.ts`; TypeScript types are
inferred from them (`z.infer`). Every external JSON file (catalogs, exercises, import report, drafts,
results) is validated with these schemas at load time. Objects are strict: unknown keys are errors,
which catches typos in authored files.

Examples below come from the **synthetic** dataset (`content/synthetic/…`) because no real source
materials were available. They illustrate the format, not firefighting practice.

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
| `carryOffset` | `{x: 22, y: -18}` | display offset of carried items |

### Scene instances (`scene.ts`)

```jsonc
// PersonnelInstance
{ "id": "clan-1", "label": "Član 1", "symbolId": "syn.osoba", "roleId": "role.clan-1",
  "position": { "x": 250, "y": 230 }, "rotation": 0,
  "sources": [{ "file": "content/synthetic/source/diagrams/sinteticka-vjezba-01-faze.svg", "anchor": "f1-clan-1" }] }
// EquipmentInstance
{ "id": "mlaznica-1", "typeId": "et.mlaznica", "position": {…}, "rotation": 0, "state": "zatvorena", "carriedBy": null }
// Connection (logical, stored in domain state)
{ "id": "spoj-1", "a": { "objectId": "vozilo", "portId": "izlaz-1" }, "b": { "objectId": "cijev-velika", "portId": "kraj-a" } }
// Zone
{ "id": "zona.cilj", "name": "Ciljno područje (sintetičko)", "shape": { "type": "rect", "rect": { "x": 800, "y": 180, "width": 200, "height": 240 } } }
```

### Stage

`{ id, name, description?, diagram?: SourceRef, diagramMoment: "start" | "end" }` — the diagram
(file + layer anchor) depicts the situation at the start or end of the stage; the compiler compares
it with the demonstration state at that moment.

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

`{ id, name, actorRoleIds[], minActors, requires?: Condition, durationMs? }` — e.g. a signal or a
report. Executed with `BeginAction` / `CompleteAction`.

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
| `connected` `{a, b}` | a direct connection exists; each side is `{objectId, portId?}` (omitted port = any port) |
| `linked` `{a, b}` | objects reachable through a chain of connections (graph reachability only) |
| `portFree` `{port}` | port has no connection |
| `inZone` `{objectId, zoneId}` | object position inside zone |
| `near` `{objectId, targetId, maxDistance}` | distance to the target's rotated rectangle |
| `carrying` `{personnelId, equipmentId?}` | person carries (that) equipment |
| `placed` `{equipmentId}` | equipment is not carried |
| `hasRole` `{personnelId, roleId}` | role assignment |
| `objectState` `{objectId, state}` | visual/semantic state |
| `rotation` `{objectId, angle, tolerance}` | orientation |

## Commands (`commands.ts`)

| Command | Intrinsic validation | Effect / events |
| --- | --- | --- |
| `MovePersonnel {personnelId, to}` | personnel exists | position; carried items follow · `PersonnelMoved` |
| `MoveEquipment {equipmentId, to}` | not carried; portable only if `equipmentMovePolicy = any` | `EquipmentMoved` |
| `RotateObject {objectId, rotation}` | symbol rotation policy (none/step/free) | `ObjectRotated` |
| `PickUpEquipment {personnelId, equipmentId}` | portable, not carried, within `pickUpDistance`, capacity | `EquipmentPickedUp` |
| `PlaceEquipment {personnelId, equipmentId, at, rotation?}` | carried by that person, `at` within `placeDistance` | `EquipmentPlaced` |
| `ConnectPorts {a, b, connectionId?}` | connection engine (existence, same object, duplicate, compatibility, capacity, distance) | `PortsConnected` |
| `DisconnectPorts {connectionId}` | connection exists | `PortsDisconnected` |
| `AssignRole {personnelId, roleId \| null}` | role exists | `RoleAssigned` |
| `BeginAction {actionId, actorIds}` | defined, not active/completed, actors' roles, `minActors`, `requires` | `ActionBegan` |
| `CompleteAction {actionId}` | action active | `ActionCompleted` |
| `SetObjectState {objectId, state}` | state defined on the symbol | `ObjectStateChanged` |

Plus exercise rules and the order policy (see ARCHITECTURE.md). Procedural events:
`StepAvailable`, `StepCompleted {outOfOrder}`, `StageCompleted`, `ExerciseCompleted`,
`OrderDeviation {missingStepIds}`, `RuleWarning`.

This vocabulary is generic; it was **not** derived from real procedures (none were available).

## Simulation state (`state.ts`)

Plain JSON, never mutated:

```ts
{ seq, time,                         // accepted command count, logical ms
  objects: Record<Id, ObjectState>,  // kind, symbolId, position, rotation, roleId, typeId,
  objectOrder: Id[],                 //   carriedBy, carrying[], visualState
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
