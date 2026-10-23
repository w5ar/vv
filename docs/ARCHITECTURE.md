# Architecture

## Goals that shaped the design

- **Data-driven exercises**: one JSON definition serves demonstration, training and assessment.
- **Authoritative state outside the UI**: the simulation engine owns state; React Flow only renders it.
- **Determinism**: same exercise + same command sequence (+ same logical times) ⇒ same state, always.
- **Traceability**: every generated or authored element can point back to a source file, line or SVG element.
- **No invented doctrine**: rules, compatibilities and procedures come from declared data with provenance and review status, never from code.

## Module map

```
                ┌──────────────┐
                │   domain     │  Zod schemas → types (no React, no DOM)
                └──────┬───────┘
          ┌────────────┼───────────────┬──────────────────┐
   ┌──────▼─────┐ ┌────▼────────────┐ ┌▼─────────────┐    │
   │  geometry  │ │connection-engine│ │ svg-registry │    │
   └──────┬─────┘ └────┬────────────┘ └┬─────────────┘    │
          └──────┬─────┘               │                  │
          ┌──────▼────────────┐        │                  │
          │ simulation-engine │        │                  │
          └──────┬────────────┘        │                  │
    ┌────────────┼─────────────────────┼──────────┐       │
┌───▼──────────────────┐   ┌───────────▼────────┐ │  ┌────▼──────────────┐
│ exercise-importer    │   │ reactflow-renderer │ │  │ (future) HTTP repo│
│ (Node CLI, stages A–F)│   │ (React, XYFlow)    │ │  │ ASP.NET Core API  │
└──────────────────────┘   └───────────┬────────┘ │  └───────────────────┘
                                ┌──────▼──────────▼──┐
                                │      apps/web      │
                                └────────────────────┘
```

Dependency rules (enforced by package manifests):

- `domain`, `geometry`: no internal dependencies; `domain` depends only on `zod`.
- `connection-engine`, `simulation-engine`: pure TypeScript, no React/DOM/Node APIs.
- `svg-registry`: uses `@xmldom/xmldom` so sanitization behaves identically in Node and in the browser.
- `reactflow-renderer`: the only package that knows React Flow; it maps domain state to nodes/edges.
- `exercise-importer`: the only package using Node APIs (`fs`, `crypto`).
- Exercise-specific rules never live in React components: the UI dispatches generic commands.

Packages are consumed as TypeScript source (`exports` → `src/index.ts`); Vite, Vitest and `tsx` compile
them on the fly, so there is no build step between packages.

## Simulation engine

### Commands and events

The engine is a set of pure functions:

```ts
executeCommand(ctx, state, command, time) → { accepted, state, events, issues }
```

Pipeline per command (`packages/simulation-engine/src/engine.ts`):

1. **Intrinsic validation** — existence and kind of objects, carrying and hand-over rules, proximity
   (`pickUpDistance`, `placeDistance`), rotation policy of the symbol, port compatibility and
   constraints (via the connection engine), hose state (a laid hose cannot be carried, moved or
   rotated; it can be rolled up only when disconnected), action roles/preconditions, visual states.
2. **Command-precondition rules** from the exercise (`rules[type=commandPrecondition]`), evaluated on
   the state *before* the command.
3. **Tentative application** (immutable update).
4. **Prohibited-overlap rules** (`rules[type=noOverlap]`) on the new placements. All other overlap is
   allowed: schematic symbols may overlap.
5. **Order policy** — if the command makes a *locked* step's condition true, it is an order
   deviation: `warn` (accept + warning event), `reject`, or `ignore` (exercise setting).
6. **Procedural progression** — the step state machine advances and emits
   `StepAvailable`, `StepCompleted`, `StageCompleted`, `ExerciseCompleted`.

Rejected commands return the *same* state object. Errors and warnings are structured `Issue`s with a
stable English `code` and a Croatian `message`.

### Procedure state machine

Each step is `locked → available → completed`:

- `locked → available` when every `dependsOn` step is completed (partial order ⇒ parallel steps).
- `available → completed` when its declarative `completedWhen` condition holds.
- Completion is **latched**. A locked step whose condition becomes true is flagged `outOfOrder`
  and completes as soon as its dependencies do (if the condition still holds).

