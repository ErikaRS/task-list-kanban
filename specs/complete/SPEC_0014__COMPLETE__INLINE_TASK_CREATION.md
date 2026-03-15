# Inline Task Creation

Status: COMPLETE
Implemented: 2026-03

**Related issues:** [#92](https://github.com/ErikaRS/task-list-kanban/issues/92) (FR: "Add new" should allow to put the task info immediately)

## Feature Request Summary

When a user clicks "Add new" on a column, they currently have to find the newly created "TODO" task in the list and click it to edit. This feature makes new tasks start in edit mode inline — the user picks a file, then a textarea appears at the bottom of the column where they can immediately type the task name.

## User Requirements

1. Clicking "Add new" shows the file picker menu (same as today)
2. After selecting a file, an inline textarea appears at the bottom of the column
3. The textarea is focused and ready for typing immediately
4. Pressing Enter or clicking away saves the task to the selected file
5. Pressing Escape discards the pending task without writing anything
6. Empty content on save also discards (no blank tasks created)
7. The task text replaces the old hardcoded "TODO" placeholder

## High-Level Design

### Two-Phase Creation Flow

```
[Add new] → File picker menu → User picks file
                                      ↓
                              Inline textarea appears
                              at bottom of column
                                      ↓
                         User types task name
                                      ↓
                    Enter/blur: write to file ← task appears via normal store pipeline
                    Escape: discard
```

The key insight is that no "ghost Task object" is needed in the store. The textarea is purely local UI state in `column.svelte`. On save, we write the task to the file, and the existing file-watch → parse → store pipeline picks it up naturally.

### Action Changes

Split `addNew` into two concerns:

1. **`pickFileForNewTask(column, e, onFileSelected)`** — Shows the file picker menu. When a file is selected, calls the `onFileSelected` callback instead of writing directly. Reuses all existing menu-building logic (default file, folder tree, etc.).

2. **`createTask(file, content, column)`** — Writes `- [ ] {content} #{column}` to the end of the selected file. This is essentially the `updateRow` call that `addNew` used to do inline.

The old `addNew` method is replaced by these two.

### Column Component Changes

`column.svelte` gains:
- A `pendingNewTask` state variable holding the selected `TFile` (or null)
- A textarea rendered below the task list when `pendingNewTask` is set
- Save handler: calls `createTask`, clears state
- Cancel handler: clears state

## Detailed Behavior

### Textarea Behavior

- Appears at the bottom of the task list, above the "Add new" button
- Auto-focused on mount
- Single-line by default (Enter saves, Shift+Enter for newline — matching existing task edit behavior)
- Styled similarly to the existing task edit textarea
- The "Add new" button remains visible but is disabled while a pending task exists

### Save Behavior

- On blur or Enter (without Shift): save
- Content is trimmed; if empty after trim, discard instead
- Write format: `- [ ] {content} #{column}` (same as today, but with user's text instead of "TODO")
- After write, `pendingNewTask` is cleared and the task appears via the normal store update pipeline

### Cancel Behavior

- On Escape: clear `pendingNewTask`, nothing written to file
- Clicking "Add new" again while a pending task exists: save the current pending task first (blur triggers save), then show new file picker

### Edge Cases

- If the selected file is deleted before the user saves, the vault.modify call will fail silently (consistent with existing behavior for deleted files)
- Column collapse while editing: the textarea disappears with the column content (natural CSS behavior)

## Alternatives Considered

### Option B: Skip file picker when default task file is set

Instead of always showing the file picker first, use the default task file directly when one is configured — the user clicks "Add new" and the textarea appears immediately with no menu. Fall back to file picker only when no default is set.

**Pros:**
- Fastest possible UX for users with a default task file (one click → typing)
- Removes an unnecessary step for the most common case

**Cons:**
- Different behavior depending on configuration could be surprising
- Users who want to occasionally add to a non-default file would need to change settings or use a different workflow
- More conditional logic

This remains a good future enhancement if users request faster creation when a default file is configured.

## Implementation Plan

### Phase 1: Refactor addNew and add inline creation ✅ COMPLETE

**Goal:** User clicks "Add new", picks a file, types task name inline, and the task is created with their text.

1. ✅ In `actions.ts`, replace `addNew` with `pickFileForNewTask(column, e, onFileSelected)` that shows the same file picker menu but calls the callback instead of writing
2. ✅ In `actions.ts`, add `createTask(file, content, column)` that writes `- [ ] {content} #{column}` to the end of the file
3. ✅ Update the `TaskActions` type to reflect the new methods
4. ✅ In `column.svelte`, add `pendingNewTask` state and wire the "Add new" button to call `pickFileForNewTask`
5. ✅ In `column.svelte`, render an inline textarea when `pendingNewTask` is set
6. ✅ Implement save (Enter/blur) and cancel (Escape) handlers
7. ✅ Style the textarea to match existing task edit styling
8. ✅ `npm run build` and `npm test` pass

**Deliverable:** Full working inline task creation flow.

## Files to Modify

| File | Change |
|------|--------|
| `src/ui/tasks/actions.ts` | Replace `addNew` with `pickFileForNewTask` + `createTask`; update `TaskActions` type |
| `src/ui/components/column.svelte` | Add pending task state, inline textarea, save/cancel handlers |
