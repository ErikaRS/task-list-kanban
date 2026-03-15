Status: IN_PROGRESS

# SPEC 0015 — Task Properties, Manual Ordering, and Swim Lanes

## Feature Request Summary

Three related features that all affect how tasks are arranged in the board:

1. **Task properties** — structured key-value metadata parsed from task text according to a user-selected schema (Tasks plugin emoji format or Dataview inline fields), enabling property-based sorting and grouping.
2. **Manual ordering** — persistent drag-to-reorder within a column, surviving page reloads and file edits.
3. **Swim lanes** — a second structural axis: horizontal bands spanning all columns, partitioning tasks by a property value (e.g. all High-priority tasks in one row, all Medium in another).

These three features share a common ordering model and must be designed together.

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
4. Adding properties to this system later (new schemas or new property keys) should require minimal changes.

### Ordering (within a column/cell)
5. Tasks within a column can be sorted by a property value (e.g. sort by `due` ascending). Properties that do not exist on a task sort last.
6. Alternatively, the user can manually drag tasks into a custom order within a column, and that order persists across sessions and file edits.
7. The ordering mode (file order / property sort / manual) is a board-level setting.

### Grouping
8. Tasks can be grouped within a column by a property value (e.g. group by `priority`), creating labelled sub-sections.
9. The board can display swim lanes — horizontal bands spanning all columns — where each band shows only tasks matching a given property value. This is orthogonal to within-column grouping.

### General
10. All of the above are configurable settings; no behaviour is inferred.

---

## High-Level Design

### Conceptual Model

A **property** is a named, typed value extracted from task text. Properties live alongside the task's textual content — they are part of the raw markdown, not separately stored.

```
Task text:   "Fix login bug 📅 2024-01-20 ⏫"
Properties:  { due: Date(2024-01-20), priority: "high" }

Task text:   "Write docs [due:: 2024-01-20] [priority:: medium]"
Properties:  { due: Date(2024-01-20), priority: "medium" }
```

### Schema Abstraction

A `PropertySchema` is a named object that knows:
1. How to **parse** properties from a raw task string → `TaskProperty[]`
2. The **canonical keys** it produces (used to build sort/group UI dropdowns)
3. How to **compare** two values for a given key (date, number, priority order, text)

```typescript
export interface PropertySchema {
  id: PropertySchemaOption;
  label: string;
  /** Extract properties from raw task text (the full line, before column/block-link stripping). */
  parseProperties(rawLine: string): TaskPropertyMap;
  /** Well-known keys this schema can produce, for driving UI dropdowns. */
  knownKeys(): PropertyKeyMeta[];
}

export type TaskPropertyMap = Map<string, TaskProperty>;

export interface TaskProperty {
  key: string;        // normalized key, e.g. "due", "priority"
  rawValue: string;   // raw string as it appears in source
  value: string | number | Date | null;  // parsed for comparison
}

export interface PropertyKeyMeta {
  key: string;
  label: string;
  type: "date" | "number" | "text" | "priority";
}
```

### Schema Implementations

#### `NoneSchema`
Returns an empty map for every task. Used when schema is `"none"`.

#### `TasksPluginSchema`
Parses the [Obsidian Tasks plugin](https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format) emoji format:

| Emoji | Key | Type |
|-------|-----|------|
| `📅` | `due` | date |
| `⏰` | `scheduled` | date |
| `🛫` | `start` | date |
| `🏁` | `done` | date |
| `🔺` | `priority` | priority (highest) |
| `⏫` | `priority` | priority (high) |
| `🔼` | `priority` | priority (medium) |
| `🔽` | `priority` | priority (low) |
| `⏬` | `priority` | priority (lowest) |
| `🔁 <recurrence>` | `recurrence` | text |

Priority values are stored as numbers (5=highest … 1=lowest) to allow numeric comparison.

#### `DataviewSchema`
Parses [Dataview inline fields](https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/) in three forms:
- `key:: value` (standalone in text)
- `[key:: value]` (bracketed)
- `(key:: value)` (parenthesized)

Values are heuristically typed:
- ISO date string (`YYYY-MM-DD`) → `Date`
- Pure number → `number`
- Everything else → `string`

Common keys (`due`, `priority`, `start`, `scheduled`, `done`) get extra treatment (e.g. `priority: high/medium/low` mapped to numeric order).

---

### Data Model Changes

#### `Task` class (`src/ui/tasks/task.ts`)

New field:
```typescript
readonly properties: TaskPropertyMap;   // populated during construction
```

The schema is passed in at construction time (similar to `columnTagTable`):

