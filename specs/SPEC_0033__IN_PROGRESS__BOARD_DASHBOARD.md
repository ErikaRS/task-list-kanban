# SPEC 0033: Board Dashboard Panel

Status: IN_PROGRESS

## Feature Request Summary

[#132](https://github.com/ErikaRS/task-list-kanban/issues/132) — Dashboard
view: summary information for all boards, serving as a launchpad. Spun out
of SPEC 0030 Phase 7. Depends on SPEC 0030's plugin-level `GlobalSettings`
resolution and SPEC 0032's board discovery service
(`src/ui/boards/board_index.ts`).

**Design history:** v1 of this spec (and an uncommitted Phase 1 build) made
the dashboard a standalone `ItemView` opened from a ribbon icon. Review
rejected that shape: it was redundant with the tab strip as a second
board-switching surface, and opening in a separate leaf lost the current
board. The redesign below replaces both — the dashboard becomes a
**slide-over panel inside the kanban view**, and the tab strip is removed,
leaving one navigation surface and reclaiming the strip's vertical space.
The tab strip (SPEC 0032) was merged but never cut into a release, so its
removal has no user-facing migration or deprecation burden.

**This spec supersedes SPEC 0032's tab strip UI.** The rest of SPEC 0032
survives and is load-bearing here: the board discovery service, the in-leaf
`setViewState` switch, the rename-board modal, and the
`boardPaths`/`unpinnedPaths` curation model all carry over.

## User Requirements

1. A dashboard button in the **upper left of the kanban board chrome**
   opens the dashboard; a "Show board dashboard" command (active only when
   a kanban view is focused) toggles the same panel. No ribbon icon, no
   separate leaf.
2. The dashboard **slides over the current board** from the left with a
   literal slide animation, covering ~75% of the view (tuned to what feels
   good); the board stays visible behind a light scrim on the exposed
   edge. `prefers-reduced-motion` disables the animation.
   *(Revised in Phase 1 review: the panel covers only the board area
   **below the chrome row** — the toolbar stays visible so the dashboard
   button remains a live toggle, making an accidental open trivially
   undoable. The rest of the toolbar goes inert + dimmed while the panel
   is open.)*
3. Each board is a card: name, folder, last-modified time, and open / done
   task counts (counts arrive in a later phase).
4. **Selecting a board slides the panel closed and the chosen board
   appears in place** (the existing in-leaf switch). Clicking the current
   board just closes the panel.
5. The board list reuses the tabs curation model: explicitly ordered
   boards first, the rest alphabetical; boards hidden from the main grid
   remain reachable under an **"Other boards" zippy** (more real estate
   than tabs had, so hidden ≠ inaccessible).
   *(Revised in Phase 2 review: all curation is in-panel — cards
   drag-reorder in the shown grid and the card context menu hides/shows —
   so the settings-tab board list is removed entirely rather than
   relabeled. The hidden section stays alphabetical: no ordering
   complexity for a parking lot.)*
6. **The tab bar is removed**, returning its vertical space. Follow-up
   (deliberately out of scope here): revisit a quick board-switching
   affordance that feels integrated with the dashboard — see Follow-ups.
7. Dismissal: the button toggles, Esc closes, clicking the scrim closes,
   and the panel header has an explicit close X (added in Phase 1 review —
   explicit affordances over implicit-only dismissal). Panel-open state is
   transient — never persisted.
8. Counts must be **exact** — computed with each board's own resolved
   settings (scope, exclusions, columns, status markers, parsing options) —
   and must not make large vaults unusable (lazy, cached, progressive).

Non-goals (v1):

- Dashboard display preferences (sort order, which stats to show).
- Per-column count breakdowns, charts, or filtering within the dashboard.
- The marker-scan fallback strategy (SPEC 0030 Part E) is designed but
  only built if the perf validation phase demands it.
- A replacement quick-switch UI for the removed tab strip (follow-up).

## High-Level Design

### Panel, not view (`src/ui/dashboard/dashboard_panel.svelte`)

- Rendered by `main.svelte`, architecturally the same move as the view
  editor popover — chrome-button-toggled UI floating over the board — at
  ~75% width. No new Obsidian view type; the uncommitted
  `ItemView`/ribbon plumbing from design v1 is deleted.
- Phase 1 review revision: the overlay anchors to the board area below
  the toolbar (`.board-area` wrapper around the columns), not the full
  view. The chrome row stays interactive — the dashboard button is the
  accidental-click undo — while the toolbar's other controls (View,
  search, settings) are `inert` and dimmed, with open popovers collapsed
  on panel open.
