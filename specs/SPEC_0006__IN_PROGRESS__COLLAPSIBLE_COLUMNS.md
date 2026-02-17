# Collapsible Columns & Task Counts

Status: IN_PROGRESS

## Summary

This spec defines collapsible columns and task count display for the kanban board. Builds on SPEC_0005's flow direction system.

**Related issues:** [#74](https://github.com/ErikaRS/task-list-kanban/issues/74) (collapse columns), [#87](https://github.com/ErikaRS/task-list-kanban/issues/87) (task counts), [#16](https://github.com/ErikaRS/task-list-kanban/issues/16) (general suggestions)

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

| Flow | Collapse | Expand |
|------|----------|--------|
| LTR  | `▶`      | `◀`    |
| RTL  | `◀`      | `▶`    |
| TTB  | `▼`      | `▲`    |
| BTT  | `▲`      | `▼`    |

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

### Phase 1: Data Model
- Add `collapsedColumns: string[]` to settings store
- Handle frontmatter serialization/parsing
- Create derived state for per-column collapsed status

### Phase 2: Task Counts & Collapse Button UI ✓
- Add board total count component (above columns, right-aligned)
- Add task count to column headers
- Add collapse button to column headers (directional chevron)
- Add "Collapse column" to column context menu

### Phase 3: Collapsed State - Horizontal Flows
- Implement 48px collapsed width with CSS transitions
- Vertical text rotation for column name
- Hide task cards, mode toggle, add button when collapsed

### Phase 4: Collapsed State - Vertical Flows
- Implement 40px collapsed height with CSS transitions
- Keep configured width (no rotation needed)
- Horizontal layout: name + count + expand button

### Phase 5: Drag-and-Drop
- Add drop zone highlighting to collapsed columns
- Enable task drop without auto-expanding

### Phase 6: Edge Cases
- Selection mode clearing on collapse
- Flow direction change adaptation
- Filter count updates

### Phase 7: Accessibility & Polish
- ARIA attributes
- Keyboard navigation
- Screen reader announcements
- Run build and tests

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag-drop behavior | Drop without auto-expand | Simpler, less disruptive; auto-expand can be added later if requested |
| Collapsed state storage | Per-kanban (frontmatter) | Different boards have different workflows |
| Task count format | Simple total only | "3/5" adds clutter without clear benefit |

## Future Enhancements (Out of Scope)

- Auto-expand on hover during drag (800ms delay)
- Keyboard shortcuts (Cmd/Ctrl+Shift+C/E)
- Collapse All / Expand All buttons
- Quick peek tooltip showing first few task titles

## References

- SPEC_0005 (Column Width and Flow Direction) - dependency
- `src/ui/components/column.svelte` - column implementation
- `src/ui/main.svelte` - columns layout
- `src/ui/settings/settings_store.ts` - settings store