Because completion is defined by *state predicates* (e.g. "these ports are connected",
"object in zone", "objects linked through connections"), any command sequence that reaches the
state is accepted: the trainee is not forced into one arbitrary order. `linked` and selectors with
an omitted `portId` express "any valid way" (e.g. any free outlet of a distributor).

### Sessions, replay and snapshots

`SimulationSession` records every attempt (accepted or rejected) with its logical time, takes
full-state snapshots every *N* accepted commands, reconstructs `stateAtSeq(n)` from the nearest
snapshot plus replay, and implements `undo()` as deterministic replay. `replay(ctx, commands)`
reproduces recorded attempts exactly — rejected commands are rejected again.

No randomness, no wall-clock reads and no iteration over unordered collections exist in the engine:
objects and connections carry explicit order arrays; connection ids are derived from endpoints
when not given.

### Demonstration timeline: logical vs visual time

`compileTimeline(ctx)` turns step scripts into scheduled entries `[startMs, endMs]`:

- Deterministic **list scheduling** in topological step order: a step starts when its
  dependencies have ended (+`stepGapMs`) and every object it animates is free. Independent steps
  that animate different objects therefore run **in parallel**.
- Durations come from the script or exercise animation defaults (move speed, connect time, …) and
  are rounded to whole milliseconds.
- **Each command is applied to the authoritative state exactly at its `endMs`** (in end-time order).
  The state at logical time *t* is "initial state + all entries with `endMs ≤ t`", reconstructed from
  periodic snapshots. It does not matter whether the playhead got there by playing, seeking,
  stepping backward or skipping.
- `frameAt(ctx, timeline, t)` produces a **display-only** frame: interpolated positions/rotations of
  objects animated by in-progress commands, hoses growing while being laid and shrinking while rolled
  up (`layout` override), carried items following their carrier, connections being drawn (progress)
  or removed (fade), actors highlighted. Frames never mutate state.

The web player maps `requestAnimationFrame` wall-clock deltas × speed to logical time. Pausing or
skipping an animation cannot make the exercise state inconsistent because the state is never
derived from animation progress. No animation library is used: interpolation is a few lines of pure
code, which keeps playback deterministic and testable. (Motion/GSAP can be added later for
richer visual effects without touching the engine; video generation can render frames from
`frameAt` at fixed logical time steps.)

### Diagnostics

`checkCatalog` and `checkExercise` provide static checks (unknown symbols, types, roles, zones,
ports, steps, stages; duplicate ids; dependency cycles; initial-connection validity; ports outside
symbol bounds) and dynamic checks (the demonstration script must execute without rejections,
complete every scripted step and reach the completion condition; no two concurrent commands may
animate the same object). They are used by the importer (stage F) and live in the editor.

## Connection engine

- Ports are defined on symbols in symbol-local coordinates with optional direction.
  `portWorld` applies the instance pivot, position and rotation; directions rotate with the object.
  For a **laid hose** the end ports (`hoseEnds`) sit exactly at the ends of its layout, so the next
  hose, the distributor or the nozzle connects where the line ends.
- Compatibility is **declared**: an unordered pair of port types is compatible only if an `allow`
  rule exists and no `deny` rule matches; rules with review status `rejected` are ignored.
- Constraints: same object, duplicate connection, `maxConnections` per port, optional
  `connectionMaxDistance`.
- `evaluateTargets` classifies every port as a valid/invalid target for highlighting.
- `findSnap` finds the nearest compatible free port pair within `snapDistance` and returns the
  adjusted object position (editor drop snapping, placing carried equipment).
- Logical connections live in the domain state; React Flow edges are generated from them.

## Geometry

Only what schematic exercises need: vectors, angle normalization/interpolation, rotation about a
pivot, local↔world transforms, rotated bounds, hit testing, distance to a rotated rectangle,
oriented-rectangle overlap (SAT) and proximity queries. No physics engine.

Conventions: screen coordinates (y down), degrees, positive = clockwise; an instance `position` is
the world position of the symbol pivot (default: symbol centre).

## SVG pipeline and security