- Slide-in via CSS `transform: translateX(-100%) → 0` transition plus a
  scrim fade (350ms, ease-out); under `prefers-reduced-motion` both
  render instantly.
- The dashboard button sits at the far left of the board chrome row
  (before the View toggle and search bar); the gated command
  (`checkCallback` on an active `KanbanView`, like the existing board
  commands) toggles the same state.
- **Board switch choreography:** selecting a card starts the close
  animation and fires the existing in-leaf switch
  (`leaf.setViewState({ type: KANBAN_VIEW_NAME, state: { file } })`)
  immediately. The same view instance and Svelte component survive that
  switch (SPEC 0032; only the stores re-hydrate), so the panel visibly
  slides closed over the incoming board.
- Focus management: focus moves into the panel on open and back to the
  dashboard button on close; Esc is handled at the panel level.

### Board cards (`src/ui/dashboard/dashboard_cards.ts` + panel component)

Carried over from design v1 (already built and tested, uncommitted):

- Card model derives from `BoardIndexEntry` (path, name, folder) plus the
  file's `stat.mtime`. Pure builder + last-modified formatter live in
  `dashboard_cards.ts` (no runtime `obsidian` import — vitest-testable;
  the view passes a `(path) => stat` accessor in).
- Responsive grid (`auto-fill, minmax`), Obsidian CSS variables, folder
  line hidden for vault-root boards, full path as tooltip, empty state
  pointing at the file-menu "New kanban" entry.
- The current board's card is highlighted (the active-tab affordance,
  relocated).
- Freshness: cards re-derive when the board-index store emits; a debounced
  `vault.on("modify")` tick refreshes last-modified times (and later,
  counts) — but only while the panel is open.
- **Card context menu** (parity with the tab strip before its removal):
  "Rename board" (same modal/glue as SPEC 0032 Phase 3), plus
  "Hide board" / "Show board" writing `unpinnedPaths` — curation without a
  settings round-trip, which the tab strip never had.

### Curation settings (`GlobalSettings.boardList`, migrated from `tabs`)

- The tabs settings become the **board list** settings; the model is
  unchanged, the toggle is gone:

```ts
interface BoardListSettings {
	boardPaths?: string[];    // explicit order (may be partial)
	unpinnedPaths?: string[]; // boards under the "Other boards" zippy
}
```

- No `data.json` migration: tabs never shipped in a release, so no real
  vault carries the `tabs` key. `boardList` simply replaces it — parse
  ignores a stray `tabs` key (dev vaults re-curate in seconds), and
  `enabled` disappears with the strip.
- `resolveTabEntries` generalizes to a resolver returning
  `{ shown, hidden }`: shown = ordered boards first, rest alphabetical;
  hidden = unpinned boards (the zippy's content, alphabetical). The
  "minimum two tabs" rule and the current-board append hack die with the
  strip — the panel always shows everything, just sectioned.
- Plugin settings tab: nothing. *(Phase 2 review revision — the original
  plan relabeled the "Board tabs" block to "Board dashboard"; with card
  drag-reorder and menu hide/show both living in the panel, the settings
  list was pure duplication and is deleted. One curation surface.)* The
  vault-rename rewrite of both path lists carries over untouched, as a
  pure `rewriteBoardListPaths` helper.
- Stale `boardPaths` entries (board deleted outside Obsidian) lose their
  settings-row cleanup surface, but reorder writes are self-cleaning: a
  drop materializes the shown order — which only contains discovered
  boards — as the new explicit order.

### Tab strip removal

- `board_tabs.svelte`, its `main.svelte` wiring, tab-strip drag-reorder,
  and the tab context menu are deleted; `text_view.ts` keeps `openBoard`
  and the current-path store (the panel needs both). SPEC 0032 gets a
  superseded-by note; its spec file otherwise stands as the record of the
  surviving machinery.
- Reordering boards is card drag-and-drop in the panel's shown grid
  (promoted from polish to v1 in Phase 2 review, replacing the settings
  list). The drop position comes from the pointer's side of the card's
  horizontal midpoint — grid wrapping doesn't matter because the order is
  one-dimensional. A drag across the zippy boundary as a hide/show gesture
  is the remaining polish candidate.

### Task counts (`src/ui/dashboard/board_stats.ts`, Phase 3)

Unchanged from design v1 — exact counts reuse the existing parsing
machinery with each board's own resolved settings:

1. **Settings, without file reads:** the board's sparse overrides come from
   the metadata cache's frontmatter (`kanban_plugin` value →
   `parseSettingsOverrides`), resolved as
   `resolveSettings(overrides, inheritedSettingsFromGlobalSettings(global))`
   — the same three layers a live `KanbanView` resolves.
