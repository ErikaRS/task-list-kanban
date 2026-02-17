# Collapsible Columns & Task Counts

Status: COMPLETE

## Summary

This spec defines collapsible columns and task count display for the kanban board. Builds on SPEC_0005's flow direction system.

**Related issues:** 
- [#74](https://github.com/ErikaRS/task-list-kanban/issues/74) (collapse columns), 
- [#87](https://github.com/ErikaRS/task-list-kanban/issues/87) (task counts), 
- [#16](https://github.com/ErikaRS/task-list-kanban/issues/16) (general suggestions), 
- [#90](https://github.com/ErikaRS/task-list-kanban/issues/90) (drag selected tasks together)
- [#88](https://github.com/ErikaRS/task-list-kanban/issues/88) (empty columns
  not showing)

## User Requirements

1. Users can collapse/expand individual columns with a single click
2. Collapsed state persists across sessions (stored in frontmatter)
3. All columns display task count in header (expanded and collapsed)
4. Board displays total task count across all columns
5. Collapsed columns show: column name, task count, expand button
6. In horizontal flows (ltr/rtl): collapsed columns minimize width (48px)
7. In vertical flows (ttb/btt): collapsed columns minimize height (~40px)
8. Collapse/expand animates smoothly (~250ms)
9. Drag-and-drop works to collapsed columns (column stays collapsed)
10. Any column can be collapsed, including Done

## Visual Design

### Horizontal Flows (LTR/RTL)

**Expanded:**
```
┌──────────────────────┐
│ [▶] Today  2 tasks   │  ← collapse button left, count after name, menu (···) right
│ [ Done | Select ]    │
│ ┌──────────────────┐ │
│ │ ☐ Task card      │ │
│ └──────────────────┘ │
│ + Add new            │
└──────────────────────┘
Width: 200-600px (configured)
```

**Collapsed:**
```
┌──┐
│T │  ← vertical text (rotated)
│o │
│d │
│a │
│y │
│2 │  ← task count
│◀ │  ← expand button
└──┘
Width: 48px fixed
```

### Vertical Flows (TTB/BTT)

**Expanded:**
```
┌─────────────────────────────────────────────────────────┐
│ [▼] Today  2 tasks                                  ··· │
│ [ Done | Select ]                                       │
│ ┌────────────┐  ┌────────────┐                          │
│ │ Task card  │  │ Task card  │  ← cards wrap horizontal │
│ └────────────┘  └────────────┘                          │
│ + Add new                                               │
└─────────────────────────────────────────────────────────┘
```

**Collapsed:**
```
┌─────────────────────────────────────┐
│ Today                      2    [▲] │
└─────────────────────────────────────┘
Width: same as configured (maintains alignment)
Height: ~40px fixed
```

### Collapse Button Icons

Standard right/down collapse indicator (consistent across all flow directions):

| State    | Icon | Meaning                    |
|----------|------|----------------------------|
| Expanded | `▼`  | Click to collapse (hide)   |
| Collapsed| `▶`  | Click to expand (show)     |

## Task Counts

### Board Total
- Displayed above columns, right-aligned: "Total: X tasks"
- With filters active: "X of Y tasks"
- Updates in real-time

### Per-Column

| State | Format | Example |
|-------|--------|---------|
| Expanded | Full text (pluralized) | `2 tasks` / `1 task` |
| Collapsed | Just number | `2` |

## Settings Persistence

```yaml
---
kanban-plugin: {
  "collapsedColumns": ["#waiting", "#backlog"],
  ...
}
---
```

- `collapsedColumns`: Array of collapsed column tags
- Empty/missing = all expanded (default)

## Key Behaviors

### Collapse Animation
1. Width/height shrinks (depending on flow)
2. Task cards fade out
3. Column name rotates (horizontal flows only)
4. Button icon reverses direction
5. State saved to frontmatter

### Drag-and-Drop to Collapsed Column
- Drop zone highlights on drag-over
- Task moves to column, column stays collapsed
- Task count updates immediately

### Edge Cases
- **Selection mode when collapsing:** Clears selections, exits selection mode
- **Flow direction change:** Collapsed state preserved, visual adapts automatically
- **Long column names:** Truncate with ellipsis, full name in hover tooltip
- **All columns collapsed:** Allowed; collapsed columns remain visible as narrow bars/strips
- **Mobile:** Entire collapsed column is tappable to expand (48px meets touch target minimum)

## Accessibility

- `aria-expanded` on collapse/expand buttons
- `aria-label` on collapsed columns: "Today column, collapsed, 5 tasks"
- Keyboard: Tab to button, Enter/Space to activate
- Focus-visible states on buttons and collapsed columns

## Implementation Plan

### Phase 1: Data Model ✓
- Add `collapsedColumns: string[]` to settings store (`settings_store.ts` Zod schema + `defaultSettings`)
- Handle frontmatter serialization/parsing (via Zod `.default([])`, roundtrips correctly)
- Create `createCollapsedColumnsStore` in `columns.ts` returning `Readable<Set<string>>` (uses `Set<string>` not `Set<ColumnTag>` to support `DefaultColumns` without Svelte template cast issues)

### Phase 2: Task Counts & Collapse Button UI ✓
- Board total count above columns, right-aligned: "Total: X tasks" / "X of Y tasks" when any filter active
- Per-column task count displayed right of column name ("1 task" / "N tasks")
- Collapse button left of column name with directional arrow per flow (▶/◀/▼/▲); `aria-expanded` set
- "Collapse/Expand column" added to all column context menus (not just Done)
- `toggleColumnCollapse` in `main.svelte` wires button and menu item to `settingsStore.update()` + `requestSave()`; collapse state persists to frontmatter immediately

### Phase 3: Collapsed State - Horizontal Flows ✓
- Implement 48px collapsed width with CSS transitions
- Vertical text rotation for column name
- Hide task cards, mode toggle, add button when collapsed

### Phase 4: Collapsed State - Vertical Flows ✓
- Implement collapsed height with CSS transitions (height animation deferred to Phase 7 — CSS cannot transition `height: auto`)
- Keep configured width (no rotation needed)
- Horizontal layout: name + count (bare number) visible; mode toggle, divider, tasks, and ··· menu hidden

### Phase 5: Drag-and-Drop ✓
- Add drop zone highlighting to collapsed columns
- Enable task drop without auto-expanding

### Phase 6: Edge Cases ✓
- Selection mode clearing on collapse: `toggleColumnCollapse` calls `exitSelectionMode` + `clearTaskSelections` when collapsing
- Flow direction change adaptation: handled automatically by `isHorizontalCollapsed`/`isVerticalCollapsed` reactive CSS class logic
- Filter count updates: handled automatically by reactive Svelte derived stores

### Phase 7: Accessibility & Polish ✓
- `aria-label` added to `···` column menu button: "Column options for {columnTitle}"
- `aria-live="polite"` + `aria-label={taskCountLabel}` added to per-column task count span
- `aria-label="Add new task to {columnTitle}"` added to "Add new" button (disambiguates across columns for screen readers)
- All other ARIA attributes, keyboard navigation, and focus-visible states were already in place from earlier phases
- Build and tests pass

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag-drop behavior | Drop without auto-expand | Simpler, less disruptive; auto-expand can be added later if requested |
| Collapsed state storage | Per-kanban (frontmatter) | Different boards have different workflows |
| Task count format | Simple total only | "3/5" adds clutter without clear benefit |
| `collapsedColumnsStore` type | `Set<string>` not `Set<ColumnTag>` | `DefaultColumns` ("done", "uncategorised") must also be collapsible; `Set<ColumnTag>` required unsafe `as` casts in Svelte templates |
| Header element order | `[▶] Title  N tasks  ···` | Collapse button on left for quick access; count next to title for clear association; menu on far right |
| Collapse icon convention | `▶` collapsed / `▼` expanded (all flows) | Standard file-explorer triangle pattern; directional arrows (◀/▶/▲) were non-intuitive |

## Manual Test Cases

### TC-01: Basic Collapse/Expand — Horizontal Flow

Setup: board with LTR or RTL flow, at least one column with tasks.

- [x] Collapse button (`▼`) appears left of column name; task count appears right of name
- [x] Clicking `▼` collapses column to 48px wide; button changes to `▶`; column name rotates vertically; task cards hidden
- [x] Clicking `▶` expands column; button returns to `▼`; task cards reappear; animation ~250ms

### TC-02: Basic Collapse/Expand — Vertical Flow

Setup: board with TTB or BTT flow.

- [x] Clicking `▼` collapses column to ~40px height; column name, bare task count, and `▶` button remain visible
- [x] Mode toggle, task cards, "Add new" button, divider, and `···` menu are hidden when collapsed
- [x] Clicking `▶` expands column; all hidden elements reappear

### TC-03: Task Count Display

- [X] Column with 0 tasks (expanded) shows `0 tasks`
- [X] Column with 1 task (expanded) shows `1 task` (singular)
- [X] Column with 3 tasks (expanded) shows `3 tasks` (plural)
- [X] Collapsed column shows bare number only (e.g., `3`)
- [X] Task count updates immediately when a task is added or removed

### TC-04: Board Total Count

- [X] "Total: X tasks" appears above columns, right-aligned
- [X] Count updates in real-time when tasks are added or removed
- [X] With a filter active: shows "X of Y tasks" format
- [X] Removing the filter returns display to "Total: X tasks"

### TC-05: Persistence Across Sessions

- [X] Collapsing a column writes its tag to `collapsedColumns` in frontmatter
- [X] Closing and reopening the note: column is still collapsed
- [X] Expanding the column removes its tag from `collapsedColumns` in frontmatter
- [X] Closing and reopening the note: column remains expanded

### TC-07: Drag-and-Drop to Collapsed Column

- [X] Dragging a task over a collapsed column highlights the drop zone
- [X] Dropping a task onto a collapsed column moves the task there; column stays collapsed
- [X] Task count on the collapsed column updates immediately after drop
- [X] Expanding the column reveals the dropped task

### TC-08: Drag-and-Drop Selected Tasks (fixes #90)

Setup: select multiple tasks across one or more columns.

- [ ] Dragging any selected task moves all selected tasks to the target column
- [ ] Dragging selected tasks onto a collapsed column: all tasks move; column stays collapsed
- [ ] Task counts on source and target columns update correctly after the move

### TC-09: Selection Mode Clears on Collapse

- [ ] Enter selection mode in a column and select one or more tasks
- [ ] Collapsing that column exits selection mode and clears all selections
- [ ] Expanding the column shows it in normal mode with no selections

### TC-10: Flow Direction Change Preserves Collapse State

- [X] Collapse a column in LTR flow (48px wide vertical bar)
- [X] Change board flow to TTB: column remains collapsed as a horizontal strip (~40px tall)
- [X] Change back to LTR: column still collapsed as a 48px wide vertical bar

### TC-11: All Columns Collapsed

- [ ] Collapse every column on the board: all remain visible as narrow bars/strips
- [ ] Expanding one column expands only that column; others stay collapsed

### TC-12: Long Column Names

- [ ] A very long column name is truncated with ellipsis in collapsed (horizontal) state
- [ ] Hovering over the collapsed column name shows the full name in a tooltip

### TC-13: Done Column Can Be Collapsed

- [ ] Done column has the same `▼` collapse button as other columns
- [ ] Done column collapses and expands identically to other columns

### TC-14: Accessibility

- [ ] Collapse button has `aria-expanded="true"` when expanded, `"false"` when collapsed
- [ ] Collapsed column has `aria-label` reading e.g. "Today column, collapsed, 5 tasks"
- [ ] Tab to collapse button → Enter or Space toggles collapse state
- [ ] Collapse button has a visible focus ring when focused via keyboard
- [ ] `···` menu button has `aria-label` reading "Column options for {column name}"
- [ ] Task count span has `aria-live="polite"` and a descriptive `aria-label`
- [ ] "Add new" button has `aria-label` reading "Add new task to {column name}"

## Future Enhancements (Out of Scope)

- Auto-expand on hover during drag (800ms delay)
- Keyboard shortcuts (Cmd/Ctrl+Shift+C/E)
- Collapse All / Expand All buttons
- Quick peek tooltip showing first few task titles

## References

- SPEC_0005 (Column Width and Flow Direction) - dependency
- `src/ui/components/column.svelte` - column implementation
- `src/ui/main.svelte` - columns layout, `toggleColumnCollapse`, board total count
- `src/ui/settings/settings_store.ts` - settings store (`collapsedColumns` field)
- `src/ui/columns/columns.ts` - `createCollapsedColumnsStore` derived store
- `src/ui/columns/tests/columns.tests.ts` - collapsed columns store tests
- `src/ui/settings/tests/settings_store.tests.ts` - `collapsedColumns` persistence tests
