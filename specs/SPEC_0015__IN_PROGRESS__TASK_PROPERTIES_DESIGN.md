Status: IN_PROGRESS

# SPEC 0015 — Task Properties Design

## Feature Request Summary

Add support for task *properties* — structured key-value metadata attached to tasks — parsed according to a user-selected schema. Properties enable **sorting** and **grouping** of tasks within and across columns in a clean, extensible way.

Supported schemas at launch:
- **Obsidian Tasks plugin** (emoji-based fields, e.g. `📅 2024-01-15`)
- **Dataview inline fields** (e.g. `due:: 2024-01-15`)

The active schema is a plugin setting; properties are never inferred.

---

## User Requirements

1. The user can choose which property schema to use (Tasks plugin, Dataview, or None) in plugin settings.
2. When a schema is selected, the plugin parses properties from task strings according to that schema.
3. Parsed properties are available on task cards (optionally displayed).
4. Tasks within a column can be sorted by a property value (e.g. sort by `due` ascending).
5. Tasks can be grouped within a column by a property value (e.g. group by `priority`).
6. The sort key, sort direction, and group key are all configurable.
7. Adding properties to this system later (new schemas or new property keys) should require minimal changes.
8. Properties that do not exist on a task are treated consistently (nulls sort last).

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
      comparators.ts         — typed value comparison utilities
  ui/
    tasks/
      task.ts                — add `properties` field + schema param
      tasks.ts               — thread schema through to Task constructor
      store.ts               — thread schema through; apply sort/group
    settings/
      settings_store.ts      — add propertySchema, sortProperty, etc.
      settings.ts            — add schema picker UI
    components/
      column.svelte          — apply sort/group, render group headers
      task_card.svelte        — optionally display key properties
```

---

### Settings UI

New section in the Settings modal: **"Task Properties"**

```
Property Schema:  [ None ▼ ]   (dropdown: None / Tasks Plugin / Dataview)

Sort tasks by:    [ (none) ▼ ]  [ Ascending ▼ ]
                  (key dropdown only shows keys from the selected schema)

Group tasks by:   [ (none) ▼ ]
```

The sort/group dropdowns are disabled when schema is `"none"`.

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

### Phase 1: Schema infrastructure + parsing ✅ (not started)
**Goal:** Property schema can be selected in settings; properties are parsed and stored on Task objects. No UI changes yet except the settings picker.

1. [ ] Add `PropertySchemaOption` enum to `settings_store.ts`
2. [ ] Add `propertySchema` to settings schema + defaults
3. [ ] Create `src/parsing/properties/` directory with `property_schema.ts`, `none_schema.ts`
4. [ ] Implement `TasksPluginSchema` with emoji parsing + tests
5. [ ] Implement `DataviewSchema` with inline-field parsing + tests
6. [ ] Add `properties: TaskPropertyMap` to `Task` class; thread schema through constructors in `tasks.ts` and `store.ts`
7. [ ] Add schema picker to Settings UI

**Deliverable:** Schema selection is persisted; tasks have `.properties` populated correctly (verified via unit tests).

---

### Phase 2: Sorting within columns
**Goal:** Tasks in each column are sorted by the configured property.

1. [ ] Add `sortProperty` + `sortDirection` to settings
2. [ ] Implement `comparators.ts` with typed null-last comparison
3. [ ] Apply sort in column rendering (reactive, no store mutation)
4. [ ] Add sort controls to settings UI
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

### Phase 4: Grouping within columns
**Goal:** Tasks within a column can be grouped by a property value, with group headers.

1. [ ] Add `groupProperty: string | null` to settings
2. [ ] Implement grouping logic in column rendering
3. [ ] Add group header component
4. [ ] Add group control to settings UI
5. [ ] Test: tasks group correctly; null-group appears last

**Deliverable:** Column shows tasks grouped by priority with headers.

---

## Open Questions / Future Considerations

- **Per-column sort/group** (vs. global): start with global for simplicity; per-column can be added later.
- **Additional schemas**: YAML frontmatter properties, custom regex-based schemas — the `PropertySchema` interface makes these straightforward to add.
- **Filtering by property**: natural follow-on once properties exist (e.g. "only show tasks due this week").
- **Editing properties from the kanban**: complex; defer to later spec.
- **Property key discovery**: for Dataview, the sort dropdown could auto-discover keys found in the current task set rather than only listing `knownKeys()`. Defer to Phase 2+.