2. **Scope:** `resolveScopeFilter(scope, scopeFolders, boardFolder)` +
   `shouldIncludeFilePath` with the board's `excludePaths` select the
   in-scope markdown files.
3. **Parsing:** `updateMapsFromFile` runs per in-scope file into throwaway
   per-board maps, with column tables from `createColumnData` and the
   board's marker/schema/subtask options. Reads go through
   `vault.cachedRead` (`updateMapsFromFile`'s vault parameter narrows to
   `Pick<Vault, "read">` so the dashboard passes a cached-read facade).
4. **Counting:** open = `getBoardTaskCount` (`src/ui/board_counts.ts` — the
   same "active task" rule as the board-corner count: not done, not
   archived, not in the done column); done = `task.done || task.column ===
   "done"` (the done bucket in `main.svelte`'s `groupByColumnTag`).
   Archived tasks count in neither.

**Caching & laziness:**

- Cache per board path: `{ key, counts }`. The key is cheap to compute (no
  file reads): a JSON digest of the board's count-relevant resolved
  settings plus the sorted `(path, mtime)` pairs of its in-scope files.
  Settings changes, scope changes, file edits, and file adds/removes all
  change the key; an unchanged key skips all parsing.
- Counts compute lazily **when the panel opens**, sequentially
  board-by-board (bounds concurrent IO), publishing each result as it
  lands — cards show a pending placeholder, then fill in progressively.
  Nothing computes while the panel is closed.
- While the panel is open, the debounced modify tick triggers a recompute
  pass; the cache keeps untouched boards O(stat) instead of O(read).

## Detailed Behavior

- **Count semantics vs. board UI:** counts ignore pure display settings —
  `doneVisibility` / `uncategorizedVisibility` toggles and the board's
  persisted filter query (`lastFilter`) do not change counts. They reflect
  what the board *tracks*, not what it currently *shows*. Cancelled tasks
  keep their column and count as open (matching the board-corner count);
  tasks with ignored status markers are not tracked at all.
- **A file shared by several boards** (overlapping scopes) counts in each
  board independently, with each board's own column/marker settings.
- **Boards with unreadable/empty settings** (`kanban_plugin: {}` or
  malformed JSON) resolve to inherited/global defaults — same as opening
  the board would.
- **Hidden boards** count too, but only when the zippy is expanded (their
  cards aren't visible otherwise, so their computation is deferred).
- **Rename/delete while the panel is open:** the discovery service
  refreshes the card list; the curation path lists follow via the existing
  vault-rename rewrite.
- **Escape/scrim/button** all route through one close path so the
  animation and focus return are identical regardless of how the panel
  closes.

## Follow-ups

- **Quick board switching, redesigned:** removing the tab strip regresses
  one-click switching (#130's original ask) to two interactions. The user
  explicitly wants to revisit a switching affordance that feels integrated
  with the dashboard (rather than keeping the strip as a bolt-on) — when
  this spec completes, prompt for that design conversation instead of
  quietly closing the topic.

## Implementation Plan

Dependency shape: Phase 1 builds the panel while tabs still exist (both
briefly coexist, keeping every intermediate state shippable); Phase 2
moves curation into the panel and deletes the strip; Phase 3 adds counts;
Phase 4 validates performance. Each phase is independently testable in
Obsidian.

### Phase 1: Slide-over panel (alphabetical cards, no curation, no counts)
**Goal:** Button + command open a slide-over dashboard listing every
board; selecting one closes the panel and swaps the board in-leaf.

1. ✅ Rework design v1: delete the `ItemView`/ribbon/leaf plumbing; keep
   `dashboard_cards.ts` + tests
2. ✅ `dashboard_panel.svelte`: slide animation + scrim, reduced-motion
   fallback, Esc/scrim/button close paths, focus management
3. ✅ Chrome button (upper left) + gated "Show board dashboard" command
   toggling the panel
4. ✅ Card select → close + in-leaf switch; current board highlighted,
   click-current closes
5. ✅ Tests: card-model derivation and formatter (carried over), panel
   open/close state logic where extractable
   (`dashboard_panel_state.tests.ts`: slide/fade curves, reduced-motion
   duration, select-current-closes)
6. ✅ Automated verification: `npm run build`, `npm test`
7. ✅ Manual: open via button and command, slide animation, all four
   close paths (button, X, Esc, scrim), toolbar inert + dimmed while
   open, switch boards, current-board highlight, last-modified freshness
   while open

**Deliverable:** Working slide-over launchpad (tabs still present).
**Size:** M

**Implemented by:** [d245005](https://github.com/ErikaRS/task-list-kanban/commit/d24500506d06a481225970762edbcd17ef09f8c3)

**Implementation notes (Phase 1):**
- Panel-open state lives in `KanbanView` (not `main.svelte`) so the
  gated command can reach it via `getActiveViewOfType`; focus return
  and popover collapse hang off the store's open/close edges in
  `main.svelte`, covering every open/close path uniformly.
- Phase 1 review feedback folded in: 350ms `cubicOut` slide (was 250ms
  linear), panel anchored below the chrome row with the toolbar inert +
  dimmed (dashboard button stays live as the accidental-click undo),
  and an explicit header X alongside Esc/scrim/button dismissal.

### Phase 2: Curation + tab strip removal
**Goal:** The panel honors board order and hidden boards ("Other boards"
zippy), the card menu curates and renames, and the tab strip is gone.

1. ✅ `GlobalSettings.boardList` replacing `tabs` (no migration — never
   released); settings-tab board list removed entirely (revised in review
   from "relabeled" — curation is all in-panel)
2. ✅ Shown/hidden resolver replacing `resolveTabEntries`; "Other boards"
   zippy in the panel
3. ✅ Card context menu: rename (reusing SPEC 0032 modal), hide/show
4. ✅ Card drag-reorder in the shown grid writing `boardPaths`
   (self-cleaning; added in review, promoted from polish)
5. ✅ Delete `board_tabs.svelte` + strip wiring; superseded-by note in
   SPEC 0032; SPEC 0030 Phase 6 pointer updated
6. ✅ Tests: boardList parse round-trip (stray `tabs` key ignored),
   resolver shown/hidden ordering, rename rewrite still covering both
   lists
7. ✅ Automated verification: `npm run build`, `npm test`
8. ✅ Manual: drag-reorder cards persists across reopen, hide/show via
   card menu (zippy appears/empties), rename from card menu, strip gone,
   vertical space reclaimed, settings tab has no board list, legacy
   data.json sheds its `tabs` key

**Deliverable:** One integrated board-navigation surface.
**Size:** M

**Implemented by:** [63efbf5](https://github.com/ErikaRS/task-list-kanban/commit/63efbf591c506d31922cc4298633aa2b7362bb1a)

**Implementation notes (Phase 2):**
- The card markup moved into `dashboard_card.svelte` so the shown grid and
  the "Other boards" zippy render the same card; the zippy (collapsed by
  default, transient like the panel) shows the hidden count in its label.
- The rename rewrite logic moved from `entry.ts` into a pure
  `rewriteBoardListPaths` helper in `board_index.ts` so both path lists are
  covered by a unit test, per this phase's test item.
- Curation writes are plugin-owned callbacks threaded entry → view →
  panel: `onSetBoardHidden` (menu hide/show) and `onReorderBoards` (card
  drag). Hiding leaves `boardPaths` untouched, so re-showing an ordered
  board restores its slot; a reorder drop materializes the full shown
  order via `movePathRelativeTo`, shedding stale paths as a side effect.
- The panel owns drag state; `dashboard_card.svelte` reports gestures with
  a before/after position computed from the pointer's side of the card's
  horizontal midpoint. Drop cue is an accent bar on the landing edge.
- Phase 2 review feedback folded in: the settings-tab "Board tabs" block
  (toggle + drag-reorderable list) was deleted rather than relabeled once
  panel drag-reorder made it redundant; `GlobalSettingsTab` no longer
  needs the board index at all. Hidden section stays alphabetical.

### Phase 3: Open/done task counts
**Goal:** Every card shows exact open and done counts that stay current,
computed lazily with mtime-keyed caching.

1. ✅ `board_stats.ts`: settings resolution from cached frontmatter +
   global layer; in-scope file selection; count computation via
   `updateMapsFromFile` (vault parameter narrowed to `Pick<Vault, "read">`,
   service passes a `cachedRead` facade)
2. ✅ Cache keyed by count-relevant settings + in-scope `(path, mtime)`
   pairs; sequential per-board compute publishing progressively, starting
   on panel open; hidden boards deferred until the zippy expands
3. ✅ Card UI: pending placeholder → open/done counts; recompute pass on
   the debounced modify tick while open
4. ✅ Tests: count semantics (done tag vs. done marker, cancelled open,
   archived in neither, excluded task tags, ignored markers, subtasks
   mode), settings resolution precedence (global default markers affect an
   untouched board's counts, board overrides win), scope + exclude
   selection, cache key invalidation (mtime, settings, file add/remove),
   no cross-board leakage / shared-file independence
5. ✅ Automated verification: `npm run build`, `npm test`
6. ✅ Manual: counts match a board's own column totals; edit a task →
   panel updates; change global default markers → untouched board's
   counts follow

**Implemented by:** [c50a9fa](https://github.com/ErikaRS/task-list-kanban/commit/c50a9fa831435142b475400b8d5d856fc14f1b28)

**Implementation notes (Phase 3):**

- `createBoardStatsService` (`src/ui/dashboard/board_stats.ts`) lives at
  the **plugin** level (`entry.ts`), not the panel: the cache and the
  published counts survive panel close/reopen, while computes only ever
  start from a panel request — so nothing runs while the panel is closed.
  The panel re-requests all visible boards on its existing debounced
  modify tick; unchanged boards cost a cache-key check (stat mtimes +
  settings digest), zero reads.
- The service consumes a narrow `BoardStatsHost` (get markdown files,
  `cachedRead`, frontmatter payload, global settings) so tests fake it
  with plain objects; cache-invalidation tests assert on `cachedRead`
  call counts rather than inspecting key strings.
- `getMarkerSettings` moved from `tasks/store.ts` to `tasks/tasks.ts`
  (both the live store and the stats pass build `updateMapsFromFile`
  options from it; `store.ts` has a runtime `obsidian` import that the
  test environment cannot load). `toSettingsPayload` is now exported from
  `kanban_frontmatter.ts` for the metadata-cache settings source.
- The test item's "global default columns" became "global default
  markers": column definitions only redistribute open tasks among
  columns — they cannot change open/done totals (`done`/`archived` are
  built-in tags, and the reserved `done` column id can't be a user
  column), so marker defaults are the count-visible way to exercise the
  inheritance layer.
- Done-bucket rule matches `groupByColumnTag` exactly (`task.done ||
  task.column === "done"`, checked before archived) — so a checked task
  in the archived column counts as done, same as the board UI shows it.

**Deliverable:** Dashboard cards with live, exact task stats.
**Size:** M–L

### Phase 3b: Per-column count breakdown (post-review extension)
**Goal:** Each card gets a zippy expanding to that board's per-column
open counts, mirroring the board's own layout.

1. ✅ `BoardTaskCounts` grows `columns: { label, count }[]`: uncategorized
   first (only when non-zero, like the board's auto visibility), then the
   board's columns in settings order (zero counts shown, reserved ids
   skipped), then done — labels from the board's resolved
   `uncategorizedColumnName`/`doneColumnName`; those two keys join the
   cache digest since they now feed output
2. ✅ Card UI: root becomes a non-interactive wrapper (drag/context-menu
   surface + whole-card click); the main content stays a real button for
   keyboard access; below it a per-card transient zippy
   (chevron + "Columns") expands the breakdown list
3. ✅ Tests: breakdown grouping/order/names, zero-count columns listed,
   empty uncategorized omitted, global default column-name change
   refreshes labels (cache digest covers them)
4. ✅ Automated verification: `npm run build`, `npm test`
5. ☐ Manual: breakdown matches the open board's columns; zippy state is
   per-card and transient

**Implemented by:** [3ab193c](https://github.com/ErikaRS/task-list-kanban/commit/3ab193c7240a719f714be6a427f6927f8f20544d)

**Deliverable:** Cards answer "where is the work?" without opening the board.
**Size:** S–M

### Phase 4: Performance validation
**Goal:** Confirm the lazy/cached pipeline holds up on a large vault;
build the fallback only if it does not.

1. ☐ Manual perf pass on a large vault (many boards × broad scopes):
   panel-open cost, time-to-all-counts, recompute cost on a single file
   edit
2. ☐ If unacceptable: implement the SPEC 0030 Part E fallback (count
   done-vs-open checkbox markers in in-scope files without column
   semantics) behind the same card UI
3. ☐ Record findings + decision in this spec

**Deliverable:** Dashboard performance validated (closes #132).
**Size:** S
