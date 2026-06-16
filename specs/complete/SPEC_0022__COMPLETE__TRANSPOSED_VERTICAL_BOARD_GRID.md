Status: COMPLETE

Implemented: 2026-06

# SPEC 0022 - Transposed Vertical Board Grid

## Feature Request Summary

GitHub issue:

- [#144](https://github.com/ErikaRS/task-list-kanban/issues/144) - Make top to bottom and bottom to top views use the grid

Top-to-bottom (`TTB`) and bottom-to-top (`BTT`) flow should render the board as a true transpose of the normal horizontal board grid.

In plain terms: the board's columns become rows. When grouping is enabled, the group buckets become columns across the top. Tasks inside each rendered cell lay out horizontally and do not wrap.

This is a follow-up to:

- [SPEC 0019 - Board Matrix Rendering Architecture](complete/SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md)
- [SPEC 0021 - Group By and Swim Lanes](complete/SPEC_0021__COMPLETE__GROUP_BY_SWIMLANES_DESIGN.md)

Those specs correctly established the shared board matrix model, but their vertical-renderer wording allowed an implementation where vertical flow became stacked column sections. This spec clarifies that `TTB` and `BTT` are visual transposes of the matrix, not stacked columns.

## User Requirements

1. In `TTB` and `BTT`, board columns render as rows.
2. In grouped `TTB` and `BTT`, group buckets render as columns across the top.
3. In ungrouped `TTB` and `BTT`, there is no visible group-header row; each board column row contains its tasks horizontally.
4. Tasks inside each cell lay out horizontally and do not wrap.
5. The board may scroll horizontally when rows or grouped cells exceed the viewport width.
6. `BTT` preserves the existing reversed primary-axis order: the same rows as `TTB`, but reversed.
7. Grouping, sorting, manual ordering, drag/drop, and task write-back semantics remain matrix-cell semantics and do not change.

## High-Level Design

### Current Mental Model

The board matrix has:

- `primaryAxis`: board columns such as `Todo`, `Doing`, and `Done`
- `secondaryAxis`: group buckets such as files, tags, properties, or the default ungrouped bucket
- `cells[primaryId][secondaryId]`: the tasks for one board-column/group intersection

Horizontal flow renders:

- `primaryAxis` as grid columns
- `secondaryAxis` as grid rows

Vertical flow should render the transpose:

- `primaryAxis` as grid rows
- `secondaryAxis` as grid columns

### Ungrouped TTB/BTT

Ungrouped mode has one default secondary bucket, so the default bucket should not appear as a visible column header.

```text
Todo      [ card ]      [ card ]      [ card ]
Doing     [ card ]      [ card ]
Done      [ card ]      [ card ]      [ card ]
```

Each row header is a board column header. Each row's task cards continue horizontally without wrapping.

### Grouped TTB/BTT

Grouped mode shows secondary-axis buckets as column headers across the top.

```text
          File 1        File 2        File 3        ...
Todo      [ card ]      [ card ]      [ card ]
Doing     [ card ]      [ card ]
Done      [ card ]      [ card ]      [ card ]
```

Each row header is a board column header. Each group column contains the tasks in that `(board column, group bucket)` cell.

If a grouped cell contains multiple tasks, those tasks lay out horizontally inside that group cell and may widen the board.

### Renderer Ownership

The vertical matrix renderer owns the transposed DOM and CSS.

Recommended shape:

```text
main.svelte
  -> deriveBoardMatrix(...)
  -> BoardMatrixVertical
     -> grid corner / group column headers when grouped
     -> primary-axis row headers
     -> BoardCell for each rendered matrix cell
```

`deriveBoardMatrix` should remain flow-agnostic except for the existing primary-axis reversal for `RTL` and `BTT`.

## Detailed Behavior

### Axis Mapping

For `TTB`:

1. `matrix.primaryAxis` renders from top to bottom in normal order.
2. `matrix.secondaryAxis` renders from left to right.
3. Each cell renders at row `primaryAxis index` and column `secondaryAxis index`.

For `BTT`:

1. `matrix.primaryAxis` renders from top to bottom in reversed order.
2. `matrix.secondaryAxis` renders from left to right.
3. Each cell renders at row `primaryAxis index` and column `secondaryAxis index`.

The existing matrix derivation already reverses the primary axis for `BTT`; the renderer should consume the matrix order as given.

### Ungrouped Rendering

When `secondaryAxis` contains only the default ungrouped bucket:

1. Do not render a visible secondary-axis header row.
2. Render one row per primary bucket.
3. Render each row's default cell immediately after the row header.
4. Render tasks horizontally inside that row.

### Grouped Rendering

When grouping is active:

1. Render an empty corner cell above the primary-axis row headers.
2. Render one secondary-axis column header per group bucket.
3. Render one primary-axis row header per board column.
4. Render every matrix cell, including empty cells, at the intersection of its row and group column.
5. Preserve compact empty-cell behavior while keeping the cell available for drag/drop and task creation where applicable.

### Task Layout

In `TTB` and `BTT`:

1. Task cards in a rendered cell use a horizontal row layout.
2. Task cards do not wrap.
3. Task cards keep the configured board column width as their card width.
4. Overflow extends the matrix horizontally instead of compressing cards to unreadable widths.

### Header Styling

The visual treatment should be transposed from the horizontal board:

- board column headers become left-side row headers
- group/swimlane headers become top column headers
- the corner cell appears only when group headers are visible
- color accents remain associated with the primary board column row

The exact CSS does not need to duplicate horizontal selectors, but the visual hierarchy should make it clear that board columns are rows and groups are columns.

### Scroll Behavior

Vertical flow must allow horizontal scrolling. The existing vertical-flow container should not hide horizontal overflow when rows or grouped cells extend past the viewport.

### Interactions

The following behavior should remain unchanged:

- moving tasks between board columns
- moving tasks between file/tag swimlanes
- adding a task in a grouped file cell
- manual ordering within a matrix cell
- unpinning manual-order entries
- selection mode and bulk actions
- collapsed board columns

Implementation should preserve `BoardCell` as the interaction boundary if practical, because drag/drop and task creation already operate on matrix cell metadata.

## Implementation Plan

### Phase 1: Transposed Ungrouped Vertical Grid ✅ COMPLETE

**Goal:** `TTB` and `BTT` ungrouped boards render with board columns as rows and tasks flowing horizontally.

1. ✅ Update `BoardMatrixVertical` to render ungrouped boards as a CSS grid with primary-axis row headers.
2. ✅ Make vertical-flow task lists horizontal and non-wrapping.
3. ✅ Allow horizontal overflow in the vertical-flow board container.
4. ✅ Verify `TTB` row order.
5. ✅ Verify `BTT` reversed row order.

**Deliverable:** Ungrouped vertical flow behaves as a transposed board grid.

**Implemented by:** [cf7387b](https://github.com/ErikaRS/task-list-kanban/commit/cf7387b)

### Phase 2: Grouped Transposed Grid ✅ COMPLETE

**Goal:** Grouped `TTB` and `BTT` boards render group buckets as columns across the top.

1. ✅ Add grouped header row with secondary-axis labels.
2. ✅ Add corner cell where the row-header and group-header axes meet.
3. ✅ Render every `(primary, secondary)` cell at the correct row/column intersection.
4. ✅ Keep empty grouped cells compact but usable for supported drop/create interactions.
5. ✅ Verify grouped file, tag-prefix, and property board data paths with existing Vitest coverage and successful build.

**Deliverable:** Grouped vertical flow behaves as a transposed matrix with group columns.

**Implemented by:** [8ec9064](https://github.com/ErikaRS/task-list-kanban/commit/8ec9064)

### Phase 3: Interaction and Regression Pass ✅ COMPLETE

**Goal:** Confirm the transposed renderer preserves existing board behavior.

1. ✅ Verify dragging tasks between board-column rows.
2. ✅ Verify dragging tasks between file/tag group columns.
3. ✅ Verify manual ordering within a cell.
4. ✅ Verify collapsed rows.
5. ✅ Run `npm run build`.
6. ✅ Run `npm test`.

**Deliverable:** The transposed renderer passes quality gates and preserves existing interactions.

**Implemented by:** Manual verification by Erika; quality gates passed locally.
