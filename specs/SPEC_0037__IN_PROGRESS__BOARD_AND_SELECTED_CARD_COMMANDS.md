# SPEC 0037: Board and Selected Card Commands

Status: IN_PROGRESS

## Feature Request Summary

[#148](https://github.com/ErikaRS/task-list-kanban/issues/148) asks for more
command/hotkey coverage:

- Add a new board
- Add a new card to the current or focused list
- Add a new list/column
- Delete the selected card or list
- Ribbon: New Kanban board

SPEC 0035 covers the new-board command and ribbon entry point. This spec
covers the remaining command-palette work, with one product adjustment:
instead of a command to add a new column, add a command to **open board
settings**, where column/list management already lives.

It also expands the command set beyond issue #148's initial delete ask by
adding command-palette actions for selected cards: delete, archive, cancel,
duplicate, and mark as done.

Obsidian standard: this spec adds commands that appear in the command palette
and can be assigned hotkeys by the user. It does **not** register any default
hotkeys.

## User Requirements

1. Users can open board settings from the command palette while a kanban board
   is active.
2. Users can add a card from the command palette even when no kanban board is
   active by choosing the target board, column, and file in a modal.
3. Users can run selected-card commands from the command palette while a
   kanban board has selected visible cards:
   - mark selected cards as done
   - archive selected cards
   - cancel selected cards
   - duplicate selected cards
   - delete selected cards
4. Commands are hotkey-bindable through Obsidian's standard hotkey settings,
   but no default hotkeys are registered.
5. Commands reuse existing board and task action logic rather than
   maintaining parallel write paths.
6. Commands never affect hidden filtered-out tasks or stale selections from a
   previous board state.

## High-Level Design

### Command registration

Register these commands in `entry.ts`:

- `open-current-board-settings` — **Open current board settings**
- `add-card` — **Add card**
- `mark-selected-cards-done` — **Mark selected cards as done**
- `archive-selected-cards` — **Archive selected cards**
- `cancel-selected-cards` — **Cancel selected cards**
- `duplicate-selected-cards` — **Duplicate selected cards**
- `delete-selected-cards` — **Delete selected cards**

The selected-card and board-settings commands use `checkCallback`, gated on an
active `KanbanView`. The **Add card** command is global and uses a normal
callback because it opens its own board/column/file chooser.

None of these command definitions should include default hotkeys.

For active-board commands, the active `KanbanView` should expose small
imperative methods for commands to call. `entry.ts` should stay thin: find the
active view, ask whether the command is available, then invoke the view method.

### Open board settings

The command should open the same board settings surface as the existing
settings gear in the board toolbar.

Behavior:

- Available only when a kanban view is active.
- If settings are closed, open them.
- If settings are already open, leave them open and focus the settings surface
  if there is a focusable target.
- Close transient overlays that would block interaction, such as the dashboard
  panel or view popover, using the same close paths as existing UI controls.

This replaces the "Add a new list/column" command idea from issue #148
because column/list creation is board-configuration work and already belongs
inside board settings.

### Add card

Behavior:

- Available globally when the plugin is loaded.
- Opens a modal with:
  - a text editor for the card content
  - a board dropdown
  - a column dropdown for the selected board
  - a file dropdown containing files in the selected board's scope
- The board dropdown is populated from discovered kanban board files.
- The column dropdown includes Uncategorized, configured columns, and Done for
  the selected board.
- The file dropdown defaults to the board's configured default task file when
  it is valid and in scope, otherwise the board's last-used task file when
  valid, otherwise the first scoped markdown file.
- On submit, write a task line using the same task-line construction rules as
  existing inline task creation: placement tags, status-marker columns,
  priority columns, and property schema handling should match.
- Persist the chosen file as the selected board's last-used task file.
- Does not create a task until the user submits content.

### Selected-card command target set

Add a testable selector that derives command targets from current board UI
state:

- Start with `taskSelectionStore`.
- Intersect with task ids currently visible in the active board matrix.
- Preserve board display order for deterministic operations.
- Return an empty list if the dashboard is open or no kanban board is active.

Selected-card commands operate across all visible selected cards in the active
board, not only within one column. After a successful command, clear the
affected selections. Selection mode itself may remain on, matching existing
bulk-menu behavior.

Commands should not silently act on stale ids, tasks hidden by filters, tasks
from another board, or tasks that were selected before a board switch.

### Selected-card actions

Use existing `TaskActions` methods wherever possible:

- Mark done: `moveTasksToColumn(ids, "done")`
- Archive: `archiveTasks(ids)`
- Cancel: `cancelTasks(ids)`
- Duplicate: call `duplicateTask(id)` for each selected id in display order
- Delete: call `deleteTask(id)` for each selected id in display order

Delete is destructive and easier to trigger from a command/hotkey than from a
card menu. Before deleting multiple selected cards, show a confirmation modal
with the selected count. For a single selected card, follow the existing
single-card delete behavior unless implementation review decides to reuse the
same confirmation path for consistency.

Cancel means cancel, not toggle restore. A separate restore-selected command
can be added later if users ask for it.

Duplicate should duplicate each selected card's owned source block, using the
existing duplicate semantics. If a selected id becomes stale after a previous
duplicate write, skip it with a notice rather than aborting the whole command.

## Detailed Behavior

- Command palette entries for selected-card actions should be hidden/disabled
  by `checkCallback` when there are no visible selected cards.
- Running a selected-card command with a mix of columns acts on all selected
  visible cards in display order.
- Mark-done selected cards use the board's current done-column behavior,
  including completion metadata when the active property schema supports it.
- Archive selected cards uses the existing archive action and should keep
  archived tasks out of normal open/done dashboard counts as today.
- Cancel selected cards uses the board's configured cancelled marker.
- Duplicate selected cards should not auto-select the duplicate copies.
- Delete selected cards removes each selected card's owned source block, using
  the same parent/subtask ownership rules as the existing delete action.
- After success, affected selections are cleared. If an operation partially
  fails, clear only ids that completed successfully and show a notice.
- Commands do not change selection mode, filter query, grouping, sorting, or
  manual order except as naturally caused by the underlying task action.

## Non-Goals

- Default hotkeys.
- New-board command/ribbon behavior; see SPEC 0035.
- Add-column command. The replacement command is open board settings.
- Delete selected column/list.
- Restore selected cards.
- Move selected cards to arbitrary columns from the command palette.
- Command-palette editing of card content or dates.

## Implementation Plan

### Phase 1: Board settings and add-card commands 🚧 IN PROGRESS
**Goal:** Issue #148's non-destructive board-level commands exist in the
command palette without default hotkeys.

1. ✅ Add a `KanbanView` method for opening board settings
2. ✅ Register **Open current board settings** with active-kanban
   `checkCallback` gating and no default hotkey
3. ✅ Register global **Add card** command with no active-board dependency and
   no default hotkey
4. ✅ Add a command modal with card text, board, column, and file inputs
5. ✅ Resolve board settings from global defaults plus board frontmatter so the
   modal can create cards even without an open `KanbanView`
6. ✅ Route add-card through shared task-line construction so placement tags,
   status columns, and priority columns match existing inline creation
7. ✅ Default the file dropdown to the selected board's valid default task file,
   then valid last-used file, then first scoped markdown file
8. ✅ Persist the chosen file as the selected board's last-used task file
9. [ ] Tests: command availability with and without active kanban view; modal
   board/column/file defaults; add-card command writes the expected task line
   - ✅ Added task-line builder coverage for Uncategorized and Done defaults
   - ✅ Existing task action tests cover configured status and priority columns
10. ✅ Automated verification: `npm run build`, `npm test`
11. ✅ Manual: command palette opens board settings; global Add card opens the
   modal without an active kanban view; board, column, and file dropdowns
   populate correctly; submitted card appears in source markdown; confirm no
   default hotkeys appear

**Deliverable:** Command-palette access for board settings and keyboard-first
card creation.
**Size:** M

**Implemented by:** [9c5ab60](https://github.com/ErikaRS/task-list-kanban/commit/9c5ab60)

### Phase 2: Non-destructive selected-card commands 🚧 IN PROGRESS
**Goal:** Selected visible cards can be marked done, archived, cancelled, and
duplicated from the command palette.

1. ✅ Add a selector that derives visible selected task ids from
   `taskSelectionStore` plus the active board matrix, preserving display order
2. ✅ Add `KanbanView` methods for selected-card mark-done, archive, cancel,
   and duplicate actions
3. ✅ Register selected-card commands with active-kanban and non-empty
   visible-selection gating; no default hotkeys
4. ✅ Clear affected selections after successful operations, leaving
   selection mode unchanged
5. [ ] Tests: visible-selection selector excludes hidden/stale ids and
   preserves display order; each command calls the expected `TaskActions`
   method(s); selections clear after success
   - ✅ Added visible-selection selector coverage for hidden/stale ids,
     dashboard-open state, display order, and selection clearing helper
6. ✅ Automated verification: `npm run build`, `npm test`
7. ✅ Manual: select cards across columns, run each command from the palette,
   verify underlying markdown writes and selection clearing

**Deliverable:** Common selected-card workflows are command-palette accessible
without reaching for the column bulk menu.
**Size:** M

**Implemented by:** [e56abd4](https://github.com/ErikaRS/task-list-kanban/commit/e56abd4), [9c5ab60](https://github.com/ErikaRS/task-list-kanban/commit/9c5ab60)

### Phase 3: Delete selected cards 🚧 IN PROGRESS
**Goal:** Destructive selected-card deletion is command-palette accessible
with an explicit safety check.

1. ✅ Add a `KanbanView` method for deleting visible selected cards in
   display order
2. ✅ Add a confirmation modal for multi-card delete, showing the selected
   count and requiring explicit confirmation
3. ✅ Register **Delete selected cards** with active-kanban and non-empty
   visible-selection gating; no default hotkey
4. ✅ Clear only successfully deleted selections after completion
5. [ ] Tests: multi-delete confirmation accept/cancel paths; single-delete
   path follows the decided behavior; stale ids are skipped; successful ids
   clear from selection
6. ✅ Automated verification: `npm run build`, `npm test`
7. ✅ Manual: delete one selected card, delete multiple selected cards,
   cancel confirmation, verify source blocks and nested owned rows are removed
   correctly

**Deliverable:** The remaining requested selected-card action is available
from the command palette with appropriate friction.
**Size:** S-M

**Implemented by:** [e56abd4](https://github.com/ErikaRS/task-list-kanban/commit/e56abd4)
