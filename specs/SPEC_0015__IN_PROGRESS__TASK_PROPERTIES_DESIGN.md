Status: IN_PROGRESS

# SPEC 0015 — Task Properties, Manual Ordering, and Grouping

## Feature Request Summary

Three related features that all affect how tasks are arranged in the board:

1. **Task properties** — structured key-value metadata parsed from task text according to a user-selected schema (Tasks plugin emoji format or Dataview inline fields), enabling property-based sorting and grouping.
2. **Manual ordering** — persistent drag-to-reorder within a column, surviving page reloads and file edits.
3. **Grouping** — partitioning tasks by a property value, with labelled section dividers that span all columns simultaneously, creating a grid-like layout while keeping columns as the primary visual axis.

Note: "swim lanes" and "grouped columns with spanning dividers" are the **same feature**. The spanning divider is what creates the swim-lane appearance. There is no separate swim-lanes concept in this design.

Supported schemas at launch:
- **Obsidian Tasks plugin** (emoji-based fields, e.g. `📅 2024-01-15`)
- **Dataview inline fields** (e.g. `due:: 2024-01-15`)

The active schema is a plugin setting; properties are never inferred.

---

## User Requirements

### Properties
1. The user can choose which property schema to use (Tasks plugin, Dataview, or None) in plugin settings.
2. When a schema is selected, the plugin parses properties from task strings according to that schema.
3. Parsed properties are available on task cards (optionally displayed).
4. Adding new schemas or property keys later should require minimal changes.

### Ordering (within a column)
5. Tasks within a column can be sorted by a property value (e.g. sort by `due` ascending). Missing properties sort last.
6. Alternatively, the user can manually drag tasks into a custom order that persists across sessions and file edits.
7. The ordering mode (file order / property sort / manual) is a board-level setting.

### Grouping
8. Tasks can be grouped by a property value, creating labelled sections. When grouping is active, every column shows all group sections (including empty ones), and a single horizontal divider line spans across all columns at each section boundary.
9. Grouping is only available in horizontal flow mode (LTR/RTL). It is disabled and hidden in vertical flow (TTB/BTT).

### General
10. All of the above are configurable settings; no behaviour is inferred.

---

## High-Level Design

### Conceptual Model

A **property** is a named, typed value extracted from task text. Properties live alongside the task's textual content — they are part of the raw markdown, not separately stored.

```
Task text:   "Fix login bug 📅 2024-01-20 ⏫"
Properties:  { due: Date(2024-01-20), priority: 4 }

Task text:   "Write docs [due:: 2024-01-20] [priority:: medium]"
Properties:  { due: Date(2024-01-20), priority: "medium" }
```

### Schema Abstraction

A `PropertySchema` is a named object that knows:
1. How to **parse** properties from a raw task string → `TaskPropertyMap`
2. The **canonical keys** it produces (used to build sort/group UI dropdowns)

```typescript
export interface PropertySchema {
  id: PropertySchemaOption;
  label: string;
  parseProperties(rawLine: string): TaskPropertyMap;
  knownKeys(): PropertyKeyMeta[];
}

export type TaskPropertyMap = Map<string, TaskProperty>;

export interface TaskProperty {
  key: string;        // normalized key, e.g. "due", "priority"
  rawValue: string;   // raw string as it appears in source
  value: string | number | Date | null;
}

export interface PropertyKeyMeta {
  key: string;
  label: string;
  type: "date" | "number" | "text" | "priority";
}
```

### Schema Implementations

#### `NoneSchema`
Returns an empty map for every task.

#### `TasksPluginSchema`
Parses the [Obsidian Tasks plugin](https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format) emoji format:

| Emoji | Key | Type |
|-------|-----|------|
| `📅` | `due` | date |
| `⏰` | `scheduled` | date |
| `🛫` | `start` | date |
| `🏁` | `done` | date |
| `🔺` | `priority` | priority (5=highest) |
| `⏫` | `priority` | priority (4) |
| `🔼` | `priority` | priority (3) |
| `🔽` | `priority` | priority (2) |
| `⏬` | `priority` | priority (1=lowest) |
| `🔁 <recurrence>` | `recurrence` | text |

#### `DataviewSchema`
Parses [Dataview inline fields](https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/) in three forms:
- `key:: value` (standalone)
- `[key:: value]` (bracketed)
- `(key:: value)` (parenthesized)

Values are heuristically typed: ISO date → `Date`, pure number → `number`, else `string`. Common keys (`due`, `priority`, `start`, `scheduled`) get priority-string-to-number mapping.

