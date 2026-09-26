# New Tasks Inherit Their Swimlane Property

Status: IN_PROGRESS

## Feature Request Summary

Issue: [#188](https://github.com/ErikaRS/task-list-kanban/issues/188)

Adding a task with a swimlane's add button should give the task whatever keeps it
in that swimlane. File lanes and tag lanes already did this. Property lanes did
not: on a board grouped by scheduled date, a task added in the 2026-09-30 lane
got the column's status but no scheduled date, so it landed in Unassigned.

## User Requirements

1. A task added in a property lane (scheduled, due, start, priority) is written
   with that lane's value, so it appears in the lane it was added in.
2. Column placement (tags, status, priority) keeps working as before.
3. A date typed in the new-task form wins over the lane's date for the same key.
4. The Unassigned and Overdue lanes write nothing, since neither has one value.
5. Lanes for properties the plugin cannot write (status, created, custom
   Dataview keys) write nothing, matching drag and drop.
6. Desktop and mobile creation behave the same.

## High-Level Design

`deriveCellCreationMetadata` (`src/ui/board/cell_creation.ts`) now returns a
`groupProperty` (`{ key, value }`) for property lanes with a value. The cell
passes it through `NewTaskControls` (and the captured mobile creation session)
to `TaskActions.createTask`, which hands it to `buildNewTaskLine`.

`buildNewTaskLine` applies it with `createSwimlanePropertyTransform`, the same
writer drag and drop uses for property lanes, so both paths format dates and
Tasks-plugin priority weights the same way. The lane property is written before
the typed dates, so a typed date for the same key replaces it.

## Detailed Behavior

| Lane | Written on the new task |
| --- | --- |
| File | Task is created in the lane's file (unchanged) |
| Tag | Lane tag is added (unchanged) |
| Scheduled / due / start date | That date, in the active schema's format |
| Priority | That priority, in the active schema's format |
| Unassigned, Overdue | Nothing |
| Unwritable property, or no property schema | Nothing |

## Implementation Plan

### Phase 1: Inherit the lane property on creation 🚧 IN PROGRESS
**Goal:** Tasks added in a property lane stay in that lane.

1. ✅ Return the lane's property from `deriveCellCreationMetadata`
2. ✅ Pass it through desktop and mobile creation to `createTask`
3. ✅ Write it in `buildNewTaskLine`, before typed dates
4. ✅ Test: unit tests for cell metadata, line building (date lane, typed-date
   override, priority lane, unwritable lanes) and mobile sessions
5. ✅ Test: Erika added a task in a dated lane on a status-by-scheduled board and
   it stayed in that lane (2026-09-26)
6. Test: in a vault, group by scheduled date with status columns and add a task
   in a dated lane; it appears in that lane and column (Tasks and Dataview)
7. Test: add a task in the Unassigned lane; it gets no scheduled date
8. Test: repeat step 6 from the mobile layout

**Deliverable:** New tasks land in the lane where they were added.

**Implemented by:** pending
