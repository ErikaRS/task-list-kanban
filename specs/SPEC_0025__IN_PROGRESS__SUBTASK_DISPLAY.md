Status: IN_PROGRESS

# SPEC 0025 - Parsed Subtask Display

**Related issues:**
- [#1](https://github.com/ErikaRS/task-list-kanban/issues/1)
- [#125](https://github.com/ErikaRS/task-list-kanban/issues/125)

## Feature Request Summary

Add a **Treat nested tasks as subtasks** setting that keeps nested Markdown task rows inside the root task card instead of creating separate board cards for them.

Example:

```markdown
- [ ] A
  - B
    - [ ] C
  - [ ] D
```

With the setting enabled, `A` is the board card. `B` is editable raw content. `C` and `D` are editable, clickable subtasks displayed inside `A`.

## Requirements

1. Default behavior stays unchanged when the setting is off.
2. A board card root is any visible task row with no visible task ancestor.
3. Visible task rows are task rows that are not ignored by status marker or existing task exclusion rules.
4. Nested visible task rows become parsed subtasks, not independent board cards.
5. Subtasks can contain nested subtasks.
6. Only the board card root affects grouping, filtering, sorting, column placement, column tag stripping, consolidated tags, and parent property display.
7. Subtask tags/properties render as part of the subtask line text in v1; they are not extracted into footer chips or controls.
8. Parent checkbox clicks affect only the parent row. Subtask checkbox clicks affect only the clicked subtask row.
9. Subtask checkbox clicks cycle status using the configured status marker order and marker settings.
10. Non-task rows and ignored-status task rows inside a card's owned block display as editable raw content with no checkbox behavior.
11. Parent, subtask, and raw content rows are editable line-by-line.
12. Parent delete, duplicate, and move-to-file operate on the full owned source block.
13. Other parent actions rewrite only the parent task row and preserve child/raw rows in place.

## Setting

Add:

```typescript
treatNestedTasksAsSubtasks: boolean;
```

- Default: `false`
- UI label: **Treat nested tasks as subtasks**
- UI section: **Task properties**
- Saving/reloading this setting must reinitialize the task store because it changes which rows become board cards.

## Model

Store a source tree for each board card root. This is the only stored hierarchy.

```typescript
type SourceBlockNode = SourceTaskNode | SourceRawNode;

type SourceTaskNode = {
  kind: "task";
  taskVisibility: "visible" | "ignored";
  rowIndex: number;
  rawLine: string;
  indentation: string;
  status: string;
  content: string;
  sourceChildren: SourceBlockNode[];
};

type SourceRawNode = {
  kind: "raw";
  rowIndex: number;
  rawLine: string;
  indentation: string;
  sourceChildren: SourceBlockNode[];
};
```

`Task` should gain:

```typescript
readonly sourceChildren: SourceBlockNode[];
readonly sourceBlockLineCount: number;
sourceBlockRows(serializedParent = serialise()): string[];
```

For the opening example, the stored tree is:

```text
A task
├─ B raw
│  └─ C task
└─ D task
```

Task-only descendants can be derived by walking `sourceChildren` and selecting visible task nodes. Do not store a separate task-only tree in v1.

## Parsing Rules

When the setting is enabled:

1. Classify rows as visible task, ignored task, or non-task.
2. Build source parent/child relationships from indentation.
3. Create board cards only for visible task rows with no visible task ancestor.
4. Attach each card's owned source block as `sourceChildren`.
5. Exclude nested visible task rows from `tasksByTaskId` so they do not appear as independent board cards.

Indentation rules:

- A row is a descendant when its leading whitespace starts with the ancestor prefix and is longer.
- Equal indentation, less indentation, or a different whitespace prefix breaks ancestry.
- Do not normalize tabs/spaces in v1.

Source block ownership:

- A card owns its parent task row and following non-blank rows that are more indented than the root row.
- Ownership stops at blank line, dedent to the root indentation or less, or end of file.
- Owned rows include visible subtasks, ignored-status task rows, non-task rows, and their nested descendants.

Ignored-status task rows and non-task rows:

- Do not become board cards.
- Do not become visible task nodes.
- Do not count as visible task ancestors.
- Do remain source ancestors.
- Do not suppress visible task descendants.

## UI Behavior

Cards render the existing parent task row plus recursive `sourceChildren`.

Visible task nodes render with:

- Checkbox/status control.
- Line text.
- Tags/properties as normal text.
- Nested children.

Raw/ignored nodes render with:

- Editable line text.
- No checkbox/status control.
- Nested children.

Display indentation is derived from source indentation. Source indentation is not rewritten for visual alignment.

## Row Writes

Row-local writes use row indexes from the parsed model, not text matching.

Rewrite exactly one source row:

- Parent text edit.
- Parent checkbox/status change.
- Parent date/property edit.
- Subtask checkbox/status change.
- Subtask text edit.
- Raw content row edit.

Subtask checkbox/status writes:

- Cycle only the clicked subtask row.
- Do not move the card between columns.
- Do not mutate parent, siblings, or child rows.
- Reparse after write. If the new marker is ignored, the row becomes raw/ignored content.

Minimum v1 behavior is row-local status cycling. Parent-style completion metadata side effects for subtasks are optional only if they can be safely applied row-locally.

## Parent Actions

Full-block actions:

- Delete removes parent plus all owned rows.
- Duplicate copies parent plus all owned rows, applying `createDuplicateLine()` only to the duplicated parent row.
- Move-to-file appends parent plus all owned rows to the destination and deletes source blocks bottom-to-top by row index.

Parent-row-only actions:

- Column change.
- Parent status/done/cancel/restore/archive.
- Parent swimlane tag change.
- Parent date property change.
- Parent manual-order block link assignment.

Manual-order block links remain parent-only in v1.

## Existing Feature Interactions

| Feature | Behavior |
|---|---|
| Column/group/sort/filter | Parent/root task only |
| Parent tags/properties | Existing behavior |
| Subtask tags/properties | Display as line text only |
| Excluded/ignored task rules | Determine visible vs ignored task nodes |
| Raw content | Display/edit only, no task behavior |
| Delete/duplicate/move card | Full owned source block |
| Manual order | Parent/root task only |

## Edge Cases

- Task under non-task row becomes a board card root if it has no visible task ancestor.
- Task under ignored-status row becomes a board card root if it has no visible task ancestor.
- Ignored/non-task rows inside a parent block display as raw editable content.
- Visible task under raw/ignored row remains source-nested there, but can be found by task-only traversal.
- Done/completed subtasks display and can cycle status.
- Blank line ends block ownership.
- Mixed indentation without shared prefix breaks ancestry.
- Setting off restores independent-card behavior.

## Future Drag And Drop Note

Future subtask drag/drop should operate on the source tree by default. A task under a raw bullet is structurally nested under that raw row even though task-only traversal can find it as a descendant of the nearest visible task ancestor.

## Implementation Plan

### Phase 1: Parsed Model And Board Roots

**Goal:** Build board card roots with source trees.

1. [ ] Add setting schema, default, UI, and parser option.
2. [ ] Add `SourceTaskNode` and `SourceRawNode` types.
3. [ ] Add source block helpers to `Task`.
4. [ ] Parse source tree and create cards only for root-most visible tasks.
5. [ ] Exclude nested visible task nodes from independent board cards.
6. [ ] Add task-only traversal helper(s).
7. [ ] Unit tests for setting off, root detection, nested subtasks, raw/ignored rows, blank lines, and mixed indentation.

### Phase 2: Render Source Children

**Goal:** Display parsed subtasks and raw content rows inside parent cards.

1. [ ] Add recursive child row component.
2. [ ] Render visible task nodes with checkbox/status controls.
3. [ ] Render raw/ignored nodes without checkbox/status controls.
4. [ ] Preserve source order and visual nesting.
5. [ ] Manual test display with nested tasks, raw bullets, ignored rows, and done subtasks.

### Phase 3: Row-Local Editing

**Goal:** Edit any displayed child row independently.

1. [ ] Add row-local text edit action keyed by source row index.
2. [ ] Edit subtask rows without changing parent/siblings.
3. [ ] Edit raw rows without adding task behavior.
4. [ ] Reparse after writes.
5. [ ] Unit tests for subtask/raw/nested row edits.

### Phase 4: Row-Local Subtask Status Cycling

**Goal:** Click subtask checkboxes to cycle only that subtask row.

1. [ ] Add row-local status cycle action.
2. [ ] Use configured status marker order and marker settings.
3. [ ] Rewrite only the clicked subtask row.
4. [ ] Reparse after writes.
5. [ ] Unit tests for row-local cycling, parent isolation, ignored-marker transition, and done subtasks.

### Phase 5: Block-Aware Parent Actions

**Goal:** Parent board actions preserve or move full owned source blocks.

1. [ ] Add block splice helper where needed.
2. [ ] Update delete, duplicate, and move-to-file for full blocks.
3. [ ] Confirm parent-only actions rewrite only parent rows.
4. [ ] Confirm manual order remains parent-only.
5. [ ] Unit tests for delete, duplicate, move-to-file, parent-only mutations, and multiple block deletes from one file.

## Verification Plan

### Automated Tests

- [ ] `npm run build`
- [ ] `npm test`

### Manual Verification

- [ ] Toggle setting on/off.
- [ ] Verify root detection under non-task and ignored-status rows.
- [ ] Verify recursive subtasks and raw rows display correctly.
- [ ] Verify raw/ignored rows edit as raw content.
- [ ] Verify subtask checkbox changes only clicked row.
- [ ] Verify subtask edit changes only clicked row.
- [ ] Verify parent move/delete/duplicate carries full source block.