---

### Column Ordering Mode

```typescript
export enum ColumnOrderMode {
  FileOrder = "file",     // default: path + rowIndex order (current behaviour)
  Property  = "property", // sort by a configured property key
  Manual    = "manual",   // explicit user-defined order via drag-and-drop
}
```

---

### Board Layout: Grouped vs Ungrouped

This is the central architectural decision for grouping.

**Ungrouped (current layout, preserved):**
```
.columns > div  { display: flex; gap: ... }
  <Column />   <Column />   <Column />
```
Each `Column` component renders its full task list. This is unchanged.

**Grouped layout (new):**

When `groupProperty` is set and flow is horizontal, `main.svelte` renders a CSS grid instead:

```
.board-grid {
  display: grid;
  grid-template-columns: repeat(N, {columnWidth}px);
}

DOM structure:
  <div class="group-divider" style="grid-column: 1 / -1">⏫ High</div>
  <ColumnCell tasks={Later∩High} />
  <ColumnCell tasks={Soonish∩High} />
  <ColumnCell tasks={Today∩High} />

  <div class="group-divider" style="grid-column: 1 / -1">🔼 Medium</div>
  <ColumnCell tasks={Later∩Medium} />
  ...
```

The `group-divider` element spans all columns (`grid-column: 1 / -1`) in a single DOM node — no JS measurement, no overlay. CSS grid row heights are determined by the tallest cell in each group row automatically.

The global group-value list is derived from all tasks (not just the visible column) so every column shows every group section, including empty ones. Empty sections show just the divider header with minimal height — no card-sized placeholder.

**Column headers** in grouped mode:
Column headers (name, colour, collapse toggle) are pinned as a sticky header row above the grid, outside the grid structure, since they don't participate in group rows.

**Component split:**

| Mode | Component | Responsibility |
|---|---|---|
| Ungrouped | `column.svelte` | Full column: header + sorted task list |
| Grouped | `column.svelte` | Full column: header + sorted task list (unchanged) |
| Grouped | `column_cell.svelte` | Task list only, for one (group, column) cell |
| Grouped | `board_grid.svelte` | CSS grid, column headers, group dividers, ColumnCell grid |

`column.svelte` is **not** modified to be dual-mode. It is used as-is in ungrouped mode. `column_cell.svelte` is a new, simpler component used only in grouped mode. `board_grid.svelte` owns the grouped layout.

**flowDirection constraint:**
Grouping is only meaningful in horizontal flow (LTR/RTL). In vertical flow (TTB/BTT) the concept of a "horizontal line across all columns" has no equivalent — columns are stacked, not side by side. When `flowDirection` is TTB or BTT, the `groupProperty` setting is ignored and the grouping controls are hidden in the UI.

---

### Manual Ordering

#### The Stable Identity Problem

The current task ID (`sha256(content + path + rowIndex)`) is unstable for persistent ordering:
- Content edits → new ID
- Lines inserted above → rowIndex changes → new ID
- File rename → path changes → new ID

#### Block Links as Stable Keys

Obsidian block links (`^abc12` appended to a line) are stable: they are embedded in the markdown, survive content edits, survive file renames, and are already part of the Task model.

When the user first manually reorders a task that has no block link, the plugin auto-assigns one:
1. Generate a short random alphanumeric ID (5–6 chars)
2. Write it to the task line via `vault.modify()`
3. Use `path + "::" + blockLink` as the stable key

File rename caveat: the `(path, blockLink)` key breaks on rename. Renames already trigger full store reinitialisation, so manual order silently degrades (tasks fall back to file order) and the user can re-drag. A rename migration handler is a future improvement.

#### Manual Order Storage

Stored separately from display settings in plugin data (see Architectural Concerns below):

```typescript
type ManualOrderKey = string; // "path::blockLink"

// key: columnTag (or groupValue + "::" + columnTag when grouped)
type ManualOrderStore = Record<string, ManualOrderKey[]>;
```

When grouping is active, the key for a cell is `"${groupValue}::${columnTag}"` (with `"__ungrouped__"` as the groupValue when grouping is off — avoiding the fragile `__default__` sentinel and making intent clearer). Tasks absent from the array appear after listed tasks in file order.

#### Drag-and-Drop Integration

When `columnOrderMode = Manual`:
- Within-column (or within-cell) drag handles appear
- Block links are auto-assigned before writing the order
- Cross-column drag reassigns the column tag and appends to the destination's order list
- On task removal (done, archived, deleted), stale entries are pruned at save time