1. Raw SVG files are **never modified** (originals stay in `content/**/source`).
2. `sanitizeSvg` parses with xmldom (fatal errors → graceful failure) and converts to a JSON AST using
   an **element allowlist** (static SVG only). Removed: `script`, `foreignObject`, SMIL animation,
   event-handler attributes, foreign namespaces, `javascript:`/`data:text/html` values, external
   `href`s (recorded as references), unsafe CSS (`url()` to non-fragments, `expression`,
   `@import`, …). `<a>`/`<switch>` are unwrapped. Size and node-count limits prevent abuse.
3. `<style>` sheets with simple selectors (`tag`, `.class`, `tag.class`, `#id`) are **inlined per
   element** (specificity + order respected), so symbol CSS never leaks into the page; unsupported
   selectors are reported.
4. `prepareSymbolSvg` extracts one element from multi-symbol sheets (keeping `<defs>` and ancestor
   transforms), normalizes the `viewBox`, and **namespaces ids** (`sym-<id>__<orig>`) while
   preserving the original id in `data-src-id` (used by visual states).
5. The renderer converts the AST to React elements — no `innerHTML`, no raster conversion.
6. Production builds ship a strict Content-Security-Policy (`script-src 'self'`, no objects).

## Rendering (React Flow)

- `buildFlow(view)` is a pure function from domain state (+ display overrides) to nodes and edges.
  React Flow's internal state is never authoritative.
- Node `position` is the symbol centre (`nodeOrigin [0.5, 0.5]`); the SVG is rotated by CSS around
  the centre, which equals the domain transform about the pivot.
- Port handles are supplied through React Flow's `node.handles` with coordinates computed by the
  connection engine, so handle bounds and edges stay correct after rotation without DOM
  measurement. Edges draw straight lines between domain port positions and sit below nodes so
  ports always receive pointer events.
- Dragging produces a display-only override; the domain command is dispatched on drop
  (training: `MovePersonnel` / `PlaceEquipment` / `MoveEquipment`; editor: scene edit).
- **Laid hoses** are drawn as a line of the type's `laidLineStrokeWidth` with the coupling symbol at
  both ends; the node is the line's bounding box but only the line receives pointer events.
- **Personnel with a `directionMarker`** keep the symbol upright and draw the facing mark at the
  declared distance, as the source sketches do.
- **Carried items** are drawn at half size, unrotated, in a column beside the carrier; their port
  handles and connection edges use the same compact geometry (display only — the domain keeps the
  logical carry position).
- Read-only views (demonstration) hide port handles; zones and notes let clicks pass through to the
  canvas (placing and laying by clicking).

## Web application

- Hash router, Zustand stores, Croatian labels in `apps/web/src/labels.ts`.
- `BundledContentRepository` implements the domain `ContentRepository` with Vite lazy imports of
  `content/exercises/**` and SVG assets; all JSON is validated with Zod at load time and invalid
  files show diagnostics instead of crashing.
- `LocalDraftRepository` / `LocalResultRepository` implement `DraftRepository` / `ResultRepository`
  over `localStorage`.
- Editor: immutable drafts with undo/redo stacks; edits change only the initial scene and stage
  metadata; live `checkExercise` diagnostics; JSON export.

## Path to a backend (ASP.NET Core + SQL Server)

The engines receive already-validated domain objects and never perform I/O. A backend only needs to
implement the persistence interfaces in `packages/domain/src/persistence.ts`, e.g.:

| Interface method | Suggested endpoint |
| --- | --- |
| `listExercises()` | `GET /api/exercises` |
| `getExercise(id)` | `GET /api/exercises/{id}` |
| `getCatalog(id)` | `GET /api/catalogs/{id}` |
| `getSvgAsset(path)` | `GET /api/assets/{path}` (raw SVG; still sanitized client-side) |
| `getImportReport()` | `GET /api/import-report` |
| `saveDraft` / `loadDraft` | `PUT/GET /api/drafts/{exerciseId}` |
| `saveResult` / `listResults` | `POST/GET /api/exercises/{id}/results` |

The JSON shapes are the Zod schemas, which can be exported as JSON Schema for the C# side.
The importer can keep running as a build step or be ported; its outputs are plain JSON files.

## Deliberate non-goals (MVP)

Multiplayer, realistic hydraulics, 3D, accounts/authorization (the editor has only an
"unlock editing" switch), complex scoring, physics.
