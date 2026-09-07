Status: IN PROGRESS

# SPEC 0038 — Mobile Board Layout

## Feature Request Summary

- [#176](https://github.com/ErikaRS/task-list-kanban/issues/176) — Android board becomes extremely small and task input is hidden by the keyboard
- [#182](https://github.com/ErikaRS/task-list-kanban/pull/182) — Phone-friendly stacked board layout

The desktop board is a two-dimensional matrix: board columns are its primary
axis and optional swimlane groups are its secondary axis. That presentation is
appropriate for a desktop workspace, where users can scan several columns and
groups simultaneously. It does not fit a portrait phone comfortably.

This spec defines a phone-first, vertically serialized presentation of the
same matrix. It does not introduce a mobile task model, mobile-only board
settings, or a separate interaction system. The existing focused mobile task
and new-task editors remain responsible for keyboard/visual-viewport behavior;
this spec concerns the board presentation around them.

Related completed architecture:

- [SPEC 0019 — Board Matrix Rendering Architecture](complete/SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md)
- [SPEC 0021 — Group By and Swim Lanes](complete/SPEC_0021__COMPLETE__GROUP_BY_SWIMLANES_DESIGN.md)
- [SPEC 0022 — Transposed Vertical Board Grid](complete/SPEC_0022__COMPLETE__TRANSPOSED_VERTICAL_BOARD_GRID.md)

## User Requirements

1. A board on Obsidian Mobile must use a readable full-width, vertically
   scrolling presentation rather than compressing a desktop matrix into a
   narrow viewport.
2. The mobile presentation must consume the existing `BoardMatrix` and retain
   the same column, group, cell, sorting, and task-write semantics as desktop.
3. The existing flow-direction setting must determine which matrix axis leads
   the mobile hierarchy; no separate mobile-layout setting is introduced.
4. `LTR` and `RTL` must be column-dominant. `TTB` and `BTT` must be
   group-dominant when grouping is active.
5. `RTL` and `BTT` must preserve their respective flip/reversal behavior.
6. Mobile must retain task counts: an accessible board summary plus accurate,
   non-duplicated counts for the visible hierarchy.
7. All existing cell-level interactions must remain available: add task,
   task editing, drag/drop, selection and bulk actions, manual ordering,
   pinning, task menus, and file/group creation metadata.
8. The stacked renderer and forced top board rail must apply only when
   `Platform.isMobile` is true. A narrow desktop window or split pane must
   retain the desktop matrix and the user's rail-dock preference.
9. `Platform.isMobile` defines the supported mobile-device scope, including
   phones, tablets, portrait, and landscape orientations.
10. The design must work for ungrouped boards, grouped boards, empty cells,
    collapsed columns, filtered boards, and all four flow directions.

## High-Level Design

### Core Principle

Desktop retains the full two-dimensional matrix. Mobile serializes that matrix
into a hierarchy while preserving its semantics.

```text
filtered tasks
  -> BoardMatrix (unchanged)
  -> desktop: horizontal or transposed-grid renderer
  -> mobile: hierarchy renderer
       -> outer axis section
          -> inner axis cell section
             -> existing BoardCell and task controls
```

The renderer is the only layer that changes. `BoardMatrix`, `BoardCell`,
task actions, grouping derivation, sorting, and manual-order persistence remain
shared.

### Mobile Renderer Selection

`main.svelte` selects the mobile hierarchy renderer only for
`Platform.isMobile`.

Desktop may continue to calculate responsive card widths for a narrow pane,
but it must not switch to the phone renderer, force the rail to the top, or
discard the configured desktop flow direction.

On mobile, the board rail docks across the top to maximize the remaining board
width and to avoid spending a narrow viewport on a permanent left gutter.

### Axis-Dominance Mapping

The existing flow direction determines the outer hierarchy.

#### Naming Going Forward

Use the following descriptive names in new user-facing copy, design discussion,
and implementation comments. Keep the legacy flow-direction abbreviation in
parentheses so existing settings, documentation, and user mental models remain
easy to connect.

| Descriptive name | Existing flow direction |
| --- | --- |
| Column dominant ascending (LTR) | Left-to-right |
| Column dominant descending (RTL) | Right-to-left |
| Group dominant ascending (TTB) | Top-to-bottom |
| Group dominant descending (BTT) | Bottom-to-top |

"Dominant" describes the outer mobile hierarchy; "ascending" and
"descending" describe the workflow-column order. In particular, BTT does not
reverse group order.

| Flow direction | Mobile outer axis | Mobile inner axis | Reversal rule |
| --- | --- | --- | --- |
| LTR | Board columns | Groups/cells within each column | Columns use normal primary-axis order. |
| RTL | Board columns | Groups/cells within each column | Columns use reversed primary-axis order. |
| TTB | Groups | Board columns/cells within each group | Groups use normal secondary-axis order; columns use normal primary-axis order. |
| BTT | Groups | Board columns/cells within each group | Groups use normal secondary-axis order; columns use reversed primary-axis order. |

`deriveBoardMatrix` already exposes primary-axis order according to flow
direction. The mobile renderer should consume that order rather than recreate
or independently reverse it.

The BTT rule is intentional: BTT reverses workflow-column order, not the
order of file/tag/property groups.

### Column-Dominant Mobile Presentation (LTR / RTL)

```text
Board task count

[ Todo — 6 ]                         <- outer column section; collapsible
  [ Ungrouped — 2 ]
    Add task / cards
  [ Project Alpha — 4 ]
    Add task / cards

[ In Progress — 3 ]                  <- next/reversed column for RTL
  ...
```

The existing column-collapse state applies directly to each outer column.

### Group-Dominant Mobile Presentation (TTB / BTT)

```text
Board task count

[ Project Alpha — 7 ]                <- outer group section
  [ Todo — 3 ]
    Add task / cards
  [ In Progress — 4 ]
    Add task / cards
  [ Done — 0 ]
    Add task / empty drop target

[ Project Beta — 2 ]
  ...
```

Column order inside each group follows the primary-axis order supplied by the
matrix: normal for TTB, reversed for BTT.

Column collapse remains a board-column setting. Collapsing `Todo` therefore
collapses that column in every rendered group section; the mobile renderer must
not create a separate per-group column-collapse state. Group collapse is out of
scope for this first version.

### Ungrouped Boards

An ungrouped board has one default secondary bucket. Group-dominant rendering
does not display a meaningless default group heading. It renders the same
simple sequence of columns:

- TTB: columns in normal order;
- BTT: columns in reversed order.

This is the natural degenerate case of the group-first hierarchy, not a
separate data path.

The default ungrouped bucket is the only group label that may be hidden. A
real bucket emitted by an active grouping source, including a grouping source's
explicit `Uncategorized`/`Unassigned` bucket, remains visible and participates
in normal group ordering and counts.

## Detailed Behavior

### Counts

The mobile hierarchy must show counts at the level users are reading without
repeating a board-wide total in every nested section.

1. The board summary appears once at the top and uses the existing live text:
   `Total: N tasks` or `X of N tasks` when filtered.
2. Every count is derived from the **filtered tasks** materialized in its
   relevant matrix bucket or cell, rather than from the unfiltered board.
3. Each outer section shows the number of filtered tasks in that outer bucket:
   - column total in LTR/RTL;
   - group total in TTB/BTT.
4. Each inner cell section shows the number of tasks in that exact
   `(primary, secondary)` cell.
5. A repeated nested column header in group-dominant mode must never display
   that column's board-wide total; that would be misleading.
6. Counts update reactively after filtering, task edits, moves, and creation.
7. Count text is exposed through an appropriate accessible name/live region;
   decorative duplicate count text must not be announced twice.

### Header Component Contract

Counts are part of a section header's data contract, not incidental text
rendered alongside it. The implementation should extend a shared header
component or introduce a reusable mobile section-header component with:

- label and heading level;
- exact count and an accessible combined name;
- optional collapse control and collapse state;
- optional compact `Add task` control;
- the matrix bucket/cell identity needed for its actions.

This keeps count semantics reusable if desktop later adopts the same header
presentation. It also prevents a group-dominant renderer from reusing a
column header whose count is scoped to the whole board column rather than the
current cell.

### Empty Cells

Every matrix cell remains materialized in the mobile renderer, but empty cells
do not need the full visual body used for a cell with cards.

- An empty inner cell renders as a compact header-level affordance, including
  its zero count and `Add task` control; it does not reserve card-list padding
  or an empty card container.
- The compact empty representation remains the valid target for the existing
  drop behavior.
- In grouped file cells, creating a task continues to use the file-group
  target. In tag/property cells, it continues to use the existing additional
  metadata behavior.

### Headers, Collapse, and Semantics

- Outer sections use semantically ordered headings.
- Existing actionable column-header controls retain keyboard activation,
  labels, and collapse behavior.
- Inner headers identify both the bucket and the exact cell count.
- A mobile column header may be visually compact, but may not lose an action
  available from the corresponding desktop cell.
- Both the outer-section header and the active inner-cell header are required
  to stick while their section is in view. The inner header sits immediately
  below the outer header; the next section replaces both as it reaches the
  scroll boundary.
- Sticky positioning must be relative to the actual scrolling container. An
  ancestor with `overflow: hidden` must not unintentionally defeat it.
- The renderer must establish/measures the outer sticky-header height for the
  inner header's sticky offset, rather than relying on an unrelated fixed
  pixel value.

### Interactions

`BoardCell` remains the interaction boundary where practical. The renderer
must pass the same information it receives today:

- `secondaryAxisBucket` and `primaryAxisLabel` for correct task creation;
- task actions and column/group metadata for drag/drop;
- manual-order entries keyed by the existing group/column cell;
- selection mode and task selection state;
- card display settings, tags, property settings, and source-block behavior.

No mobile-specific write path may be introduced for moves, grouping, ordering,
or task updates.

Touch drag/drop retains its existing behavior and limitations. This feature
does not promise to improve it, replace it, or make it worse; the existing task
menus remain the supported alternative where a platform's native drag support
is weak.

### Editor Compatibility

This spec does not replace the focused mobile editor or new-task composer.

- Opening a new-task control in any mobile cell uses the existing
  `visualViewport`-aware composer.
- Editing an existing mobile card uses the existing focused task editor.
- The mobile hierarchy must not place an overflow or transformed ancestor
  between those editors and their intended viewport behavior.

## Non-Goals

- Changing desktop grid layout, desktop rail behavior, or desktop flow
  semantics.
- Adding a separate persisted mobile grouping/layout preference.
- Adding group-collapse state.
- Redefining the BoardMatrix or changing how group buckets are derived.
- Replacing touch drag/drop with a new move interaction.
- Implementing a tabbed, paged, or horizontal-snap mobile board as the default
  presentation.

## Implementation Plan

### Phase 1: Mobile Column-Dominant Renderer 🚧 IN PROGRESS

**Goal:** LTR/RTL mobile boards display readable, full-width collapsible
column sections while desktop remains unchanged.

1. ✅ Add a `Platform.isMobile`-only renderer selection path.
2. ✅ Keep narrow desktop panes on their configured desktop renderer and rail
   dock.
3. ✅ Render primary-axis sections in the matrix's LTR/RTL order.
4. ✅ Preserve the board-level task-count label.
5. ⬜ Render accurate per-column and per-cell counts.
6. ⬜ Render compact empty cells with an inline `Add task` affordance and
   preserve their drop target.
7. ⬜ Implement nested outer/inner sticky headers without overflow clipping.
8. ⬜ Verify ungrouped and grouped LTR/RTL boards on Android portrait.
9. ⬜ Add focused automated coverage for renderer selection and count inputs.

**Deliverable:** A column-dominant mobile list that remains semantically and
functionally equivalent to the desktop matrix.

### Phase 2: Group-Dominant Renderer for TTB/BTT

**Goal:** TTB/BTT mobile boards serialize by groups first and preserve the
correct primary-axis direction inside each group.

1. ⬜ Add a group-first mobile renderer path for non-default secondary axes.
2. ⬜ Render group totals and exact per-cell column counts.
3. ⬜ Consume matrix primary-axis order for TTB/BTT instead of reversing in
   the renderer.
4. ⬜ Preserve globally collapsed columns across every group section.
5. ⬜ Keep empty cells compact, but usable for their existing create/drop
   behavior.
6. ⬜ Keep every real grouping bucket visible, including an explicit
   `Uncategorized`/`Unassigned` bucket, while hiding only the default
   ungrouped bucket.
7. ⬜ Verify grouped file, tag-prefix, and property boards in TTB and BTT.

**Deliverable:** A group-dominant mobile hierarchy that expresses TTB/BTT
without introducing a second board model.

### Phase 3: Accessibility, Interaction, and Regression Verification

**Goal:** Confirm that mobile serialization keeps board interactions and
desktop behavior intact.

1. ⬜ Verify screen-reader labels/announcements for board, outer, and cell
   counts.
2. ⬜ Verify keyboard access to headers, collapse controls, task controls, and
   board rail controls.
3. ⬜ Verify mobile new-task and existing-task editor visibility with the
   Android soft keyboard.
4. ⬜ Verify drag/drop, manual order, pinning, selection, and bulk actions in
   both hierarchy modes.
5. ⬜ Verify desktop full-width and narrow split-pane boards retain their
   matrix renderer, chosen flow, and rail dock.
6. ⬜ Verify Android phone portrait/landscape and tablet portrait/landscape.
7. ⬜ Verify the acceptance matrix: each of LTR, RTL, TTB, and BTT with
   ungrouped and grouped boards, both unfiltered and filtered.
8. ⬜ Add/update automated tests for renderer selection, hierarchy order,
   visibility of real/default group buckets, and count scoping.
9. ⬜ Run `npm run build`.
10. ⬜ Run `npm test`.

**Deliverable:** A mobile board presentation that is accessible, preserves
matrix semantics, and leaves desktop behavior unchanged.
