Status: COMPLETE
Implemented: 2026-05

# SPEC 0019 — Board Matrix Rendering Architecture

## Feature Request Summary

This spec defines a rendering architecture for showing the task board as a flow-agnostic 2D matrix. It exists to support current and planned work on:

- property-based grouping
- manual ordering within grouped cells
- flow-direction-specific presentation without changing task/group/order semantics

It does not define property parsing rules, property schemas, group/sort settings, or user-facing grouping behavior. Those belong in dependent feature specs.

This spec can be implemented either before or after the first phases of `SPEC 0020`. Property parsing, property display, and column-local property sorting do not require the matrix renderer. The matrix becomes the prerequisite when implementing grouping/swimlane presentation and grouped-cell ordering.

---

## User Requirements

1. The board should have one flow-agnostic internal representation whether the user is in `LTR`, `RTL`, `TTB`, or `BTT`.
2. Grouping and ordering semantics should not change when flow direction changes; only presentation should change.
3. Ungrouped boards should use the same rendering architecture as grouped boards, not a separate data model.
4. The rendering architecture should support:
   - ungrouped columns
   - grouped columns
   - manual ordering within a rendered cell
   - future layout variations without redefining board semantics
5. Styling concerns such as sticky headers, section dividers, and repeated local headers should be renderer concerns, not model concerns.

---

## High-Level Design

### Core Principle

The board is a 2D matrix of task cells.

- The **primary axis** is the board's column axis.
- The **secondary axis** is the grouping axis.
- A **cell** is the intersection of one primary bucket and one secondary bucket.

Ungrouped mode is represented as a matrix with a single secondary bucket.

This means:
- grouping is not a special board mode with a separate data model
- flow direction does not affect task grouping, sorting, or ordering
- renderers consume the same matrix and choose how to display it

### Board Matrix View Model

```typescript
type PrimaryBucketId = string;   // column tag or built-in column id
type SecondaryBucketId = string; // group bucket id, "__default__" when ungrouped

interface BoardMatrix {
  primaryAxis: AxisBucket[];
  secondaryAxis: AxisBucket[];
  cells: Record<PrimaryBucketId, Record<SecondaryBucketId, BoardCell>>;
}

interface AxisBucket {
  id: string;
  label: string;
  kind: "column" | "group";
  collapsed?: boolean;
  meta?: {
    color?: string;
    value?: string | number | Date | null;
    isDefault?: boolean;
  };
}

interface BoardCell {
  primaryId: PrimaryBucketId;
  secondaryId: SecondaryBucketId;
  tasks: Task[];
  isEmpty: boolean;
}
```

### Derivation Pipeline

The matrix is derived in this order:

1. Start from filtered tasks.
2. Partition tasks by primary axis bucket.
3. Resolve secondary axis buckets from a supplied secondary-axis provider.
   - Ungrouped mode uses a built-in default provider with one `__default__` bucket.
   - Grouping specs can later supply file/property group buckets without changing the matrix shape.
4. Materialize every `(primary, secondary)` cell, including empty cells.
5. Apply the supplied in-cell ordering function.

The output of this pipeline is independent of flow direction.

### Renderer Layer

Renderers sit above `BoardMatrix` and map the same matrix to different DOM structures.

#### Horizontal Renderer

Used for `LTR` / `RTL`.

- primary axis rendered as board columns
- secondary axis rendered as board rows
- may use spanning row dividers across all primary buckets
- may use sticky board-level column headers

#### Vertical Renderer

Used for `TTB` / `BTT`.

- primary axis rendered as stacked columns
- secondary axis rendered as repeated grouped sections inside each stacked column
- does not require spanning row dividers
- can keep column headers in normal per-column position

These two renderers share:
- `BoardMatrix`
- `AxisBucket`
- `BoardCell`
- the cell task-list component
- ordering semantics

They differ only in DOM structure and CSS.

---

## Styling Implications

### Shared Styling Tokens

The matrix architecture should standardize board-level CSS variables so renderer styling is consistent:

```css
--board-axis-gap
--board-primary-track-size
--board-secondary-header-size
--board-cell-padding
--board-divider-color
--board-sticky-header-offset
```

These tokens define spacing and sizing at the renderer boundary rather than inside task/group logic.

### Horizontal Styling

The horizontal renderer will likely use CSS Grid:

- primary axis controls track count/width
- secondary axis controls row sequence
- shared row dividers can span `grid-column: 1 / -1`
- sticky primary headers belong to the renderer, not the model

### Vertical Styling

The vertical renderer will likely use stacked flex/column layouts:

- each primary bucket renders as its own stacked section
- each secondary bucket header is repeated locally
- empty grouped sections should remain compact
- no attempt should be made to fake spanning dividers across stacked columns

### Styling Rule

Renderer CSS may express the same semantics differently. The architecture should not attempt to force identical DOM for all flows just to reuse selectors. Shared semantics are more important than shared markup.

---

## Component Architecture

```text
filtered tasks
  -> board_matrix.ts
  -> BoardMatrix
  -> renderer selection in main.svelte
     -> board_matrix_horizontal.svelte
     -> board_matrix_vertical.svelte
        -> board_cell.svelte / task_list.svelte
```

Recommended responsibilities:

- `board_matrix.ts`
  Derive `BoardMatrix`, `AxisBucket[]`, and `BoardCell`s from tasks + settings.
- `board_matrix_horizontal.svelte`
  Render matrix for `LTR` / `RTL`.
- `board_matrix_vertical.svelte`
  Render matrix for `TTB` / `BTT`.
