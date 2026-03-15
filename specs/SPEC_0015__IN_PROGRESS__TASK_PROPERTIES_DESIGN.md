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

**Component architecture — unified at the task-list level:**

The key insight is that the task list rendering (drag target + task loop + inline creation) is the piece that needs to be reused between ungrouped and grouped modes. It is extracted into `task_list.svelte` in pre-work, before any functional changes.

```
task_list.svelte  ← shared building block
      │
      ├── used by column.svelte       (ungrouped: header + TaskList)
      └── used by board_grid.svelte   (grouped: grid of TaskList cells)
```

| Mode | Component | Responsibility |
|---|---|---|
| Ungrouped | `column.svelte` | Column header + `<TaskList>` |
| Ungrouped | `task_list.svelte` | Drag target, task loop, inline creation |
| Grouped | `board_grid.svelte` | CSS grid, sticky column headers, group dividers |
| Grouped | `task_list.svelte` | Same component, used as each grid cell |

`column.svelte` is **not** made dual-mode. It retains its current shape minus the task list body, which moves to `task_list.svelte`. `board_grid.svelte` uses `task_list.svelte` directly without going through `column.svelte`.

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
      column.svelte          [pre-work] — extract task list body into task_list.svelte
      task_list.svelte       [pre-work] — drag target, task loop, inline creation (extracted from column.svelte)
      board_grid.svelte      [new] — CSS grid layout + sticky column headers + group dividers
      task.svelte            [Phase 1+] — add property strip
    main.svelte              [pre-work] — extract filter sidebar; use task_grouping; [Phase 5] switch to board_grid
    filter_sidebar.svelte    [pre-work] — all filter state, persistence, and sidebar UI (extracted from main.svelte)
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

## Pre-work: Debt Reduction

These phases make **no functional changes** — the board looks and behaves identically before and after each one. They are preconditions for implementing the new features cleanly. Each is independently testable: run the existing test suite and manually verify the board works after every phase.

They are ordered by dependency. P1–P3 must be complete before any functional phase begins. P4 and P5 gate specific later phases.

---

### Pre-work P1: Extract `task_list.svelte` from `column.svelte`

**Goal:** Create the shared building block that both `column.svelte` (ungrouped) and `board_grid.svelte` (grouped) will use. No visual change.

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

1. [ ] Define `PluginData` interface and `ManualOrderStore` type (empty for now, filled in Phase 4)
2. [ ] Update `text_view.ts` load path: parse new shape, fall back gracefully for old data
3. [ ] Update `text_view.ts` save path: write new shape
4. [ ] Verify: existing settings survive a load/save round-trip; no data loss

**Deliverable:** Plugin data has a stable two-key shape. Phase 4 can add manual ordering without touching the storage layer.

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

Concerns P1–P3 are addressed by the pre-work phases above and are resolved before any functional phase begins. The remaining concerns apply to the functional implementation.

### 1. Block-link auto-assignment triggers vault modify re-entrancy (Phase 4)

When a task is first drag-reordered and auto-assigned a block link:
1. `vault.modify()` writes the block link to the file
2. `vault.on("modify")` fires → `processFile()` re-parses → `debounceSetTasks()` emits new task list
3. If the UI re-renders before the manual order is applied, the task jumps back to its pre-drag position

**Mitigation:** After writing a block link, flag that file path as "pending block-link write" in the store. The next modify event for that path within a short window (100ms) is treated as a structural-only change — task identity is updated but task-list position is not reset. Clear the flag after processing.

### 2. Dual rendering mode must stay strictly separated (Phase 5)

The `{#if groupSource && !isVerticalFlow}` conditional in `main.svelte` switches between `column.svelte` loop and `board_grid.svelte`. This is acceptable as a single top-level branch. It becomes a maintenance problem if the condition starts propagating into child components as feature flags. Rule: the two rendering paths share only `task_list.svelte`. Neither `column.svelte` nor `board_grid.svelte` should have conditionals that reference the other mode.

### 3. `groupSource` must be a discriminated union, not a bare string

`groupProperty: string | null` with a magic `"file"` value is a type inconsistency — "file" is not a property key derivable from any `PropertySchema`. Use:

```typescript
type GroupSource =
  | { kind: "property"; key: string }
  | { kind: "file" };

// In settings:
groupSource: GroupSource | null;
```

Stored in settings as a JSON object. The group-value derivation function dispatches on `kind`, keeping the schema model clean.

### 4. Collapsible group sections — reserve the data model now

`collapsedColumns: string[]` tracks collapsed columns today. Once group sections exist, users will want to collapse them too. Reserve a `collapsedGroups: string[]` field in settings now (empty array, no UI yet) using the same `"${groupValue}::${columnTag}"` key format as `ManualOrderStore`. This prevents a breaking settings schema change later.

### 5. Column collapse in grouped mode requires grid-template-columns coordination (Phase 5)

In ungrouped mode, `column.svelte` manages its own collapse width via CSS. In grouped mode, collapsing a column must narrow its track in the CSS grid — a board-level concern. `board_grid.svelte` must subscribe to `collapsedColumns` state and compute `grid-template-columns` dynamically, giving collapsed columns a narrow fixed width (e.g. 48px) and normal columns `columnWidth`. This is a new coupling that does not exist in the ungrouped path.

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
