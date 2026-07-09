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
3. The user can optionally restrict tabs to a pinned subset of boards, whose
   list order is the tab order (manual ordering "can be a list in plugin
   settings first" per SPEC 0030 Part D).
4. Board discovery is automatic and stays current as boards are created,
   deleted, renamed, or gain/lose the `kanban_plugin` frontmatter key.

Non-goals (v1, per SPEC 0030 Part D): nested tab groups, drag-to-reorder,
"recently used" ordering.

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
	enabled: boolean;      // default false
	boardPaths?: string[]; // pinned subset + manual order; absent/empty = all boards
}
```

- Parsed/serialized with the rest of `GlobalSettings` (`data.json`).
  Unknown board paths are kept (the board may exist later); entries that
  don't resolve to a discovered board are simply not shown.
- Tabs are plugin-wide *behavior*, not an inheritable board default, so
  their controls live in a plugin-settings block at the **top** of the
  plugin tab, above the "Board defaults" / "Default view" / "Global saved
  views" defaults sections: a "Show board tabs" toggle and (Phase 2) a
  one-path-per-line text area for the pinned list.

### Tab strip UI (`src/ui/boards/board_tabs.svelte`)

- Rendered by `main.svelte` above the board toolbar.
- Visible only when tabs are enabled **and** at least two tabs would show;
  a strip with one tab is noise.
- Tab resolution is a pure function (`resolveTabEntries`):
  - No pinned list → all discovered boards, alphabetical by name
    (case-insensitive, path tie-break).
  - Pinned list → those boards in list order.
  - The current board always gets a tab even if it isn't pinned (appended
    at the end), so the active tab is never missing.
- The active tab is the view's current file; clicking it is a no-op.

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

### Phase 2: Pinned board subset + manual order
**Goal:** Plugin settings can restrict tabs to a chosen, ordered list.

1. ☐ `boardPaths` list editing in the "Board tabs" section (one per line)
2. ☐ `resolveTabEntries`: pinned order, unknown paths skipped, current
   board appended when unpinned
3. ☐ Tests: pinned ordering, unknown-path skip, current-board append
4. ☐ Manual: pin a subset, reorder lines, verify tab order follows

**Deliverable:** Curated tab strips (closes #130).
**Size:** S
