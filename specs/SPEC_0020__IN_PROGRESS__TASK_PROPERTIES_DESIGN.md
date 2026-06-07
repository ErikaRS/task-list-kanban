Status: IN_PROGRESS

# SPEC 0020 — Task Properties and Ordering

## Spec Status Note

This spec was split out from the earlier combined task-properties / grouping design.

- [SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md](complete/SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md) owns board rendering architecture.
- [SPEC_0021__IN_PROGRESS__GROUP_BY_SWIMLANES_DESIGN.md](SPEC_0021__IN_PROGRESS__GROUP_BY_SWIMLANES_DESIGN.md) owns grouping and swimlanes.

This spec is intentionally limited to property parsing, property display, property-based sorting, and manual ordering within a column.

## Implementation Order

`SPEC 0019` is now complete, so this spec should be implemented against the board matrix renderer instead of the removed legacy column renderer.

The current code already has a column-local rendering and ordering boundary:

- `Task` / `tasks.ts` parse source lines before rendering.
- `settings_store.ts` and `settings.ts` already own board settings.
- `board_matrix.ts` sorts tasks by file order before materializing matrix cells.
- `BoardCell.svelte` receives one matrix cell's tasks and renders cell-local controls.
- `task.svelte` owns card display.

Because of that, phases 1-3 can land on the existing matrix renderer:

1. Parse properties onto `Task`.
2. Sort the tasks passed to each current matrix cell by a configured property.
3. Render a property strip on current task cards.

Phase 4, column-local manual ordering, should apply within primary buckets in ungrouped mode. `SPEC 0021` later extends the same stable task identity model from column-local order to grouped-cell order.

---

## Feature Request Summary

GitHub issues reviewed for this spec:

### Partially addressed
- [#21](https://github.com/ErikaRS/task-list-kanban/issues/21) — Additional support for scheduled tasks
  - This spec adds scheduled-date parsing as prerequisite infrastructure, but the requested hide/auto-column behavior still requires follow-up work.
- [#61](https://github.com/ErikaRS/task-list-kanban/issues/61) — FR: Add date support
  - This spec adds Dataview date parsing as prerequisite infrastructure, but completion-date write-back still requires follow-up work.
- [#65](https://github.com/ErikaRS/task-list-kanban/issues/65) — FR: Sorting
  - This spec adds generic property-based sorting infrastructure, but explicit estimated-time and natural-name sorting still require follow-up work.
- [#86](https://github.com/ErikaRS/task-list-kanban/issues/86) — FR: add Tasks plugin compatibility
  - This spec adds Tasks-plugin property parsing and date-based sorting infrastructure, but completion/status workflow compatibility still requires follow-up work.

### Related but not addressed
- [#84](https://github.com/ErikaRS/task-list-kanban/issues/84) — FR: Dataview-generated tasks support

Scope notes:
- This spec covers parsing structured task properties from raw markdown.
- This spec covers displaying and sorting by parsed properties.
- This spec covers manual ordering within a column.
- This spec does not define grouping, swimlanes, or board layout.
- This spec does not cover property write-back, completion-date insertion, or Tasks-plugin status workflows.

---

## User Requirements

### Properties
1. The user can choose which property schema to use in plugin settings: Tasks plugin, Dataview, or None.
2. When a schema is selected, the plugin parses properties from task strings according to that schema.
3. Parsed properties are available on task cards and to ordering features.
4. Adding new schemas or property keys later should require minimal changes.

### Ordering
5. Tasks within a column can be sorted by a property value such as `due` or `priority`.
6. Missing property values sort last.
7. Alternatively, the user can manually drag tasks into a custom order that persists across sessions and file edits.
8. The ordering mode (`file`, `property`, `manual`) is a board-level setting.
9. In manual mode, tasks whose position is explicitly held are visibly marked as pinned; untouched tasks remain in file order.
10. The user can unpin a task, returning it to its natural file order without losing its block link.

### General
11. All of the above are configurable settings; no behaviour is inferred.

---

## High-Level Design

### Conceptual Model

A **property** is a named, typed value extracted from task text. Properties live alongside the task's textual content in raw markdown; they are parsed, not stored separately.

In addition to custom schema-defined properties, the plugin also automatically parses the task's checkbox status into a built-in property named `status`. The status is exactly one character between the `[` and `]` in the task definition.

```text
Task text:   "Fix login bug 📅 2024-01-20 ⏫"
Properties:  { status: " ", due: Date(2024-01-20), priority: 4 }

Task text:   "Write docs [due:: 2024-01-20] [priority:: medium]"
Properties:  { status: " ", due: Date(2024-01-20), priority: "medium" }

Task text:   "- [/] Review PR [due:: 2024-01-20]"
Properties:  { status: "/", due: Date(2024-01-20) }
```

### Schema Abstraction

```typescript
export interface PropertySchema {
  id: PropertySchemaOption;
  label: string;
  parseProperties(rawLine: string): TaskPropertyMap;
  knownKeys(): PropertyKeyMeta[];
}

export type TaskPropertyMap = Map<string, TaskProperty>;

export interface TaskProperty {
  key: string;
  rawValue: string;
  value: string | number | Date | null;
}

export interface PropertyKeyMeta {
  key: string;
  label: string;
  type: "date" | "number" | "text" | "priority";
}
```

Regardless of the selected schema, the returned `TaskPropertyMap` must always include the `status` property. The `status` property has type `text` and its value is the exact character parsed between the task's `[` and `]` brackets.

`knownKeys()` provides the base set for sort UI. For Dataview, sort choices should also include discovered inline keys present on currently parsed tasks.

### Schema Implementations

#### `NoneSchema`
Returns a property map containing only the universal `status` property.

#### `TasksPluginSchema`
Parses Tasks-plugin emoji metadata:

| Emoji | Key | Type |
|---|---|---|
| `📅` | `due` | date |
| `⏰` | `scheduled` | date |
| `🛫` | `start` | date |
| `🏁` | `done` | date |
| `🔺` / `⏫` / `🔼` / `🔽` / `⏬` | `priority` | priority |
| `🔁 <recurrence>` | `recurrence` | text |

#### `DataviewSchema`
Parses Dataview inline fields in supported forms:

- `key:: value`
- `[key:: value]`
- `(key:: value)`

Typing rules:

- ISO date -> `Date`
- pure number -> `number`
- otherwise -> `string`

Common keys such as `status`, `due`, `priority`, `start`, and `scheduled` get canonical typing and labels.

### Ordering Modes

```typescript
export enum ColumnOrderMode {
  FileOrder = "file",
  Property = "property",
  Manual = "manual",
}
```

#### Property Sort

Property sort applies within a column using typed comparison:

- dates by chronological order
- priorities by canonical numeric weight
- text by lexical order
- missing values last

#### Manual Ordering

Manual ordering is column-local in this spec.

Stable task identity uses Obsidian block links:

```typescript
type ManualOrderKey = string; // "path::blockLink"
type ManualOrderStore = Record<string, ManualOrderKey[]>; // key: columnTag
```

Important distinction:

- `ManualOrderKey` is the stable task identity, using Obsidian block links to refer back to a source line.
- `ManualOrderStore` does not define task identity; it only stores display order for a column.

When a task is first manually reordered and lacks a block link, the plugin auto-assigns one, then stores the order using `path + "::" + blockLink`.

##### Lazy pinning and the prefix invariant

Block links (and `ManualOrderStore` entries) are assigned **lazily**, never up front:

- Entering `Manual` mode assigns nothing. Every task starts unpinned and the
  column renders in file order.
- A task becomes **pinned** only when a drag requires it. Pinned status is defined
  solely by the presence of a `ManualOrderStore` entry; a task that has never been
  pinned has neither an entry nor a block link.
- A block link is necessary but not sufficient for pinning: an unpinned task may
  still carry a block link (e.g. one left behind after unpinning, or added by
  another tool). "Has a block link" ≠ "is pinned" — the store entry is the source
  of truth.

Display order is the store array first (pinned tasks, in stored order), then all
unpinned tasks in file order. This implies the load-bearing invariant:

> **Pinned tasks always form a contiguous prefix of the displayed column.**
> An unpinned task can never appear above a pinned one.

The invariant is what keeps the model expressible: because the tail is "whatever
isn't pinned, in file order," there is no way to represent a pinned task sitting
*below* an unpinned one. Every drag operation must preserve the prefix.

This is also why a drag pins **the dropped task plus every task above its drop
position** — that is the minimal set of pins that keeps the prefix contiguous.
Tasks already pinned in that prefix are reused (no new block link); only tasks
that lack one are written.

**Cost.** Writes scale with the *drop index*, not the move distance: dropping at
the top is one write; dropping at position _n_ assigns up to _n_ block links.
Because a column aggregates tasks across files, those writes may touch several
files, so block-link assignments are batched per file (one write per file) and
the resulting refresh is reconciled once (see Re-entrancy).

**Semantics.** `Manual` mode freezes only what you have dragged. The unpinned
tail continues to follow live file order, so newly added or externally edited
tasks land in the tail (never above a pinned task) rather than snapshotting the
whole column.

##### Pinned indicator

Pinned tasks render a small **pin marker** on the card so manual ordering is
visible rather than implicit. Use the existing icon set (a lucide `pin` glyph at
card-control size) rather than an emoji, to stay visually consistent with other
card controls:

- shown only when `columnOrderMode = Manual` and the task is pinned (has a
  `ManualOrderStore` entry).
- distinct from the drag handle: the handle is the affordance to reorder; the pin
  marker communicates "this task's position is explicitly held."
- unpinned tasks in `Manual` mode show the drag handle but no pin marker,
  signaling they are still floating in file order.

##### Unpinning

The pin marker is interactive: clicking it **unpins** the task.

- the task's `ManualOrderStore` entry is removed; it rejoins the unpinned tail and
  renders in its natural file order.
- the **block link is not removed**. By the time a task is pinned it may carry a
  block link relied on elsewhere (links, other plugins, Tasks dependencies), so
  unpinning only drops the order entry, never the anchor in the file.
- unpinning is always safe with respect to the prefix invariant: removing one
  entry shrinks the pinned prefix by one and the task moves into the file-order
  tail, so the remaining pinned tasks stay a contiguous prefix. No re-pinning or
  compaction of the others is required.

---

## UI Surfaces

Property controls are split across two surfaces by their nature:

- **Settings page** owns the "what format is my vault in" configuration that is set once.
- **Board header** owns the "how do I want to look at the board right now" controls, alongside the existing group-by dropdown.

### Settings page

New section in Settings: **Task Properties**

```text
Property Schema:  [ None ▼ ]
Show properties:  [ None ▼ ]   (None / Pretty / Debug (JSON))
```

The schema picker and `propertyDisplay` selector live here. `Show properties`
is a tri-state display mode rather than a boolean toggle:

- `None` — no property strip on cards.
- `Pretty` — formatted property chips (dates as `Jan 20`, priorities as labels).
- `Debug (JSON)` — raw parsed property map as a JSON dump (developer aid).

Ordering is **not** configured here.

### Board header (sort control)

Ordering is controlled from the board header, next to the group-by dropdown, mirroring
how `groupSource` is persisted in settings but rendered/controlled from the board.

The control is a **single unified dropdown** plus a **direction toggle**. The dropdown
collapses `columnOrderMode` and `sortProperty` into one list; selecting a property
implies `columnOrderMode = Property` with that `sortProperty`, while `File order` and
`Manual` map to their respective modes.

```text
Board header:
[ Group by: (none) ▼ ]  [ Sort: File order ▼ ]

After picking a property:
[ Sort: Due ▼ ] [ ↑ ]
```

Dropdown contents (schema = Tasks):

```text
  File order
  Manual            (Phase 4)
  ──────────
  Status
  Due
  Scheduled
  Start
  Done
  Created
  Priority
  Recurrence
```

Behavior:

- The dropdown always offers `File order` and `Manual`, then a separator, then the
  available sort keys for the active schema.
- The available sort keys are `schema.knownKeys()`, plus — for Dataview only —
  discovered inline keys present on currently parsed tasks.
- `status` is always present as a sort key, including under the `None` schema. The
  control is never fully disabled.
- The direction toggle (`↑` ascending / `↓` descending, bound to `sortDirection`) is
  shown only when a property is selected (i.e. `columnOrderMode = Property`).
- Manual ordering shows drag handles only when `columnOrderMode = Manual`.
- In `Manual` mode, pinned tasks additionally show a small pin marker (lucide
  `pin`); unpinned tasks show the drag handle only. Clicking the pin marker
  unpins the task (see Pinned indicator / Unpinning).

---

## Data Model Changes

### `Task`

```typescript
readonly properties: TaskPropertyMap;
```

Properties are populated at parse time via a `TaskParseContext`.

```typescript
export interface TaskParseContext {
  columnTagTable: ColumnTagTable;
  consolidateTags: boolean;
  doneStatusMarkers: string;
  cancelledStatusMarkers: string;
  ignoredStatusMarkers: string;
  propertySchema: PropertySchema;
}
```

### Settings

```typescript
propertySchema:  PropertySchemaOption;
columnOrderMode: ColumnOrderMode;
sortProperty:    string | null;
sortDirection:   "asc" | "desc";
propertyDisplay: PropertyDisplayMode; // None | Pretty | Debug
```

Manual order data is stored separately from display settings:

```typescript
interface PluginData {
  settings: SettingValues;
  manualOrder: ManualOrderStore;
}
```

---

## Detailed Behavior

### Property Parsing

- non-destructive: task content is not rewritten
- parsed from the raw line before column-tag or block-link stripping
- first occurrence wins for duplicate keys
- **Status Property**: The checkbox character (exactly one character between the `[` and `]` of the task definition) is parsed and stored in the properties map under the key `status` (type `text`).
  - Example: `- [ ] Task` results in `{ key: "status", rawValue: " ", value: " " }`
  - Example: `- [x] Task` results in `{ key: "status", rawValue: "x", value: "x" }`
  - Example: `- [-] Task` results in `{ key: "status", rawValue: "-", value: "-" }`
  - Example: `- [/] Task` results in `{ key: "status", rawValue: "/", value: "/" }`
  - This property is universal and populated for all schemas (including `None`).

### Property Display

`propertyDisplay` selects how parsed properties appear below task content:

- `None` — nothing is rendered.
- `Pretty` — recognized properties are shown as chips:
  - dates as locale-short values such as `Jan 20`
  - priorities as labels such as `High`
  - text values as-is
  - recognized Tasks-plugin properties use their Tasks emoji as the chip icon
    (`📅` due, `⏳` scheduled, `🛫` start, `✅` done, `➕` created, `🔁` recurrence,
    and the level emoji `🔺`…`⏬` for priority); unrecognized keys fall back to a
    text label. Icons are keyed on the canonical property key, so Dataview dates
    also get icons, while non-numeric Dataview priority text falls back to a label.
  - the universal `status` property is omitted (the checkbox already conveys it)
  - the raw text of each displayed property is hidden from the rendered task
    body (it is shown only as a chip), mirroring how consolidated tags move to
    the footer. The underlying markdown is not modified; the edit view still
    shows the full source.
- `Debug (JSON)` — the raw parsed property map is dumped as JSON for development.

### Property Sorting

- sorting is applied within a column
- `file` order remains the fallback when `columnOrderMode = FileOrder`
- property sort never mutates raw markdown

### Manual Ordering

- ordering is applied within a column
- unordered tasks append after explicitly ordered tasks in file order
- stale order entries are pruned when tasks are removed from the column
- pinned tasks form a contiguous prefix of the column (see prefix invariant)

#### Drop algorithm

When a task is dropped at display index `dropIndex` within a column (`Manual`
mode):

1. **Compute the target prefix.** Take the column's current display order, apply
   the move, and slice `[0 .. dropIndex]` — the dropped task plus every task above
   it. These are the tasks that must be pinned to hold the new position.
2. **Assign missing block links.** For each prefix task without a block link,
   auto-assign one. Group assignments by file and write each file once. Tasks in
   the prefix that are already pinned keep their existing block link (no write).
3. **Rewrite the store entry.** Set `manualOrder[columnTag]` to the prefix in its
   new order, expressed as `path + "::" + blockLink` keys. Tasks below the prefix
   are left unpinned and fall back to file order.
4. **Reconcile once.** The block-link writes trigger a re-parse; suppress the
   matching refresh-side reset so the just-set order is not clobbered (see
   Architectural Concern #2).

Properties of the algorithm:

- dropping at the top assigns one block link; dropping at index `n` assigns up to
  `n` block links (only those not already pinned).
- the prefix invariant is preserved by construction: everything above the drop is
  pinned, so no unpinned task is ever above a pinned task.
- the unpinned tail is never written; it continues to follow live file order.

#### Unpin operation

Clicking a task's pin marker removes its `ManualOrderStore[columnTag]` entry. The
task rejoins the unpinned tail in file order. The block link is left in the file
(it may be referenced elsewhere), so unpinning is a store-only mutation with no
file write. The prefix invariant is preserved automatically: the remaining
entries still describe a contiguous prefix.

### Serialization

Parsed properties stay in raw markdown exactly as written. This spec does not reorder, normalize, or write back property text.

---

## File Structure

```text
src/
  parsing/
    properties/
      index.ts
      property_schema.ts
      none_schema.ts
      tasks_schema.ts
      dataview_schema.ts
      comparators.ts
  ui/
    tasks/
      task.ts
      tasks.ts
      store.ts
      manual_order.ts
    settings/
      settings_store.ts
      settings.ts
    components/
      task.svelte
    board/
      BoardCell.svelte
      board_matrix.ts
    text_view.ts
```

---

## Implementation Plan

### Phase 1: Schema Infrastructure and Parsing
**Goal:** Parse and store properties on task objects.

1. [x] Add `propertySchema` to `TaskParseContext`
2. [x] Create `src/parsing/properties/`
3. [x] Implement universal `status` property parsing from task checkbox (`[<char>]`)
4. [x] Implement `NoneSchema` with unit tests (returns map with only `status`)
5. [x] Implement `TasksPluginSchema` with unit tests (includes emoji properties + `status`)
6. [x] Implement `DataviewSchema` with unit tests (includes inline fields + `status`)
7. [x] Add `properties` to `Task`
8. [x] Thread schema selection from settings through parsing
9. [x] Add schema picker to Settings UI

**Deliverable:** `task.properties` is populated correctly for the selected schema, including the universal `status` property.

### Phase 2: Property Sort
**Goal:** Sort tasks within a column by the configured property.

1. [x] Add `columnOrderMode`, `sortProperty`, and `sortDirection` to settings (zod schema + defaults), mirroring `groupSource`
2. [x] Implement typed comparators with null-last behavior (date/number/text by parsed value type)
3. [x] Apply sort in column task computation (`deriveBoardMatrix`, with file order as stable tiebreak)
4. [x] Derive available sort keys reactively: `schema.knownKeys()` ∪ discovered Dataview keys; `status` always included
5. [x] Add the unified sort dropdown + direction toggle to the board header (next to group-by); direction toggle shown only when a property is selected

**Deliverable:** Tasks sort by the configured property, controlled from the board header, without affecting parsing or storage.

### Phase 3: Property Display
**Goal:** Show parsed properties on cards when enabled.

1. [x] Add `propertyDisplay` (None / Pretty / Debug) to settings, replacing the
   debug-only `showProperties` toggle and migrating legacy values (`true` → Debug)
2. [x] Render property strip in `task.svelte` (Pretty chips + Debug JSON)
3. [x] Format property values for display (`display.ts`: dates, priority labels, text)
4. [x] Move the display control out of "Advanced task parsing" into the
   "Task properties" settings section, next to the schema picker

**Deliverable:** Task cards can display parsed properties in Pretty or Debug form.

### Phase 4: Manual Ordering
**Goal:** Persist manual drag ordering within a column.

1. [x] Implement `manual_order.ts` (prefix-pin drop algorithm + store helpers)
2. [x] Lazily auto-assign block links for the drop prefix only, batched per file
3. [x] Handle block-link write re-entrancy deterministically (reconcile once)
4. [x] Add manual-order drag handles to the column task list
5. [x] Render the pin marker (lucide `pin`) on pinned tasks in `Manual` mode; clicking it unpins (store-only, keeps block link)
6. [x] Save and load column-local `ManualOrderStore`
7. [x] Prune stale entries on task removal

**Deliverable:** Manually reordered tasks remain in order across reloads, with
pinned tasks marked and the unpinned tail following file order. Covers test
cases: ME1–ME4, P1–P5, PI1–PI3, CF1–CF2, PE1–PE5, PM1, U1–U5, PR1–PR2, IX1–IX2
(all must pass before this spec is marked complete).

#### Implementation notes (code landed; manual test cases still pending)

- **Storage.** The plugin has no separate data file: settings persist in the
  board's frontmatter (`kanban_plugin`). `ManualOrderStore` is therefore stored
  as its own `manualOrder` field on `SettingValues` (zod: `record(string,
  array(string))`) rather than the conceptual `PluginData` wrapper. It is kept a
  distinct field so it is never conflated with display settings, and it is
  written via a lightweight `settingsStore.update` that does **not**
  re-initialise the tasks store (which would clobber a just-set order).
- **Re-entrancy.** No timing heuristic is needed: a task's `id` hashes
  `content + path + rowIndex`, none of which include the block link, so
  appending ` ^id` to a line preserves task identity. After the write triggers a
  re-parse, tasks keep their ids and now carry the block links the store already
  references, so display recomputes to the same order — no snap-back.
- **Grouping guard (this spec is ungrouped-only).** Manual *display* order works
  under grouping for free (ordering is applied to the whole column before the
  swimlane split, so each cell shows the column-global relative order). But
  drag-*reorder* is gated behind `reorderEnabled = isManualOrder && groupSource
  is none`: the store is column-keyed, so a grouped drop would rewrite the whole
  column prefix from a single swimlane's tasks and clobber the other swimlanes.
  Pin markers stay visible when grouped and *unpin* stays allowed (a targeted
  single-key removal cannot clobber other groups); only drag handles and reorder
  drops are suppressed. Grouped manual ordering is deferred to `SPEC 0021`, whose
  natural extension is to key the store by `columnTag::secondaryId` (cell-local
  order with a per-cell prefix invariant), which subsumes the ungrouped case as
  the single-default-bucket degenerate form.

---

## Manual Test Cases

Phases 1–3 (parsing, sort, display) are covered by unit tests. The Phase 4 manual
ordering behavior is stateful, touches the filesystem, and crosses the
parse/re-render boundary, so it must be verified manually.

All Phase 4 test cases must be checked off before this spec can be marked complete.

### Mode Entry

- [ ] **ME1.** With `columnOrderMode = File order`, no drag handles or pin markers appear on cards.
- [ ] **ME2.** Switch the board header sort control to `Manual`. Drag handles appear on every card; no pin markers appear yet (nothing is pinned).
- [ ] **ME3.** On entering `Manual` mode, no block links are written to any source file (inspect a file before and after — content is unchanged).
- [ ] **ME4.** In `Manual` mode the column initially renders in file order, identical to `File order` mode.

### Pinning via Drag

- [ ] **P1.** Drag a task to the top of a column. Only that task receives a block link in its source file; no other task is modified.
- [ ] **P2.** Drag a task to the 3rd position. That task and exactly the two tasks above it receive block links; tasks below are untouched.
- [ ] **P3.** After P2, the three top tasks show a pin marker; all tasks below show a drag handle but no pin marker.
- [ ] **P4.** Drag an already-pinned task to a new position within the existing pinned prefix. No new block link is written (existing ones are reused); only the store order changes.
- [ ] **P5.** Drag a task to a position below an existing pin, extending the prefix. Only the newly covered, previously-unpinned tasks get block links.

### Prefix Invariant

- [ ] **PI1.** After any drag, the pinned (marker-bearing) tasks are a contiguous block at the top of the column — no unpinned task ever appears above a pinned one.
- [ ] **PI2.** Attempting to drop a task above the pinned prefix pins the intervening tasks as needed so the prefix stays contiguous (you cannot leave a gap).
- [ ] **PI3.** With a pinned prefix present, a brand-new task added to the source file appears in the unpinned tail (in file order), never above a pinned task.

### Cross-File Writes

- [ ] **CF1.** In a column aggregating tasks from multiple files, drag a task so the prefix spans two files. Both files receive block links; each is written exactly once.
- [ ] **CF2.** After CF1, no unrelated lines in either file are reformatted or reordered.

### Persistence & Re-entrancy

- [ ] **PE1.** Pin several tasks, then reload the board (close and reopen the view). The manual order is preserved exactly.
- [ ] **PE2.** Pin several tasks, then fully reload the vault/Obsidian. The manual order is preserved exactly.
- [ ] **PE3.** Immediately after a drag, the just-set order is not clobbered by the re-parse triggered by the block-link write (no visible "snap back").
- [ ] **PE4.** Edit a pinned task's text in the source markdown. Its position in the column is preserved (identity follows the block link, not the content hash).
- [ ] **PE5.** Move a pinned task to a different line in its source file (without changing the block link). Its column position is preserved.

### Pin Marker & Unpinning

- [ ] **PM1.** The pin marker uses the shared icon set (lucide `pin`), not an emoji, and sits alongside other card controls.
- [ ] **U1.** Click a pinned task's pin marker. The task loses its marker and moves to its natural file-order position in the unpinned tail.
- [ ] **U2.** After U1, inspect the source file: the block link is still present (unpinning does not remove the anchor).
- [ ] **U3.** Unpin a task from the middle of the pinned prefix. The remaining pinned tasks stay contiguous at the top and keep their relative order.
- [ ] **U4.** Re-pin a task that was previously unpinned (and still has a block link). No new block link is written; the existing one is reused.
- [ ] **U5.** Unpin every pinned task in a column. The column returns to pure file order; no pin markers remain; drag handles still show (mode is still `Manual`).

### Lifecycle & Pruning

- [ ] **PR1.** Delete a pinned task from its source file. Its stale `ManualOrderStore` entry is pruned; remaining pinned tasks keep their order.
- [ ] **PR2.** Move a pinned task out of the column (change its column tag). Its entry is removed from that column's order and it appears correctly in the destination column.

### Interaction with Other Modes

- [ ] **IX1.** Switch from `Manual` to a property sort, then back to `Manual`. The previously pinned order is restored (the store survived the round trip).
- [ ] **IX2.** Manual ordering works under every property schema, including `None` (manual mode is never disabled by schema choice).

---

## Architectural Concerns

### 1. Task Identity vs Order Storage

Block links are the stable task identity. Order storage is only an index over those stable identities.

### 2. Deterministic Re-entrancy Handling

Block-link auto-assignment should suppress only the matching refresh-side reset, not use a fixed timing heuristic.

### 3. Keep Layout Out of This Spec

This spec should not assume grouped renderers, matrix cells, or flow-specific DOM structure. Those belong to the board-matrix and grouping specs.

---

## Open Questions / Future Considerations

- property filtering
- additional schemas such as YAML or custom regex
- property editing from the kanban
- completion-date write-back
- Tasks-plugin status workflows
- grouped manual ordering as an extension of column-local manual order