```typescript
constructor(
  rawContent: TaskString,
  fileHandle: { path: string },
  readonly rowIndex: number,
  private readonly columnTagTable: ColumnTagTable,
  private readonly consolidateTags: boolean,
  private readonly doneStatusMarkers: string,
  private readonly cancelledStatusMarkers: string,
  private readonly ignoredStatusMarkers: string,
  private readonly propertySchema: PropertySchema = noneSchema,  // NEW
)
```

Properties are parsed from the *raw* content before any stripping, so emoji / inline-fields remain available even if the content is later cleaned up for display.

#### Settings (`src/ui/settings/settings_store.ts`)

New settings fields:
```typescript
propertySchema: PropertySchemaOption;   // "none" | "tasks" | "dataview"
sortProperty: string | null;            // property key to sort by, or null
sortDirection: "asc" | "desc";          // sort direction
groupProperty: string | null;           // property key to group by, or null
```

`PropertySchemaOption` is a new enum:
```typescript
export enum PropertySchemaOption {
  None = "none",
  TasksPlugin = "tasks",
  Dataview = "dataview",
}
```

---

### Sorting

Within each column, tasks are ordered by the active sort property:

```
nulls-last comparator:
  if (a.value === null && b.value === null) return 0
  if (a.value === null) return +1   // nulls last
  if (b.value === null) return -1
  compare(a.value, b.value) * (direction === "asc" ? 1 : -1)
```

Type-specific comparison:
- `date` → numeric timestamp diff
- `number` → arithmetic diff
- `priority` → stored as number, same as number
- `text` → `localeCompare`

The sort is applied reactively in the store/column layer, not inside the `Task` class itself.

---

### Grouping

When a `groupProperty` is set, tasks within a column are partitioned into sub-groups by property value (or `null`). Each group renders a lightweight header row showing the property value. Groups are themselves sorted by value (with null-group last).

Grouping is a pure UI transformation — no markdown changes.

---

### File Structure

```
src/
  parsing/
    properties/
      index.ts               — re-exports public API
      property_schema.ts     — PropertySchema interface + types
      none_schema.ts         — NoneSchema implementation
      tasks_schema.ts        — TasksPluginSchema implementation
      dataview_schema.ts     — DataviewSchema implementation
      comparators.ts         — typed value comparison + ManualOrderStore utilities
  ui/
    tasks/
      task.ts                — add `properties` field + schema param
      tasks.ts               — thread schema through to Task constructor
      store.ts               — thread schema through; apply sort/group
      manual_order.ts        — block-link auto-assign, order list CRUD helpers
    settings/
      settings_store.ts      — add propertySchema, columnOrderMode, swimLaneProperty, etc.
      settings.ts            — add schema picker + ordering + swim lane UI
    components/
      column.svelte          — apply sort/group/manual-order; render group headers
      task_card.svelte       — optionally display key properties; drag handle
      swim_lane.svelte       — lane header + row of columns (new)
    main.svelte              — wrap board in lane rows when swimLaneProperty is set
```

---

### Column Ordering Mode

Ordering mode replaces the simpler `sortProperty` concept. It is a board-level enum:

```typescript
export enum ColumnOrderMode {
  FileOrder  = "file",      // default: tasks appear in file path + row order
  Property   = "property",  // sort by a configured property key
  Manual     = "manual",    // explicit user-defined order via drag-and-drop
}
```

Settings fields:
```typescript
columnOrderMode: ColumnOrderMode;    // default: FileOrder
sortProperty:    string | null;      // used when mode = Property
sortDirection:   "asc" | "desc";     // used when mode = Property
columnManualOrder: ManualOrderStore; // used when mode = Manual (see below)
```

---

### Manual Ordering

#### The Stable Identity Problem

The current task ID (`sha256(content + path + rowIndex)`) is intentionally derived from file state. It is **not** suitable as a persistent order key because:
- Content edits → new ID
- Lines inserted above → rowIndex changes → new ID
- File rename → path changes → new ID

Ordering needs a key that survives these mutations.

#### Block Links as Stable Keys

Obsidian block links (`^abc12` appended to a line) are the right tool: they are embedded in the markdown alongside the task, survive content edits, survive file renames, and are already part of the Task model (`task.blockLink`).

When the user first manually reorders a task that has **no** block link, the plugin auto-assigns one:
1. Generate a short random alphanumeric ID (5–6 chars, e.g. `k7mxp`)
2. Write it to the task line in the source file immediately
3. Use `(path, blockLink)` as the stable compound key

Using the compound `(path, blockLink)` means file renames do break the key. This is an acceptable tradeoff — renames reinitialise the store anyway, and the user can re-order after a rename. A future improvement could migrate order keys on rename.

#### Manual Order Storage

```typescript
// Stored in plugin settings
// Top-level key: lane identifier (see Swim Lanes section)
//   "__default__" when swim lanes are disabled
// Second-level key: column tag
// Value: array of [path, blockLink] pairs in display order
type ManualOrderStore = Record<string, Record<string, Array<[string, string]>>>;
```