The vault modify event triggered by block-link assignment must be handled carefully: the store's file-modify handler should detect when a re-parse produces the same logical tasks (same content, different raw line due to added block link) and not reset ordering state. This is a subtle re-entrancy concern addressed in the implementation notes.

---

### Settings UI

New section in the Settings modal: **"Task Properties"**

```
Property Schema:  [ None ▼ ]

── Ordering ─────────────────────────────────────────
Column order:     [ File order ▼ ]
                  File order / Sort by property / Manual

  [if Property sort:]
  Sort by:        [ due ▼ ]   [ Ascending ▼ ]

── Grouping ─────────────────────────────────────────
Group by:         [ (none) ▼ ]
  (disabled + hidden when flow = vertical)
```

The property key dropdowns are disabled when schema is `"none"`.

---

### Display on Task Cards

Opt-in (`showProperties: boolean`, default `false`): a small strip below task content shows recognized properties (e.g. `📅 Jan 20`).

---

## Data Model Changes

### `Task` class

New field:
```typescript
readonly properties: TaskPropertyMap;
```

The schema is passed in at construction time. To avoid a 9-parameter constructor (already at 8), introduce a `TaskParseContext` value object:

```typescript
export interface TaskParseContext {
  columnTagTable: ColumnTagTable;
  consolidateTags: boolean;
  doneStatusMarkers: string;
  cancelledStatusMarkers: string;
  ignoredStatusMarkers: string;
  propertySchema: PropertySchema;  // new
}
```

Constructor becomes:
```typescript
constructor(
  rawContent: TaskString,
  fileHandle: { path: string },
  rowIndex: number,
  context: TaskParseContext,
)
```

This is a breaking change to the `Task` constructor signature but it's the right one — the constructor is already overloaded and this gives a named, extensible structure.

### Settings

New display settings fields (in `settings_store.ts`):
```typescript
propertySchema:   PropertySchemaOption;   // "none" | "tasks" | "dataview"
columnOrderMode:  ColumnOrderMode;        // "file" | "property" | "manual"
sortProperty:     string | null;
sortDirection:    "asc" | "desc";
groupProperty:    string | null;
showProperties:   boolean;
```

Manual order data is **not** in `SettingValues`. It is stored separately (see below).

### Separate Manual Order Storage

`plugin.loadData()` / `plugin.saveData()` returns one blob. We split it into two keys:

```typescript
// What plugin.loadData() returns:
{
  settings: SettingValues,          // display + behaviour settings (existing)
  manualOrder: ManualOrderStore,    // ordering data (new, separate concern)
}
```

`ManualOrderStore` is loaded alongside settings at startup and saved independently on drag events. This avoids bloating the settings object and allows different save frequencies (settings save on user action; order saves on drag-drop).

---

## File Structure

```
src/
  parsing/
    properties/
      index.ts               — re-exports public API
      property_schema.ts     — PropertySchema interface, TaskParseContext, types
      none_schema.ts         — NoneSchema
      tasks_schema.ts        — TasksPluginSchema + tests
      dataview_schema.ts     — DataviewSchema + tests
      comparators.ts         — typed null-last comparators
  ui/
    tasks/
      task.ts                — add properties field; adopt TaskParseContext
      tasks.ts               — thread TaskParseContext through
      store.ts               — thread TaskParseContext through
      manual_order.ts        — block-link auto-assign, ManualOrderStore CRUD
    settings/
      settings_store.ts      — add new fields (not ManualOrderStore)
      settings.ts            — add schema/ordering/grouping UI
    components/
      column.svelte          — unchanged (used in ungrouped mode)
      column_cell.svelte     — task list only, for grouped mode cells (new)
      board_grid.svelte      — CSS grid layout + column headers + dividers (new)
      task_card.svelte       — add property strip, drag handle
    main.svelte              — switch between column.svelte and board_grid.svelte
```

---

## Detailed Behavior

### Property Parsing
- Non-destructive: `content` field is not modified.
- Parsed from the raw line before column tag / block-link stripping.
- First occurrence wins for duplicate keys.

### Grouping — Global Group Values
The set of group values is derived from **all tasks in the board** (not just the visible column), then sorted by the property comparator with null last. Every column/cell renders all group values — including empty ones — so section boundaries align.

### Grouping — Empty Sections
An empty group section renders the divider header only (minimal height, no padding). It does not render a card-sized drop zone. This keeps columns compact when a group has no tasks.

