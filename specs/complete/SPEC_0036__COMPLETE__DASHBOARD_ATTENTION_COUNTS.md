# SPEC 0036: Dashboard Attention Counts

Status: COMPLETE

Implemented: 2026-07

## Feature Request Summary

[#132](https://github.com/ErikaRS/task-list-kanban/issues/132) follow-up
from the post-SPEC 0033 dashboard brainstorm: add **due-today / overdue
counts per dashboard card**. Boards with a selected task property schema
already parse task dates for filtering and grouping, so the dashboard stats
service can surface the strongest "which board needs attention?" signal
without opening each board.

This spec extends SPEC 0033's dashboard stats service. SPEC 0035 handles the
separate board-creation follow-up.

## User Requirements

1. Dashboard cards show overdue and due-today task counts when, and only when,
   the board has a selected task property schema with a date-typed `due`
   property.
2. Attention counts are derived from that selected schema's parsed `due`
   metadata, not from dashboard-side text scanning.
3. Attention counts use the same exact board-specific parsing rules as the
   existing open/done dashboard stats: scope, exclusions, columns, status
   markers, archived handling, ignored markers, subtasks mode, and schema
   settings all apply per board.
4. Attention counts stay fresh across file edits, settings changes, and the
   local day boundary.
5. The dashboard remains cheap to open on large vaults: stats stay lazy,
   cached, progressive, and requested only for visible cards.

## High-Level Design

### Attention counts in `board_stats.ts`

Extend `BoardTaskCounts`:

```ts
interface BoardAttentionCounts {
	overdue: number;
	dueToday: number;
}

interface BoardTaskCounts {
	open: number;
	done: number;
	columns: BoardColumnCount[];
	attention?: BoardAttentionCounts;
}
```

`attention` is present only when the board has an active task property schema,
and that resolved `propertySchema` contains a date-typed `due` property. The
due date must be read from that selected schema's parsed `due` metadata, not
inferred by scanning task text in the dashboard layer. Boards with no selected
schema, or with a schema that does not expose a date-typed `due`, keep the
card quiet; they do not show a permanent zero badge.

Counting rule:

- Consider only tasks that count as open for the board: not done, not in the
  done column, not archived, not ignored by marker/tag parsing.
- Read the parsed `due` property from each task's metadata.
- Count a due date before the local calendar day as `overdue`.
- Count a due date on the local calendar day as `dueToday`.
- Future due dates, missing due dates, invalid/unparsed due values, done
  tasks, and archived tasks do not contribute.
- A task due today is not overdue.

This should reuse existing property parsing from `updateMapsFromFile`; do not
add a second date parser in the dashboard layer.

### Cache freshness and midnight rollover

SPEC 0033's cache key already includes count-relevant settings plus in-scope
file mtimes. Attention counts add one more cache dimension: the local date.

Add a testable date provider to the stats service, defaulting to `new Date()`,
and include a stable local `YYYY-MM-DD` day key in the cache key whenever
attention counts may be produced. This guarantees a dashboard opened after
midnight recomputes due-today / overdue counts even if no files changed.

While the dashboard is open, schedule a refresh for the next local midnight
or reuse the existing debounced refresh path with a day-key check. The
implementation should avoid a plugin-wide ticking interval; no attention
work should run while the dashboard is closed.

### Card UI

Add a compact attention row below the open/done counts and above file
timestamps:

- If both values are zero, show no attention row.
- If overdue is non-zero, show an accent/warning badge such as
  `3 overdue`.
- If due-today is non-zero, show a quieter badge such as `2 due today`.
- If both are non-zero, show both in one row.
- Keep the row small enough that it does not compete with board name/folder.
- Include accessible text via the visible labels; no icon-only status.

The row should not appear while counts are pending. It should appear as soon
as that card's stats land, matching the existing progressive card fill-in.

## Detailed Behavior

- Due attention counts are independent of the board's persisted filter query
  and display settings, matching existing open/done dashboard count semantics.
- Boards that share the same markdown files still compute attention counts
  independently because each board may have different schema, marker, column,
  and exclusion settings.
- Hidden boards under "Other boards" do not compute attention counts until the
  zippy is expanded, same as existing open/done counts.
- The local day boundary uses the user's Obsidian runtime locale/timezone,
  not UTC. Date-only values and datetimes on today's local calendar day count
  as due today.
- Invalid date-like strings parsed as non-Date property values are ignored for
  attention counts, consistent with date grouping/filtering behavior.

## Non-Goals

- Board creation surfaces; see SPEC 0035.
- Dashboard sorting/filtering by overdue count.
- Clicking an attention badge to open a pre-filtered board view.
- Attention counts for scheduled/start dates. This spec is due-date only.
- Persisting dashboard display preferences for which badges are visible.

## Implementation Plan

### Phase 1: Due-today / overdue card stats
**Goal:** Dashboard cards identify boards with date-sensitive open work.

1. ✅ Extend `BoardTaskCounts` with optional attention counts and add a
   local-day date provider to the stats service
2. ✅ During the existing exact stats pass, count open tasks whose selected
   schema parsed `due` date is before today or on today, only for boards with
   an active due-capable property schema
3. ✅ Include the local day key in cache invalidation and refresh open
   dashboards across midnight without work while closed
4. ✅ Add the compact attention row to `dashboard_card.svelte`, hiding it
   while pending and when both values are zero
5. ✅ Tests: overdue vs due-today boundaries, datetime on today's local day,
   done/archived/ignored tasks excluded, no-schema boards omit attention,
   dashboard text scanning never creates attention counts, shared-file boards
   remain independent, cache invalidates when the day key changes without an
   mtime change
6. ✅ Automated verification: `npm run build`, `npm test`
7. ✅ Manual: Tasks Plugin board and Dataview board show matching overdue /
   due-today counts; edit due dates while dashboard is open; verify hidden
   boards compute only after expanding "Other boards"; simulate or wait for a
   day rollover to confirm stale badges refresh

**Deliverable:** Cards answer "which board needs attention today?" without
opening each board.
**Size:** M

**Implemented by:** [9d327e3](https://github.com/ErikaRS/task-list-kanban/commit/9d327e3)
