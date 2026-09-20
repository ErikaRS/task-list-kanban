# Open Filtered Source Files

Status: COMPLETE

**Related issue:** [#180 — Open All Source Files At Once](https://github.com/ErikaRS/task-list-kanban/issues/180)

## Feature Request Summary

When a board surfaces tasks from several Markdown notes, a user may want to
open those source notes together to understand the context. Today this requires 
finding a card from every source file and activating its individual source-file link. 
This feature adds a board-wide split button that, by default, opens each
matching source file in its own new tab. Its dropdown provides a persistently
selectable subset plus an option to skip source files already open in a
Markdown tab, for cases where opening every matching file would be excessive
(or just undesirable).

## User Requirements

1. Provide a board-wide control for opening the source files represented by
   the board's current filter results.
2. Pressing the main part of the control must immediately open the source
   files currently checked in its selector; it must not show a confirmation,
   picker, or other intermediate step.
3. The adjacent chevron must open a multi-selector of the matching source
   files, with an explicit action to open only the checked files.
4. Selector checks must persist as board state, including after the selector
   closes and reopens, filter results change, the board is closed and reopened,
   and Obsidian restarts.
5. In the selector, allow a user to choose between opening every selected file
   in a new tab and opening only selected files not already open in a Markdown
   tab.
6. The chosen open mode must persist as board state across board closures and
   Obsidian restarts, and apply to the main split-button action as well as the
   selector action.
7. A file must be opened at most once per invocation, even if several matching
   cards came from it.

## High-Level Design

### Placement and split-button interaction

Place the control in the existing board toolbar, immediately after the filter
bar and before the Settings icon. This makes it visibly board-wide while
keeping it next to the filter whose applied result set it uses.

```text
┌────────┐  ┌───────────────────────────────────────┐  ┌──────────────────┐  ⚙
│  View  │  │ 🔎 Filter tasks …                      │  │ Open files |  ˅  │
└────────┘  └───────────────────────────────────────┘  └──────────────────┘
                                                            │
                                                            └─ selector popover
```

- The main button uses a folder-open icon and the label **Open files**. Its
  accessible name and tooltip describe both the persisted selector and active
  mode: **Open selected source files in new tabs** by default, or **Open
  selected source files not already open** after the user enables skipping.
- The chevron is a separately focusable button with the accessible name
  **Choose source files to open** and `aria-expanded` state.
- The chevron is disabled when the current result has no source files. The
  main button is also disabled when none of those files are selected. A
  zero-result filter or **Select none** therefore cannot produce an empty
  action.
- On narrow layouts, the existing toolbar wrapping rules apply. The two parts
  remain an inseparable visual/control group and wrap as one unit.

The main button uses the selector's persisted checked subset, including when
the popover is closed. It also uses the persisted skip setting. By default that
means one-click opening in new tabs for every selected matching file; when
**Skip files already open** is enabled, it opens only selected files not
already represented by a Markdown tab. This makes the selector a durable
board-level choice rather than a second, disconnected action path.

### Selector popover

The chevron opens a popover anchored to the split-button group. It contains
full vault-relative paths (rather than only file names, which may collide), one
checkbox per matching source file, and concise bulk controls:

```text
Open matching source files
3 files match the current filter

[Select all] [Select none]

Skip files already open                              [toggle]

☑ projects/launch.md
☐ projects/retrospective.md
☑ inbox.md

                         [Open 2 files]
```

- Items are sorted by their vault-relative path using the project's normal
  `localeCompare` ordering.
- **Skip files already open** is a persisted Yes/No switch. **No** is the
  default and creates a new Markdown tab for every checked file, including
  files already open in the workspace. **Yes** compares checked source paths
  with Markdown leaves already open anywhere in the workspace and skips a
  checked file if at least one Markdown tab already shows that exact
  vault-relative path.
- The footer adjusts to **Open N file(s)** or
  **Open N unopened file(s)** using a fresh opened-file snapshot. When the
  latter mode has zero eligible files, it is disabled and explains that all
  selected files are already open.
- The selector contains only files that have at least one currently matching
  task. A changed, applied filter refreshes this list reactively.
- Opening from the popover acts only on its checked files, closes the popover,
  and updates no task, filter, or board setting.
- The footer action reads **Open N file** / **Open N files**, and is disabled
  at zero checked files. Clicking outside or pressing Escape closes the
  popover without changing checks.
- Native checkbox keyboard behavior is retained. The popover must stay within
  the viewport and scroll its file list rather than growing beyond it.

### Persistent board selection semantics

The checkbox state is durable, per-board state. Store it in the board's
canonical `kanban_plugin` frontmatter settings as an optional
`openSourceFileSelection` path-to-boolean map:

```yaml
kanban_plugin:
  openSourceFileSelection:
    projects/launch.md: true
    projects/retrospective.md: false
```

Store the mode beside it as `openSourceFileOpenMode: "all" | "unopened"`.
It defaults to `"all"` when absent, maintaining the original always-new-tab
behavior for existing boards.

The map is absent until the user changes a checkbox or uses a bulk selection
control. A path with no saved entry defaults to checked when it first appears.
An intentional **Select none** writes `false` for every currently matching
path, so it remains an intentional none selection after a board close/reopen;
a genuinely new path still defaults to checked. This preserves a user's
deliberate exclusions without turning a growing set of new source files into
surprising default exclusions.

Both values are board-local and follow the existing board-state write/read
path. They survive selector close/reopen, switching away from and back to the
board, closing/reopening the board, and Obsidian restarts. They must survive an
unrelated board-state write and normal external frontmatter synchronization.
They are not inherited from global defaults, included in saved views, or
exposed in the board Settings modal because their paths and tab behavior are
specific to this board's currently surfaced files.

When the matching file set changes:

- A path previously seen by the selector keeps its checked/unchecked state,
  even if it temporarily disappears from the filter results, the board closes,
  and it later returns.
- A newly encountered matching path begins checked. Thus the initial selector
  state and any genuinely new result both default to the intuitive “all
  matching files” selection without overwriting deliberate exclusions.
- When a source note or an ancestor folder is renamed, migrate every matching
  saved path key from the old path prefix to the new one while preserving its
  boolean value. A rename must not silently turn a previously unchecked note
  back on.
- Files that no longer exist are ignored by the open action. They are removed
  from the visible list; retaining their persisted state lets a quickly
  recreated path retain its user choice and avoids silently rewriting board
  state because of a temporary vault change.

## Detailed Behavior

### Defining “matching source files”

The source-file list is derived from `filteredTasks`, the same reactive task
collection used to form the board after the **applied** filter query is
evaluated. It is a deduplicated set of each task's source path, resolved to
live `TFile` objects before opening.

This deliberately means:

- With no applied filter, the action opens every board source file that has at
  least one task represented by the board; it does not scan and open empty
  Markdown files merely because they are in the board scope.
- A typed but not yet applied search affects neither cards nor this action.
- `file:`, content, tag, and date query terms all affect the set through the
  existing filter engine; the feature must not duplicate filter parsing.
- Collapsed columns/swimlanes, configured hidden columns, grouping direction,
  sorting, and card layout do not alter the set. These are display choices,
  not filter results.
- Existing task-store rules still apply. Ignored, archived/hidden, excluded,
  out-of-scope, and nested child tasks that do not become cards are not new
  candidates merely because their Markdown file exists.

The implementation resolves file handles immediately before opening and skips
a path that no longer resolves to a `TFile`. It should show a Notice when work
was skipped or failed: for example, “Opened 2 files; 3 were already open; 1
file was no longer available.” A normal successful all-files action needs no
Notice; an unopened-files action with no eligible target must explain that the
selected files are already open.

### Opening tabs and detecting already-open files

For either action path, resolve the unique selected `TFile` list in sorted
path order, then snapshot currently open Markdown file paths before creating
any new leaves. Obtain that snapshot with `workspace.iterateAllLeaves`,
checking each leaf's `getViewState()` rather than assuming `leaf.view` is a
loaded `MarkdownView`: Obsidian can defer inactive views. A leaf counts as
already open only when its view state is `type: "markdown"` and its saved
state identifies the same vault-relative file path. This includes main-pane
tabs, sidebars, pop-out windows, pinned tabs, and inactive/deferred tabs.

A source file open in a Kanban or another custom file view does **not** count
as already open for this feature. The purpose of the action is to make the
Markdown source context available, so only an existing Markdown tab satisfies
the “unopened” condition.

In **All selected files** mode, call `workspace.getLeaf("tab").openFile(file)`
once for every target. In **Only unopened files** mode, remove paths in the
opened-file snapshot first, then call the same new-tab API for each remaining
target. The literal `"tab"` leaf target is required for every file the action
does open; do not use `getLeaf(false)`, the active leaf, modifier-key behavior,
or a workspace lookup that reuses an existing markdown tab.

Consequences:

- In **All selected files** mode, a source note already open in a tab gets an
  additional tab for this action. In **Only unopened files** mode, it is
  skipped instead.
- No modifier key changes the behavior of this board-wide action.
- The order of newly created tabs is deterministic by path. The exact active
  tab after the operation remains Obsidian's normal tab-opening behavior and
  is not separately controlled by the plugin.
- File opening is read-only with respect to Markdown and board configuration.

### Interaction and lifecycle edge cases

- While an opening request is in flight, disable both parts of the split
  button and the popover's Open action. Ignore repeated activation until all
  requested `openFile` promises settle, then re-enable against the latest
  matching set.
- Take snapshots of both selected paths and currently open Markdown paths at
  activation. Live task, filter, vault, or workspace changes during the
  operation must not cause a single click to open a moving target. A file that
  opens elsewhere after the snapshot may still receive a new tab; this is a
  predictable race rather than a reason to reuse another leaf.
- If the dashboard overlay opens, close the popover and make the control inert
  along with the other toolbar controls.
- Main-button activation by mouse, Enter, or Space has identical
  all-matching-files behavior under the persisted mode. The chevron does not
  trigger the main action.
- Neither flow navigates to a task line or changes the active kanban board.

## Implementation Plan

### Phase 1: Deterministic file-target and tab-opening primitive — ✅ COMPLETE

**Goal:** A tested UI-independent helper derives unique live source files,
detects already-open Markdown files, and opens only the targets eligible under
the chosen mode.

1. Add a helper under `src/ui/tasks/` (or a narrowly named board utility) that
   takes matching `Task` values plus the vault and returns deduplicated,
   path-sorted live `TFile` targets.
2. Add an opened-Markdown-path helper that safely visits every workspace leaf
   through view state, including deferred leaves, without forcing those views
   to load.
3. Add an opener that snapshots targets and opened paths, respects the selected
   open mode, allocates `workspace.getLeaf("tab")` for each eligible target,
   and reports unavailable, skipped-already-open, and failed targets for Notice
   copy.
4. Unit-test deduplication, ordering, no-task behavior, missing-file skips,
   deferred/inactive/pinned/pop-out Markdown leaves, custom-view exclusion,
   and one `"tab"` leaf request per eligible file.
5. Run `npm run build` and `npm test`.

**Deliverable:** The model-level operation safely converts current filter
results into fresh tabs for every unique target or only targets not already
open, as selected.

**Implemented by:** [c27d410](https://github.com/ErikaRS/task-list-kanban/commit/c27d410)

### Phase 2: Toolbar selected-files action — ✅ COMPLETE

**Goal:** A user can open every matching source file in one immediate action,
using the persisted all-files or unopened-files mode.

1. In `src/ui/main.svelte`, derive source-file candidates from `filteredTasks`
   rather than from the rendered matrix or raw scope enumeration.
2. Add the accessible **Open files** main button after the filter bar and
   before Settings, with selected-empty/in-flight disabled state.
3. Wire main-button mouse and keyboard activation to the Phase 1 opener using
   activation-time snapshots of the persisted selected subset and skip setting.
4. Ensure dashboard-open handling makes the new control inert and visually
   consistent with the existing toolbar controls.
5. Manually verify an unfiltered board and several `file:`/content/tag/date
   filters in both modes; confirm an already-open source note receives another
   tab in All mode and is skipped in Only unopened mode.
6. Run `npm run build` and `npm test`.

**Deliverable:** One click opens every unique source file in the board's saved
selector subset, either in fresh tabs or only when not already open, according
to the saved skip setting.

**Implemented by:** [c27d410](https://github.com/ErikaRS/task-list-kanban/commit/c27d410)

### Phase 3: Persistent multi-selector — ✅ COMPLETE

**Goal:** A user can curate and open a subset without losing choices whenever
the selector closes, filter results update, or the board is reopened.

1. Add a focused popover component/state for the chevron, with path checkboxes,
   select-all/none, pluralized count, viewport-safe scrolling, and an
   **Open N files** action.
2. Add the optional `openSourceFileSelection: Record<string, boolean>` and
   `openSourceFileOpenMode: "all" | "unopened"` schema fields plus board-only
   persistence plumbing. Keep unsaved paths checked and an absent mode as
   `"all"`; do not expose or inherit either field through global defaults or
   saved views.
3. Maintain the persisted path-keyed selection map with the retention and
   new-path defaults defined above. Save a changed map through the existing
   board-state path without reinitializing the task store.
4. Close it on Escape, outside click, dashboard opening, and successful subset
   opening without modifying the persisted checks. Component teardown drops
   only the UI; reopening must hydrate the same checks from board state.
5. Add tests for initial all-checked state, close/reopen persistence, persisted
   board-close/reopen and frontmatter round trips, default-All and persisted
   open-mode behavior, custom choice retention across disappearing/reappearing
   paths, new-path default, source-file and ancestor-folder rename migration,
   zero-eligible-file disablement, and subset-only tab creation.
6. Manually verify keyboard navigation, small-window/mobile toolbar layout,
   a large list's scroll behavior, and an in-flight double-click attempt.
7. Run `npm run build` and `npm test`.

**Deliverable:** The all-files split button has a reliable multi-select route
for opening a deliberate subset.

**Implemented by:** [c27d410](https://github.com/ErikaRS/task-list-kanban/commit/c27d410)

## Files Expected to Change

| File | Change |
| --- | --- |
| `src/ui/main.svelte` | Derive candidates from `filteredTasks`, render and manage the toolbar split button/popover, and synchronize persistent selection, open-mode, and in-flight state. |
| `src/ui/settings/settings_store.ts` | Validate `openSourceFileSelection` and `openSourceFileOpenMode` as optional board-local values with checked/all defaults. |
| `src/ui/kanban_frontmatter.ts` | Round-trip the new board-local state with the existing canonical board settings. |
| `src/ui/board/` or `src/ui/tasks/` new helper | Keep file-target derivation, opened-Markdown-file detection, and new-tab opening testable outside the Svelte component. |
| `src/ui/**/tests/` new tests | Cover target derivation/opening and the persistent selector state machine. |
| `README.md` | Add the board-wide source-file action to the Board Controls documentation after implementation. |

## Out of Scope

- A command-palette command or default hotkey. Issue #180 mentioned this as an
  alternative, but this proposal implements the requested board-wide button.
- Option/Alt-click or other modifier-key variants of individual card links.
- A configurable maximum, confirmation dialog, or reuse/focus-existing-tab
  mode. The unopened option skips already-open Markdown files; it never
  focuses or otherwise changes an existing tab.
- Inheriting selector checks from global defaults, adding them to saved views,
  or exposing them as a board Settings-modal preference.
- Opening files that are in scope but have no matching board task.
