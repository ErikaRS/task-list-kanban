Status: IN_PROGRESS

# SPEC 0021 — Group By and Swim Lanes

## Spec Status Note

This spec depends on:

- [SPEC_0019__IN_PROGRESS__BOARD_MATRIX_RENDERING.md](/Users/erikars/Code/task-list-kanban/worktrees/spec-19-review/specs/SPEC_0019__IN_PROGRESS__BOARD_MATRIX_RENDERING.md)
- [SPEC_0020__IN_PROGRESS__TASK_PROPERTIES_DESIGN.md](/Users/erikars/Code/task-list-kanban/worktrees/spec-19-review/specs/SPEC_0020__IN_PROGRESS__TASK_PROPERTIES_DESIGN.md)

It defines grouping and swimlane behavior on top of the shared board matrix and parsed property model.

---

## Feature Request Summary

GitHub issues reviewed for this spec:

### Partially addressed
- [#11](https://github.com/ErikaRS/task-list-kanban/issues/11) — FR: Lists grouping and sorting
  - Sorting infrastructure belongs to `SPEC 0020`; this spec covers grouping.
- [#81](https://github.com/ErikaRS/task-list-kanban/issues/81) — FR: Add Horizontal Swimlanes to Kanban Board
  - This spec covers grouped swimlane-style layout, but not cross-group property editing or collapsible swimlanes.

Scope notes:

- This spec covers grouping by file or parsed property.
- This spec covers swimlane-style presentation through the board-matrix renderers.
- This spec does not cover cross-group drag that edits the underlying property value.
- This spec does not cover collapsible swimlane sections.

---

## User Requirements

1. The user can enable grouping by file or by a parsed property key.
2. Grouping should use the same semantic group buckets regardless of flow direction.
3. Every primary bucket should render every group bucket, including empty ones.
4. Horizontal flows should present grouping as swimlane-like rows across the board.
5. Vertical flows should present the same grouping semantics using repeated local section headers inside each stacked primary bucket.
6. Grouping should compose with property sort and manual ordering.

---

## High-Level Design

### Group Source

```typescript
type GroupSource =
  | { kind: "property"; key: string }
  | { kind: "file" };
```

Grouping populates the matrix secondary axis defined in `SPEC 0019`.

### Group Buckets

```typescript
interface GroupBucket {
  id: string; // stable internal id
  label: string; // user-facing label
  value: string | number | Date | null;
  source: GroupSource;
}
```

Rules:

- derived from all tasks in the current board scope
- sorted by typed comparator with null last
- materialized even when a given primary bucket has no tasks in that group

The preferred first validation case is `group by file`, because it exercises grouping independently of property parsing complexity.

### Swimlanes

In this spec, "swimlanes" means grouped board presentation:

- in horizontal renderers, group buckets appear as board-wide row sections
- in vertical renderers, the same group buckets appear as repeated local sections inside each stacked primary bucket

The term does not imply property editing by drag. That remains out of scope.

### Ordering Interaction

Ordering always applies within a single matrix cell.

- property sort from `SPEC 0020` applies within each `(primary, secondary)` cell
- manual ordering extends `SPEC 0020` from column-local order to grouped-cell-local order

Grouped manual order storage becomes:

```typescript
type ManualOrderKey = string; // from SPEC 0020
type GroupBucketId = string;
type ManualOrderStore = Record<GroupBucketId, Record<string, ManualOrderKey[]>>;
```

This spec owns that extension because grouped ordering depends on grouping semantics.

---

## Settings UI

```text
Grouping
Group by: [ (none) ▼ ]
          (none) / By file / [parsed property keys]
```

Behavior:

- `By file` available regardless of property schema
- property-key choices depend on parsed property availability from `SPEC 0020`
- changing flow direction changes grouped presentation, not the grouping setting itself

---

## Detailed Behavior

### Global Group Bucket Derivation

The set of group buckets is derived from all visible tasks, not from a single primary bucket.

This ensures:

- aligned group order across the board
- deterministic empty-cell materialization
- stable semantics when switching flow direction

### Empty Sections

Empty grouped sections render header-only treatment:

- no card-sized placeholder
- no fake drop-zone padding
- compact empty-state behavior in both renderers

### Special Columns

Done, uncategorised, and archived columns participate in grouping the same way as regular primary buckets. Grouping does not override their existing visibility rules.

### Manual Ordering in Grouped Mode

When grouping is on and manual ordering is enabled:

- ordering is stored per `(group bucket, primary bucket)` cell
- switching between grouped and ungrouped views does not change task identity
- grouped manual ordering extends, rather than replaces, the block-link identity model from `SPEC 0020`

### Flow Direction

Flow direction changes renderer choice only:

- `LTR` / `RTL` -> horizontal grouped renderer
- `TTB` / `BTT` -> vertical grouped renderer

It does not change:

- group derivation
- group-bucket identity
- per-cell membership
- in-cell ordering semantics

---

## File Structure

```text
src/
  ui/
    board/
      board_matrix.ts
      board_matrix_horizontal.svelte
      board_matrix_vertical.svelte
    tasks/
      task_grouping.ts
      manual_order.ts
    settings/
      settings_store.ts
      settings.ts
    components/
      column_header.svelte
      task_list.svelte
    main.svelte
```

---

## Implementation Plan

### Phase 1: Grouping Semantics
**Goal:** Add grouping state and derive matrix secondary-axis buckets.

1. [ ] Add `groupSource` to settings
2. [ ] Implement `GroupSource` and `GroupBucket`
3. [ ] Derive group buckets from all visible tasks
4. [ ] Validate first with `group by file`

**Deliverable:** The matrix can be grouped by file or property.

### Phase 2: Horizontal Swimlanes
**Goal:** Render grouped horizontal flows as swimlane-style rows.

1. [ ] Feed group buckets into the horizontal matrix renderer
2. [ ] Render board-wide row sections / dividers
3. [ ] Preserve empty grouped sections compactly

**Deliverable:** Horizontal grouped boards render as swimlane-style rows.

### Phase 3: Vertical Grouped Presentation
**Goal:** Render the same grouping semantics in vertical flows.

1. [ ] Feed the same group buckets into the vertical matrix renderer
2. [ ] Render repeated local group headers inside each stacked primary bucket
3. [ ] Verify flow switches change presentation only

**Deliverable:** Grouping works in all flow directions.

### Phase 4: Grouped Manual Ordering
**Goal:** Extend manual ordering from columns to grouped cells.

1. [ ] Extend `ManualOrderStore` to nested grouped-cell storage
2. [ ] Migrate ungrouped storage into the default group bucket as needed
3. [ ] Apply manual order within each grouped cell
4. [ ] Prune stale grouped entries on task removal or regrouping

**Deliverable:** Manual ordering works inside grouped cells.

---

## Architectural Concerns

### 1. Do Not Re-encode Layout in Group Derivation

Group derivation should produce semantic buckets only. Renderer details belong to `SPEC 0019`.

### 2. Keep Grouping Dependent on Parsed Properties, Not Parsing Logic

This spec should consume parsed properties from `SPEC 0020`, not define parsing itself.

### 3. Keep Swimlane Interaction Scope Tight

Cross-group drag that edits property values and collapsible group sections should remain separate follow-up work.

---

## Open Questions / Future Considerations

- collapsible swimlane sections
- cross-group drag that edits the underlying property
- manual group ordering
- grouped bulk actions