Tasks absent from the array appear **after** listed tasks, in their natural file order (preserving relative stability for unordered tasks).

Tasks removed from a column (moved, archived, done) have their entry cleaned from the order list at save time.

#### Drag-and-Drop Integration

When `columnOrderMode = Manual`:
- Within-column drag handles appear on task cards
- Dropping a card at a new within-column position updates `columnManualOrder` and triggers a settings save
- Cross-column drag still works (reassigns the column tag, inserts task at the end of the destination column's order list)
- Block links are auto-assigned if absent before writing the order

When `columnOrderMode` is not Manual, within-column drag handles are hidden (cross-column drag still works).

---

### Swim Lanes

#### Concept

Swim lanes add a second axis to the board. Each lane is a full horizontal row of all columns, showing only tasks whose swim-lane property matches the lane's value.

```
Board with swimLaneProperty = "priority":

              | Later  | Soonish | Today  |
  ────────────┼────────┼─────────┼────────┤
  ⏫ High     │ [t1]   │ [t3]    │ [t5]   │
  ────────────┼────────┼─────────┼────────┤
  🔼 Medium   │ [t2]   │         │ [t4]   │
  ────────────┼────────┼─────────┼────────┤
  (no value)  │        │ [t6]    │ [t7]   │
  ────────────┼────────┼─────────┼────────┤
```

Each cell is a `(lane, column)` pair. The full set of columns is shown in every lane.

#### Lane Source

`swimLaneProperty: string | null` — any property key from the active schema, or `null` (swim lanes disabled). The property key `"file"` is also a valid pseudo-property (group by source file path), available regardless of schema.

#### Lane Ordering

Lanes are ordered by the same typed comparator used for property sorting: priority order, date ascending, text alphabetically. A "no value" lane always appears last.

Future: allow manual lane reordering via a drag handle on the lane header.

#### Cross-Lane Drag

Dragging a task from one lane to another would change the task's property value — a write operation. This is deferred. For now, tasks can only be dragged **within** their own lane (changing column). Moving a task to a different lane is done via the task context menu (select new property value), once property editing is implemented.

#### Interaction with Manual Ordering

When both swim lanes and manual ordering are active, each `(lane, column)` cell has an independent order list. The `ManualOrderStore` nesting handles this naturally: the lane value is the top-level key (with `"__default__"` when swim lanes are off).

#### Interaction with Column Grouping (Phase 4)

Column grouping (sub-sections within one column based on a property) and swim lanes are **different features** and can coexist in principle, but the settings UI should discourage using `groupProperty` and `swimLaneProperty` with the same property key simultaneously (the result would be redundant).

---

### Settings UI

New section in the Settings modal: **"Task Properties"**

```
Property Schema:  [ None ▼ ]   (dropdown: None / Tasks Plugin / Dataview)

── Ordering ────────────────────────────────────────────
Column order:     [ File order ▼ ]
                  (dropdown: File order / Sort by property / Manual)

  [when Property sort is selected:]
  Sort by:        [ due ▼ ]   [ Ascending ▼ ]

── Grouping ─────────────────────────────────────────────
Group within columns by:  [ (none) ▼ ]

Swim lanes:       [ (none) ▼ ]
                  (key dropdown: (none) / file / [schema keys])
```

The property key dropdowns are disabled when schema is `"none"`.
Manual ordering setting is always available (doesn't require a schema).

---

### Display on Task Cards

When a property schema is active, a small property strip can appear below the task content showing recognized properties (e.g. `📅 Jan 20` or `due: Jan 20`). This should be opt-in (a separate setting: `showProperties: boolean`) to keep the default card footprint small.

---

## Detailed Behavior

### Property Parsing

- Parsing is **non-destructive**: the `content` field of Task is not modified by property extraction.
- Properties are parsed from the **raw line** (before column tag / block-link stripping).
- Unrecognized keys under Dataview schema are still stored (key present, value as string), allowing users to sort/group by any key they define.
- If a key appears multiple times, the **first** occurrence wins.

### Schema = None

- `task.properties` is an empty map.
- Sort / group controls are hidden (or disabled) in the UI.
- No parsing overhead.

### Interaction with Existing Tag System

Properties are completely separate from the tag system. Tags continue to drive column assignment. Properties are additive metadata that does not affect column routing.

### Serialization

Properties stay in the raw markdown exactly as written. The plugin does **not** modify, reorder, or reformat properties when serializing tasks back to disk. This is intentional to avoid corrupting files managed by other plugins.

---

## Implementation Plan

### Phase 1: Schema infrastructure + parsing
**Goal:** Property schema can be selected in settings; properties are parsed and stored on Task objects. No UI changes yet except the settings picker.

1. [ ] Add `PropertySchemaOption` enum to `settings_store.ts`
2. [ ] Add `propertySchema` to settings schema + defaults
3. [ ] Create `src/parsing/properties/` with `property_schema.ts`, `none_schema.ts`
4. [ ] Implement `TasksPluginSchema` with emoji parsing + tests
5. [ ] Implement `DataviewSchema` with inline-field parsing + tests
6. [ ] Add `properties: TaskPropertyMap` to `Task` class; thread schema through constructors in `tasks.ts` and `store.ts`
7. [ ] Add schema picker to Settings UI

**Deliverable:** Schema selection is persisted; tasks have `.properties` populated correctly (verified via unit tests).

---

### Phase 2: Property sort
**Goal:** Tasks in each column are sorted by the configured property.

1. [ ] Add `ColumnOrderMode` enum + `columnOrderMode`, `sortProperty`, `sortDirection` to settings
2. [ ] Implement `comparators.ts` with typed null-last comparison
3. [ ] Apply sort in column rendering when mode = `Property` (reactive, no store mutation)
4. [ ] Add ordering mode + sort controls to settings UI
5. [ ] Test: tasks sort correctly by date, priority, text; nulls go last

**Deliverable:** Tasks in a column sort by due date / priority when configured.

---

### Phase 3: Property display on task cards
**Goal:** Configured properties are optionally shown on each card.

1. [ ] Add `showProperties: boolean` to settings (default `false`)
2. [ ] Add property strip component to `task_card.svelte`
3. [ ] Format dates as locale-short; priorities as labels; text as-is
4. [ ] Test: properties appear/disappear correctly when toggled

**Deliverable:** Card shows `📅 Jan 20` or `due: Jan 20` when enabled.

---

### Phase 4: Manual ordering
**Goal:** User can drag tasks within a column; order persists across sessions.

1. [ ] Add `columnManualOrder: ManualOrderStore` to settings; define `ManualOrderStore` type
2. [ ] Implement block-link auto-assignment: when a task is first manually ordered and has no block link, write one to the file
3. [ ] Add within-column drag handle to task cards (visible only when mode = `Manual`)
4. [ ] On drop, update `columnManualOrder` and save settings
5. [ ] Apply manual order in column rendering when mode = `Manual`; unordered tasks append in file order
6. [ ] On task removal (done, archived, deleted, moved column), prune stale entries from order list
7. [ ] Test: reorder tasks, reload board, verify order preserved; test new tasks append; test stale-entry cleanup

**Deliverable:** Drag-reordered tasks stay in place across board reloads.

---

### Phase 5: Within-column grouping
**Goal:** Tasks within a column can be grouped by a property value, with group headers.

1. [ ] Add `groupProperty: string | null` to settings
2. [ ] Implement grouping logic in column rendering (pure UI partition; no store mutation)
3. [ ] Add group header component
4. [ ] Add group control to settings UI
5. [ ] Test: tasks group correctly; null-group appears last; interacts correctly with sort modes

**Deliverable:** Column shows tasks grouped by priority with labelled section headers.

---

### Phase 6: Swim lanes
**Goal:** Board shows horizontal bands per property value, each containing all columns.

1. [ ] Add `swimLaneProperty: string | null` to settings (including `"file"` as a pseudo-key option)
2. [ ] Compute lane set reactively from task list (distinct values of swim-lane property, plus null lane)
3. [ ] Refactor `main.svelte` board layout to render one row per lane with a lane header
4. [ ] Each cell is the existing column component, filtered to the lane's task subset
5. [ ] Wire manual order: use lane value as top-level key in `ManualOrderStore`
6. [ ] Test: tasks appear in correct lane; null-value tasks go to "(no value)" lane at bottom; manual order works per cell

**Deliverable:** Setting `swimLaneProperty = "priority"` shows three horizontal bands (High / Medium / no value), each with the full column set.

---

## Open Questions / Future Considerations

- **Per-column ordering mode**: start global; per-column can be added later without schema changes (the `ManualOrderStore` nesting already supports it).
- **Additional schemas**: YAML frontmatter, custom regex — the `PropertySchema` interface supports these without core changes.
- **Filtering by property**: natural follow-on (e.g. "only show tasks due this week").
- **Cross-lane drag**: requires property editing (writing to markdown); defer to a separate spec.
- **Manual lane ordering**: let user drag swim-lane headers to reorder lanes; deferred.
- **Property editing from the kanban**: complex; defer to later spec.
- **Property key discovery**: for Dataview, sort/swim-lane dropdowns could auto-discover keys present in the current task set rather than only listing `knownKeys()`. Defer to Phase 2+.
- **Block-link collision on rename**: if a user renames a file after setting manual order, the `(path, blockLink)` keys become stale. A rename handler could migrate keys; deferred.
