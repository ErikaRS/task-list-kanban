# Duplicate Task

Status: IN_PROGRESS

**Related issues:** [#36](https://github.com/ErikaRS/task-list-kanban/issues/36) (FR: duplicate note)

## Feature Request Summary

Add the ability to duplicate a task from the task dropdown menu. The duplicate is inserted directly below the original in the source markdown file, with its checkbox reset to unchecked.

## User Requirements

1. A "Duplicate task" menu item appears in the task dropdown menu
2. Clicking it creates a copy of the task directly below the original line in the source file
3. The duplicate preserves: content text, column tag, non-column tags, indentation, list marker
4. The duplicate resets checkbox status to `[ ]` (unchecked)
5. Block links (`^block-id`) are NOT duplicated (they are unique identifiers)
6. The duplicate appears on the board via the normal file-watch pipeline (no special UI handling)

## High-Level Design

### Menu Placement

The "Duplicate task" item is inserted in `task_menu.svelte` before the existing separator that precedes Cancel/Archive/Delete (no new separator is added):

```
Go to file
─────────
Move to [Column]...
Move to Done
Duplicate task
─────────
Cancel task / Restore task
Archive task
Delete task
```

### Action: `duplicateTask`

Added to `TaskActions` in `actions.ts`. The action uses **raw string manipulation** on the original file line rather than the in-memory `Task` object. This is important because:

- Done tasks have `column = undefined` in memory (cleared on parse), but the column tag is still present in the raw file line. String manipulation preserves it.
- The list marker (`-`, `*`, `+`) is not stored by the `Task` class, so working from the raw line preserves whichever marker the user originally wrote.
- No clone/copy mechanism is needed for the `Task` class.

Steps:

1. Look up the task's metadata to get the file handle and row index
2. Read the file and extract the line at `rowIndex`
3. Strip any block link suffix (matching `\s\^[a-zA-Z0-9-]+$`)
4. Replace the checkbox content with a space: `[x]` / `[-]` / `[anything]` becomes `[ ]`
5. Insert the new line at `rowIndex + 1` (splice, not replace)
6. Write the modified file back

Error handling follows the existing pattern: silently return if the task ID or metadata is not found (same as `updateRowWithTask`).

### Behavior Notes

- **Available for all task states**: unchecked, done, cancelled. Always resets to `[ ]`.
- **Row index safety**: Uses the same stale-index risk profile as all other actions (changeColumn, delete, etc.). No additional mitigation needed.
- **`consolidateTags` setting**: Irrelevant — the raw file line already contains tags in whatever format was last written, and we copy it verbatim (minus block link and checkbox status).

### UI Changes

`task_menu.svelte`: Add one `menu.addItem` call for "Duplicate task" that invokes `taskActions.duplicateTask(task.id)`. Placed after the "Move to Done" item and before the separator.

## Implementation Plan

### Phase 1: Duplicate Task Action + Menu Item

**Goal:** User can duplicate any task from the dropdown menu

1. Add `duplicateTask(id: string)` to `TaskActions` type and implementation in `actions.ts`
2. Add an `insertRow` helper to insert a line after a given row index in a file
3. Add "Duplicate task" menu item in `task_menu.svelte` (before the Cancel/Archive separator)
4. Add tests for the string manipulation logic: checkbox reset, block link stripping, various list markers
5. Test: duplicate a done task, verify column tag is preserved and status is reset
6. Test: duplicate a task with a block link, verify block link is not present on the duplicate

**Deliverable:** Working duplicate from dropdown menu, with block links omitted and status reset
