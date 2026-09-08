# SPEC 0040 — Collapsible Swimlanes

Status: IN PROGRESS

## Feature Request Summary

Implement [#165](https://github.com/ErikaRS/task-list-kanban/issues/165): let a
user collapse and expand group-by swimlanes, analogous to columns.

This design deliberately does **not** add a `Done`-specific rule. The existing
`collapsedColumns` setting already removes a rendered swimlane whose cards are
all in collapsed columns (for example, a lane containing only cards in a
collapsed Done column). That behavior remains column-driven and applies to any
collapsed column, not just Done.

Relevant existing work:

- [SPEC 0006](complete/SPEC_0006__COMPLETE__COLLAPSIBLE_COLUMNS.md) — column
  collapsing and persistence conventions.
- [SPEC 0021](complete/SPEC_0021__COMPLETE__GROUP_BY_SWIMLANES_DESIGN.md) —
  group buckets and matrix semantics.
- [SPEC 0038](complete/SPEC_0038__COMPLETE__MOBILE_BOARD_LAYOUT.md) — mobile
  hierarchy modes.

## User Requirements

1. When grouping is active, users can collapse or expand an individual visible
   swimlane from its group header.
2. A collapsed swimlane retains a compact, labelled header and task count, so
   it can always be expanded again.
3. Collapse state persists per board in its frontmatter and is restored on
   reopen.
4. The same group is collapsed in every presentation of the board: horizontal,
   vertical, and mobile.
5. Collapsing a lane hides its cards and creation controls but does not modify
   tasks, group values, sorting, filtering, or manual order.
6. A collapsed lane remains a valid drag destination for changing a task's
   group while retaining each task's current column.
7. No special Done behavior is introduced. Existing hiding of lanes with only
   collapsed-column content stays unchanged.
8. Ungrouped boards do not show a swimlane collapse control.

## High-Level Design

### Axis-neutral grid contract (authoritative)

The board is one complete matrix. Flow direction decides only which matrix axis
is *rendered as columns* and which is *rendered as rows*; it must not create
two different collapse systems.

| Rendering role | Required presentation |
| --- | --- |
| **Rendered columns** | Compact primary headers; a collapsed item is a full-height narrow rail; its expand/collapse control is first, followed by its full label and count. |
| **Rendered rows** | Compact secondary row-header segments; never a primary-sized heading. |

This applies regardless of which semantic axis supplies the bucket:

- **Column-dominant:** semantic columns are rendered columns and groups are
  rendered rows.
- **Group-dominant:** group buckets are rendered columns and semantic columns
  are rendered rows.

The DOM/CSS should therefore share an axis-header/axis-rail primitive, or at
minimum share exactly the same layout contract and class structure. A custom
"group collapsed" visual treatment is explicitly prohibited.

#### Collapsed rendered-column rail

A collapsed rendered column is a 48–56px grid track spanning the entire board
content height. It uses the same ordered flow in every orientation:

```text
┌──────┐
│ [▶]  │  toggle, first / leading
│ Name │  full label, vertical unless it is a status marker
│      │
│  4   │  count, trailing
└──────┘
```

- The toggle is in the same leading position before and after collapse.
- The rail is not a special overlay and is not vertically centered.
- It must be possible to read the complete label and activate the toggle when
  the collapsed item is first, middle, or last.
- A status marker may remain horizontally oriented and styled exactly as task
  status markers are elsewhere. All other labels use vertical text in the
  rail; this includes file, tag, date, priority, and ordinary property group
  labels.

### Segmented rendered-row headers

Rendered-row headers must be split into grid segments, one for every expanded
rendered-column track. A collapsed rail receives **no** row-header segment, so
its label and toggle are never covered.

- The background/border may repeat across the expanded segments.
- Only the first visible segment contains the row label, count, and any row
  controls. Remaining expanded segments are presentational continuations.
- The label inside that first visible segment is sticky on the left while
  horizontally scrolling. It remains sticky across the visual continuation of
  the row-header segments; it must not disappear or restart after a collapsed
  rail.
- If every rendered column is collapsed, their rails remain independently
  expandable. A separate fallback control may be used for the rendered-row
  group, but it must not paint over a rail.

Rejected approaches:

- A full-width row header with a higher z-index (it hides collapsed rails).
- Starting a full-width header only after leading rails (it fails for a middle
  rail).
- A title/control overlay above row headers (it creates overlapping visual
  hierarchies).

### Persisted state

Add `collapsedGroups?: string[]` to `SettingValues`, the settings Zod schema,
and `defaultSettings` (default `[]`). Values are `SecondaryBucketId`s, which
are already stable semantic identifiers produced by `deriveGroupBuckets`:

```yaml
---
kanban-plugin: {
  "collapsedGroups": ["file:Projects/Alpha.md", "tag-prefix:project:Beta"]
}
---
```

The field follows `collapsedColumns` conventions:

- it is an ordinary board display setting, so the existing sparse override and
  frontmatter save paths handle it;
- it can be inherited from board defaults, with an empty default;
- it is not captured by saved views, which capture reusable query/layout
  choices rather than a board's transient expanded sections;
- unknown or currently absent bucket IDs are harmless and retained. This
  preserves a user's choice if a task, file, or filter temporarily removes a
  bucket. No migration is required because this is a new field.

`deriveBoardMatrix` creates each secondary-axis bucket with
`collapsed: collapsedGroups.has(bucket.id)`. The matrix remains complete: all
cells, task data, and group buckets continue to exist even when a lane is
collapsed.

### Rendered-matrix rule

`hideSwimlanesWithOnlyCollapsedContent` remains the last presentation filter.
It continues to remove a lane only when it has tasks and every such task is in
a collapsed primary column; empty configured lanes remain visible.

Manual group collapse is separate from that rule:

- it never removes the group's header, because that header is the expand
  affordance;
- it hides the group's body cells regardless of their task count;
- it has no special awareness of `done`, checkbox status, archive status, or
  any other task property.

Consequently, if a lane is absent due to the existing collapsed-column rule,
there is no redundant group header. If it is visible and manually collapsed,
its header remains visible even if the user later expands or collapses other
columns.

### Shared axis-header control

Introduce an axis-header primitive used for both `ColumnHeader` and group
headers, rather than duplicating the collapse geometry. It accepts an axis
bucket, task count, collapsed state, toggle callback, role (`rendered-column`
or `rendered-row`), and optional semantic label renderer.

Expanded status-group labels may use `GroupLabel`/`TaskStatusMarker`. A
collapsed rendered-column rail must instead receive either the styled status
marker or its actual text label according to the collapsed-rail rule above;
it must never degrade to an unexplained ellipsis or marker-only placeholder.

Expanded headers show `▼`; collapsed headers show `▶`. The button has:

- `aria-expanded`;
- an accessible label such as `Collapse Project Alpha group`;
- a live task-count label (`1 task` / `N tasks`);
- normal keyboard activation and visible focus styling.

Counts are the total tasks in the group across every primary column and are
computed from the complete matrix. They therefore remain useful after the
group body is hidden and continue to react to filters and task changes.

`main.svelte` owns `toggleGroupCollapse(groupId)`, mirroring
`toggleColumnCollapse`: update the set-like string array and immediately call
`requestSave()`.

## Detailed Behavior

### Column-dominant desktop flows (LTR and RTL)

Semantic columns are rendered columns; groups are rendered rows. Render every
group row header as segments across expanded semantic-column tracks. The first
visible segment owns the sticky group label, count, and group-collapse button.
Each collapsed semantic column is a full-height rail with the shared
rendered-column presentation.

The group header is also the drop target while collapsed. A valid drop updates
only the group's backing value, preserving each dropped task's current column.

### Group-dominant desktop flows (TTB and BTT)

Group buckets are rendered columns; semantic columns are rendered rows. This
is the same geometry as column-dominant rendering with the axes swapped:

- every collapsed group is a full-height rail using the exact same ordered
  toggle, label/marker, and count flow as a collapsed semantic column;
- every semantic-column row header is segmented across expanded group tracks;
- the first visible segment owns the sticky semantic-column label, count, and
  controls.

The implementation must not introduce absolute positioning, a centered
full-height flex child, or a group-specific header order to achieve this.

### Mobile

The collapsed state is global to a group ID, even where a mobile hierarchy
repeats group labels:

- **Group-dominant mobile:** the outer group section header contains the
  control. Collapsing it hides all of that group's column cells while retaining
  the outer header and total group count.
- **Column-dominant mobile:** every repeated inner group header reflects the
  same state and can toggle it. When collapsed, the header remains but its
  `BoardCell` is omitted in every column. This makes the global effect visible
  without introducing a second, mobile-only state model.

Collapsed mobile headers are valid group-only drop targets. Touching the
header outside its control does not toggle it; only the explicit button does.

### Drag-and-drop

Extract the group-change portion of `BoardCell`'s drop handling into shared
logic usable by both a cell and a collapsed `GroupHeader` drop target. The
target uses the secondary bucket's source/value and runs the existing actions:

- file group: move the task(s) to the target file;
- tag-prefix group: update the matching group tag;
- writable property group: update that property;
- non-writable property group: reject the drop.

For a collapsed group header, `changeColumn` is always false. Multi-selection
therefore preserves each selected task's column while applying the selected
lane's group value. The normal visual drag-over state and `dropEffect` are
shown only for valid destinations. Tasks cannot be created directly in a
collapsed group; expansion exposes the existing per-cell creation control.

### Interactions and edge cases

- Collapse state is keyed by bucket ID, so changing grouping source naturally
  gives a fresh visible set; prior IDs remain inert in `collapsedGroups`.
- Changing group direction or board flow preserves the same collapsed IDs and
  changes only their visual placement.
- Filtering may remove all cards from a collapsed lane; configured empty lanes
  still show their collapsible header, while non-configured empty-bucket rules
  remain unchanged.
- Selection mode and selected cards are not changed by collapsing or expanding
  a group. The action is visual only.
- The ungrouped default bucket never renders a group control.
- A status-group rail renders the styled status marker horizontally; it still
  has the leading toggle and trailing count. All non-status group rails render
  their complete labels vertically.

## Implementation Plan

### Phase 1: Persisted group collapse state and matrix semantics

**Goal:** Group bucket collapse state round-trips through board settings and is
available to every renderer.

1. ✅ Add `collapsedGroups` to the settings schema, type, defaults, parse and
   serialization tests.
2. ✅ Mark secondary-axis buckets as collapsed in `deriveBoardMatrix`.
3. ✅ Add a matrix test proving that collapsed groups retain all cells and
   tasks while exposing the collapsed bucket flag.
4. ✅ Add the `main.svelte` toggle and persistence wiring.

**Deliverable:** A reloaded board retains its group-collapse state without
changing task or grouping semantics.

**Implemented by:** Working tree (pending review).

### Phase 2: Axis-neutral desktop grid headers and rails

**Goal:** Both desktop flow directions use one collapse geometry and segmented
row headers.

1. [ ] Extract a shared rendered-axis header/rail contract from the existing
   column and group header components.
2. [ ] Render collapsed tracks as full-height rails with the ordered
   toggle/label/count flow, regardless of whether the bucket is a column or a
   group.
3. [ ] Split every row header into expanded-track segments and make the first
   segment's label sticky across horizontal scrolling.
4. [ ] Add component/manual tests for first, middle, last, and all-collapsed
   rails in both axis orientations.

**Deliverable:** An axis swap changes only bucket data, never collapse
geometry or header hierarchy.

**Implemented by:** Working tree (pending review).

### Phase 3: Mobile parity

**Goal:** The same collapsed group state has clear, usable behavior in every
layout direction.

1. [ ] Implement the same rendered-column/rendered-row typography hierarchy
   in both mobile hierarchy modes.
2. [ ] Implement group-dominant and column-dominant mobile headers/bodies.
3. [ ] Verify flow-direction changes preserve state and that ungrouped boards
   show no control.

**Deliverable:** Collapsing a group in one layout persists and renders
correctly after switching to any other layout.

**Implemented by:** Working tree (pending review).

### Phase 4: Collapsed-group drop targets and regression coverage

**Goal:** Collapsed groups retain the same safe group reassignment capability
as expanded cells.

1. [ ] Extract and test reusable group-only drop planning/execution.
2. [ ] Add collapsed-header drop targets for desktop and mobile.
3. [ ] Test file, tag-prefix, writable property, non-writable property, and
   multi-column multi-selection drops.
4. [ ] Run `npm run build` and `npm test`.

**Deliverable:** Cards can be dropped into a collapsed group without expanding
it or changing their columns.

**Implemented by:** Not yet implemented.

## Acceptance Test Matrix

| Case | Expected result |
| --- | --- |
| Collapse an active file/tag/property lane | Header and count remain; all lane cells and creation controls are hidden. |
| Expand a collapsed lane | Existing cells, task order, and controls reappear unchanged. |
| Reopen the board | Each collapsed group returns in its previous state. |
| Switch LTR ↔ TTB ↔ mobile | Same group IDs remain collapsed with the layout-specific compact presentation. |
| Collapse a group with selected cards | Selection remains intact; no task source changes. |
| Collapse first, middle, and last rendered columns | Each rail shows its complete label and leading toggle; no row-header segment covers it. |
| Column-dominant vs group-dominant collapse | The rendered-column rail has identical geometry, ordering, and control placement after the axes swap. |
| Segmented row header | Background/border continues across expanded tracks; its single label is sticky at the left across all segments. |
| Status-group rail | The marker retains task-status styling and horizontal orientation; it has a leading toggle and trailing count. |
| Non-status group rail | The complete group label is vertically oriented between the leading toggle and trailing count. |
| Drop onto collapsed file/tag/property group | Group metadata changes as it would in an expanded cell; each card retains its column. |
| Drop onto non-writable property group | No drop target is offered. |
| Collapse the Done column | Existing `hideSwimlanesWithOnlyCollapsedContent` behavior hides lanes containing only that collapsed column, with no new Done-specific logic. |
| Collapse a non-Done column | The same existing column-driven hiding behavior applies, proving the rule is general. |
| Ungrouped board | No swimlane-collapse UI appears. |
