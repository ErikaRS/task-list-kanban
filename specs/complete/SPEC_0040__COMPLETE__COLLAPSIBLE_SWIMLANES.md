# SPEC 0040 — Collapsible Swimlanes

Status: COMPLETE
Implemented: 2026-09

## Feature Request Summary

Implement [#165](https://github.com/ErikaRS/task-list-kanban/issues/165): let
users collapse and expand group-by swimlanes, analogous to columns.

[SPEC 0041](complete/SPEC_0041__COMPLETE__SHARED_DESKTOP_AXIS_RENDERING.md)
is complete (2026-09), implemented in
[2e791da](https://github.com/ErikaRS/task-list-kanban/commit/2e791da). It supplies the shared desktop geometry and category
collapse presentation. This spec now covers only the remaining group state,
header controls/counts, mobile behavior, and group-only drop handling.

## User Requirements

1. When grouping is active, users can collapse or expand an individual visible
   swimlane from its group header.
2. A collapsed swimlane retains an accessible named expand control and task
   count. Visual rows keep a visible label; folded visual columns expose the
   full name through their control label and tooltip.
3. Collapse state persists per board and is restored on reopen.
4. The same group is collapsed in desktop and mobile presentations.
5. Collapse hides cards and creation controls but never changes tasks, group
   values, sorting, filtering, selection, or manual order.
6. A collapsed lane remains a valid destination for changing a task's group
   while preserving its semantic column.
7. Existing hiding of groups containing only collapsed semantic columns stays
   unchanged; this is not a Done-specific rule.
8. Ungrouped boards show no swimlane-collapse control.

## High-Level Design

### Shared visual-axis contract

The shared desktop renderer decides geometry from visual role, not bucket kind:

| Visual role | Group-collapse presentation |
| --- | --- |
| Visual column | Existing 28px folded track: neutral toggle and count in the top header band; full name available accessibly and on hover. |
| Visual row | Compact row header with toggle, label, and count; body cells are omitted. |

Column-dominant flow makes a group a visual row. Group-dominant flow makes it
a visual column. SPEC 0040 supplies group state and behavior only; it must not
introduce separate group geometry, overlays, or orientation-specific header
trees.

Row headers remain continuous across every visual-column track, including
folded gutters. Only the top header band contains folded-column controls;
there are no full-height rails or gaps in row bands. This supersedes the earlier
48–56px rail, vertical-label, and segmented-header design.

### Completed foundation and remaining delta

| Concern | Completed in SPEC 0041 | Remaining in SPEC 0040 |
| --- | --- | --- |
| Desktop projection | Canonical cell mapping and header visibility | Feed group collapse flags through the same buckets |
| Shared geometry | `DesktopMatrixGrid`: folded tracks, omitted collapsed-row bodies, continuous bands | Reuse unchanged for groups |
| Sticky hierarchy | Total, column headers, then row headers; opaque surfaces | Keep group controls within existing frames |
| Header styling | Compact visual-role typography, shared gray surfaces, category accents | Group toggle, total count, full-name accessibility and tooltip |
| State | Semantic category collapse only; group buckets remain expanded | Settings, persistence, main toggle, secondary bucket flags |
| Task interactions | Existing canonical cell creation, drop, selection, ordering | Group-only header drop targets; no creation while collapsed |
| Mobile | Existing list hierarchy | Shared group state in outer or repeated inner headers |

`DesktopAxisHeader.svelte` is the integration point for group header content.
`board_matrix_desktop.svelte` can aggregate per-group counts alongside existing
category counts. The grid must not acquire semantic-kind or flow branches.
A future adjustment to folded width or control arrangement must apply to both
semantic kinds, rather than introducing a separate group rail.

### Persisted state

Add `collapsedGroups?: string[]` to `SettingValues`, its schema, and defaults
(empty array). Values are stable `SecondaryBucketId`s. Unknown IDs are retained
so state survives filtering or temporarily absent buckets. The setting follows
`collapsedColumns` sparse-override and frontmatter conventions, is inheritable
from board defaults, and is not captured by saved views.

`deriveBoardMatrix` marks secondary buckets with
`collapsed: collapsedGroups.has(bucket.id)`. The complete matrix and all cells
remain available.

### Counts and controls

The shared header receives the group's total task count across the complete
matrix. It has an explicit keyboard-accessible toggle with `aria-expanded`, an
accessible label, and live count text. Expanded status groups continue using `GroupLabel` and `TaskStatusMarker`.
Folded controls expose the complete group/status name with an accessible label
and tooltip; the count remains visible. Row labels retain the shared compact
typography.

`main.svelte` owns `toggleGroupCollapse(groupId)`, mirrors
`toggleColumnCollapse`, and saves immediately.

### Drag and drop

Extract the group-change portion of `BoardCell` drop handling for use by both
normal cells and collapsed group headers. A collapsed-group target always uses
`changeColumn: false`:

- file group: move task(s) to the target file;
- tag-prefix group: update the matching group tag;
- writable property group: update that property;
- non-writable property group: reject the drop.

Collapsed groups cannot create tasks; expansion reveals normal cell controls.

### Mobile

The state is global to the group ID. In group-dominant mobile layout, the
outer group header owns the control. In column-dominant mobile layout, every
repeated inner group header reflects and can change the same state; collapsed
cells are omitted. Only the explicit control toggles.

## Detailed Behavior

- The ungrouped default bucket never shows a group control.
- Changing group source gives a fresh visible bucket set; old IDs remain inert.
- Changing group direction or flow preserves collapsed IDs and only changes
  placement.
- A visible manually collapsed group keeps its header even after other column
  collapse changes. A group removed by
  `hideSwimlanesWithOnlyCollapsedContent` has no redundant header.
- Filtering updates the collapsed header's count. Configured empty groups stay
  visible under existing empty-bucket rules.

## Implementation Plan

### Phase 1: Persisted group state and basic collapse ✅ COMPLETE

**Goal:** A group can be collapsed, saved, reopened, and expanded without
changing board data.

1. ✅ Add settings schema/default/parse/serialization support.
2. ✅ Mark matrix secondary buckets collapsed.
3. ✅ Add main toggle/save wiring.
4. ✅ Render collapsed group rows/columns through the shared axis header.
5. ✅ Test persistence and complete-matrix semantics.

**Deliverable:** A reloaded board retains group collapse state in every layout.

**Implemented by:** [60e5f91](https://github.com/ErikaRS/task-list-kanban/commit/60e5f91) (Refs #165).

### Phase 2: Desktop folded headers and counts ✅ COMPLETE

**Goal:** Collapsed group columns and rows use the shared axis contract.

1. ✅ Add total group count and accessible controls.
2. ✅ Reuse continuous row bands and the shared 28px folded track; add
   full-name tooltips and accessible controls in the group adapter.
3. ✅ Manually verify first, middle, last, and all-collapsed tracks in both
   flow families, including status and non-status labels.

**Deliverable:** An axis swap changes group placement, never collapse geometry.

**Implemented by:** [60e5f91](https://github.com/ErikaRS/task-list-kanban/commit/60e5f91) (Refs #165).

### Phase 3: Mobile and drop-target parity ✅ COMPLETE

**Goal:** Every collapsed-group header is usable and safe.

1. ✅ Implement mobile headers/bodies using the shared state.
2. ✅ Extract and test group-only drop planning/execution.
3. ✅ Test file, tag-prefix, writable-property, non-writable-property, and
   multi-column drops.
4. ✅ Run `npm run build` and `npm test`.

**Deliverable:** A collapsed group is consistently expandable and a valid
group-only drop target everywhere.

**Implemented by:** [60e5f91](https://github.com/ErikaRS/task-list-kanban/commit/60e5f91) (Refs #165).

## Acceptance Test Matrix

| Case | Expected result |
| --- | --- |
| Collapse / expand a group | Header and count remain; cells return unchanged on expansion. |
| Reopen the board | Each group returns in its saved state. |
| Switch desktop flow / mobile | The same IDs remain collapsed in their role-appropriate presentation. |
| First, middle, last folded group | Named expand control and visible count remain in the top band; row bands cross gutters continuously. |
| Status and non-status group | Expanded status marker remains styled; folded controls expose the complete group/status name accessibly and on hover. |
| Drop onto collapsed group | Group metadata changes while each task retains its column. |
| Non-writable property group | No drop destination is offered. |
| Collapse any semantic column | Existing group hiding rule remains general and unchanged. |
| Ungrouped board | No swimlane control appears. |
