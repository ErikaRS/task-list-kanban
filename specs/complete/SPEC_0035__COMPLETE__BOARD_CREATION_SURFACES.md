# SPEC 0035: Board Creation Surfaces

Status: COMPLETE

Implemented: 2026-07

## Feature Request Summary

Two requests point at the same missing capability: board creation should be
available from the plugin's navigation surfaces, not only from a folder
context menu.

- [#132](https://github.com/ErikaRS/task-list-kanban/issues/132) follow-up:
  add a **"New board" button on the dashboard**. The dashboard is now the
  board launchpad, so creation belongs there.
- [#148](https://github.com/ErikaRS/task-list-kanban/issues/148): expose
  **New Kanban board** from the ribbon. The same issue also asks for an
  "Add a new board" hotkey; Obsidian hotkeys attach to commands, so this
  spec includes a command for the shared creation flow. The other requested
  card/list hotkeys are out of scope here.

Manual validation of the creation surfaces exposed a natural adjacent
dashboard-management need: users who can create boards from the dashboard
should also be able to delete boards from that same launchpad, with explicit
confirmation.

This spec extends SPEC 0033's dashboard. It does not replace SPEC 0034's
board rail; the rail remains a fast-switching surface, while the dashboard
and ribbon become creation entry points.

## User Requirements

1. Users can create a new kanban board from the dashboard.
2. Users can create a new kanban board from a ribbon icon.
3. Users can bind a hotkey to create a new board through an Obsidian command.
4. Existing folder context-menu creation keeps working.
5. Every creation entry point uses the same helper and initial board content.
6. Entry points that do not already imply a folder let the user choose the
   destination folder instead of silently guessing a vault location.
7. After creation, the new board opens in the current kanban leaf when
   possible, and appears in the dashboard / rail board index without requiring
   a reload.
8. Users can delete a board from the dashboard card context menu.
9. Deleting a board requires confirmation that clearly names the board/file.
10. Cancelling delete leaves the board and dashboard state unchanged.
11. After confirmed delete, the dashboard / rail board index updates without a
   reload and stale dashboard curation data is cleaned up through existing
   path-pruning behavior where practical.

## High-Level Design

### Shared board creation helper

Extract the current file-menu creation logic from `entry.ts` into a small
plugin-level helper, for example:

```ts
async createKanbanBoardInFolder(folderPath: string): Promise<TFile>
```

Behavior:

- Create a markdown file named `Kanban-<timestamp>.md` in the chosen folder
  with the same initial frontmatter used today:

```markdown
---
kanban_plugin: {}
---
```

- If a timestamp collision occurs, retry with a numeric suffix before
  surfacing an error notice.
- Keep the folder context menu, dashboard button, ribbon icon, and command on
  the same helper so future board-creation behavior cannot drift.
- Opening the created board is a separate helper so callers can choose the
  right leaf behavior without duplicating file creation.

### Folder selection

Add a reusable folder picker using Obsidian's folder tree / suggest modal
pattern.

- The folder context menu skips the picker because the user has already
  selected a folder.
- The dashboard button defaults the picker to the current board's parent
  folder when there is a current board; otherwise vault root.
- The ribbon icon and command default to the active file's parent folder when
  the active file is in the vault; otherwise vault root.
- Confirming the picker creates the board in that folder.
- Cancelling the picker does nothing and leaves the current UI open.

### Dashboard "New board" action

Add a primary icon+text button in the dashboard header, next to the close
button:

- Label: **New board**
- Icon: `plus` or `square-kanban` from the existing icon component, depending
  on which icon is already available locally.
- Opens the shared folder picker.
- On success:
  - close the picker,
  - open the new board in the current kanban leaf,
  - close the dashboard panel using the same close path as card selection,
  - show a short success notice only if the open operation cannot be made
    visually obvious in the current flow.
- On cancel or failure, leave the dashboard open.

The empty dashboard state should change from "create one from a folder's
context menu" to pointing at the dashboard button, while still mentioning the
folder context menu as an alternate path.

### Ribbon and command entry points

Add a ribbon icon for **New Kanban board**:

- Icon: `square-kanban` when available; otherwise the closest existing
  kanban/layout icon.
- Tooltip: **New Kanban board**.
- Click opens the shared folder picker and then creates/opens the board.

Add an Obsidian command for the same flow:

- Command id: `create-new-kanban-board` or similar.
- Name: **Create new kanban board**.
- Available globally, because board creation is useful before any kanban view
  exists.
- Opens the shared folder picker and then creates/opens the board.
- This command satisfies the "Add a new board" hotkey portion of issue #148;
  users can assign their preferred shortcut in Obsidian's hotkey settings.

### Opening behavior

After creating the file:

- If a kanban view is active, open the new board in that view's leaf. This
  preserves the dashboard/rail context and matches dashboard card selection.
- Otherwise, open the board in the active markdown leaf when available.
- If neither leaf shape is available, open the board in the workspace's
  active leaf or a new leaf using Obsidian's normal file-opening behavior.
- The created file's kanban frontmatter should cause `switchToKanbanAfterLoad`
  to convert the markdown leaf to the kanban view, as today.

### Dashboard delete action

Extend the existing dashboard card context menu with **Delete board**:

- Show the action for shown and hidden board cards.
- Icon: `trash-2` or the closest existing delete icon.
- Selecting it opens a confirmation modal before any file operation.
- Confirmation copy should include the board name and path so the user can
  distinguish similarly named boards.
- The destructive confirm button label should be **Delete board**.
- Cancelling the modal does nothing and keeps the dashboard open.
- Confirming deletes the underlying markdown file using Obsidian's vault trash
  behavior when available, so users retain the normal Obsidian recovery path.
- If deletion fails, show an error notice and keep the dashboard open.

## Detailed Behavior

- Creating a board from the dashboard in an empty vault is supported: the
  folder picker can choose vault root, then the dashboard switches into the
  new board.
- Creating a board through the ribbon before any board exists is supported.
- Creating a board in a hidden/curated folder does not auto-hide it. The
  board index discovers it and `resolveBoardList` places it with the normal
  shown-board rules until the user hides or reorders it.
- If board creation fails because the folder no longer exists or the file
  cannot be created, show an error notice and keep the caller's UI open when
  applicable.
- The existing folder context menu should continue to create the board inside
  the clicked folder without an extra picker step.
- The ribbon icon is a creation shortcut only; it does not open the dashboard.
- Deleting a board from the dashboard removes that board file from the vault
  and lets the board index drop it through the existing metadata/file-event
  pipeline.
- If the deleted board is currently open in the active kanban leaf, the
  current leaf should not be left showing a stale board. Prefer switching to
  another discovered board when one exists; otherwise let Obsidian handle the
  deleted file state and keep the dashboard open enough for the user to choose
  a next action.
- Deleting a hidden board behaves the same as deleting a shown board; its
  hidden/curated entry should not linger in the UI after the index refreshes.
- Delete is only exposed from the dashboard card context menu in this spec.

## Non-Goals

- Creating boards from the rail.
- Board templates or copying settings from another board.
- Choosing the new board's name before creation.
- Dashboard sorting/filtering changes.
- Bulk board deletion.
- A command palette or hotkey action for deleting boards.
- Deleting boards from the rail.
- The other hotkeys from issue #148: add card, add list/column, delete
  selected card/list.

## Implementation Plan

### Phase 1: Shared creation helper and dashboard action
**Goal:** Users can create a board from the dashboard, choose its folder, and
land directly in the new board while the existing folder context menu keeps
working.

1. [x] Extract the file-menu "New kanban" logic into a shared helper that
   creates the board file and handles filename collision retries
2. [x] Add a reusable folder picker, including a pure helper for deriving the
   default folder from current board path, active file path, or vault root
3. [x] Add the dashboard header's "New board" button and wire successful
   creation to open the new board in the current kanban leaf
4. [x] Close the dashboard through the normal selection choreography after a
   successful dashboard-created board open
5. [x] Update the dashboard empty state copy to mention the new button
6. [x] Tests: creation path helper chooses filenames safely; default-folder
   helper handles current board, active file, and root fallback; dashboard
   callback opens the created board path
7. [x] Automated verification: `npm run build`, `npm test`
8. [x] Manual: create in current folder, create in another folder, create
   from an empty dashboard, cancel picker, and verify the board appears in
   dashboard/rail without reload

**Deliverable:** The dashboard is a true launchpad: browse, switch, curate,
rename, and create boards from one place.
**Size:** S-M

**Implemented by:** [5ecd311](https://github.com/ErikaRS/task-list-kanban/commit/5ecd311)

### Phase 2: Ribbon icon and hotkey-bindable command
**Goal:** The same board-creation flow is available from the ribbon and from
an Obsidian command.

1. [x] Add a globally available **Create new kanban board** command that opens
   the shared folder picker, creates the board, and opens it
2. [x] Add a **New Kanban board** ribbon icon using the same command/helper
   path
3. [x] Ensure ribbon/command default folder selection uses the active file's
   parent folder when possible, otherwise vault root
4. [x] Tests: command/ribbon path calls the same creation helper and derives
   the expected default folder
5. [x] Automated verification: `npm run build`, `npm test`
6. [x] Manual: create from ribbon with a markdown file active, create from
   ribbon with no file active, bind a temporary hotkey to the command and
   create a board, verify folder context-menu creation still skips the picker

**Deliverable:** Issue #148's new-board ribbon request and add-board hotkey
path are covered without duplicating creation logic.
**Size:** S

**Implemented by:** [5ecd311](https://github.com/ErikaRS/task-list-kanban/commit/5ecd311)

### Phase 3: Dashboard right-click delete with confirmation
**Goal:** Users can remove an unwanted board from the dashboard without going
to the file explorer, while confirmation prevents accidental vault changes.

1. [x] Add **Delete board** to the dashboard card context menu for shown and
   hidden boards
2. [x] Add a confirmation modal that names the board and path, with a
   destructive **Delete board** confirm action and a non-destructive cancel
3. [x] Delete the board file through Obsidian's trash/delete API and surface a
   failure notice if the file cannot be deleted
4. [x] Ensure the dashboard and rail board lists update after deletion without
   requiring a reload
5. [x] Handle deleting the currently open board without leaving the active
   kanban leaf stuck on stale content
6. [x] Tests: confirmation state/callback behavior; delete callback calls the
   expected vault API; deleted-board path is removed from dashboard/rail inputs
   after index refresh
7. [x] Automated verification: `npm run build`, `npm test`
8. [x] Manual: delete a shown board, delete a hidden board, cancel deletion,
   delete the currently open board, and verify the board disappears from the
   dashboard/rail without reload

**Deliverable:** Dashboard board management covers create, switch, curate,
rename, hide/show, and confirmed delete from the card context menu.
**Size:** S

**Implemented by:** [5ecd311](https://github.com/ErikaRS/task-list-kanban/commit/5ecd311)
