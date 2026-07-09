# SPEC 0032: Tabbed Board Navigation

Status: IN_PROGRESS

## Feature Request Summary

[#130](https://github.com/ErikaRS/task-list-kanban/issues/130) — Tabbed
navigation for quick switching between kanban boards. Spun out of
SPEC 0030 Phase 6 (scoping level there; this spec is the implementation
spec). Depends on SPEC 0030's plugin-level `GlobalSettings` storage.

## User Requirements

1. A tab strip on the kanban view lists the vault's kanban boards; clicking
   a tab opens that board **in the same leaf** (confirmed in SPEC 0030 open
   questions: in-leaf is the requested UX).
2. Tabs are opt-in via plugin settings (off by default).
3. **Every board is a tab by default** (review feedback: opt-in pinning was
   unintuitive). The user curates by *removing* boards from the strip and
   adding them back; newly created boards appear automatically.
4. Tabs are reorderable by drag and drop — both in the plugin settings list
   (same UI as the settings modal's column editor) and directly in the tab
   strip on the board.
5. Board discovery is automatic and stays current as boards are created,
   deleted, renamed, or gain/lose the `kanban_plugin` frontmatter key.
6. Right-clicking a tab offers **Rename board**: renames the underlying
   file in place (same folder, new name) without opening it.

Non-goals (v1, per SPEC 0030 Part D): nested tab groups, "recently used"
ordering.

## High-Level Design

### Board discovery service (`src/ui/boards/board_index.ts`)

- A plugin-level Svelte readable store of discovered boards:

```ts
interface BoardIndexEntry {
	path: string;   // vault path, unique id
	name: string;   // basename without extension → tab label
	folder: string; // parent folder path (dashboard will want this too)
}
```

- Discovery scans `vault.getMarkdownFiles()` and keeps files whose
  `metadataCache` frontmatter contains the `kanban_plugin` key. No file
  reads — the metadata cache already has parsed frontmatter.
- Kept current via `metadataCache.on("changed" | "deleted" | "resolved")`
  and `vault.on("rename")`. Recomputes are debounced and the store only
  emits when the computed list actually differs, so open boards don't
  re-render on unrelated vault activity.
- Created once in `entry.ts` (`Plugin.onload`) and shared with every
  `KanbanView` through the `registerView` closure, alongside the existing
  inherited-settings and global-views stores. The dashboard (SPEC 0030
  Phase 7) will reuse the same service.

### Tabs configuration (`GlobalSettings.tabs`)

```ts
interface TabsSettings {
	enabled: boolean;         // default false
	boardPaths?: string[];    // explicit tab order (may be partial)
	unpinnedPaths?: string[]; // boards hidden from the strip
}
```

- **Everything-shown-by-default model** (reworked twice on review
  feedback: first from a path textarea, then from opt-in pinning): every
  discovered board is a tab unless listed in `unpinnedPaths`. `boardPaths`
  fixes an explicit order for the boards it lists; boards absent from it —
  including boards created later — follow alphabetically, so new boards
  appear as tabs with zero configuration. Reordering materializes the
  currently shown order into `boardPaths`.
- Parsed/serialized with the rest of `GlobalSettings` (`data.json`).
  Unknown board paths are kept (the board may exist later); entries that
  don't resolve to a discovered board are simply not shown as tabs.
- Tabs are plugin-wide *behavior*, not an inheritable board default, so
  their controls live in a plugin-settings block at the **top** of the
  plugin tab, above the "Board defaults" / "Default view" / "Global saved
  views" defaults sections: a "Show board tabs" toggle and a **board tabs
  list** showing only the boards currently shown as tabs, in tab order —
  each row drag-reorderable exactly like the settings modal's column
  editor (same row/handle UI) with a remove ("✕") button, plus an **"Add
  board" dropdown** listing removed boards to restore. Stale ordered paths
  stay listed as "not found" so they can be cleaned up; removing a stale
  row just drops it from the order rather than recording it as unpinned.

### Tab strip UI (`src/ui/boards/board_tabs.svelte`)

- Rendered by `main.svelte` above the board toolbar.
- Visible only when tabs are enabled **and** at least two tabs would show;
  a strip with one tab is noise.
- Tab resolution is a pure function (`resolveTabEntries`):
  - Explicitly ordered boards (`boardPaths`) first, in list order; all
    other discovered boards follow alphabetically by name
    (case-insensitive, path tie-break); `unpinnedPaths` boards are hidden.
  - The current board always gets a tab even if it is unpinned (appended
    at the end), so the active tab is never missing.
- The active tab is the view's current file; clicking it is a no-op.
- Tabs are drag-reorderable in the strip itself: dropping a tab writes the
  shown order (with the dragged tab moved) into `boardPaths` via a
  plugin-provided callback; the unpinned list is untouched.

### In-leaf switching

- Clicking a tab calls back into `KanbanView`, which sets the leaf's view
  state directly:

```ts
await this.leaf.setViewState({
	type: KANBAN_VIEW_NAME,
	state: { file: path },
	active: true,
});
```

- Going straight to the kanban view type avoids the markdown-view detour
  (`leaf.openFile` would open markdown first and rely on the plugin's
  auto-switch listener, which only fires on `active-leaf-change`).
- Save-on-switch: `TextFileView`'s unload path flushes the pending
  `requestSave` before the old file detaches. SPEC 0030 flags this as
  "verify in testing" — it is an explicit manual test case below.

## Detailed Behavior

- **Tab label** is the file basename without `.md`. Duplicate basenames in
  different folders show the same label; the tab tooltip (title attribute)
  carries the full path for disambiguation.
- **Current board not in pinned list:** shown as the last tab while open.
  This keeps the strip honest without silently editing the pinned list.
- **Board deleted/renamed while tabbed:** the discovery service refreshes;
  a renamed board keeps its tab (new path), a deleted board's tab
  disappears.
- **Unsaved edits on switch** are flushed by the view unload lifecycle;
  switching must never lose a just-made change.
- **Editor state on switch:** filter bar text, view-editor popover, and
  suggestion state reset with the new board's own persisted state (the
  board's `lastFilter` etc.), exactly as if the board had been opened
  fresh.
- **Tab rename (right-click):** an Obsidian `Menu` on tab context-click
  with a "Rename board" item opening a name-prompt modal prefilled with
  the current name. The rename goes through `app.fileManager.renameFile`
  (not `vault.rename`) so vault-wide links to the board update. The target
  path keeps the board's folder — rename never moves the file. Validation:
  empty names and path separators are rejected; a collision with an
  existing file shows a Notice and keeps the modal open state simple by
  aborting. Renaming the currently open board keeps the view (Obsidian's
  `FileView.onRename` fires); the view updates its current-path store so
  the active tab highlight follows.
- **Pinned paths follow renames:** the plugin listens to `vault.on("rename")`
  and rewrites matching `tabs.boardPaths` entries to the new path, so pins
  survive renames from the tab menu *and* from the file explorer alike.

## Implementation Plan

### Phase 1: Discovery service + tab strip (all boards) 🚧 IN PROGRESS
**Goal:** Toggle tabs on in plugin settings → every kanban view shows an
alphabetical tab strip of all boards; clicking switches in-leaf.

1. ✅ `board_index.ts`: pure compute + sort helpers and the event-wired
   store factory; created in `entry.ts`, passed into `KanbanView`
2. ✅ `GlobalSettings.tabs` with `enabled` (parse, serialize, clone);
   "Show board tabs" toggle in a plugin-settings block at the top of the
   plugin tab (review feedback: tabs are plugin behavior, not a board
   default, so they must not sit among the defaults sections)
3. ✅ `board_tabs.svelte` strip rendered from `main.svelte`; current-path
   store + in-leaf `setViewState` switching in `text_view.ts`
4. ✅ Tests: sorting, `resolveTabEntries` (alphabetical, hide-if-<2,
   disabled/unset), tabs settings parse round-trip
5. ✅ Automated verification: `npm run build`, `npm test` (839 passing)
6. ☐ Manual: enable tabs, switch between boards, verify in-leaf switching,
   active-tab highlight, and that a just-edited board saves on switch
   (edit a task, switch away, check the file)
7. ☐ Manual: create/delete/rename a board file and watch the strip update

**Deliverable:** Working opt-in tab bar across all kanban boards.
**Size:** M

**Implemented by:** [06d4910](https://github.com/ErikaRS/task-list-kanban/commit/06d4910bcc766665e1eb2a8af179fda8f8ae24ae)

**Implementation notes (Phase 1):**
- Board detection uses key presence (`"kanban_plugin" in frontmatter`)
  rather than `entry.ts`'s truthiness check, so an empty-string value still
  counts as a board.
- `tabs` persists in `data.json` only when enabled; disabling drops the key
  so a default config file stays clean.
- The tab strip renders inside `.board-content` above the toolbar, styled
  as underline tabs with the full path as tooltip.
- `resolveTabEntries` already appends the current board when a resolved
  list misses it — a no-op in all-boards mode, load-bearing once Phase 2's
  pinned subsets land.

### Phase 2: Tab curation + ordering ✅ COMPLETE
**Goal:** All boards are tabs by default; the user removes/re-adds boards
and reorders tabs by drag and drop, in settings and in the strip.

1. ✅ Board tabs editor in the plugin-settings block: shown boards as
   drag-reorderable rows (column-editor UI) with remove buttons, plus an
   "Add board" dropdown of removed boards (reworked twice per review
   feedback: from a path textarea, then from opt-in pin toggles)
2. ✅ `resolveTabEntries`: ordered boards first, rest alphabetical,
   `unpinnedPaths` hidden, current board appended when hidden
3. ✅ Drag-reorder within the board tab strip itself, materializing the
   shown order into `boardPaths` via a plugin callback
4. ✅ Order and unpinned paths rewritten on `vault.on("rename")` so
   curation survives renames
5. ✅ Tests: order + hidden resolution, current-board append,
   `movePathRelativeTo`, parse normalization of both lists, rename
   rewrite (file + folder)
6. ✅ Manual: remove/re-add boards, drag-reorder in settings and in the
   strip, verify a new board appears automatically

**Deliverable:** Curated tab strips (closes #130).
**Size:** S–M

**Implemented by:** [bddf905](https://github.com/ErikaRS/task-list-kanban/commit/bddf9054b7ad27ee4ef53f753f8e42aeb3b5fe94)

**Implementation notes (Phase 2):**
- `boardPaths` and `unpinnedPaths` are normalized at parse (trim, drop
  empties, dedupe) and kept in `data.json` even while `enabled` is false,
  so toggling tabs off and back on preserves the curation.
- The rename rewrite also handles folder renames by prefix
  (`rewriteBoardPath`), since Obsidian fires one rename event for a folder
  rather than one per child file.
- The board tabs editor subscribes to the board index while the tab is
  open (discovery is async; boards can be created or renamed with settings
  open) and re-renders only its own list container on changes — never the
  whole tab, which would tear down the embedded board-defaults editor.
- The settings rows reuse the column editor's CSS classes
  (`column-editor-row` / `-handle` / drag-state classes), so both editors
  share one look and one stylesheet.
- Removing a board records it in `unpinnedPaths` (and drops it from the
  order); re-adding removes it from `unpinnedPaths`, letting it fall back
  into the alphabetical tail until reordered.

### Phase 3: Rename board from tab context menu ✅ COMPLETE
**Goal:** Right-click a tab → "Rename board" renames the file in place.

1. ✅ Pure target-path helper (folder preserved, `.md` appended, name
   validation) + rename glue via `app.fileManager.renameFile`
2. ✅ Name-prompt modal (prefilled, Enter submits, collision Notice)
3. ✅ Context menu on tabs wired through `main.svelte`; current-path store
   updated in `KanbanView.onRename` so the active tab follows a rename of
   the open board
4. ✅ Tests: target-path computation and validation edge cases (root
   folder incl. the "/" spelling, nested folder, trims, rejects
   empty/separators); collision handling is Obsidian glue, covered by the
   manual pass
5. ✅ Manual: rename via tab menu (open board and background board), verify
   links to the board update, label updates, and the file did not move

**Deliverable:** Boards renameable directly from the tab strip.
**Size:** S

**Implemented by:** [2f0fe72](https://github.com/ErikaRS/task-list-kanban/commit/2f0fe72d0d40bb93ec6929f24a15eee972b0dbf5)

**Implementation notes (Phase 3):**
- `board_rename.ts` holds only the pure target computation; the
  `fileManager.renameFile` glue lives in `rename_board_modal.ts` because a
  runtime `obsidian` import cannot load under vitest (the npm package is
  types-only).
- Rename of a pinned board updates the pin via the Phase 2 vault-rename
  listener; nothing rename-specific was needed in the tab flow.