### Grouping — Special Columns
The Done, Uncategorised, and Archived columns participate in grouping the same way as regular columns. Done and Uncategorised columns already have their own visibility logic; grouping does not override it.

### Ordering — Interaction with Grouping
When both `columnOrderMode = Manual` and `groupProperty` are set, the manual order applies within each `(group, column)` cell independently. The `ManualOrderStore` key is `"${groupValue}::${columnTag}"`.

When `columnOrderMode = Property`, the sort applies within each cell as well.

### Serialization
Properties stay in raw markdown exactly as written. The plugin does not modify, reorder, or reformat properties.

---

## Implementation Plan

### Phase 1: Schema infrastructure + parsing
**Goal:** Schema can be selected in settings; properties parsed and stored on Task objects; no UI changes beyond the settings picker.

1. [ ] Define `TaskParseContext` in `property_schema.ts`; refactor `Task` constructor to use it (update all call sites in `tasks.ts`, `store.ts`, test files)
2. [ ] Add `PropertySchemaOption` enum + `propertySchema` to settings
3. [ ] Implement `NoneSchema`, `TasksPluginSchema` + tests, `DataviewSchema` + tests
4. [ ] Add `properties: TaskPropertyMap` to `Task`; wire schema through `TaskParseContext`
5. [ ] Add schema picker to Settings UI

**Deliverable:** Schema selection persists; `task.properties` is populated correctly (verified by unit tests).

---

### Phase 2: Property sort
**Goal:** Tasks in each column sort by the configured property.

1. [ ] Add `ColumnOrderMode`, `columnOrderMode`, `sortProperty`, `sortDirection` to settings
2. [ ] Implement `comparators.ts` with typed null-last comparison
3. [ ] Apply sort in column rendering when mode = `Property` (reactive, in `column.svelte`)
4. [ ] Add ordering mode + sort key controls to Settings UI
5. [ ] Test: sort by date, priority, text; nulls last; file order unaffected

**Deliverable:** Tasks in a column sort by due date / priority when configured.

---

### Phase 3: Property display on task cards
**Goal:** Recognized properties shown on cards when enabled.

1. [ ] Add `showProperties: boolean` to settings (default `false`)
2. [ ] Add property strip to `task_card.svelte`
3. [ ] Format: dates as locale-short, priorities as labels, text as-is
4. [ ] Test: strip appears/disappears correctly

**Deliverable:** Card shows `📅 Jan 20` or `due: Jan 20` when enabled.

---

### Phase 4: Manual ordering
**Goal:** Drag-to-reorder within a column persists across sessions.

1. [ ] Split plugin data into `{ settings, manualOrder }` at load/save; update `entry.ts`
2. [ ] Implement `manual_order.ts`: `ManualOrderStore` type, CRUD helpers, stale-entry pruning
3. [ ] Implement block-link auto-assignment in `manual_order.ts`; handle vault-modify re-entrancy in `store.ts`
4. [ ] Add within-column drag handles to `task_card.svelte` (visible only when mode = `Manual`)
5. [ ] On drop: update `ManualOrderStore`, save
6. [ ] Apply manual order in `column.svelte` when mode = `Manual`; unordered tasks append in file order
7. [ ] Prune stale order entries when tasks are done/archived/deleted/moved
8. [ ] Test: reorder → reload → order preserved; new tasks append; stale-entry cleanup; block-link assignment round-trip

**Deliverable:** Manually reordered tasks stay in place across board reloads.

---

### Phase 5: Grouping with spanning dividers
**Goal:** Tasks grouped by property with a single horizontal divider spanning all columns.

1. [ ] Add `groupProperty: string | null` to settings; hide control when `flowDirection` is vertical
2. [ ] Implement global group-value derivation (from all tasks; sorted; null last)
3. [ ] Implement `column_cell.svelte`: task list only (no header), accepts `tasks` + ordering context
4. [ ] Implement `board_grid.svelte`: CSS grid layout, sticky column-header row, group dividers (`grid-column: 1 / -1`), `ColumnCell` grid items
5. [ ] In `main.svelte`: render `board_grid.svelte` when `groupProperty` is set and flow is horizontal; render existing `column.svelte` loop otherwise
6. [ ] Wire `columnOrderMode = Manual` with `(groupValue, columnTag)` keyed order in `ManualOrderStore`
7. [ ] Test: tasks appear in correct group sections; empty sections show header only; dividers span all columns; manual order works per cell; vertical flow disables grouping

