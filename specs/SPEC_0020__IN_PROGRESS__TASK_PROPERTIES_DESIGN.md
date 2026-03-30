Status: IN_PROGRESS

# SPEC 0020 — Task Properties, Manual Ordering, and Grouping

## Spec Status Note

This spec was renumbered from `SPEC 0019` after extracting board-rendering architecture into [SPEC_0019__IN_PROGRESS__BOARD_MATRIX_RENDERING.md](/Users/erikars/Code/task-list-kanban/worktrees/spec-19-review/specs/SPEC_0019__IN_PROGRESS__BOARD_MATRIX_RENDERING.md).

It will require significant revision once the matrix-rendering spec is finalized, because several sections currently assume renderer shapes that should instead be expressed in terms of the shared board-matrix model.

## Feature Request Summary

GitHub issues reviewed for this spec:

### Addressed
- [#11](https://github.com/ErikaRS/task-list-kanban/issues/11) — FR: Lists grouping and sorting

### Partially addressed
- [#21](https://github.com/ErikaRS/task-list-kanban/issues/21) — Additional support for scheduled tasks 
	- This spec adds scheduled-date parsing as prerequisite infrastructure, but the requested hide/auto-column behavior still requires follow-up work.
- [#61](https://github.com/ErikaRS/task-list-kanban/issues/61) — FR: Add date support
	- This spec adds Dataview date parsing as prerequisite infrastructure, but completion-date write-back still requires follow-up work.
- [#65](https://github.com/ErikaRS/task-list-kanban/issues/65) — FR: Sorting
	- This spec adds generic property-based sorting infrastructure, but explicit estimated-time and natural-name sorting still require follow-up work.
- [#81](https://github.com/ErikaRS/task-list-kanban/issues/81) — FR: Add Horizontal Swimlanes to Kanban Board
	- This spec adds grouped swimlane-style board layout, but cross-group property editing and collapsible swimlanes still require follow-up work.
- [#86](https://github.com/ErikaRS/task-list-kanban/issues/86) — FR: add Tasks plugin compatibility
	- This spec adds Tasks-plugin property parsing and date-based sorting infrastructure, but completion/status workflow compatibility still requires follow-up work.

### Related but not addressed
- [#84](https://github.com/ErikaRS/task-list-kanban/issues/84) — FR: Dataview-generated tasks support

Scope notes:
- This spec fully covers property-based grouping and sorting as board layout features.
- It partially covers Tasks/Dataview metadata support by parsing, displaying, sorting, and grouping on recognized properties, but it does not include property write-back, automatic completion-date insertion, or Tasks-plugin status workflows.
- It treats swimlanes as grouped rows with spanning dividers, but does not include cross-group drag that edits the underlying property or collapsible swimlane sections.
- It does not cover executing Dataview queries or rendering Dataview-generated tasks as read-only board items.

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
8. Tasks can be grouped by a property value, creating labelled sections.
9. When grouping is active, every column shows all group sections (including empty ones), so section order stays aligned across the board.
10. In horizontal flow mode (LTR/RTL), grouped sections are rendered with a single horizontal divider line spanning across all columns at each section boundary.
11. In vertical flow mode (TTB/BTT), grouping is still available, but uses a different presentation that fits stacked columns rather than a spanning divider.

### General
12. All of the above are configurable settings; no behaviour is inferred.

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
2. The **canonical keys** it produces (used as the base set for sort/group UI dropdowns)

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

For Dataview, the sort/group dropdowns use the union of:
- schema-known keys (`due`, `priority`, `start`, `scheduled`, etc.)
- discovered keys currently present on parsed tasks in the board (e.g. `assignee`, `label`)

This keeps the schema extensible without requiring a code change for every Dataview inline field name.

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

Grouping has two renderers sharing the same derived `GroupBucket[]` data:
- **Horizontal grouped renderer** (Phase 5): board-wide CSS grid with spanning dividers
- **Vertical grouped renderer** (Phase 6): grouped sections inside each stacked column

#### Horizontal grouped renderer

When `groupSource` is set and flow is horizontal, `main.svelte` renders a CSS grid instead:

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

**Column headers** in grouped horizontal mode:
Column headers (name, colour, collapse toggle) are pinned as a sticky header row above the grid, outside the grid structure, since they don't participate in group rows.

#### Vertical grouped renderer

When `groupSource` is set and flow is vertical, the board keeps the existing stacked-column flow, but each column renders the shared group bucket sequence internally:

```
<ColumnGroupedStack column="Later">
  <div class="group-divider">⏫ High</div>
  <TaskList tasks={Later∩High} />

  <div class="group-divider">🔼 Medium</div>
  <TaskList tasks={Later∩Medium} />
</ColumnGroupedStack>

<ColumnGroupedStack column="Soonish">
  ...
</ColumnGroupedStack>
```

There is no board-wide spanning divider in vertical flow. Instead, each stacked column renders the same ordered group buckets with repeated local section headers. Because every column uses the same `GroupBucket[]`, group order remains aligned conceptually even though the headers are not shared DOM nodes.

**Component architecture — unified at the task-list level:**

The key insight is that the task list rendering (drag target + task loop + inline creation) is the piece that needs to be reused between ungrouped and grouped modes. It is extracted into `task_list.svelte` in pre-work, before any functional changes.

```
task_list.svelte  ← shared building block
      │
      ├── used by column.svelte                (ungrouped: header + TaskList)
      ├── used by board_grid.svelte            (grouped horizontal: grid of TaskList cells)
      └── used by grouped_column_stack.svelte  (grouped vertical: repeated group sections)
```

| Mode | Component | Responsibility |
|---|---|---|
| Ungrouped | `column.svelte` | Column header + `<TaskList>` |
| Ungrouped | `task_list.svelte` | Drag target, task loop, inline creation |
| Grouped horizontal | `board_grid.svelte` | CSS grid, sticky column headers, spanning group dividers |
| Grouped vertical | `grouped_column_stack.svelte` | Stacked column with repeated local group headers |
| Grouped | `task_list.svelte` | Same component, used as each group/column cell |

`column.svelte` is **not** made dual-mode. It retains its current shape minus the task list body, which moves to `task_list.svelte`. Grouped renderers use `task_list.svelte` directly without going through `column.svelte`.

**`task_list.svelte` props:**
```typescript
export let column: ColumnTag | DefaultColumns;
export let tasks: Task[];          // pre-sorted and pre-filtered by parent
export let taskActions: TaskActions;
export let columnTagTableStore: Readable<ColumnTagTable>;
export let showFilepath: boolean;
export let consolidateTags: boolean;
export let isSelectionMode: boolean;
export let selectedIds: string[];
```

Sorting is the **parent's responsibility**. `task_list.svelte` renders tasks in the order it receives them — no internal sort. This removes the redundant re-sort that currently exists in `column.svelte` (the store already emits tasks in path+rowIndex order; the column's `sortedTasks` computation is a no-op re-sort of already-sorted data).

**flowDirection behavior:**
Grouping is available in all flow directions, but the renderer depends on flow:
- `LTR` / `RTL` → board-wide grouped grid with spanning dividers
- `TTB` / `BTT` → per-column grouped stacks with repeated local section headers

The setting is never ignored. Changing flow direction changes the grouped presentation, not whether grouping is enabled.

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
type GroupBucketId = string;  // stable encoded id for a rendered group bucket

// top-level key: group bucket id ("__ungrouped__" when grouping is off)
// nested key: columnTag
type ManualOrderStore = Record<GroupBucketId, Record<string, ManualOrderKey[]>>;
```

Important distinction:
- `ManualOrderKey` is the stable task identity, using Obsidian's native block-link mechanism to refer back to a specific task line in a source file.
- `ManualOrderStore` does **not** define task identity. It only organizes those stable task keys by board cell so the kanban can remember display order in each column/group bucket.

When grouping is active, manual ordering is stored per `(group bucket, column)` cell. When grouping is off, the top-level bucket id is `"__ungrouped__"`. This avoids fragile delimiter-based composite keys and cleanly supports:
- property groups whose display label contains `::`
- file-based grouping, where the group value is a full file path
- a dedicated `(no value)` bucket without colliding with a literal string value

Tasks absent from the array appear after listed tasks in file order.

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
                  (none) / By file / [schema property keys]
  (available for all flow directions)
```

The sort and group property dropdowns are disabled when schema is `"none"`. The "By file" group option is always available regardless of schema. When schema = `Dataview`, property-key dropdowns include both built-in keys and discovered inline keys present on current tasks.

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
sortProperty:     string | null;          // used when columnOrderMode = "property"
sortDirection:    "asc" | "desc";         // used when columnOrderMode = "property"
groupSource:      GroupSource | null;     // null = no grouping (see type below)
showProperties:   boolean;
collapsedGroups:  string[];               // reserved for future collapsible sections; default []
```

`GroupSource` is a discriminated union (see Architectural Concerns §3):
```typescript
type GroupSource =
  | { kind: "property"; key: string }   // group by a parsed property key
  | { kind: "file" };                   // group by task.path
```

Stored as a JSON object in settings. Serializes cleanly; no magic string values.

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

Files marked `[pre-work]` are created or significantly changed during pre-work phases. Files marked `[new]` are created during functional phases.

```
src/
  parsing/
    properties/
      index.ts               [new] — re-exports public API
      property_schema.ts     [new] — PropertySchema interface, TaskParseContext, types
      none_schema.ts         [new] — NoneSchema
      tasks_schema.ts        [new] — TasksPluginSchema + tests
      dataview_schema.ts     [new] — DataviewSchema + tests
      comparators.ts         [new] — typed null-last comparators
  ui/
    tasks/
      task.ts                [pre-work] — adopt TaskParseContext; [Phase 1] add properties
      tasks.ts               [pre-work] — thread TaskParseContext
      store.ts               [pre-work] — thread TaskParseContext
      task_grouping.ts       [pre-work] — pure groupByColumnTag function + tests (extracted from main.svelte)
      manual_order.ts        [new] — block-link auto-assign, ManualOrderStore CRUD
    settings/
      settings_store.ts      [pre-work] — split plugin data shape; [Phase 1+] add new fields
      settings.ts            [Phase 1+] — add schema/ordering/grouping UI
    components/
      column.svelte                [pre-work] — extract task list body into task_list.svelte; extract header into column_header.svelte
      column_header.svelte         [Phase 5] — column title, count, collapse toggle, mode toggle (shared by column.svelte and grouped renderers)
      task_list.svelte             [pre-work] — drag target, task loop, inline creation (extracted from column.svelte)
      board_grid.svelte            [Phase 5] — horizontal grouped CSS grid + sticky column header row + spanning group dividers
      grouped_column_stack.svelte  [Phase 6] — vertical grouped column renderer with repeated local group headers
      task.svelte                  [Phase 3] — add property strip
    main.svelte                    [pre-work] — extract filter sidebar; use task_grouping; [Phase 5+] switch between ungrouped / grouped-horizontal / grouped-vertical renderers
    filter_sidebar.svelte    [pre-work] — all filter state, persistence, and sidebar UI (extracted from main.svelte)
```

---

## Detailed Behavior

### Property Parsing
- Non-destructive: `content` field is not modified.
- Parsed from the raw line before column tag / block-link stripping.
- First occurrence wins for duplicate keys.

### Grouping — Global Group Values
The set of group values is derived from **all tasks in the board** (not just the visible column), then sorted by the property comparator with null last. The derived result is a list of `GroupBucket` records, each with:
- `id`: stable internal key used for rendering and manual-order storage
- `label`: user-facing text for the divider header
- `value`: the typed property value (or `null`)

Every column/cell renders all group buckets — including empty ones — so section boundaries align.

### Grouping — Empty Sections
An empty group section renders the divider header only (minimal height, no padding). It does not render a card-sized drop zone. This keeps columns compact in both grouped renderers.

### Grouping — Special Columns
The Done, Uncategorised, and Archived columns participate in grouping the same way as regular columns. Done and Uncategorised columns already have their own visibility logic; grouping does not override it.

### Ordering — Interaction with Grouping
When both `columnOrderMode = Manual` and `groupSource` are set, the manual order applies within each `(group, column)` cell independently. `ManualOrderStore[groupBucket.id][columnTag]` contains the ordered task keys for that cell.

When `columnOrderMode = Property`, the sort applies within each cell as well.

### Serialization
Properties stay in raw markdown exactly as written. The plugin does not modify, reorder, or reformat properties.

---

## Pre-work: Debt Reduction

These phases make **no functional changes** — the board looks and behaves identically before and after each one. They are preconditions for implementing the new features cleanly. Each is independently testable: run the existing test suite and manually verify the board works after every phase.

**Dependency order:**
- P1, P2, P3, P4 must all be complete before Phase 1 begins
- P5 must be complete before Phase 4 begins
- P1–P5 can be executed in any order relative to each other (they are independent)

---

### Pre-work P1: Extract `task_list.svelte` from `column.svelte`

**Goal:** Create the shared building block that ungrouped and grouped renderers will use (`column.svelte`, `board_grid.svelte`, and later `grouped_column_stack.svelte`). No visual change.

**What moves to `task_list.svelte`:**
- `isDraggedOver` state, `canDrop` derived value
- `handleDragOver`, `handleDragLeave`, `handleDrop` handlers
- `pendingNewTask`, `pendingCancelled`, `newTaskTextAreaEl` inline-creation state
- `handleNewTaskSave`, `handleNewTaskKeydown` handlers
- The `.tasks-wrapper` DOM subtree (tasks loop + new-task textarea + add-new button)

**What stays in `column.svelte`:**
- Column header (title, count, collapse toggle, Done/Select mode toggle, context menu)
- `isSelectMode`, `selectedCount`, `selectedIds` selection state
- `column.svelte` renders: header + `<TaskList tasks={sortedTasks} ... />`

**Also in this phase:** remove `sortedTasks` from `column.svelte`. The store already emits tasks in path+rowIndex order; the column's `sortedTasks` computation is a no-op re-sort of already-sorted data. `task_list.svelte` renders the `tasks` prop in the order received. Sorting will be applied by the parent when property sort is added in Phase 2.

1. [ ] Create `task_list.svelte` with the props interface above
2. [ ] Move drag target state + handlers into `task_list.svelte`
3. [ ] Move inline task creation state + handlers into `task_list.svelte`
4. [ ] Move `.tasks-wrapper` DOM into `task_list.svelte`
5. [ ] Replace extracted code in `column.svelte` with `<TaskList tasks={tasks} ... />`
6. [ ] Delete `sortedTasks` reactive declaration in `column.svelte`
7. [ ] Verify: build passes, existing tests pass, board is visually and functionally identical

**Deliverable:** `task_list.svelte` exists and is used inside `column.svelte`. Drag-and-drop, inline creation, and task rendering work identically.

---

### Pre-work P2: Extract `groupByColumnTag` to `task_grouping.ts`

**Goal:** Remove business logic from the view layer; make it testable in isolation.

The `groupByColumnTag` function in `main.svelte` (lines 270–289) partitions a flat task list into columns. It contains non-trivial logic (done/archived/uncategorised routing) and is untested. Moving it to the task layer enables unit testing and makes `main.svelte` smaller.

1. [ ] Create `src/ui/tasks/task_grouping.ts` with `groupByColumnTag` as a pure exported function
2. [ ] Write unit tests for: normal column assignment, done tasks, archived tasks, uncategorised tasks, multi-column tasks
3. [ ] Remove `groupByColumnTag` from `main.svelte`; import from `task_grouping.ts`
4. [ ] Verify: build passes, new tests pass, board behaviour unchanged

**Deliverable:** `groupByColumnTag` has unit tests and no longer lives in a Svelte component.

---

### Pre-work P3: Extract `filter_sidebar.svelte` from `main.svelte`

**Goal:** Reduce `main.svelte` from ~950 lines to a manageable coordinator. `main.svelte` adding more code in Phase 5 without this pre-work would make it unmaintainable.

**What moves to `filter_sidebar.svelte`:**
- All filter state: `filterText`, `selectedTags`, `fileFilter`
- Filter persistence logic: the `subscriptionCount`/`hydrated` pattern, the `setInterval` for tag hydration, `saveFilterState`
- All saved-filter management functions: `addContentFilter`, `loadContentFilter`, `clearContentFilter`, `addFileFilter`, `loadFileFilter`, `clearFileFilter`, `addTagFilter`, `clearTagFilter`, `openDeleteModal`, `closeDeleteModal`, `confirmDelete`
- Derived values: `contentFilters`, `tagFilters`, `fileFilters`, `contentFilterExists`, `tagFilterExists`, `fileFilterExists`, `availableFiles`, `activeContentFilterId`, `activeTagFilterId`, `activeFileFilterId`
- The entire filter sidebar DOM (aside element and its contents)
- The `DeleteFilterModal`

**Interface:**
```typescript
// Props in:
export let settingsStore: Writable<SettingValues>;
export let tasks: Task[];     // for tag/file discovery
export let requestSave: () => void;
export let expanded: boolean;

// Out (bound or dispatched):
export let filteredTasks: Task[];   // reactive, replaces filteredByFile in main.svelte
```

**What stays in `main.svelte`:**
- Board rendering (columns or grid)
- Task count display
- Sidebar expand/collapse toggle + resize logic
- `tasksByColumn` derived from `filteredTasks`

Note: the `setInterval` in the existing tag-hydration code (checks every 100ms until tags are loaded) is fragile. Replace with a reactive `$:` that checks `tags.size > 0` before applying the stored tag filter.

1. [ ] Create `filter_sidebar.svelte` with above interface
2. [ ] Move all filter state + DOM into it; fix tag-hydration to use reactive instead of setInterval
3. [ ] Replace filter section in `main.svelte` with `<FilterSidebar bind:filteredTasks ... />`
4. [ ] Verify: build passes, all filter behaviours (content, tag, file, saved, persistence) work identically

**Deliverable:** `main.svelte` is under 400 lines. Filter state and persistence are fully encapsulated. Tag hydration no longer uses `setInterval`.

---

### Pre-work P4: Refactor `Task` constructor to `TaskParseContext`

**Goal:** Replace the 8-parameter `Task` constructor with a named context object, making future additions a single field rather than a new positional parameter.

**Why now:** This must be done before Phase 1 (properties), which would add a 9th parameter. Doing it as pre-work means Phase 1 is a clean addition rather than a painful refactor under pressure.

```typescript
// New interface (in property_schema.ts or task.ts):
export interface TaskParseContext {
  columnTagTable: ColumnTagTable;
  consolidateTags: boolean;
  doneStatusMarkers: string;
  cancelledStatusMarkers: string;
  ignoredStatusMarkers: string;
  // propertySchema added in Phase 1
}

// New constructor signature:
constructor(
  rawContent: TaskString,
  fileHandle: { path: string },
  rowIndex: number,
  context: TaskParseContext,
)
```

1. [ ] Define `TaskParseContext` interface
2. [ ] Refactor `Task` constructor to accept `context`; update internal references from `this.x` to `context.x`
3. [ ] Update call sites in `tasks.ts` and `store.ts` to pass context object
4. [ ] Update all tests that construct `Task` directly
5. [ ] Verify: build passes, all tests pass

**Deliverable:** `Task` constructor takes 4 parameters. Adding future parse-time configuration is a single field addition to `TaskParseContext`.

---

### Pre-work P5: Split plugin data into `settings` + `manualOrder`

**Goal:** Establish the correct storage structure before manual ordering is implemented, so Phase 4 doesn't have to migrate a schema that was wrong from the start.

Currently `text_view.ts` saves and loads a single blob that is the settings object. The new shape:

```typescript
interface PluginData {
  settings: SettingValues;
  manualOrder: ManualOrderStore;  // {} by default
}
```

Backward compatibility: if `loadData()` returns an object without a `manualOrder` key (old format), default `manualOrder` to `{}`. If `loadData()` returns an object that looks like old-format settings directly (has a `columns` key at the top level), treat the entire object as `settings` with empty `manualOrder`.

1. [ ] Define `PluginData` interface and `ManualOrderStore` type (empty `Record<string, Record<string, string[]>>` for now; filled in Phase 4)
2. [ ] Update `text_view.ts` load path: parse new shape with backward-compatible fallback — if loaded object has a top-level `columns` key, treat whole object as legacy `settings` with `manualOrder: {}`
3. [ ] Update `text_view.ts` save path: always write `{ settings, manualOrder }` shape
4. [ ] Verify: existing settings survive a load/save round-trip; no data loss

**Deliverable:** Plugin data has a stable two-key shape. Phase 4 can add manual ordering without touching the storage layer.

---

## Implementation Plan

### Phase 1: Schema infrastructure + parsing
**Goal:** Schema can be selected in settings; properties parsed and stored on Task objects; no UI changes beyond the settings picker.

*Depends on: P4 (TaskParseContext exists), P1–P3 (codebase clean).*

1. [ ] Add `propertySchema: PropertySchema` field to the existing `TaskParseContext` interface (defined in P4); default to `NoneSchema`
2. [ ] Create `src/parsing/properties/` with `property_schema.ts` (types), `none_schema.ts`, `index.ts`
3. [ ] Add `PropertySchemaOption` enum + `propertySchema` setting to `settings_store.ts`
4. [ ] Implement `TasksPluginSchema` + unit tests
5. [ ] Implement `DataviewSchema` + unit tests
6. [ ] Add `properties: TaskPropertyMap` to `Task`; call `context.propertySchema.parseProperties(rawContent)` in constructor
7. [ ] Thread schema selection from settings through `store.ts` → `tasks.ts` → `TaskParseContext`
8. [ ] Add schema picker to Settings UI

**Deliverable:** Schema selection persists; `task.properties` is populated correctly per schema (verified by unit tests). Board behaviour otherwise unchanged.

---

### Phase 2: Property sort
**Goal:** Tasks in each column sort by the configured property.

1. [ ] Add `ColumnOrderMode`, `columnOrderMode`, `sortProperty`, `sortDirection` to settings
2. [ ] Implement `comparators.ts` with typed null-last comparison
3. [ ] Apply sort in column rendering when mode = `Property` (reactive, in `column.svelte`)
4. [ ] Populate sort-key choices from schema-known keys; for Dataview also include discovered inline keys present on current tasks
5. [ ] Add ordering mode + sort key controls to Settings UI
6. [ ] Test: sort by date, priority, text; nulls last; file order unaffected; Dataview custom inline keys appear when present

**Deliverable:** Tasks in a column sort by due date / priority when configured.

---

### Phase 3: Property display on task cards
**Goal:** Recognized properties shown on cards when enabled.

1. [ ] Add `showProperties: boolean` to settings (default `false`) + toggle in Settings UI
2. [ ] Add property strip to `task.svelte` below the task content row; pass `task.properties` and `showProperties` as props
3. [ ] Format values: dates as locale-short (`Jan 20`), priorities as text labels (`High`), text as-is
4. [ ] Test: strip appears/disappears; correct values shown for each schema

**Deliverable:** Card shows `📅 Jan 20` or `due: Jan 20` when `showProperties` is enabled.

---

### Phase 4: Manual ordering
**Goal:** Drag-to-reorder within a column persists across sessions.

*Depends on: P5 (plugin data shape established).*

1. [ ] Implement `manual_order.ts`: fill in `ManualOrderStore` CRUD helpers (insert, remove, reorder, prune-stale, look-up position)
2. [ ] Implement block-link auto-assignment in `manual_order.ts`: generate ID, call `vault.modify()`, return stable key
3. [ ] Handle vault-modify re-entrancy in `store.ts`: track exact pending block-link writes by stable task key (or file path + block link) and suppress only the corresponding refresh-side position reset, rather than using a time-window heuristic
4. [ ] Add `columnOrderMode = Manual` to settings; add within-column drag handles to `task.svelte` (visible only in Manual mode)
5. [ ] In `task_list.svelte`: handle within-cell drop at a specific position (distinct from cross-column drop handled by `column.svelte`)
6. [ ] On within-cell drop: auto-assign block link if absent, update `ManualOrderStore`, save via `text_view.ts`
7. [ ] Apply manual order when computing tasks for `task_list.svelte`: look up position by `(path, blockLink)`, unordered tasks append in file order
8. [ ] Prune stale order entries on task removal (done, archived, deleted, column change)
9. [ ] Test: reorder → reload → order preserved; new tasks append after ordered tasks; stale-entry cleanup; block-link assignment round-trip; re-entrancy does not cause position flicker

**Deliverable:** Manually reordered tasks stay in place across board reloads.

---

### Phase 5: Horizontal grouping with spanning dividers
**Goal:** In horizontal flows, tasks grouped by a property or by file, with a single horizontal divider line spanning all columns.

1. [ ] Add `groupSource: GroupSource | null` to settings; add `collapsedGroups: string[]` with default `[]`; show grouping controls in all flows
2. [ ] Add `GroupSource` type to `settings_store.ts`; add Zod schema for it
3. [ ] Implement `deriveGroupValues(tasks, groupSource): GroupBucket[]` in `task_grouping.ts` — returns sorted distinct group buckets from all tasks, null-value last, dispatches on `groupSource.kind`
4. [ ] Implement `board_grid.svelte`:
   - Sticky header row: one column-header element per column (title, collapse button, task count, mode toggle) — these are extracted from `column.svelte` into a shared `column_header.svelte` sub-component used by both `column.svelte` and `board_grid.svelte`
   - CSS grid body: for each group value, render a spanning divider (`grid-column: 1 / -1`) then one `<TaskList>` per column
   - `grid-template-columns` computed dynamically from column widths and `collapsedColumns` state (collapsed columns get 48px track width)
   - Empty group sections: divider header only, no padding below it
5. [ ] In `main.svelte`: if `groupSource` is set and flow is horizontal, render `<BoardGrid>`; otherwise keep the existing `<Column>` loop for ungrouped and not-yet-implemented vertical grouped flows
6. [ ] Manual order in grouped mode: store order under `ManualOrderStore[groupBucket.id][columnTag]`; when grouping is off, use the `"__ungrouped__"` bucket; no data migration needed between modes
7. [ ] Test: tasks in correct sections; empty sections compact; dividers span all columns; manual order per cell; collapsing a column narrows its grid track; vertical flow remains ungrouped for now

**Deliverable:** Setting `groupSource = { kind: "property", key: "priority" }` shows High / Medium / (no value) sections with a single spanning divider. Setting `groupSource = { kind: "file" }` groups by source file.

---

### Phase 6: Vertical-flow grouping
**Goal:** In vertical flows, tasks grouped by the same `groupSource`, using per-column grouped stacks rather than board-wide spanning dividers.

1. [ ] Implement `grouped_column_stack.svelte`:
   - render one column at a time in the existing vertical board flow
   - within each column, render the shared `GroupBucket[]` sequence as repeated local section headers plus `<TaskList>`
   - preserve the same empty-section behavior as horizontal grouping
2. [ ] In `main.svelte`: when `groupSource` is set and flow is vertical, switch to the grouped vertical renderer instead of the ungrouped `<Column>` loop
3. [ ] Reuse the same `GroupBucket[]` derivation, `ManualOrderStore`, and `task_list.svelte` integration from Phase 5
4. [ ] Test: grouped sections appear in every stacked column; group order matches across columns; manual order remains per `(group bucket, column)` cell; switching between horizontal and vertical flow preserves grouping semantics

**Deliverable:** Setting `groupSource = { kind: "property", key: "priority" }` in `TTB` or `BTT` shows repeated High / Medium / (no value) sections inside each stacked column.

---

## Architectural Concerns

The pre-work phases resolve the structural debt identified earlier. The following concerns apply to the functional implementation and are reflected in the phase task lists above.

### 1. Block-link auto-assignment re-entrancy (Phase 4, step 3)

When a task is auto-assigned a block link, `vault.modify()` fires the store's modify handler, which would re-emit a new task list and potentially reset the task's visual position before the manual order is saved. Mitigation: track the exact pending block-link write using the newly assigned stable task key (or file path + block link) and suppress only the corresponding refresh-side position reset. Avoid a fixed time-window heuristic; it is brittle under slow I/O and bulk edits. This is accounted for in Phase 4 step 3.

### 2. Grouped renderers must stay strictly separated by layout mode (Phase 5/6)

`main.svelte` should choose among three top-level paths: ungrouped, grouped-horizontal, grouped-vertical. These paths share `task_list.svelte`, `column_header.svelte`, `GroupBucket[]`, and manual-order infrastructure, but should not collapse into one heavily-conditional grouped component. Enforce: `board_grid.svelte` owns only the horizontal grouped layout, and `grouped_column_stack.svelte` owns only the vertical grouped layout.

### 3. Column header duplication between modes (Phase 5, step 4)

In ungrouped mode, `column.svelte` renders its own header. In grouped horizontal mode, `board_grid.svelte` must render a sticky header row with the same column headers. Rather than duplicating the header markup, extract a `column_header.svelte` sub-component used by both. Vertical grouped mode can keep headers in the normal column position and also reuse the same sub-component.

---

## Open Questions / Future Considerations

- **Per-column ordering mode**: currently global; per-column can be added without schema changes later (the `ManualOrderStore` key structure already supports it).
- **Additional schemas**: YAML frontmatter, custom regex — the `PropertySchema` interface supports these with no core changes.
- **Filtering by property**: natural follow-on once properties are parsed (e.g. "only show tasks due this week").
- **Cross-group drag** (changing a task's property value by dragging between groups): requires property editing capability; separate spec.
- **Manual group-row ordering**: drag group headers to reorder the groups themselves; deferred.
- **Property editing from kanban**: complex write-back to markdown; separate spec.
- **Block-link stability on rename**: migrate `ManualOrderStore` keys when a file is renamed; deferred (order silently degrades to file order on rename, user can re-drag).
- **Collapsible group sections**: `collapsedGroups: string[]` is reserved in settings (Phase 5); UI toggle for collapsing individual group sections is a separate feature.
