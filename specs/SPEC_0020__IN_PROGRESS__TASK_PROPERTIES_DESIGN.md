Status: IN_PROGRESS

# SPEC 0020 — Task Properties and Ordering

## Spec Status Note

This spec was split out from the earlier combined task-properties / grouping design.

- [SPEC_0019__IN_PROGRESS__BOARD_MATRIX_RENDERING.md](/Users/erikars/Code/task-list-kanban/worktrees/spec-19-review/specs/SPEC_0019__IN_PROGRESS__BOARD_MATRIX_RENDERING.md) now owns board rendering architecture.
- Grouping and swimlanes now belong in a dependent spec.

This spec is intentionally limited to property parsing, property display, property-based sorting, and manual ordering within a column.

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

### General
9. All of the above are configurable settings; no behaviour is inferred.

---

## High-Level Design

### Conceptual Model

A **property** is a named, typed value extracted from task text. Properties live alongside the task's textual content in raw markdown; they are parsed, not stored separately.

```text
Task text:   "Fix login bug 📅 2024-01-20 ⏫"
Properties:  { due: Date(2024-01-20), priority: 4 }

Task text:   "Write docs [due:: 2024-01-20] [priority:: medium]"
Properties:  { due: Date(2024-01-20), priority: "medium" }
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

`knownKeys()` provides the base set for sort UI. For Dataview, sort choices should also include discovered inline keys present on currently parsed tasks.

### Schema Implementations

#### `NoneSchema`
Returns an empty property map.

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

Common keys such as `due`, `priority`, `start`, and `scheduled` get canonical typing and labels.

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

---

## Settings UI

New section in Settings: **Task Properties**

```text
Property Schema: [ None ▼ ]

Ordering
Column order:    [ File order ▼ ]
                 File order / Sort by property / Manual

  [if Property sort:]
  Sort by:       [ due ▼ ] [ Ascending ▼ ]

Display
Show properties: [ toggle ]
```

Behavior:

- sort-key dropdown disabled when schema is `none`
- Dataview sort-key choices include discovered inline keys present on current tasks
- manual ordering shows drag handles only when `columnOrderMode = Manual`

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
showProperties:  boolean;
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

### Property Display

When `showProperties = true`, recognized properties are shown below task content:

- dates as locale-short values such as `Jan 20`
- priorities as labels such as `High`
- text values as-is

### Property Sorting

- sorting is applied within a column
- `file` order remains the fallback when `columnOrderMode = FileOrder`
- property sort never mutates raw markdown

### Manual Ordering

- ordering is applied within a column
- unordered tasks append after explicitly ordered tasks in file order
- stale order entries are pruned when tasks are removed from the column

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
      task_list.svelte
    text_view.ts
```

---

## Implementation Plan

### Phase 1: Schema Infrastructure and Parsing
**Goal:** Parse and store properties on task objects.

1. [ ] Add `propertySchema` to `TaskParseContext`
2. [ ] Create `src/parsing/properties/`
3. [ ] Implement `TasksPluginSchema` with unit tests
4. [ ] Implement `DataviewSchema` with unit tests
5. [ ] Add `properties` to `Task`
6. [ ] Thread schema selection from settings through parsing
7. [ ] Add schema picker to Settings UI

**Deliverable:** `task.properties` is populated correctly for the selected schema.

### Phase 2: Property Sort
**Goal:** Sort tasks within a column by the configured property.

1. [ ] Add `columnOrderMode`, `sortProperty`, and `sortDirection` to settings
2. [ ] Implement typed comparators with null-last behavior
3. [ ] Apply sort in column task computation
4. [ ] Populate sort-key choices from schema-known keys and discovered Dataview keys
5. [ ] Add ordering controls to Settings UI

**Deliverable:** Tasks sort by configured property without affecting parsing or storage.

### Phase 3: Property Display
**Goal:** Show parsed properties on cards when enabled.

1. [ ] Add `showProperties` to settings
2. [ ] Render property strip in `task.svelte`
3. [ ] Format property values for display

**Deliverable:** Task cards can display parsed properties.

### Phase 4: Manual Ordering
**Goal:** Persist manual drag ordering within a column.

1. [ ] Implement `manual_order.ts`
2. [ ] Auto-assign block links when needed
3. [ ] Handle block-link write re-entrancy deterministically
4. [ ] Add manual-order drag handles to the column task list
5. [ ] Save and load column-local `ManualOrderStore`
6. [ ] Prune stale entries on task removal

**Deliverable:** Manually reordered tasks remain in order across reloads.

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
