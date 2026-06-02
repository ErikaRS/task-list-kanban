Status: IN_PROGRESS

# SPEC 0021 — Group By and Swim Lanes

## Spec Status Note

This spec depends on:

- [SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md](complete/SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md)
- [SPEC_0020__IN_PROGRESS__TASK_PROPERTIES_DESIGN.md](SPEC_0020__IN_PROGRESS__TASK_PROPERTIES_DESIGN.md)

It defines grouping and swimlane behavior on top of the shared board matrix and parsed property model.

Current implementation status, as of 2026-05:

- File grouping is implemented with `groupSource: { kind: "file" }`.
- Horizontal and vertical grouped presentations are implemented through the matrix renderers.
- File swimlane drag is implemented for moving tasks between source files while preserving column placement.
- Tag prefix grouping (e.g. swimlanes based on `#Project-` tags) and tag exclusion list settings are planned/designed.
- Property grouping and grouped manual ordering remain future work.

Dependency sequencing:

- `Group by file` depends on `SPEC 0019`, but not on `SPEC 0020`.
- `Group by property` depends on `SPEC 0019` plus property parsing/key metadata from `SPEC 0020`.
- Grouped manual ordering depends on `SPEC 0019`, `SPEC 0020`'s stable task identity/manual order foundation, and this spec's grouped-cell semantics.

`SPEC 0019` is complete, so file grouping and grouped rendering can build directly on the matrix contract. Property grouping and grouped manual ordering still wait on the relevant `SPEC 0020` property/manual-order foundations.

---

## Feature Request Summary

GitHub issues reviewed for this spec:

### Partially addressed
- [#11](https://github.com/ErikaRS/task-list-kanban/issues/11) — FR: Lists grouping and sorting
  - Sorting infrastructure belongs to `SPEC 0020`; this spec covers grouping.
- [#81](https://github.com/ErikaRS/task-list-kanban/issues/81) — FR: Add Horizontal Swimlanes to Kanban Board
  - This spec covers grouped swimlane-style layout, but not cross-group property editing or collapsible swimlanes.
- [#136](https://github.com/ErikaRS/task-list-kanban/issues/136) — FR: Support group by Tag prefix
  - This spec covers grouping by tag prefix, cross-swimlane drag for tag prefixes, and the accompanying tag exclusion list.

Scope notes:

- This spec covers grouping by file first, then by tag prefix, and then by parsed property after property metadata exists.
- This spec covers swimlane-style presentation through the board-matrix renderers.
- This spec covers cross-file drag for file swimlanes and cross-tag drag for tag prefix swimlanes.
- This spec does not cover cross-group drag that edits an underlying parsed property value.
- This spec does not cover collapsible swimlane sections.

---

## User Requirements

1. The user can enable grouping by file, by a tag prefix, or by a parsed property key.
2. Grouping should use the same semantic group buckets regardless of flow direction.
3. Every primary bucket should render every group bucket, including empty ones.
4. Horizontal flows should present grouping as swimlane-like rows across the board.
5. Vertical flows should present the same grouping semantics using repeated local section headers inside each stacked primary bucket.
6. Grouping should compose with property sort and manual ordering.
7. The user can configure a tag exclusion list to omit specific tags from task card displays and the consolidated tag footer.
8. The user can automatically populate the tag exclusion list with all tags matching column names via a settings button.

---

## High-Level Design

### Group Source

```typescript
type GroupSource =
  | { kind: "none" }
  | { kind: "file" }
  | { kind: "tag-prefix"; prefix?: string }
  | { kind: "property"; key: string };
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
- file buckets are sorted by vault-relative path
- tag-prefix buckets (with or without a prefix) are matched case-insensitively, sorted alphabetically by their label, with the "Unassigned" bucket always last
- future property buckets are sorted by typed comparator with null last
- materialized even when a given primary bucket has no tasks in that group

#### Tag Prefix Group Buckets Detail
- **Matching with Prefix**: For a `tag-prefix` group source with prefix `Project-`, tasks are matched by tags starting with `#Project-` (case-insensitive).
- **Matching without Prefix (Empty Prefix)**: If no prefix is specified (or is empty), the group source matches *all* tags present on tasks in the board scope, *except* for tags listed in the `excludedTags` setting.
- **Label & Value**:
  - *With Prefix*: The bucket label is the suffix of the tag following the prefix (e.g. `#Project-Alpha` -> label is `Alpha`). Suffixes are displayed as-is (preserving case) but compared case-insensitively for sorting.
  - *Without Prefix*: The bucket label is the full tag name as-is (e.g. `#Active` -> label is `Active`).
- **Multiple Matches**:
  - *With Prefix*: If a task has multiple tags starting with the prefix, it determines the bucket using the first matching tag.
  - *Without Prefix*: If a task has multiple non-excluded tags, it is mapped to the bucket of its first non-excluded tag by alphabetical order.
- **Unassigned Bucket**: Tasks that do not contain any matching tag are assigned to an unassigned bucket with ID `tag-prefix:unassigned` and label `Unassigned`.

### Tag Exclusion List

To prevent tags that serve structural purposes (such as column mapping or swimlane grouping) from cluttering task cards, a tag exclusion list setting is supported:

- **Setting**: `excludedTags: string[]` stores a list of tags (without the leading `#` character).
- **Display**: Any tag in `excludedTags` is filtered out of `task.tags` and omitted from the consolidated tag footer. It is also stripped from card text content when `consolidateTags = true` or when matching the active column.
- **Autopopulate Button**: A button in settings titled "Exclude column tags" automatically adds all tags currently mapped to columns in `settings.columns` to the `excludedTags` list.

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
Grouping & Swimlanes
Group by:      [ (none) ▼ ]
               (none) / By file / By tag / [future parsed property keys]

  [if Group by == By tag]
  Tag prefix:  [ e.g., Project- (Optional) ]
               (Leave empty to group by all tags except excluded)

Tag Exclusion List
Excluded tags: [ Tag inputs or text box ]
               [ Exclude column tags button ]
```

Behavior:

- `By file` and `By tag prefix` are available regardless of property schema
- property-key choices are future work and depend on parsed property availability from `SPEC 0020`
- `Exclude column tags` button scans current column definitions and adds their match tags to the exclusion list
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

Empty grouped cells render compactly:

- no card-sized placeholder
- no fake drop-zone padding
- a cell can still expose add/drop controls when the primary bucket supports them
- compact empty-state behavior in both renderers

### Special Columns

Done, uncategorised, and archived columns participate in grouping the same way as regular primary buckets. Grouping does not override their existing visibility rules.

### Manual Ordering in Grouped Mode

When grouping is on and manual ordering is enabled:

- ordering is stored per `(group bucket, primary bucket)` cell
- switching between grouped and ungrouped views does not change task identity
- grouped manual ordering extends, rather than replaces, the block-link identity model from `SPEC 0020`

### File Swimlane Drag

When grouping by file, dropping tasks into another file swimlane moves those tasks into the destination source file and applies the target primary bucket's column placement. Dropping within the same file swimlane but into another primary bucket applies only the column change.

### Tag Prefix Swimlane Drag

When grouping by tag prefix, dropping tasks into another tag prefix swimlane moves those tasks into that destination group. This performs a tag write-back on the task:

- **With Prefix**:
  1. Identify any existing tag on the task starting with the prefix (case-insensitive) and remove it.
  2. Add the new tag matching the destination swimlane prefix + suffix (e.g. if the prefix is `Project-` and the destination swimlane is `Beta`, add the tag `#Project-Beta` to the task).
  3. Dropping into the `Unassigned` swimlane removes any tags starting with the prefix from the task.

- **Without Prefix (Empty Prefix)**:
  1. Identify the tag corresponding to the source swimlane (e.g. if dragging from `Home` to `Errand`, identify `Home`) and remove it from the task.
  2. Add the new tag corresponding to the destination swimlane (e.g. add `#Errand` to the task).
  3. Dropping into the `Unassigned` swimlane removes all non-excluded tags from the task.

In both cases:
- If dragged to a different column as well, apply the column's status/tag changes simultaneously.
- Dropping within the same tag prefix swimlane but into another column applies only the column change.

This behavior is implemented for file and tag prefix grouping. Property swimlane drag that writes back a parsed property remains out of scope until property parsing/write-back semantics exist.

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
      BoardCell.svelte
    tasks/
      task_grouping.ts
    settings/
      settings_store.ts
      settings.ts
    components/
      ColumnHeader.svelte
      task.svelte
    main.svelte
```

---

## Implementation Plan

### Phase 1: Group By File ✅ COMPLETE
**Goal:** Add grouping state and derive matrix secondary-axis buckets for files first.

1. ✅ Add `groupSource` to settings
2. ✅ Implement `GroupSource` and `GroupBucket`
3. ✅ Derive file group buckets from all visible tasks
4. ✅ Feed file buckets into the matrix secondary axis
5. ✅ Validate empty-cell materialization with `group by file`

**Deliverable:** The matrix can be grouped by file without depending on property parsing.

**Implemented by:** [07d2c58](https://github.com/ErikaRS/task-list-kanban/commit/07d2c58), [83a079b](https://github.com/ErikaRS/task-list-kanban/commit/83a079b)

### Phase 2: Property Grouping
**Goal:** Add grouping by parsed property keys after `SPEC 0020` property parsing is available.

1. [ ] Populate property group choices from parsed property metadata
2. [ ] Derive property group buckets from all visible tasks
3. [ ] Sort property buckets with the typed comparator from `SPEC 0020`
4. [ ] Preserve null/missing-property buckets last

**Deliverable:** The matrix can be grouped by file or by a parsed property.

### Phase 3: Horizontal Swimlanes ✅ COMPLETE
**Goal:** Render grouped horizontal flows as swimlane-style rows.

1. ✅ Feed group buckets into the horizontal matrix renderer
2. ✅ Render board-wide swimlane rows with a compact vertical lane-label rail
3. ✅ Preserve empty grouped cells compactly
4. ✅ Keep primary column headers sticky during vertical scrolling
5. ✅ Keep collapsed column headers aligned and sticky

**Deliverable:** Horizontal grouped boards render as swimlane-style rows.

**Implemented by:** [07d2c58](https://github.com/ErikaRS/task-list-kanban/commit/07d2c58), [73df26b](https://github.com/ErikaRS/task-list-kanban/commit/73df26b), [6d4ede4](https://github.com/ErikaRS/task-list-kanban/commit/6d4ede4)

### Phase 4: Vertical Grouped Presentation ✅ COMPLETE
**Goal:** Render the same grouping semantics in vertical flows.

1. ✅ Feed the same group buckets into the vertical matrix renderer
2. ✅ Render repeated local group headers inside each stacked primary bucket
3. ✅ Verify flow switches change presentation only

**Deliverable:** Grouping works in all flow directions.

**Implemented by:** [07d2c58](https://github.com/ErikaRS/task-list-kanban/commit/07d2c58), [83a079b](https://github.com/ErikaRS/task-list-kanban/commit/83a079b)

### Phase 4.5: File Swimlane Drag ✅ COMPLETE
**Goal:** User can move tasks between file swimlanes by drag and drop.

1. ✅ Detect file-backed swimlane drop targets
2. ✅ Move dropped tasks to the destination file when the source file differs
3. ✅ Apply target column placement during the file move
4. ✅ Keep same-file swimlane drops as normal column changes

**Deliverable:** File swimlane drag moves tasks between files and columns.

**Implemented by:** [07d2c58](https://github.com/ErikaRS/task-list-kanban/commit/07d2c58), [b2b0928](https://github.com/ErikaRS/task-list-kanban/commit/b2b0928)

### Phase 4.6: Tag Prefix Grouping & Exclusions
**Goal:** Group tasks by tag (with optional prefix) and hide specified tags.

1. [ ] Add `tag-prefix` kind to `GroupSource` setting in `settings_store.ts`, with optional `prefix`.
2. [ ] Extend `deriveGroupBuckets` in `task_grouping.ts` to support tag prefix grouping (and empty prefix general tag grouping), extracting labels and sorting with unassigned last.
3. [ ] Update `taskBelongsToGroup` in `task_grouping.ts` for tag prefix grouping (with and without prefix).
4. [ ] Implement tag prefix/general swimlane drag and drop: strip source tag and add new destination tag on drop.
5. [ ] Add `excludedTags: string[]` to settings store and `settings.ts`.
6. [ ] Implement filtering of `excludedTags` from task card tags and strip them from task content.
7. [ ] Add "Exclude column tags" button to settings page to autopopulate `excludedTags`.
8. [ ] Test: Verify tag prefix and empty prefix swimlanes display correctly, drag updates tags, and excluded tags are hidden.

**Deliverable:** Kanban board supports tag prefix swimlanes with cross-swimlane drag, and tag exclusions.

### Phase 5: Grouped Manual Ordering
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
