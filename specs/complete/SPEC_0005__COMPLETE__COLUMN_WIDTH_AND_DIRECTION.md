# Column Width and Direction Configuration

Status: COMPLETE
Implemented: 2025-01

## Feature Request Summary

Configurable column width and flow direction for the kanban board.

**Issues:**
- [#80](https://github.com/ErikaRS/task-list-kanban/issues/80) - Column width configuration
- [#72](https://github.com/ErikaRS/task-list-kanban/issues/72) - Flow direction options

## User Requirements

1. Users can configure the width of task cards (200-600px range, default 300px)
2. Users can choose from four column flow directions:
   - Left-to-right (default)
   - Right-to-left
   - Top-to-bottom
   - Bottom-to-top
3. Settings persist across sessions
4. Card width always controls horizontal width regardless of flow direction
5. Card height remains auto-calculated based on content
6. Drag-and-drop works correctly in all flow directions
7. Changes apply immediately without page refresh

---

## High-Level Design

### Layout Behavior

| Flow Direction | Column Arrangement | Scroll Axis | Card Width | Card Height |
|----------------|-------------------|-------------|-----------|-------------|
| Left-to-right  | Horizontal        | X           | Configured (200-600px) | Auto (content) |
| Right-to-left  | Horizontal (reversed) | X       | Configured (200-600px) | Auto (content) |
| Top-to-bottom  | Vertical          | Y           | Configured (200-600px) | Auto (content) |
| Bottom-to-top  | Vertical (reversed) | Y         | Configured (200-600px) | Auto (content) |

### Key Design Decisions

**Column Width Always Means Horizontal Width:**
- Width setting controls the horizontal dimension of task cards in ALL flow directions
- In vertical flows, columns maintain horizontal width but stack vertically
- Column height is always auto-calculated based on content

**JavaScript Array Reversal for Reversed Flows:**
- RTL and BTT modes use JavaScript array reversal, not CSS flex-direction reverse
- CSS `row-reverse` and `column-reverse` cause scrollbar origin issues
- JavaScript reversal is simple, predictable, and has no side effects

**Vertical Flow Layout:**
- Columns become horizontal "rows" that stack vertically
- Within each row: header on left, cards flow horizontally (flex-wrap), "Add new" at end
- Task cards respect column width but cap at 100% to prevent viewport overflow

### Settings UI

```
┌─────────────────────────────────────┐
│ Column width: [----●----] 300       │  ← Slider (200-600)
│                                     │
│ Flow direction: [Left to right  ▼]  │  ← Dropdown
└─────────────────────────────────────┘
```

---

## Detailed Behavior

### Horizontal Flows (LTR/RTL)

- Columns arrange in a horizontal flexbox with horizontal scrolling
- RTL reverses column order (uncategorized, regular columns, done all reversed)
- Sidebar remains on left in RTL mode (UI chrome, not content)

### Vertical Flows (TTB/BTT)

- Columns stack vertically with vertical scrolling
- Within each column/row:
  - Header row: column title, Done/Select toggle, selection count, bulk actions
  - Cards row: tasks flow horizontally with flex-wrap
  - "Add new" button at end of cards row
- BTT reverses column order (same as RTL pattern)
- Task cards use `width: min(var(--column-width), 100%)` to prevent overflow on narrow viewports

### Edge Cases

**Narrow Viewport in Vertical Flow:**
- Task cards cap at 100% width when viewport is narrower than configured column width

**Empty Columns:**
- Maintain 50px min-height drop zone in all flow directions

**Sidebar Coexistence:**
- Sidebar stays on left regardless of flow direction
- Both horizontal and vertical flows work with sidebar expanded or collapsed

---

## Implementation Plan

### Phase 1: Column Width Configuration ✅ COMPLETE
**Goal:** Users can configure card/column width, persisted across sessions

- Added `columnWidth` to settings (200-600 range, default 300)
- Settings UI uses slider with dynamic tooltip
- Column uses CSS variable `--column-width`
- Validation falls back to 300px for invalid values

### Phase 2: Flow Direction UI and Settings ✅ COMPLETE
**Goal:** Settings UI for flow direction, stored and validated

- Added `FlowDirection` enum: `ltr`, `rtl`, `ttb`, `btt`
- Dropdown in settings UI with readable labels
- Invalid values fall back to `ltr`

### Phase 3: Horizontal Flow Directions (LTR/RTL) ✅ COMPLETE
**Goal:** Left-to-right and right-to-left column flows work correctly

- `orderedColumns` computed property builds column list including uncategorized and done
- RTL mode reverses array order using JavaScript
- Single `{#each orderedColumns}` loop in template

### Phase 4: Vertical Flow Directions (TTB/BTT) ✅ COMPLETE
**Goal:** Top-to-bottom and bottom-to-top column flows work correctly

- `isVerticalFlow` computed property detects TTB/BTT modes
- BTT uses JavaScript array reversal (same pattern as RTL)
- CSS `.vertical-flow` class on columns container:
  - `flex-direction: column` for vertical stacking
  - `overflow-y: scroll` for vertical scrolling
- Column component receives `isVerticalFlow` prop
- `.row-header` class conditionally applied for horizontal header layout
- Tasks wrapper uses `flex-direction: row` with `flex-wrap: wrap`
- Task cards use `min()` function to cap at viewport width

### Phase 5: Edge Case Handling and Polish ✅ COMPLETE
**Goal:** Handle corner cases, improve UX, ensure robustness

- ✅ Validation for columnWidth range (200-600)
- ✅ Fallback logic for invalid flowDirection values
- ✅ Task card overflow prevention in vertical flows
- ✅ Focus management with proper keyboard accessibility
- ✅ Fixed array mutation bug (sortedTasks now copies before sorting)

---

## Future Enhancements (Out of Scope)

1. **Per-Column Width**: Individual columns with different widths
2. **Sidebar Position**: Configurable sidebar position (left/right)
3. **Keyboard Navigation**: Arrow keys to navigate between columns
4. **Auto-fit**: Automatically size columns to fit viewport
5. **RTL Locale Detection**: Set RTL default for RTL languages
