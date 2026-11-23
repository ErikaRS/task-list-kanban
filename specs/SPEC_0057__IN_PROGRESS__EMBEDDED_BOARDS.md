Status: IN_PROGRESS (Phases 1–3 implemented, awaiting manual checks; Phase 4 partly done)

# SPEC 0057: Embedded Boards (Read-Only)

## Feature Request Summary

Refs [#207](https://github.com/ErikaRS/task-list-kanban/issues/207).

Let a note embed a **read-only** rendering of a Task List Kanban board with a
fenced code block:

````markdown
```task-list-kanban
board: Projects/Work Board.md
```
````

The embed shows the board's current state (columns, swimlanes, cards) and
updates when tasks change. It makes no writes. Clicking it opens the full
board, where all editing happens.

Even read-only, this adds a **second board renderer** next to the full board
(`main.svelte` and its components). The pure layers (settings resolution, task
parsing, matrix derivation, card display helpers) are shared, but the embed
has its own static board and card markup. The cost of keeping the two in step
is set out in [Cost of maintaining two renderers](#cost-of-maintaining-two-renderers).
Part of this spec is adding the guidance ("breadcrumbs") that keeps future
display changes landing in both renderers. See
[Phase 5](#phase-5-two-renderer-breadcrumbs).

## User Requirements

1. A `task-list-kanban` code block renders the named board inside the note in
   Reading view and Live Preview, on desktop and mobile.
2. The embed shows the board's tasks using the board's resolved settings:
   built-in defaults, then global board defaults, then the board's frontmatter
   overrides, plus Selected-paths scope. It uses the same columns, swimlanes,
   sort, flow direction, Table/List layout ([SPEC 0055](complete/SPEC_0055__COMPLETE__DESKTOP_LIST_LAYOUT.md)),
   column visibility, property display, and saved collapse and per-cell fold
   state as the board.
3. The embed applies the board's persisted filter by default. Optional block
   parameters can apply a saved view or filter instead, for that embed only.
4. Cards show the same content as board cards in the same layout. Table
   embeds use Table cards. List embeds use the dense one-line List cards.
   Card content includes:
   - status marker;
   - rendered Markdown content (including nested items and later blocks, per
     [SPEC 0056](complete/SPEC_0056__COMPLETE__PLAIN_MARKDOWN_TASK_CONTENT.md)),
     with excluded tags stripped;
   - displayed properties and dates;
   - overdue styling;
   - subtasks, when the board shows them;
   - the file path, when the board shows it.
5. The embed is strictly read-only. It never writes to the board file, the
   note, or any task file, and it has no drag, edit, menu, checkbox, or
   selection behavior.
6. Clicking the embed's header, or any card area other than a link, opens the
   full board. Modifier clicks follow Obsidian conventions (new tab, split).
   Links and tags inside card content behave as normal Obsidian links.
7. The embed refreshes on its own when tasks in the board's scope change, when
   the board's settings change, and at midnight for date-dependent filters and
   grouping.
8. A missing, renamed, or invalid board shows an inline message explaining how
   to fix the block.
9. Embeds have a bounded height with internal scrolling.
10. Embeds that are off screen don't parse anything until scrolled near.

### Out of scope

- Any write or interaction beyond opening the board and following links.
  Possible later additions (done toggle, open source line) are listed under
  [Future extensions](#future-extensions). Each would need its own spec.
- The archived column, board rail, dashboard, toolbar, filter bar, and
  settings.
- Toggling collapse in the embed. Collapsed columns and swimlanes are shown
  as the board saved them.
- Rendering through `![[Board.md]]` transclusion, which would need Obsidian's
  private embed registry.
- Rewriting code blocks automatically when a board file is renamed.

## High-Level Design

### Code block syntax

````markdown
```task-list-kanban
board: Projects/Work Board.md   # required; vault path or link text, resolved like a wikilink from this note
view: Today                      # optional; a saved view's filter/sort/group (local or global), this embed only
filter: #urgent and due < $TODAY+7d   # optional; replaces the view/board filter for this embed only
height: 420                      # optional; px, default 420, clamped 160–1200
layout: auto                     # optional; auto | table | list (auto = the board's layout, or List in a narrow container)
```
````

- The format is `key: value` lines, parsed by a small pure parser
  (`src/ui/embed/embed_block.ts`). It reports errors per line. Unknown keys
  produce a warning, not a failure, so later parameters stay backward
  compatible.
- `board` resolves through `metadataCache.getFirstLinkpathDest(value,
  sourcePath)`, then an exact vault path. The target must be a board, meaning a
  file with `kanban_plugin` frontmatter.
- `filter:` uses the board's filter language (`parseFilterQueryResult`). A
  filter that doesn't parse shows the parser's error inline.

### Architecture

```
  board file + global settings          vault files in scope
            │                                    │
  ┌─────────▼────────────────────────────────────▼─────────┐
  │ board_snapshot.ts (new, shared with dashboard counts)   │
  │  resolveSettings ⊕ path scope ⊕ scope filter            │
  │  updateMapsFromFile → Task[]                            │
  └─────────┬──────────────────────────────────────────────┘
            │  { settings, tasks }
  ┌─────────▼──────────────────────────────────────────────┐
  │ board_presentation.ts (new, pure, shared with main)     │
  │  filter → group by column → visibility/order → matrix   │
  └─────────┬──────────────────────────┬───────────────────┘
            │                          │
  ┌─────────▼─────────┐      ┌─────────▼──────────────────┐
  │ main.svelte        │      │ embedded_board.svelte (new) │
  │ renderer #1        │      │ renderer #2, static         │
  │ Table + List       │      │ static Table + List         │
  │ task.svelte ───┐   │      │ static card ──┐             │
  └────────────────│───┘      └───────────────│────────────┘
                   └──────────┬───────────────┘
                 ┌────────────▼────────────────────────────┐
                 │ Shared card display (extracted)          │
                 │  TaskCardBody.svelte: status marker,     │
                 │  markdown content, properties, dates,    │
                 │  subtasks (display), file path           │
                 │  + task_markdown / properties/display    │
                 └──────────────────────────────────────────┘
```

**board_snapshot.ts.** `board_stats.ts` already resolves a board's settings
from cached frontmatter, applies path scope and exclusions, and parses tasks
through the live board's parser (`computeBoard` / `countTasks`). That logic
moves into a shared `loadBoardSnapshot(host, boardPath, now)` that returns
`{ settings, tasks, inScopeFiles, cacheKey }`. The stats service then derives
counts from a snapshot. The embed renders one. Both use the same
`BoardStatsHost` abstraction and its `cachedRead`, so the embed never needs a
`TextFileView`, a tasks store, or task actions.

**board_presentation.ts.** The derivation now inline in `main.svelte` (the
reactive block from `filteredTasks` through `renderedMatrix`) moves into
tested pure functions:
- filtering;
- `groupByColumnTag`;
- uncategorized and done visibility;
- ordered columns with RTL/BTT reversal;
- vertical flow;
- `deriveBoardMatrix` plus `hideSwimlanesWithOnlyCollapsedContent`;
- the count label;
- the renderer choice (`shouldUseListRenderer`) and List per-cell folds
  (`resolveListCellFold`), which already live in `list_layout.ts` and are
  reused as-is.

Both renderers call it. An embed can't drift from the board on which cards go
where, because that decision is made in one place.

**Shared card display (`TaskCardBody.svelte`).** The read-only parts of
`task.svelte` move into a presentational component with a `dense` flag
matching SPEC 0055's List cards. It covers:
- the status marker;
- Markdown content rendered through `MarkdownRenderer` with
  `renderTaskMarkdownSource`;
- the read-only rendering of nested items and later blocks that SPEC 0056
  draws through `TaskSourceRows`/`TaskSourceRow`;
- property and date display;
- the file path.

`task.svelte` wraps it with its interactive behavior (editing through
`MarkdownBodyEditor`, per-block editors, drag, menu, selection, checkbox, the
dense toolbar). The embed card wraps it with only the click-to-open handler.
This extraction is the main lever for keeping the second renderer cheap,
because card display is where most future visual changes land.

SPEC 0056 made the source rows harder to split, because each rendered block
is now also its own editor. The split has to separate "render this block"
from "edit this block" in `TaskSourceRow`. SPEC 0056 is now complete, so
Phase 2 can start.

If the extraction turns out too invasive (it is decided at the end of Phase 1),
the fallback is a separate static card. It would be built from the same pure
helpers (`task_markdown.ts`, `properties/display.ts`,
`task_status_display.ts`), with the higher upkeep described below.

**Decision (Phase 1 spike): extract.** The fallback is rejected. Findings:

- Display and interaction already meet at `TaskLineRow`'s slots (`marker`,
  default content, `actions`) in both `task.svelte` and `TaskSourceRow.svelte`.
  Those slots are the seams: `TaskCardBody` owns the card layout and static
  display, and `task.svelte` fills the interactive slots (selection and done
  buttons, `MarkdownBodyEditor` while editing, pin/drag handle, menu, dense
  toolbar, `TaskDateFields`, the add-subtask button).
- The Markdown preview pipeline (`MarkdownRenderer.render`, internal-link
  click and hover handlers, post-processing) is already duplicated between
  `task.svelte` and `TaskSourceRow.svelte`. Phase 2 moves it into one shared
  helper first. A static fallback card would have made that a third copy.
- `TaskSourceRow` should not split into two components. It gains a read-only
  mode (static status marker, no drag, delete, or editor) so that how a
  Markdown block renders stays in one place, which is the part SPEC 0056
  changed and the part most likely to change again.
- The subtask progress bar, consolidated tags, property chips, date chips, and
  the file path are plain display markup with no write paths. They move as-is.
  The dense toolbar's file button and `TaskDateFields` stay in `task.svelte`.

**Static renderer (`embedded_board.svelte`).**
- **Header:** board name (opens the board), the count label from
  `board_presentation`, and an active-filter chip.
- **Table body:** a simple CSS grid of axis headers and cells, with collapsed
  columns and lanes shown as narrow labelled stubs. It reuses
  `desktop_matrix_projection.ts`, which maps the matrix to visual rows and
  columns for each flow direction.
- **List body:** stacked sections with dense cards. It reuses
  `list_layout.ts` (`deriveListHierarchyMode`, `hasVisibleListGroupHeaders`,
  `listCellKey`, `resolveListCellFold`, the count helpers), so hierarchy
  and folding match `BoardList` and the board's saved `collapsedCells`.
  Like the board's List, it is centred with an 800px maximum width.
- **Not reused:** `DesktopMatrixGrid`, `BoardCell`, `BoardList`, and
  `ListSectionHeader`. They carry drop targets, creation controls, fold
  toggles, and sticky-layer logic the embed doesn't need.
- **Layout choice:** `layout: table` or `list` forces one. `auto` (the
  default) uses the board's `layout` setting, but switches to List when the
  container is narrower than 560px or the platform is mobile, matching
  `shouldUseListRenderer`.

### Embed host (`src/ui/embed/embedded_board_child.ts`)

- Registered with `registerMarkdownCodeBlockProcessor("task-list-kanban", …)`
  in `src/entry.ts`.
- `EmbeddedBoardChild extends MarkdownRenderChild`. It parses the block,
  resolves the board, mounts the Svelte component, and owns its event refs.
  `onunload` unmounts and unregisters.
- **Lazy mount:** an `IntersectionObserver` defers loading the snapshot until
  the embed is near the viewport.
- **Refresh:**
  - `vault.on("modify" | "create" | "delete" | "rename")` for in-scope files,
    plus `metadataCache.on("changed")` for the board file's settings;
  - debounced at 300ms;
  - a refresh with an unchanged snapshot cache key re-renders nothing;
  - a midnight timer when the filter or grouping depends on dates.
- **Caching:** snapshots are cached plugin-wide by board path and cache key.
  Several embeds of the same board, and the dashboard counts, share one parse.

### Live Preview behavior

Read-only removes the event-isolation problems a writable embed would have,
because there are no drags, inline editors, or keystrokes to protect. The root
is `contenteditable="false"`. Clicks on the embed open the board (with
`stopPropagation` so the editor cursor doesn't jump into the block), and
Obsidian's hover "edit block" button still works for changing parameters.

## Detailed Behavior

- **Settings resolution:** identical to the board, through `board_snapshot`.
  `view` and `filter` only replace the filter, sort, and group inputs to
  `board_presentation`. They are never written.
- **Collapse:** the board's saved `collapsedColumns` and `collapsedGroups`,
  plus `collapsedCells` for List per-cell folds.
- **Archived column:** never shown.
- **Count label:** "N of M tasks" when filtered, "Total: M tasks" otherwise,
  from the shared presentation function.
- **Opening the board:** `leaf.setViewState({ type: KANBAN_VIEW_NAME, state: {
  file } })` through `Keymap.isModEvent` to choose the leaf. There is no
  per-embed filter hand-off to the board in this version.
- **Errors:** inline callouts for an unresolved board, a non-board file, a
  filter parse error, an unknown view name, or a bad `height` or `layout`
  value.
- **Self-embedding:** a block inside its own board file shows an error
  instead of rendering.
- **Performance:** a cold load parses every in-scope file once (shared cache).
  Warm refreshes cost only metadata and stat checks, as dashboard counts do
  today.

## Cost of maintaining two renderers

The owner asked for this to be explicit. Even read-only, the embed is a
second renderer of a board that users will expect to match the real one. Once
it ships, every visible difference reads as a bug.

### What is shared vs duplicated

| Concern | Shared | Duplicated |
| --- | --- | --- |
| Settings resolution, scope, parsing | `board_snapshot.ts` | — |
| Which card goes in which cell, visibility, order, counts | `board_presentation.ts` | — |
| Visual axis mapping per flow direction | `desktop_matrix_projection.ts` | — |
| Card content display | `TaskCardBody.svelte` (if extracted) | Card wrapper only |
| Table markup and CSS | — | Static grid vs `DesktopMatrixGrid`/`BoardCell` |
| List hierarchy and folds | `list_layout.ts` | Section markup vs `BoardList`/`ListSectionHeader` |
| Axis headers (labels, colours, subtitles, counts) | Pure label helpers (`group_label.ts`, column tables) | Header markup |
| Header / chrome | Count label | Embed header vs toolbar |
| Lifecycle and refresh | Snapshot cache | Embed refresh vs tasks store events |

Rough size (estimate, to be checked after Phase 3): about 250–400 lines for
the embed renderer and host. About 250–350 lines move out of `main.svelte`,
`board_stats.ts`, and `task.svelte` into shared modules.

### Ongoing costs

1. **Visual changes to either board layout must be mirrored.** Since SPEC 0055
   the board has two matrix renderers of its own (Table and List), so the
   embed mirrors both. A new header element (for example a new subtitle,
   badge, or colour treatment), a grid change (spacing, collapse stub style,
   swimlane label layout), or a List change (section headers, fold behavior,
   dense card line) lands in `DesktopMatrixGrid`/`DesktopAxisHeader`/
   `BoardCell` or `BoardList`/`ListSectionHeader`. It must be repeated, or
   deliberately omitted, in the matching embed body. That makes four
   board-level renderings to keep in step, not two.
2. **Card display changes must go through the shared card body.** Changes made
   directly in `task.svelte`'s display markup, or in `TaskSourceRow`'s
   rendering, instead of `TaskCardBody` show up on the board and silently not
   in embeds. This applies to both Table and dense cards. With the fallback
   static card, *every* card display change is a double implementation, and
   SPEC 0056-style changes to how Markdown blocks render would need redoing
   in the embed.
3. **New settings that affect display need an embed classification:**
   respected, ignored, or replaced by a block parameter. Leaving one out shows
   wrong data with no error. An exhaustive map typed against
   `keyof SettingValues` makes it a type error.
4. **Presentation logic must stay in `board_presentation.ts`.** A new rule
   added inline in `main.svelte` (a new visibility option, a new ordering
   mode) silently differs in embeds.
5. **Parsing-pipeline changes must keep `board_snapshot` and the live tasks
   store equivalent.** They already share `updateMapsFromFile`, but any new
   input to it (a new marker setting, a new context field) has to be passed
   from both. Dashboard counts already carry this risk. Embeds make a mistake
   visible rather than just a wrong number.
6. **CSS has two containers.** Board styles scoped to
   `.task-list-kanban-view` that the embed reuses (cards, status styling) must
   not assume a full-height leaf. Theme and status-styling changes (SPEC 0009)
   need checking in both.
7. **The test surface grows:** (board, embed) × (Table, List) × flow
   direction, and for embeds also × (Reading view, Live Preview). Shared pure
   layers are tested once. Each renderer needs its own wiring and
   rendering tests.
8. **Support and docs:** "doesn't look the same in the embed" becomes a class
   of bug report, and docs need to say which board features embeds show.
9. **Contributor and agent load:** a display change that looks complete on the
   board is not complete. Phase 5 exists so this is caught by guidance and
   checks, not by users.

These costs are much smaller than for a read/write embed. A read/write embed
would add persistence routing, editor event isolation, command targeting,
per-session UI stores, and write-race risk on top of the list above.

## Risks

- **`TaskCardBody` extraction regressions** in the full board's cards,
  especially the SPEC 0056 per-block editors and the SPEC 0055 dense toolbar.
  Mitigated by doing it as its own no-visible-change phase with existing
  tests plus a manual card pass. The fallback (separate static card) is
  decided at the end of Phase 1.
- **Refresh cost** for large scopes or many embeds. Mitigated by lazy mount,
  the shared snapshot cache, and debouncing.
- **Live Preview re-renders** recreating the embed often. Acceptable for a
  stateless view. The snapshot cache keeps it cheap.

## Future extensions

These are not part of this spec. Each would need its own spec with an
"Embedded board impact" section:
- done toggle on embed cards (uses `createTasksStore`/`toggleDone`; no settings
  writes);
- open a card's source line;
- open the board with the embed's `view`/`filter` applied.

## Implementation Plan

### Phase 1: Shared snapshot and presentation (no user-visible change) ✅ COMPLETE
**Goal:** Dashboard counts and the full board get their data and layout
decisions from the shared modules the embed will use.

1. ✅ Extract `loadBoardSnapshot` from `board_stats.ts`, and rebuild
   `countTasks` on top of it. `src/ui/boards/board_snapshot.ts` provides
   `resolveBoardScope` (no reads), `boardParseKey`, `parseBoardTasks`, and
   `loadBoardSnapshot`. The stats service keeps its cache-before-parse check
   and derives counts with the pure `countBoardTasks`.
2. ✅ Extract `board_presentation.ts` from `main.svelte` (filtering, column
   grouping, visibility, ordering, flow, matrix, count label), with unit tests
   at that layer. `main.svelte` had a second, unused copy of column grouping,
   visibility, and ordering (`groupByColumnTag`, `orderedColumns`) alongside
   `deriveBoardMatrix`. It was removed, so `presentBoard` is the only path.
3. ✅ Spike `TaskCardBody.svelte` extraction from `task.svelte` and
   `TaskSourceRow.svelte` (render vs edit per block, `dense` flag), and record
   the decision (extract or fallback) in this spec. Decision: extract; see
   [Shared card display](#architecture).
4. ✅ Test: the existing suite passes. New pure tests cover filter
   application, visibility after filtering, the collapse source, and the count
   label. Ordering and RTL/BTT reversal are already covered by
   `board_matrix.tests.ts`, so they aren't repeated.

**Deliverable:** No behavior change. Shared modules are ready, and the card
strategy is decided.

**Implemented by:** [a2d0082](https://github.com/ErikaRS/task-list-kanban/commit/a2d0082)

### Phase 2: Shared card body (no user-visible change) 🚧 IN PROGRESS
**Goal:** Board cards render their display through `TaskCardBody`.

**Prerequisite:** SPEC 0056 is complete.

1. ✅ Move display markup and Markdown rendering from `task.svelte` and
   `TaskSourceRow.svelte` into `TaskCardBody.svelte`, keeping both Table and
   dense variants. `task.svelte` keeps interaction, editing, drag, menu,
   selection, and the dense toolbar. The Markdown preview pipeline (render,
   link handlers, media stripping) is in `card_markdown.ts`, shared by
   `TaskCardBody` and `TaskSourceRow`. `TaskSourceRow` renders read-only when
   it has no `taskActions`.
2. ✅ Test: the existing card and component tests pass, plus one test for the
   read-only source row.
3. Manual: a card display pass in Table and List covering status styling,
   properties, dates, nested items and paragraphs, file path, and excluded
   tags.

**Deliverable:** No behavior change. The card display has one implementation.
(Skipped if Phase 1 chose the fallback.)

**Implemented by:**

### Phase 3: Embed, desktop Table 🚧 IN PROGRESS (implemented; manual checks pending)
**Goal:** A user adds a `task-list-kanban` block and sees a live, read-only
board on desktop that opens the board on click. Boards set to List render
as Table until Phase 4.

1. ✅ Add the `embed_block.ts` parser (`board`, `view`, `filter`, `height`,
   `layout`) with error reporting and tests. `board:` also accepts
   `[[link|alias]]` and quoted values.
2. ✅ Add `EmbeddedBoardChild`, the processor registration, lazy mount, error
   callouts, and the click-to-open board. The Obsidian-free logic is in
   `embedded_board_controller.ts`; the child only wires events and mounting.
   `vault_snapshot_host.ts` is the app-backed snapshot host, now also used by
   dashboard counts.
3. ✅ Add `embedded_board.svelte`: header, static Table grid via
   `desktop_matrix_projection`, and cards via `TaskCardBody`. Column
   subtitles (match tags, status, priority) are not shown yet.
4. ✅ Add refresh (vault and metadata events, debounce, midnight) using the
   snapshot cache (`createBoardSnapshotCache`, plugin-wide, bounded to 16
   boards). Dashboard counts keep their own count cache rather than holding
   parsed tasks for every board.
5. ✅ Test: one representative rendering test of a fixture through the embed,
   checking columns, lanes, and the collapsed stub.
6. ✅ Test: refresh on an in-scope file change. No refresh on an out-of-scope
   change.
7. ✅ Test: the embed makes no vault writes (vault double with `modify`/`process`
   that fails the test if called).
8. Manual (use `test-vault/obsidian-plugin-dev/Embedded Boards.md`): Reading view and Live Preview. All flow directions, swimlanes,
   collapsed columns, and the persisted filter.

**Deliverable:** A working read-only embed on desktop.

**Implemented by:**

### Phase 4: List layout, view and filter parameters
**Goal:** Embeds honor the board's Table/List layout, work on mobile and in
narrow panes, and honor `view` and `filter`.

1. Add the List body (via `list_layout.ts`, dense cards, saved
   `collapsedCells`) and the `layout` parameter with container-width `auto`.
2. ✅ Wire `view` and `filter` into `board_presentation` inputs, with inline
   errors for unknown views and bad filters. Done early, in Phase 3
   (`resolveEmbedInputs`). A view applies its sort, group, flow, layout,
   width, and archive settings, and its query if it has one.
3. ✅ Test: `view`/`filter` resolution in the parser and presentation layer.
4. Manual: phone and tablet, sidebar-width pane, and a note with several
   embeds (lazy mount).

**Deliverable:** The feature is complete on desktop and mobile.

**Implemented by:**

### Phase 5: Two-renderer breadcrumbs
**Goal:** Future changes, by people or agents, account for both renderers by
default. **This phase is required for the spec to be complete.** It is not
optional cleanup.

1. **`AGENTS.md`:** add a "Two board renderers" section. Any change to board
   display (Table grid, List sections, axis headers, card display in either
   density, display settings, presentation rules, board CSS) must be
   implemented in, or explicitly ruled out for, both the full board and the
   embed, with the embed parity matrix updated in the
   same change. Point to `TaskCardBody` and `board_presentation.ts` as where
   shared display and layout logic belongs.
2. **`README.architecture.md`:** add a "Board renderers" section with the
   diagram above, the snapshot/presentation/card-body split, and the **embed
   parity matrix**: one row per board display feature, with Shown / Omitted
   (reason) / N/A.
3. **Source breadcrumbs:** header comments in `main.svelte`,
   `DesktopMatrixGrid.svelte`, `DesktopAxisHeader.svelte`, `BoardCell.svelte`,
   `board_list.svelte`, `ListSectionHeader.svelte`, `task.svelte`,
   `TaskSourceRow.svelte`, `TaskCardBody.svelte`, `embedded_board.svelte`,
   `embedded_board_child.ts`, `board_presentation.ts`, and `board_snapshot.ts`
   naming the other renderer and pointing to the parity matrix.
4. **Enforced parity checks**, so the breadcrumbs don't depend on someone
   reading them:
   - `EMBED_SETTING_SUPPORT`, an exhaustive map that
     `satisfies Record<keyof SettingValues, "respected" | "ignored" | "blockParam">`,
     so adding a setting without classifying it fails the type check;
   - one shared fixture rendered through `board_presentation` for both
     renderers' inputs, asserting the same cell assignment, so presentation
     logic added inline in one renderer shows up as a test difference.
5. **`README.planning.md`:** require an "Embedded board impact" subsection in
   every new spec that touches board display, display settings, or the
   parsing pipeline.
6. **`.claude/skills/manual-test.md`:** add embed setup (a note with a block in
   Reading view and Live Preview) and an embed pass for board display changes.

**Deliverable:** The guidance and checks are in place. Adding a setting without
classifying it for embeds fails the build.

**Implemented by:**

### Manual acceptance checks

- [ ] Reading view and Live Preview, desktop: matches the board in Table and
      List for all four flow directions, swimlanes, collapsed columns and
      lanes, List per-cell folds, and the persisted filter.
- [ ] Cards with multi-paragraph notes and nested items render like the
      board's cards.
- [ ] Clicking the header or a card opens the board. Modifier click opens a new
      tab. Links in card content follow normally.
- [ ] Editing a task in another file updates the embed within about a second.
- [ ] Mobile phone and tablet, and a narrow pane: List layout is used and is
      readable.
- [ ] `view` and `filter` parameters apply, and bad values show inline errors.
- [ ] Missing board, non-board file, self-embed: clear inline messages.
- [ ] Several embeds in one long note: off-screen embeds don't load until
      scrolled near.
- [ ] No file changes after interacting with an embed (check git or file
      mtimes in the sandbox vault).
