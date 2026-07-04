# SPEC 0028: Date filters with $TODAY, and overdue smooshing for date groups

Status: COMPLETE

Implemented: 2026-07

## Feature Request Summary

Issue [#21](https://github.com/ErikaRS/task-list-kanban/issues/21) asks for
better support for scheduled tasks: hiding them or routing them somewhere
automatic. SPEC_0019/0020 made 📅 due and ⏳ scheduled first-class parsed
properties, and the board can already sort and group by them — but nothing
*uses* the values relative to the current day.

This spec adds the two missing behaviors:

1. **Date filters with a `$TODAY` value** — board-level filter conditions on
   date properties (e.g. `scheduled on-or-before $TODAY`, `due before
   $TODAY`) that re-evaluate as the calendar day changes, so a board
   configured once stays correct forever. This covers "hide tasks scheduled
   for the future" and, combined with the existing tag-group swimlanes, gives
   an "everything overdue, grouped by area" view.
2. **Overdue smooshing when grouping by a date property** — an option that
   collapses all past-date group buckets into a single "Overdue" swimlane
   instead of one stale swimlane per past date.

Both are generic mechanisms rather than a hardcoded scheduled-task workflow,
per the issue discussion.

## User Requirements

1. Filter board tasks by any date-typed property of the active property
   schema (due, scheduled, start, done, created) using a comparison against
   either a fixed date or `$TODAY`.
2. Support **multiple conditions, AND-ed**, so an always-on hygiene filter
   ("hide scheduled after today") can stay active while an on-demand view
   ("due before today") is toggled on top.
3. Tasks that lack the referenced property are **never hidden by date
   conditions**. This follows the project-wide principle that
   uncategorized/unassigned tasks are always shown; visibility of
   unassigned buckets is a column-level concern (and, as separate future
   work, a group-level toggle) — filters never make it.
4. Date conditions persist per-board like the existing content/tag/file
   filters, and can be captured in saved filters. A saved date filter can
   optionally be given a user-chosen name (e.g. "overdue"); the chip shows
   the name when present, otherwise a description of the conditions.
5. `$TODAY` re-evaluates when the day rolls over while a board stays open —
   no reload needed for the board to be correct the next morning.
6. When swimlanes group by a date property, an option collapses every bucket
   whose date is before `$TODAY` into a single "Overdue" swimlane; buckets
   for today and future dates stay per-date.
7. The filtered-count indicator and "is filtered" state account for active
   date conditions.

## High-Level Design

### Data model

New condition type, persisted in board settings (frontmatter) and validated
with zod alongside the existing filter fields in
`src/ui/settings/settings_store.ts`:

```ts
export interface DateFilterCondition {
	property: string; // a date-typed key of the active schema, e.g. "scheduled"
	operator: "before" | "on-or-before" | "on" | "on-or-after" | "after";
	value: string; // "$TODAY" or "YYYY-MM-DD"
}
```

- `lastDateFilter: DateFilterCondition[]` (default `[]`) joins
  `lastContentFilter` / `lastTagFilter` / `lastFileFilter`.
- `savedFilterSchema` gains an optional `date: { conditions: [...] }` slot,
  parallel to `content` / `tag` / `file`, and an optional top-level
  `name: string`. The name lives on the shared saved-filter shape so any
  filter type can be named later, but only the Date section's save flow
  surfaces it for now.
- `BoardFilterState` (`src/ui/filters/filter_state.ts`) gains
  `dateConditions`, so persistence, serialization, and the external-edit
  sync logic extend for free.

The property-grouping source gains an opt-in flag (persisted via the
existing `groupSourceSchema` union in settings):

```ts
{ kind: "property"; key: string; collapsePastDates?: boolean }
```

### Date semantics

`$TODAY` means **the user's local calendar day**. Parsed date-only values
are stored as UTC midnight of their written calendar date (`parseDateOnly`
in `src/parsing/properties/value_parsers.ts`), so `$TODAY` takes the local
year/month/day and encodes it the same way
(`Date.UTC(localYear, localMonth, localDay)`) — the UTC part is purely the
shared encoding, and every comparison is an exact local-calendar-day
comparison via `getTime()`. Fixed dates entered in the UI parse through the
existing `parseDateOnly`.

Operator meanings (given task date `d` and resolved condition date `c`):

| operator       | keeps task when |
| -------------- | --------------- |
| `before`       | `d < c`         |
| `on-or-before` | `d <= c`        |
| `on`           | `d == c`        |
| `on-or-after`  | `d >= c`        |
| `after`        | `d > c`         |

A task with no value (or an unparseable value) for the property is always
kept, regardless of operator. Consequence for the overdue view: `due before
$TODAY` shows overdue tasks *plus* tasks with no due date. Hiding undated
tasks is deliberately not a filter concern — it belongs with the existing
column-visibility toggles and a future group-level "hide unassigned"
toggle.

### New modules

- `src/ui/filters/date_filter.ts` — pure logic, fully unit-testable:
  - `getToday(): Date` — UTC midnight of the local calendar day.
  - `resolveConditionDate(condition, today): Date | null` — `$TODAY` or
    parsed fixed date; `null` marks an invalid/incomplete condition, which
    is skipped (never silently hides the whole board).
  - `taskMatchesDateConditions(task, conditions, today): boolean` — AND over
    valid conditions.
- `src/ui/filters/today_store.ts` — a readable Svelte store holding
  `getToday()`, refreshed by a timer scheduled for the next local midnight
  (re-armed after each fire, and defensively re-checked on visibility/focus
  since timers sleep with the OS). This is the first board input that
  changes without a file or settings event, so it must be a store for the
  reactive pipeline to pick it up.

### Filter pipeline wiring

`main.svelte` extends the existing derivation chain:

```
filteredByText → filteredByTag → filteredByFile → filteredByDate → board
```

`filteredByDate` applies `taskMatchesDateConditions(task, dateConditions,
$todayStore)`. `tasksByColumn`, `deriveBoardMatrix`, `filteredTaskCount`,
and `isFiltered` switch to consuming `filteredByDate`.

### Overdue smooshing in `deriveGroupBuckets`

In the `kind === "property"` branch of
`src/ui/tasks/task_grouping.ts::deriveGroupBuckets`, when
`collapsePastDates` is set and the value is a `Date` before `today`:

- All such values map to one synthetic bucket
  `id = property:<key>:__overdue__`, label **"Overdue"**, ordered before all
  dated buckets in ascending order (so `applyGroupDirection` keeps it at the
  stale end either way).
- `createGroupAssigner` and `taskBelongsToGroup` route tasks with
  `value < today` to that bucket.
- Non-date values (possible under Dataview for a key that is usually a
  date) are unaffected; the missing-value "Unassigned" bucket is unchanged.
- `deriveGroupBuckets` gains a `today: Date` parameter, threaded from the
  today store through `deriveBoardMatrix` (and the manual-order prune path
  in `main.svelte`).

The synthetic id is stable across days, so manual-order pins inside the
Overdue swimlane survive rollover. Tasks migrating *into* Overdue as days
pass simply append (existing behavior for unpinned tasks in a cell).

### UI

**Filters sidebar** gains a "Date" section below File, visible only when the
active property schema exposes date-typed keys (hidden for schema "None",
with the section replaced by a short hint to enable a property schema):

```
▼ Date
  [Scheduled ▾] [on or before ▾] (•) Today  ( ) Date [__________]   [×]
  [Due ▾]       [before ▾]       (•) Today  ( ) Date [__________]   [×]
  [+ Add condition]                                        [Add filter]
```

- Property dropdown lists the active schema's `knownKeys()` filtered to
  `type === "date"`.
- Value is a Today/fixed-date toggle; fixed date uses a native date input.
- Each row has a remove button; `[+ Add condition]` appends a row with
  defaults (`scheduled`, `on-or-before`, `$TODAY`).
- A `Save` action saves the current condition set as a saved filter chip
  (with a collapsible "Saved filters" list above the rows), matching the
  content/file pattern; an optional name input next to it labels the chip
  (unnamed chips describe their conditions, e.g. "Scheduled on or before
  Today"). `Clear` removes all condition rows.

**Group control**: when the group select is a date-typed property, show a
checkbox "Combine overdue into one group" bound to
`groupSource.collapsePastDates`.

## Detailed Behavior

- Conditions are AND-ed; an empty list means no date filtering.
- Invalid conditions (unknown property, unparseable fixed date) are skipped
  individually; the remaining conditions still apply.
- Changing the property schema may orphan a condition's property key; the
  condition then matches no property on any task, so all tasks pass it (the
  UI shows the raw key so the user can fix or delete the row).
- Dataview datetime values (parsed via `parseIsoDate` with a time
  component) are truncated to their **local** calendar day before
  comparison, so they compare consistently with `$TODAY` and with date-only
  values.
- Day rollover: the today store tick re-runs `filteredByDate` and
  `deriveBoardMatrix`; a task due yesterday moves into the Overdue swimlane
  and a future-scheduled task surfaces the day it comes due, with no user
  action.
- The Overdue bucket appears only when at least one visible task falls in
  it (it is derived from values present, same as other property buckets).
- "Overdue" label applies whatever date key is grouped (due, scheduled,
  start, …) — the semantics are "before today" in all cases.
- Filtered counts (`filteredTaskCount`) and the `isFiltered` flag include
  date conditions; the existing "clear filters" affordance clears them too.

## Open Questions

1. **`$TODAY` offsets** (`$TODAY+7` for "next week" views): deferred. The
   operator set plus fixed dates covers the issue's use cases; offsets can
   be added later as a value-syntax extension without schema changes.
2. **Relative bucketing beyond Overdue** (Today / Tomorrow / This week
   swimlanes): out of scope; noted as a possible follow-up on the same
   `collapsePastDates`-style mechanism.
3. **Group-level "hide unassigned" toggle**: the counterpart to the
   never-filter-uncategorized rule — undated tasks in an overdue view are
   hidden by bucket visibility, not by the filter. Related but separate
   work; deserves its own spec alongside the existing column-level
   visibility options.

## Implementation Plan

### Phase 1: Core date filter (single condition) ✅ COMPLETE
**Goal:** "Hide tasks scheduled after today" works and persists.

1. ✅ Add `DateFilterCondition` + `lastDateFilter` to the settings zod
   schema and `SettingValues`; extend `BoardFilterState` and its
   read/write/serialize helpers.
2. ✅ Implement `src/ui/filters/date_filter.ts` (`getToday`,
   `resolveConditionDate`, `taskMatchesDateConditions`) with unit tests:
   each operator, `$TODAY` vs fixed date, missing property always passes,
   invalid condition skipped, local-day resolution of `$TODAY`.
3. ✅ Wire `filteredByDate` into `main.svelte`; switch board matrix, counts,
   and `isFiltered` to it.
4. ✅ Sidebar Date section rendering one condition row (property, operator,
   Today/date value, remove); hidden when the schema has no date keys.
5. ✅ Test: set `scheduled on-or-before $TODAY`, confirm future-scheduled
   tasks hide, unscheduled tasks stay, state survives close/reopen.

**Deliverable:** A persistent single-condition date filter with `$TODAY`.

### Phase 2: Multiple conditions ✅ COMPLETE
**Goal:** Overdue view stacks on top of the hygiene filter.

1. ✅ `[+ Add condition]` / per-row remove; conditions AND-ed.
2. ✅ Unit tests for multi-condition evaluation and per-row validity
   skipping.
3. ✅ Test: with the Phase 1 condition active, add `due before $TODAY` —
   board shows overdue tasks plus tasks with no due date; remove the row
   and the hygiene filter alone remains.

**Deliverable:** AND-ed condition list covering both issue use cases at
once ("all overdue, grouped by area" = this plus existing tag-group
swimlanes).

### Phase 3: Saved filters + day rollover ✅ COMPLETE
**Goal:** Date filters are first-class citizens of filter persistence.

1. ✅ Add optional `date` slot and optional `name` to `savedFilterSchema`;
   chips, add/apply/remove in the Date section mirroring content/tag/file,
   with an optional-name input in the save flow.
2. ✅ Implement `today_store.ts` (midnight timer + focus/visibility
   re-check); thread it into `filteredByDate`.
3. ✅ Unit tests: saved-filter round-trip with and without a name; store
   rollover, wake re-check after simulated sleep, and teardown with an
   injected clock (vitest fake timers) and injected wake-listener registrar.
4. ✅ Manual test: save an overdue filter (named and unnamed), reapply from
   chip, delete a chip; confirm the board re-filters on day rollover.

**Deliverable:** Saveable, optionally named date filters that stay correct
across days.

### Phase 4: Overdue smooshing for date groups ✅ COMPLETE
**Goal:** Grouping by a date property can collapse the past into one lane.

1. ✅ Extend `groupSourceSchema` property variant with
   `collapsePastDates?: boolean`.
2. ✅ Thread `today` into `deriveGroupBuckets` / `createGroupAssigner` /
   `taskBelongsToGroup`; implement the `__overdue__` bucket (derivation,
   assignment, ordering, stable id). Update the manual-order prune call
   site.
3. ✅ Unit tests: mixed past/today/future dates produce one Overdue bucket
   plus per-date buckets; direction desc reverses placement; missing values
   still land in Unassigned; non-date values unaffected; bucket id stable.
4. ✅ Group-control checkbox "Combine overdue into one group", shown only
   for date-typed group keys; persists with saved groupings.

**Deliverable:** A single Overdue swimlane when grouping by due/scheduled.

### Phase 5: Manual verification ✅ COMPLETE
**Goal:** Confirm end-to-end in a real vault.

1. ✅ Sandbox vault: tasks with 📅/⏳ dates in the past, today, and future.
   Verify: future-scheduled hidden by the hygiene filter; overdue view
   correct; combined view correct with tag-group swimlanes; Overdue
   swimlane collapses past dates; chips save/apply; counts and clear-all
   behave.
2. ✅ Leave the board open across a (simulated or real) midnight and verify
   rollover without reload.

**Deliverable:** Checked-off manual test cases (per README.planning.md,
only after actually performing them).
