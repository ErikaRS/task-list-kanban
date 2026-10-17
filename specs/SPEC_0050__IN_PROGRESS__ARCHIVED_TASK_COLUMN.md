Status: IN_PROGRESS

# SPEC 0050 - Archived Task Column

## Feature Request Summary

Issue [#174](https://github.com/ErikaRS/task-list-kanban/issues/174) asks for a way to see archived tasks on a kanban board. A custom column matching `#archived` cannot do this because archive recognition excludes those rows during parsing. The owner also raised the risk that an archive grows without bound. Add an optional Archived column whose cards are read on demand in bounded pages.

This spec covers viewing and restoring archived tasks. It does not move archived Markdown into a separate file or change the meaning of Archive.

## User Requirements

1. Users can show an **Archived** column from the board's **View** panel. It is hidden by default, including on existing boards, and can be captured in a saved view.
2. The column recognizes the board's current archive mode: `#archived` in tag mode, or configured archive checkbox markers in status mode. A tag alone does not count in status mode.
3. Archived cards can be inspected, opened in their source file, and restored to **Done**. Restoration preserves the source block and unrelated metadata.
4. A large archive does not cause all archived tasks to be retained in board state or rendered in the DOM.
5. Board counts, dashboard attention counts, active filters, and normal columns retain their existing meaning unless explicitly described below.

## High-Level Design

### UX

Add **Show archived column** to the existing **View** panel, beside the flow and card-width controls. Its value is board-local current view state, default `false`; it is not an inherited board default or a control in the Board Settings modal. Like sort and flow, the last chosen value persists for that board so reopening it restores the view. When enabled, show a fixed **Archived** column after Done in workflow order; reverse-flow layouts reverse its visual position with the other columns. Showing it opens the first bounded page immediately. Its header can be collapsed for the current session; collapse state is transient and resets when the option is turned off or the board changes. The header says **Archived**, without an all-time count.

Use `showArchivedColumn?: boolean` in the board-local view-state storage and `SavedViewProperties`, including the saved-view schema. The setting's absence means `false`, and an explicit `false` must be capturable so a saved view can hide an already visible archive. `captureSavedViewProperties` includes it when the board-local value was explicitly chosen; `applySavedViewProperties` changes it only when the saved view carries it. Add an **Archive** property badge and include this property in query-only saved-view detection. A global saved view carrying this option applies it to the target board while archive recognition still uses that board's tag/status configuration. Saved views omit page number and transient collapse state.

Opening the column starts an archive scan. Show a loading state, then up to **50** cards and **Previous** / **Next** page controls. Show “Page N” and “More archived tasks may be available” until the next page is known; do not imply a total count. The page controls replace cards rather than appending them. The column is read-only except for **Restore to Done** and **Open source file**. No add-card, drag/drop, advance, bulk archive, manual pinning, or selection actions appear on archived cards in the first release.

Restoration places the task in Done: tag mode removes only the archive tag and sets the board's done marker if the row was not already done; status mode changes an archive marker to the board's done marker. The user can then move it to another active column with the ordinary board actions. Preserve completion dates and unrelated tags. After a successful restore, refresh the current archive page and let the normal file watcher update Done.

### Bounded Archive Reader

Keep the existing active-task store's archive exclusion. Add a separate `ArchivePageReader` owned by the current board view. It uses the board's resolved scope, exclusions, archive settings, and nested-task setting. It does not publish archived tasks to `tasksStore`, the dashboard, tag suggestions, saved views, source-file controls, or normal board counts.

The reader scans Markdown files in stable vault-path order and rows in source order. Its cursor is `(file path, next row)` plus a generation identifier. It checks archive eligibility on the raw task row before constructing a full `Task`. It constructs at most the page's cards plus a transient look-ahead match, then discards all other rows. The retained page has at most 50 `Task` instances and their source locators. It does not retain a vault-wide archive index, all archive IDs, or all parsed `Task` objects.

Page 1 starts at the first in-scope file. **Next** resumes from the cursor after the current page: reaching page N by repeatedly pressing Next scans each intervening row once, not N times. Retain start cursors for the most recent 64 visited pages, each only a file path and row number. **Previous** within that window resumes from its saved cursor. Going farther back requires one scan from the beginning to rebuild the requested page's cursor; no task cards from skipped pages are retained. There is no arbitrary page-number jump. Page numbers describe the current scan generation, not stable positions across vault edits.

Obsidian file reads return a whole file, so peak scan memory still includes the largest source file being read. Release each file's content before advancing. The design bounds retained archive cards, not total vault I/O or the temporary buffer for one unusually large Markdown file.

The reader pauses between files or bounded row batches so a large scan cannot monopolize the UI thread. It supports cancellation when the board, scope, archive mode, filter, or page changes, and on view close. A stale scan cannot publish results or write to the current page. Reading a sparse matching page may still require scanning many files; show progress and a Cancel control. No expensive total-count pass runs merely to display the header.

While the column is visible, listen for in-scope Markdown create, modify, delete, and rename events. Any such change invalidates all page cursors because a changed row can alter page boundaries, even if the file was not on the current page. Clear old cards immediately so their source actions cannot run against stale row locations; show a refreshing state, coalesce bursts of events, cancel the old scan, and rebuild page 1. A local Archive or Restore action explicitly triggers this invalidation after its write succeeds, without waiting for the vault event; the later event is coalesced with it. External edits rely on vault events. Hiding/collapsing the column clears page cards and cancels scans. A hidden or collapsed column does not scan or retain a watcher.

The refreshed page appears after the asynchronous scan finishes, not synchronously with the edit. If the user was on page N, return to page 1 with “Archive changed; showing the first page” so stale cursors cannot skip or duplicate tasks. File order is not archive time order: a newly archived task may land on a later page and will not necessarily appear in the refreshed first page. Do not claim “newest first” or that a newly archived card will appear immediately. If its location matters to users, an archive timestamp or index is a separate design decision.

### Board Presentation

Treat Archived as a special board column rather than a normal configured tag column. Keep the bounded page out of `deriveBoardMatrix`, which sorts and groups all supplied tasks. Render one archive section adjacent to the matrix on desktop and after the active columns on mobile. In grouped boards, show one ungrouped archive page; grouping the entire archive would require scanning and retaining group membership across all archived tasks. The archive section uses the same card display where possible, but its actions and pagination are explicit.

The board's existing filter query applies to the archive page when the column is open. Matching is evaluated during the scan. The query is not reinterpreted as `tag:archived`: status-mode archives may have no such tag. Changing a filter resets to page 1. Filtered and total task count labels continue to count active tasks only and are labeled accordingly when Archived is visible. Archived cards do not affect swimlane visibility, active column visibility, or dashboard statistics.

## Detailed Behavior

### Archive Recognition and Nested Blocks

Extract one shared archive predicate used by the active parser, archive reader, and dashboard: tag mode recognizes a parsed `#archived` tag token; status mode recognizes any configured archive marker and ignores the tag for classification. The current active parser uses a substring check, so this deliberately corrects false positives such as `#archived-old`; add a regression test for that case. Ignored status markers and excluded task tags still exclude rows from the archive page. The reader observes the same board scope and path exclusions as the active store.

| Source row | Tag-mode board | Status-mode board with `dD` |
| --- | --- | --- |
| `- [x] Task #archived` | Archived column | Done |
| `- [d] Task` | Active board | Archived column |
| `- [D] Task #archived` | Archived column | Archived column |

Classification uses the settings of the board being viewed. The same source task may therefore appear in different places on overlapping boards. The archive reader must use the same predicate as that board's active parser, so a task never appears in both its active and Archived columns or disappears from both.

With **Treat nested tasks as subtasks** enabled, an archived root is one card with its owned nested source block. A child archived row under a visible parent stays inside that parent's block, as it does today; it is not a second archive card. With the setting disabled, archived task rows are separate cards. Build source ownership for one file at a time and discard the tree after extracting page matches. Tests must cover an archived parent, nested archived child, and intervening notes.

### Restore Safety

The archive reader stores a file handle, row index, and raw-row fingerprint for each visible card. Before writing, reread the source file and verify the row still matches that fingerprint and the current archive predicate. If not, refresh the page and show a non-destructive “Task changed; try again” notice. Use the targeted source edit path and preserve the owned nested block byte for byte. One restore writes only its source file and must not affect another task with the same text.

On restore in tag mode, remove the exact archive tag token according to existing tag parsing rules, change an open checkbox to the configured done marker, keep an already-done marker, and remove no unrelated tag. In status mode, change only the checkbox marker to the configured done marker. Preserve any existing completion date; do not invent a historical completion date during restore. If the done marker is missing or invalid in persisted settings, disable Restore with an explanatory notice rather than making a task disappear into an ambiguous state. A successful restore should become visible in Done under the current board settings, subject to the user's active filter.

In status mode, an existing `#archived` tag is left intact on restore, matching the current status-mode archive write policy. That task becomes Done on the current board but remains archived on a tag-mode board that sees the same file. Show this consequence in the restore action's help text when the card carries both an archive status and the tag.

### Pagination and Order

- Page size is 50, fixed for the first release. Render no more than one page at once.
- File order is the archive order, regardless of the active board's sort or manual-order setting. Explain this in the column's page controls. Sorting the full archive by task name or property would require full-archive materialization or an index.
- Retain at most 64 recent page-start cursors. Next and nearby Previous use those cursors; navigating farther back rescans from the beginning. Show progress and allow cancellation for any rescan.
- A filter with fewer than 50 matches shows only those matches. The next button appears only when a look-ahead match exists.
- An empty result says “No archived tasks match this board and filter.” An I/O error shows a retry action and leaves the active board usable.

### Mutation and Consistency Cases

- A scan reads files at different moments rather than from one vault-wide snapshot. A vault event during the scan cancels that generation and starts a fresh one after the event burst settles. Only the newest generation may publish a page.
- A source row can move when another task is inserted or deleted. Restore verifies the row's raw content at write time and refuses to edit if the locator is stale. Identical task text in a different row is not a substitute.
- A scoped file rename, deletion, new file, scope setting change, archive-mode change, committed filter change, or saved-view switch invalidates cursors and resets to page 1. A view option turned off cancels the scan.
- If events arrive continuously, coalescing must still start a fresh scan periodically rather than postpone refresh forever; test this with repeated writes.
- If an archive action writes to a file outside the current board's scope, it must not refresh this board's archive page. If a row enters or leaves the archive under this board's predicate, the active store and archive page must converge after the write/event cycle.

### Compatibility

- Existing boards continue hiding archived tasks unless the setting is enabled.
- A custom column named Archived does not supersede this special column. If one exists, label the special column **Archived tasks** to avoid two identical headers.
- Status-based archive behavior from [SPEC 0039](complete/SPEC_0039__COMPLETE__STATUS_BASED_ARCHIVING.md) remains authoritative.
- Archive visibility is a board-local view option and an optional saved-view property. Board switches restore each board's current view choice and clear the old page. Existing saved views that omit this property leave the current archive visibility unchanged when applied.

## Performance Acceptance Criteria

1. With 10,000 archived rows and a normal active board, keeping the view option off creates no archived `Task` objects and performs no archive-only file scan. Turning it on starts only the bounded first-page scan.
2. Expanding the column retains at most 50 archived cards plus one transient look-ahead card, regardless of archive size; peak temporary scan memory is bounded by the largest source file plus one page. The DOM contains at most 50 archived cards.
3. Navigating pages replaces the prior page and keeps retained archive card count bounded; cursor history never exceeds 64 entries. Repeated board/filter switches do not leak readers, listeners, or pending scans.
4. A 10,000-archive-row fixture can be opened, paged, filtered, restored, and refreshed after single and burst edits without a long main-thread block. Record elapsed first-page, later-page, and mutation-refresh time; maximum batch duration; retained-card count; and cursor count on desktop and a mobile test environment before deciding whether the batching interval needs adjustment. This is a measurement gate, not an unmeasured speed promise.
5. `npm run build` and `npm test` pass after implementation, with tests for cancellation, stale source guards, scope, both archive modes, nested blocks, filtering, and pagination.

## Implementation Plan

### Phase 1: Optional Bounded Archive View

**Goal:** A user can enable the column and browse archived tasks safely in fixed-size pages.

1. [ ] Add the View-panel option, board-local view persistence, saved-view capture/apply/schema handling, and special column shell on desktop and mobile.
2. [ ] Extract the shared archive predicate without adding archived rows to the active task store.
3. [ ] Implement cancellable, scoped page scans and loading/empty/error states.
4. [ ] Test the tag/status classification table, explicit saved-view `true` and `false`, omitted saved-view properties, forward/backward paging and cursor eviction, board switches, scope/exclusions, and memory bounds.
5. [ ] Manually verify the column in normal, reversed, grouped, and mobile layouts.

**Deliverable:** Archived tasks can be viewed in bounded pages; normal board data remains bounded to active tasks.

**Implemented by:** Pending

### Phase 2: Restore and Filter

**Goal:** A user can find and restore an archived task without risking a stale source write.

1. [ ] Apply the board's committed filter to archive scans and reset paging on changes.
2. [ ] Add Restore to Done with source-row verification and targeted edits.
3. [ ] Test same-text rows, source changes during scan/restore, local and external archives, event coalescing, create/delete/rename, page reset after edits, nested blocks, completion metadata, filter transitions, and cross-board restore behavior for tasks carrying both archive signals.
4. [ ] Run the performance fixture, `npm run build`, and `npm test`; document the measured results.
5. [ ] Update README usage and archive-mode documentation.

**Deliverable:** Filtered archive browsing and safe restoration work end to end with measured large-archive behavior.

**Implemented by:** Pending

## Decisions to Revisit After Measurement

1. If first-page scans over sparse archives are slow, add a small per-file archive-presence cache invalidated by vault events. Do not add a full task index without measuring its memory cost.
2. If users need archive-wide sorting or grouped archive lanes, evaluate a disk-backed index or a separate archive search view. Those features require a different performance model from the bounded file-order reader.
