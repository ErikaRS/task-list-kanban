Status: IN_PROGRESS

# SPEC 0048 - Keep Column Tag On Completion

## Feature Request Summary

Today, completing a task removes the tag that placed it in a column. Some users
want the tag kept so the Markdown still records where the task was when it was
finished. See
[#192](https://github.com/ErikaRS/task-list-kanban/issues/192).

While tracing the write paths for this change, a second bug turned up.
Completing a task by dragging it to **Done** removes a priority that placed it
in a priority column. Checking the box does not. Priority describes the task
itself rather than its workflow state, so no completion or archive action
should ever remove it.

Completion is currently written by three separate mechanisms. This spec merges
them into one surgical path, so the new behavior only has to be built once.

## User Requirements

1. Add an inherited board/default setting, **Keep column tag when completing**,
   off by default. When it is off, tag behavior is unchanged.
2. When the setting is on, every completion action keeps the task's column
   tag or tags: the checkbox, **Move to Done**, dragging to **Done**, the
   Advance action, bulk and command-palette **Mark done**, and moving a task
   into another file's **Done** column.
3. When the setting is on, **Archive** also keeps the column tag. This applies
   to both the `#archived` tag mode and the archive-status mode.
4. **Done** and **Archived** still take priority over a remaining column tag.
   A completed task shows in **Done** and an archived task stays hidden,
   whatever tags it carries.
5. Unchecking a completed task that still has its column tag returns it to
   that column.
6. Completion and archive never remove a priority, whatever the setting.
   This is a bug fix, not an option.
7. Status-matched columns cannot keep their placement, because completion has
   to overwrite the status marker. The setting description says so.
8. Code paths that do the same job are consolidated where that removes
   duplicate logic.

## Current Behavior (verified)

**Reading is already correct.**

- `Task` parses the status first (`task.ts:314`). When the task is done, it
  clears the parsed column (`task.ts:377-379`).
- `deriveBoardMatrix` sends any `task.done` task to **Done** before checking
  the column (`board_matrix.ts:62`).
- A status column cannot use a done marker (`column_validation.ts:80`).
- A line containing `#archived` is never tracked (`task.ts:800`), and neither
  is a line with an archive status (`task.ts:812`). A kept column tag
  therefore cannot bring an archived task back onto the board.

**The tag is lost on write, in three places.**

| Action | Path | Why the tag is lost |
|---|---|---|
| Checkbox, Move to Done menu, Mark done | `markDone` / `toggleDone` → `rewriteTaskRows` → `Task.serialise()` | The parse step strips the placement tag from `content` (`task.ts:344-351`). `serialise()` writes it back only from `column`, which the `done` setter clears (`task.ts:406-409`, `629`). |
| Drag to Done, bulk Move to Done | `moveTasksToColumn` → `changeColumnTransform` | The source column's write tags are removed (`column_change.ts:52-60`). The source priority is removed too (`column_change.ts:43-46`). |
| Archive | `archiveTasks` → `Task.archive()` → `serialise()` | Only `#archived` or the archive status is written (`task.ts:747`, `756`, `631`). The source priority is removed (`task.ts:742-745`). |
| Move to another file's Done column | `moveTasksToFile` → `serialiseForColumn` | Same cause as the checkbox path. |

**A latent bug.** Any later full rewrite of a done task strips a leftover
column tag, even one the user typed by hand, because the parse step removes
it from `content`. Examples are editing the card text or cancelling it.

## High-Level Design

### 1. One surgical path for status and column changes

All status and column transitions are written by string transforms in
`column_change.ts`. These edit only the checkbox marker and the placement
fragments, and leave the rest of the line byte-for-byte as it was. That module
already describes itself this way ("never parses and rebuilds the task body").

```ts
// column_change.ts
changeColumnTransform(row, options)   // existing: move between columns / to Done
archiveTransform(row, options)        // new: archive tag or archive status
```

`ColumnChangeOptions` gains `keepColumnTag: boolean`.

Actions are rewired as follows.

| Action | Before | After |
|---|---|---|
| `markDone(id)` | `rewriteTaskRows` + `task.done = true` | `editTaskColumns([id], "done")` |
| `toggleDone(id)`, when the cycle reaches done | `rewriteTaskRows` + `cycleStatus` | `editTaskColumns([id], "done")` |
| `toggleDone(id)`, for any other step | `rewriteTaskRows` + `cycleStatus` | surgical status-marker replace |
| `archiveTasks(ids)` | `rewriteTaskRows` + `task.archive()` | `editTaskSourceRows(ids, archiveTransform)` |
| `moveTasksToFile` destination row | `serialiseForColumn` | `changeColumnTransform(task.serialise(), …)` |

This removes the `Task` methods that duplicate the transform logic:
`set done`, `cycleStatus`, `archive`, `serialiseForColumn`, `moveToColumn`,
`moveToUncategorised`, and the private priority read/write helpers. The
`column` setter stays only if `column_rename_migration.ts:160` still needs it;
the preference is to move that migration onto `changeColumnTransform` as well.
`getNextStatusMarker` stays as a pure function, because `toggleDone` still
needs it to pick the next marker.

A side benefit is that the completion date gets written in one place instead
of two (`actions.ts:315`, `888`). Moving a task into another file's Done
column now adds the completion date too, like every other completion action.

Cancel and restore also became marker-only edits, which let `Task.cancel` and
`Task.restore` go as well. After this change, the full-line rewrite path is
only used for content and tag edits.

### 2. Completion keeps the tag when the setting is on

In `changeColumnTransform`, when `toColumn === "done"` and `keepColumnTag` is
true, source placement tags are not removed. The status marker still becomes
the first done marker, and the completion date is still added when it is
enabled.

`archiveTransform` behaves the same way. When the setting is on, it leaves
placement tags alone and either appends `#archived` or writes the archive
status. When the setting is off, it removes the source column's placement
tags, as it does today.

### 3. Priority is never removed by completion or archive

`changeColumnTransform` removes the source priority only when the
destination is a custom column or **Uncategorised**. Moving to **Done** leaves
it alone. `archiveTransform` never touches priority. Moving between two
priority columns still replaces the priority, as it does today.

### 4. A done task's leftover column tag is an ordinary tag

In the `Task` constructor, when the task is done, a tag that would otherwise
be a placement tag is treated as an ordinary tag. It stays in `content` and
`tags` instead of being stripped. As a result:

- full rewrites (edit text, cancel, restore, and so on) preserve it;
- the done card shows it like any other tag, filters such as `tag:doing` match
  it, and **Group by tag** places the card in that tag's swimlane.

This part does not depend on the setting (decided 2026-09-30). Editing a
done task keeps every tag it has, however the tag got there.

### 5. Moving a task out of Done

Moving a task out of **Done** follows the normal column-drag rules. The task
gets the destination column's tags, and the column its kept tag points to is
treated as the source column: that column's tags are removed and its status
and priority rules apply, exactly as for a drag between two columns.

The source column is resolved with the same matcher the parser uses
(`resolveMatchedColumnDefinition`, `definitions.ts:201`), applied to the done
task's tags. A done task with no kept tag has no source column, as today.

Without this, a done task would pass no source column (`actions.ts:307`).
Dragging `#todo` from **Done** to **Doing** would then leave both tags, and
because the matcher picks the first matching column in board order, the card
could land in **Todo** instead of **Doing**.

### 6. Column rename migration

`column_rename_migration.ts:159` skips done tasks. Once done tasks can carry
column tags, renaming a tag column should also rewrite the kept tag on done
tasks. Archived tasks are never tracked, so their tags are left as they are.

### Settings

```ts
keepColumnTagOnCompletion?: boolean; // default false, inherited, board-overridable
```

The setting is also a global board default (`BOARD_DEFAULT_SETTING_KEYS`).
It lives in the **Columns** section, directly below the **Add column**
button, with the normal override chip (decided 2026-09-30).

```text
Keep column tag when completing  [toggle]
  Leave a task's column tag in place when it is completed or archived.
  Status-based columns cannot be kept, because completion changes the status.
```

## Detailed Behavior

Examples assume columns **Todo** (`#todo`), **Doing** (`#doing`), and **High**
(priority `high`, Tasks schema), with the setting **on** unless stated.

| Start | Action | Result |
|---|---|---|
| `- [ ] Write #doing` | checkbox to done | `- [x] Write #doing ✅ 2026-09-26` in **Done** |
| `- [ ] Write #doing` | drag to Done | same |
| `- [ ] Write #doing` | drag to Done, setting **off** | `- [x] Write ✅ 2026-09-26` (unchanged behavior) |
| `- [x] Write #doing` | uncheck | `- [ ] Write #doing` in **Doing** |
| `- [x] Write #doing` | drag to Todo | `- [ ] Write #todo` in **Todo** |
| `- [x] Write #doing` | Archive | `- [x] Write #doing #archived`, hidden |
| `- [ ] Write #doing` | Archive, archive-status mode `d` | `- [d] Write #doing`, hidden |
| `- [ ] Write ⏫` in High | drag to Done, setting **off** | `- [x] Write ⏫ ✅ …` (priority kept) |
| `- [ ] Write ⏫` in High | Archive | priority kept |
| `- [x] Write #doing` | edit text | `#doing` kept |
| `- [/] Write` in status column `/` | complete | `- [x] Write`; the status placement cannot be kept |

Lines are otherwise preserved byte-for-byte: spacing, bullets, indentation,
block links, and existing completion metadata.

## Implementation Plan

### Phase 1: Priority survives completion and archive ✅ COMPLETE
**Goal:** Dragging to Done and archiving no longer remove priority.

1. ✅ Stop `changeColumnTransform` removing priority when `toColumn === "done"`
2. ✅ Add `archiveTransform` (no priority removal) and route `archiveTasks` through `editTaskSourceRows`
3. ✅ Test: `column_change.tests.ts` covers drag to Done from a priority column (Tasks and Dataview)
4. ✅ Test: archive from a priority column keeps priority, in both archive modes

**Deliverable:** Priority is never lost on completion or archive.

**Implemented by:**

### Phase 2: One completion path ✅ COMPLETE
**Goal:** Every completion action writes through `changeColumnTransform`, with no behavior change.

1. ✅ Route `markDone` and the done step of `toggleDone` through `editTaskColumns(…, "done")`
2. ✅ Replace non-done `toggleDone` steps with a surgical status-marker replace
3. ✅ Route `moveTasksToFile` through `changeColumnTransform`
4. ✅ Move `column_rename_migration` onto `changeColumnTransform`
5. ✅ Delete the now-unused `Task` mutators and their tests; port the meaningful cases to `column_change.tests.ts`
6. ✅ Test: the existing actions and task suites pass; add a byte-preservation case for the checkbox path

**Deliverable:** Identical behavior with less code; the checkbox no longer rebuilds the line.

**Implemented by:**

### Phase 3: Keep column tag setting 🚧 IN PROGRESS
**Goal:** With the setting on, completion and archive keep the tag, and Done/Archived still win.

1. ✅ Add `keepColumnTagOnCompletion` to the settings store, global settings, and the settings UI
2. ✅ Pass `keepColumnTag` into `changeColumnTransform` and `archiveTransform`
3. ✅ Treat a done task's placement tag as an ordinary tag when parsing
4. ✅ When moving a done task, resolve its source column from its kept tags so the normal drag rules apply
5. ✅ Update the rename migration to rewrite kept tags on done tasks
6. ✅ Test: each Detailed Behavior row, with the setting on and off
7. ✅ Test: `deriveBoardMatrix` puts a done task carrying `#doing` in **Done**; an `#archived` task carrying `#doing` stays untracked
8. ✅ Update the README (Columns, Archive)
9. Manual: complete, uncheck, drag out of Done, and archive in a test vault, with consolidated tags on and off

**Deliverable:** Issue #192 is resolved behind the new setting.

**Implemented by:**

## Decisions

Made by Erika on 2026-09-30.

1. On a done card, a kept column tag is an ordinary tag. It is shown, and it
   counts for filters and **Group by tag**.
2. Dragging a task into a column gives it that column's tags. Every other
   change follows the normal column-drag rules (section 5).
3. Editing a done task keeps all of its tags, whatever their source and
   whatever the setting (section 4).