- `task_list.svelte`
  Render the ordered tasks for a single cell.
- `column_header.svelte`
  Render a primary-axis bucket header where needed.

The renderer selection point should be top-level. Child components should not branch on flow direction unless the component is explicitly renderer-specific.

---

## Detailed Behavior

### Ungrouped Mode

When grouping is off:

- `secondaryAxis` contains exactly one default bucket
- every primary bucket has exactly one rendered cell
- renderers still consume `BoardMatrix`

This removes the need for a separate ungrouped data path.

### Non-Default Secondary Axes

When a later grouping feature supplies a non-default secondary axis:

- `secondaryAxis` contains all group buckets in sorted order
- every primary bucket renders every secondary bucket
- empty cells are materialized even when they contain no tasks

This spec should validate non-default secondary axes with a small test-only partitioner or fixture data, not with user-facing grouping settings. Real `group by file` behavior belongs to `SPEC 0021`.

`SPEC 0021` should use `group by file` as its first end-to-end grouped-board validation because it exercises the matrix independently of property parsing.

### Ordering

Ordering is always applied within a single cell.

This means the ordering layer receives:

- `primaryId`
- `secondaryId`
- the unordered task set for that cell

and returns the final ordered task list for that cell.

### Flow Direction

Flow direction does not change:

- group derivation
- ordering keys
- task membership in cells
- bucket identities

Flow direction only changes:

- which renderer is selected
- axis presentation
- header placement
- divider presentation

---

## File Structure

```text
src/
  ui/
    board/
      board_matrix.ts                 [new] — flow-agnostic matrix derivation
      board_matrix_horizontal.svelte  [new] — horizontal renderer (CSS Grid)
      board_matrix_vertical.svelte    [new] — vertical renderer (vertical flex)
      BoardCell.svelte                [new] — cell wrapper binding drag-and-drop at the cell level
    components/
      ColumnHeader.svelte             [new/extracted] — reusable primary-axis header component
    main.svelte                      [changed] — selects renderer from flow direction
```

---

## Implementation Plan

### Phase 0: Reusable ColumnHeader Extraction ✅ COMPLETE
**Goal:** Extract column header logic and markup out of the legacy `column.svelte` into a reusable, standalone Svelte component.

1. ✅ Create `ColumnHeader.svelte` in `src/ui/components/`
2. ✅ Extract column title, task counts, collapse triggers, Done/Select mode toggles, and column menu
3. ✅ Integrate `<ColumnHeader>` back into `column.svelte` to verify zero regression
4. ✅ Run all automated tests to ensure no functional changes

**Deliverable:** A highly reusable column header component, preparing the codebase for clean 2D matrix rendering.

### Phase 1: Matrix Derivation ✅ COMPLETE
**Goal:** Introduce a flow-agnostic board matrix without changing visible behavior.

1. ✅ Create `board_matrix.ts` with `BoardMatrix`, `AxisBucket`, and `BoardCell` types
2. ✅ Derive the matrix from the current ungrouped board state using a single default secondary bucket (`__default__`)
3. ✅ Ensure matrix materializes empty cell elements explicitly to guarantee DOM grid alignment
4. ✅ Add unit tests for:
   - ungrouped matrix derivation
   - non-default secondary-axis derivation using a test fixture/provider
   - empty-cell materialization
   - primary/secondary bucket ordering

**Deliverable:** The board can compute a matrix view model even before new renderers are introduced.

### Phase 2: Horizontal Renderer ✅ COMPLETE
**Goal:** Render the existing horizontal board from `BoardMatrix`.

1. ✅ Implement `board_matrix_horizontal.svelte` using a CSS Grid layout
2. ✅ Apply `columnWidth` from settings as the grid column track size, allowing horizontal container scroll if width exceeds viewport
3. ✅ Implement `BoardCell.svelte` as the drag-and-drop event listener target for clean swimlane drop zones
4. ✅ Keep visible behavior aligned with the existing horizontal board
5. ✅ Validate the renderer first with ungrouped mode and fixture-driven non-default secondary buckets before layering on user-facing grouping

**Deliverable:** Horizontal flows render from `BoardMatrix` rather than ad hoc column/group structures.

### Phase 3: Vertical Renderer ✅ COMPLETE
**Goal:** Render vertical flows from the same matrix.

1. ✅ Implement `board_matrix_vertical.svelte` using vertical flexbox column stack
2. ✅ Render row/swimlane sections as repeated local headers inside each stacked primary bucket
3. ✅ Verify switching flow directions changes presentation only
4. ✅ Remove deprecated legacy `column.svelte` component

**Deliverable:** All flow directions render from the same matrix model.

---

## Architectural Concerns

### 1. Avoid Layout Logic in the Matrix

`BoardMatrix` should not contain renderer hints like "spanning divider" or "sticky header row". Those are renderer concerns.

### 2. Avoid One Hyper-Generic Renderer

A single renderer with many conditionals will likely be harder to maintain than two renderer-specific components consuming the same matrix.

### 3. Preserve DOM Simplicity per Renderer

The architecture should unify semantics, not force identical markup. Horizontal and vertical renderers should use the DOM that best fits each layout.

---

## Relationship to Dependent Specs

Feature specs that depend on board presentation should be revised to consume `BoardMatrix` rather than inventing their own layout model.

In particular, grouping specs should consume the matrix contract rather than define their own renderer shape.

The preferred first integration target for a grouping feature is `group by file`, but that belongs to `SPEC 0021`, not this renderer architecture spec.