**Deliverable:** Setting `groupProperty = "priority"` shows grouped sections with a single spanning divider line between High / Medium / (no value).

---

## Architectural Concerns

The following concerns must be addressed during implementation. Some require changes to the plan above; all require conscious decisions.

### 1. `main.svelte` is already too large (946 lines)

The current file handles: filter state and persistence, column grouping logic (`groupByColumnTag`), sidebar resize, task count, and all column rendering. Adding two more rendering modes (grid) and property controls will make it unmanageable.

**Required before Phase 5:** Extract `groupByColumnTag` into `src/ui/tasks/task_grouping.ts` as a pure function. Extract filter sidebar state management into a separate component (`filter_sidebar.svelte`). `main.svelte` should be a thin coordinator, not a logic sink.

### 2. The `Task` constructor takes 8 parameters — and the plan adds a 9th

The `TaskParseContext` refactor in Phase 1 is **not optional**. It must happen first, because every subsequent phase depends on Task construction. Skipping it and adding `propertySchema` as a 9th positional argument would make the codebase worse, not better.

### 3. `ManualOrderStore` must not live in `SettingValues`

Manual order data has completely different characteristics from display settings: it changes on every drag, can grow large (one entry per manually-ordered task), and does not benefit from the Zod-validated settings schema. Storing it in `SettingValues` would bloat every settings write and couple two unrelated concerns. The Phase 4 plan correctly separates them in plugin data; this must not be simplified away.

### 4. Block-link auto-assignment triggers vault modify re-entrancy

When a task is first drag-reordered:
1. A block link is written to the file via `vault.modify()`
2. The `vault.on("modify")` handler fires
3. `processFile()` re-parses the file
4. `debounceSetTasks()` emits a new task list
5. If the new task list causes the UI to re-render the column before the manual order is applied, the task jumps back to its pre-drag position momentarily

This must be handled: when re-parsing a file immediately after a block-link assignment, the store should recognise the re-parse as a "block link addition only" and not emit a task-list update that would disrupt ordering. One approach: after auto-assigning a block link, suppress the next modify event for that file path for a short window (100ms).

### 5. Dual rendering mode (`column.svelte` loop vs `board_grid.svelte`) is a conditional in `main.svelte`

This is acceptable as long as the condition is a single `{#if groupProperty && !isVerticalFlow}` block that switches between two completely self-contained rendering paths. It becomes a problem if the condition starts leaking into child components as feature flags. Keep the two paths strictly separate.

### 6. `groupByColumnTag` is a pure function but lives in the view

The existing `groupByColumnTag` function in `main.svelte` contains business logic (handling done, archived, uncategorised). It belongs in the task layer (`src/ui/tasks/`) as a pure, tested utility. This is pre-existing technical debt that these phases will make worse if not addressed first.

### 7. The `"file"` pseudo-property for grouping is inconsistent with the schema model

If we allow `groupProperty = "file"` (group by source file), it cannot be parsed from a `PropertySchema` — it is derived from `task.path`, not from task text. Using a bare string `"file"` that is specially handled in comparators and the group-value derivation is a type inconsistency.

**Decision required:** Either (a) make `"file"` a proper pseudo-schema that implements `PropertySchema` and returns `task.path` as a property, or (b) use a discriminated union for the group source:
```typescript
type GroupSource =
  | { kind: "property"; key: string }
  | { kind: "file" };
```
Option (b) is safer and more explicit. Recommendation: use (b), stored as `groupSource` in settings rather than `groupProperty`.

### 8. Collapsible groups are not addressed

The existing `collapsedColumns` setting tracks which columns are collapsed. Once grouping is added, users will want to collapse individual group sections too. This is a separate feature, but the data model for it should be considered now to avoid a conflicting schema later. Placeholder: a `collapsedGroups: string[]` field (storing `"${groupValue}::${columnTag}"` keys) in settings.

---

## Open Questions / Future Considerations

- **Per-column ordering mode**: start global; per-column can be added without schema changes later.
- **Additional schemas**: YAML frontmatter, custom regex — the interface supports these.
- **Filtering by property**: natural follow-on.
- **Cross-group drag** (changing a task's property value): requires property editing; separate spec.
- **Manual group-row ordering**: drag lane headers to reorder; deferred.
- **Property editing from kanban**: complex; separate spec.
- **Block-link collision on rename**: migrate order keys on rename; deferred.
- **Collapsible group sections**: design the data model (`collapsedGroups`) now even if UI is deferred.
