Status: IN_PROGRESS

# SPEC 0046 — Reschedule Overdue Tasks to Today

## Feature Request Summary

Issue [#193](https://github.com/ErikaRS/task-list-kanban/issues/193) asks for a way to reschedule overdue tasks to today, using whichever date property the board is grouped by. Today the only way to do this is to edit each task's date by hand or drag each card out of the Overdue swimlane (which SPEC 0028 deliberately does not accept as a drop target). This spec adds one bulk action that sets the grouped date to today on every visible overdue task.

## User Requirements

1. When a board is grouped by an editable date property (`due`, `scheduled`, or `start`), the user can reschedule every visible overdue task to today in one action.
2. The action writes only the grouped date property. No other date, status, tag, column placement, or task text changes.
3. Only tasks currently visible on the board are affected. Tasks hidden by content, file, or date filters are not changed.
4. Completed tasks (tasks in the Done column) and cancelled tasks are not changed.
5. The action is offered from the Overdue swimlane header when overdue tasks are combined into one group, and from a command-palette command that works whether or not they are combined.
6. The user confirms before anything is written; the confirmation states how many tasks will change and which date property.
7. The action is unavailable when the board is not grouped by an editable date property, when the property schema cannot write dates, or when there are no matching tasks.

## High-Level Design

### Which tasks are eligible

A pure helper, `getReschedulableOverdueTasks(tasks, groupSource, today)`, returns the IDs of tasks that:

- are rendered on the board: every task in a cell of the current `BoardMatrix` (`getVisibleBoardTasks`), so filtered-out tasks and hidden built-in columns are excluded while collapsed columns and swimlanes still count,
- have a `Date` value for `groupSource.key` strictly before `today` (the same `isOverdueValue` rule the Overdue swimlane uses, including local-day truncation of Dataview datetimes),
- are not `done` and not `isCancelled`.

It returns an empty list unless `groupSource.kind === "property"` and `isWritableSwimlanePropertyKey(groupSource.key)` resolves to a date target, and the active property schema has a write adapter. `created`, `completion`, and arbitrary Dataview keys are therefore excluded.

`isOverdueValue` moves from a private function in `task_grouping.ts` to an exported helper so both the swimlane and the new helper share one definition of "overdue".

Eligibility does not depend on `collapsePastDates`. With the option off, past dates render as separate swimlanes, and the command still reschedules all of them.

### Write path

Reuse `taskActions.updateSwimlaneProperty(ids, key, getToday())`. `getToday()` returns UTC midnight of the local calendar day, and `formatSwimlaneDateValue` formats a `Date` in UTC, so the written value is the user's local calendar date (for example `📅 2026-09-26` under the Tasks schema, `[due:: 2026-09-26]` under Dataview). The existing `createSwimlanePropertyTransform` rewrites only that date, so requirement 2 holds without new write code.

After the write, the rescheduled tasks leave the Overdue swimlane and appear in today's date swimlane on the next board refresh. Manual-order pins inside the Overdue cell for those tasks become stale; they are pruned by the existing manual-order prune path, as when a task is dragged to another lane.

### Entry points

**Overdue swimlane header.** When `collapsePastDates` is on and the Overdue bucket is rendered, its group header (desktop `DesktopAxisHeader` and mobile `MobileSectionHeader`) shows a small calendar icon button, **Reschedule to today**, next to the count. On mobile it appears on the group-first layout's swimlane header; the column-first layout repeats group labels inside every column, so it relies on the command instead. The button is hidden when the helper returns no tasks (for example, every overdue card is already done). Its accessible name includes the count and property, for example **Reschedule 7 overdue tasks to today (due)**.

**Command.** Add a board command, **Reschedule overdue tasks to today**, using the same `checkCallback` pattern as the other `KanbanView` commands in `entry.ts`. It is available only when the active view is a kanban board and the helper returns at least one task. `KanbanView` exposes `hasReschedulableOverdueTasks()` and `rescheduleOverdueTasks()`, which delegate to the Svelte board component the same way the selected-card commands do.

### Confirmation

Both entry points open the existing `confirm_modal.ts` with text such as:

```text
Reschedule 7 overdue tasks to today?
Their due date will be set to 2026-09-26. Other dates and task text are unchanged.
[Cancel]  [Reschedule]
```

The task list is recomputed when the user confirms, so a task that stopped being overdue or visible while the modal was open is not written.

## Detailed Behavior

| Situation | Result |
| --- | --- |
| Grouped by `due`, 3 visible overdue open tasks, 1 overdue done task | Header button and command offer 3; the done task is unchanged |
| Grouped by `scheduled`, filter hides 2 of 5 overdue tasks | 3 are rescheduled; the 2 hidden tasks keep their dates |
| Grouped by `due`, "Combine overdue" off | No Overdue header button; command reschedules tasks from every past-date swimlane |
| Grouped by `created` or `completion` | No header button; command unavailable |
| Grouped by a tag, file, folder, or not grouped | Command unavailable |
| Property schema "None" | Command unavailable (no write adapter) |
| Task has both `due` and `scheduled`; board grouped by `due` | Only `due` changes |
| Dataview datetime `due:: 2026-09-25T18:00` | Treated as overdue by local day; replaced with the date-only value `2026-09-26` |
| Day rolls over while the board is open | Eligibility follows `$todayStore`; the target date is today's date at confirmation time |

- Writes go through `editTaskSourceRows`, so failed or stale writes use the existing task-action error handling and notices.
- Tasks in multiple files are written file by file, as other bulk actions do. A partial failure leaves the tasks that were written rescheduled.
- A notice after completion reports the count, for example **Rescheduled 7 tasks to today**.

## Implementation Plan

### Phase 1: Command-palette reschedule 🚧 IN PROGRESS

**Goal:** The user can reschedule all visible overdue tasks on a date-grouped board from the command palette.

1. ✅ Export `isOverdueValue` and add `getReschedulableOverdueTasks` with unit tests for due/scheduled/start, non-editable date keys, non-date groups, done and cancelled tasks, Dataview datetimes, and the `collapsePastDates` on/off cases.
2. ✅ Add `hasReschedulableOverdueTasks()` / `rescheduleOverdueTasks()` on `KanbanView`, wired to the board component's visible task list.
3. ✅ Register the **Reschedule overdue tasks to today** command with confirmation and a completion notice.
4. [ ] Test in a vault under the Tasks and Dataview schemas: only the grouped date changes, filtered-out tasks are untouched, and rescheduled cards move to today's swimlane.

**Deliverable:** A working command that reschedules only visible, open, overdue tasks by the grouped date.

**Implemented by:** Pending.

### Phase 2: Overdue swimlane header button 🚧 IN PROGRESS

**Goal:** The same action is one click away on the combined Overdue swimlane.

1. ✅ Add the **Reschedule to today** button to the Overdue group header on desktop and mobile, hidden when no tasks are eligible.
2. ✅ Route it through the same confirmation and write path as the command.
3. [ ] Test keyboard and touch activation, the accessible name, both flow directions, and a collapsed Overdue swimlane.
4. ✅ Update the README's grouping section to describe the command and button.

**Deliverable:** The Overdue swimlane header offers a one-click reschedule that behaves exactly like the command.

**Implemented by:** Pending.

## Design Notes and Open Questions

1. **Per-card action:** A "Reschedule to today" item on a single card's menu is a natural follow-up but is not requested. The date editor already covers single-card edits.
2. **Other targets:** "Reschedule to tomorrow" or a chosen date could reuse the same helper with a different target date. Out of scope for this spec.
3. **Undo:** There is no board-level undo. The confirmation's count and property name are the safeguard. Obsidian's file history and version control remain the recovery path.
4. **Past-date swimlane buttons:** With "Combine overdue" off, each past-date swimlane could also get a button. This spec keeps the button on the combined Overdue lane only, to avoid repeating it on every stale date.
