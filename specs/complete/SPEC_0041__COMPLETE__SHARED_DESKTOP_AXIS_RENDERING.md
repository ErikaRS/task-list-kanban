# SPEC 0041 — Shared Desktop Axis Rendering

Status: COMPLETE
Implemented: 2026-09

## Feature Request Summary

Make desktop rendering an axis-neutral two-level hierarchy. Category-dominant
and group-dominant flow share grid geometry, sticky behavior, collapse rules,
and visual hierarchy. Semantic differences are confined to header content and
category accents. This is the completed prerequisite for
[#165](https://github.com/ErikaRS/task-list-kanban/issues/165), whose remaining
group-collapse work is tracked in [SPEC 0040](../SPEC_0040__IN_PROGRESS__COLLAPSIBLE_SWIMLANES.md).

## User Requirements

1. LTR/RTL project categories as visual columns and groups as visual rows;
   TTB/BTT swap those roles. Existing semantic ordering controls remain intact.
2. Both projections use identical tracks, row bands, sticky containment,
   stacking, dividers, and collapsed-track rules.
3. Every visual intersection resolves to canonical category/group IDs before
   task creation, drag/drop, selection, manual ordering, or task writes.
4. Category colors, matching subtitles, and actions remain semantic header
   content. Group labels and status markers remain semantic header content.
   Typography and surfaces depend on visual role, not semantic kind.
5. Mobile remains a separate list hierarchy.

## High-Level Design

The canonical matrix remains `cells[primaryId][secondaryId]`, with categories
on `primaryAxis` and groups on `secondaryAxis`. `desktop_matrix_projection.ts`
selects the visual axes, determines whether each axis has meaningful labels,
and resolves visual intersections to their canonical buckets and cells.

The component boundaries are:

| Component | Responsibility |
| --- | --- |
| `board_matrix_desktop.svelte` | Connect projection, aggregated category tasks, adapters, and canonical `BoardCell` inputs |
| `DesktopMatrixGrid.svelte` | Shared tracks, summary, column header band, row sections, sticky surfaces, collapse geometry, typography tokens |
| `DesktopAxisHeader.svelte` | Category actions via `ColumnHeader`, or group/status labels via `GroupLabel` |
| `ColumnHeader.svelte` | Category controls, subtitles, counts, selection, and left-side row accent |
| Column decoration slot | Full-track category accent independent of horizontally sticky content |

The grid does not branch on flow or semantic kind. Column-header bands and row
sections inherit the same CSS grid tracks through subgrid. Each row owns one
continuous band across all columns, including folded gutters. There is no
leading label track, per-cell header fill, duplicate footer, or special rail.

## Detailed Behavior

### Geometry and collapse

- Expanded visual columns use the configured width. Folded visual columns use
  one shared 28px width for their track and neutral toggle lane.
- Category collapse state remains semantic and survives flow changes.
- Folded columns preserve their color bar, visible count, and named keyboard
  expand control. Their controls occupy only the top header band.
- A collapsed visual row keeps its compact header and omits body cells.
- Empty rows remain represented, including their labels and valid creation or
  drop intersections. `hideSwimlanesWithOnlyCollapsedContent` remains unchanged.
- Only the synthetic bucket with group source `none` is label-less. Unassigned
  and empty file-group buckets have meaningful visible headers.

### Scrolling and layering

The opaque layers, from highest to lowest, are board total, visual-column
headers, visual-row bands, and cell content. Measured header heights determine
sticky offsets. The total remains visible while scrolling both axes.

A row's label and full-width background stick while its body remains active,
then leave with that row underneath the column headers. Column header content
can stick horizontally within its own track. Category color bars fill the
entire column frame rather than shrinking to the label width. Row bands cross
folded gutters continuously.

### Selected visual hierarchy

User-selected styling combines the compactness of exploration C with the
shared gray surfaces of exploration B:

- Both header levels use the theme's opaque secondary background.
- Visual-column labels are compact semibold text.
- Visual-row labels are smaller, uppercase, and letter-spaced, regardless of
  whether they represent a category or group.
- Category row controls, subtitles, and counts align left and share one compact
  line when space permits, wrapping on narrower boards.
- Category accents stay above visual columns and on the left of visual rows.
- Group status markers preserve their existing presentation and accessible names.

### Semantic invariants

The refactor does not alter saved settings, task mutations, filtering, group
assignment, manual-order keys, or selection behavior. `BoardCell` receives the
original canonical buckets/cell and retains its existing content-flow input.
Group collapse persistence and group-only collapsed-header drop targets are
not implemented here; they remain SPEC 0040 work.

## Implementation Plan

### Phase 1: Axis-neutral projection contract ✅ COMPLETE

**Goal:** Both projections resolve to the same canonical cells.

1. ✅ Preserve the semantic matrix and introduce the display projection.
2. ✅ Cover axis mapping, ordering, and canonical cell identity in unit tests.
3. ✅ Route all desktop flows through one renderer; remove the old renderers.

**Deliverable:** Desktop flow does not change task-action identity.

**Implemented by:** [2e791da](https://github.com/ErikaRS/task-list-kanban/commit/2e791da) (Refs #165).

### Phase 2: Unified grid geometry ✅ COMPLETE

**Goal:** Shared frames own geometry and semantic adapters own content.

1. ✅ Implement continuous row bands without a phantom label track.
2. ✅ Implement opaque sticky layers and a persistent board total.
3. ✅ Reuse folded-column and collapsed-row geometry across visual roles.
4. ✅ Preserve category accents, counts, controls, group/status labels, and
   user-selected compact visual-role typography.

**Deliverable:** Axis swapping changes projected content, not grid structure.

**Implemented by:** [2e791da](https://github.com/ErikaRS/task-list-kanban/commit/2e791da) (Refs #165).

### Phase 3: Regression verification ✅ COMPLETE

**Goal:** Validate the shared renderer and remove transitional code.

1. ✅ Unit tests cover both mappings, canonical cell identity, collapsed roles,
   ordered empty intersections, and grouped versus ungrouped default labels.
2. ✅ User performed manual testing and confirmed completion on 2026-09-18,
   following the screenshot-driven fixes for compactness, counts, colors,
   header hierarchy, and scrolling. This is user validation, not automated
   browser verification.
3. ✅ Build (TypeScript, Svelte checks, production bundle) and full Vitest suite
   pass after cleanup.
4. ✅ Remove unused orientation/compact header branches and consolidate folded
   styling; retain the reviewed appearance and mobile list behavior.

**Deliverable:** Validated shared desktop rendering, ready for SPEC 0040.

**Implemented by:** [2e791da](https://github.com/ErikaRS/task-list-kanban/commit/2e791da) (Refs #165).
