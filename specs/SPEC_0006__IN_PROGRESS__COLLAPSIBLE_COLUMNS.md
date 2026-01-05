# Collapsible Columns

Status: IN_PROGRESS

## Summary

This spec defines the ability to collapse individual columns on the kanban board to reduce visual clutter and screen space usage. The feature must work intelligently with SPEC_0005's configurable column widths and flow directions.

**Key Design Principles:**
- Collapsed columns reduce BOTH visual clutter AND dimensional space
- In horizontal flows (ltr/rtl), collapsed columns minimize width
- In vertical flows (ttb/btt), collapsed columns minimize height
- Collapse state is per-column and persists across sessions
- Smooth, intuitive toggle mechanism
- Collapsed columns still show essential information (name, count)

## Feature Request Summary

**Original request:** [#74](https://github.com/ErikaRS/task-list-kanban/issues/74) - Ability to collapse columns
**Also mentioned in:** [#16](https://github.com/ErikaRS/task-list-kanban/issues/16) - General feature suggestions

Users with many columns or limited screen space need to temporarily hide columns they're not actively using, while still being able to see that the column exists and quickly access it when needed.

**Primary goals:**
1. **Reduce visual clutter** - Hide task cards and detailed content
2. **Reclaim screen space** - Minimize the dimensional footprint of unused columns
3. **Maintain awareness** - Show that collapsed columns exist and contain tasks
4. **Quick access** - Easy to expand columns when needed

## User Requirements

1. Users shall be able to collapse individual columns to reduce visual clutter
2. Users shall be able to collapse individual columns to reduce screen space usage
3. Collapsed state shall persist across sessions (stored in kanban file frontmatter)
4. Collapsed columns shall display the column name and task count
5. Collapsed columns shall be easily expandable with a single click/tap
6. In horizontal flows (ltr/rtl), collapsed columns shall minimize width
7. In vertical flows (ttb/btt), collapsed columns shall minimize height
8. Collapse/expand shall be animated smoothly for clear visual feedback
9. Drag-and-drop to collapsed columns shall work (auto-expand on hover)
10. The collapse toggle control shall be discoverable but unobtrusive
11. Collapsed columns shall remain visible in the column sequence
12. Users shall be able to collapse any column, including Done column

## High-Level Design

### Visual Design by Flow Direction

#### Horizontal Flows (LTR / RTL)

**Expanded State (Current):**
```
┌──────────────────────┐
│ Today            [▶] │ ← Column header with collapse button
│ [ Done | Select ]    │
│                      │
│ ┌──────────────────┐ │
│ │ ☐ Buy groceries  │ │
│ │ #today           │ │
│ │ ↗ daily.md       │ │
│ └──────────────────┘ │
│                      │
│ ┌──────────────────┐ │
│ │ ☐ Review PR #42  │ │
│ │ #today #code     │ │
│ │ ↗ work.md        │ │
│ └──────────────────┘ │
│                      │
│ + Add new            │
└──────────────────────┘
Width: 200-600px (configurable)
```

**Collapsed State (Narrow):**
```
┌──┐
│T │ ← Rotated column name (vertical text)
│o │
│d │
│a │
│y │
│  │
│2 │ ← Task count
│  │
│◀ │ ← Expand button
│  │
└──┘
Width: 48px (fixed, narrow)
```

**Design rationale for horizontal flows:**
- Collapsed width of 48px saves significant horizontal space (vs 200-600px expanded)
- Vertical text keeps column name readable without excessive height
- Task count provides at-a-glance status
- Expand button (◀ in ltr, ▶ in rtl) shows directionality
- Fixed narrow width ensures consistent collapsed appearance

#### Vertical Flows (TTB / BTT)

**Expanded State:**
```
┌────────────────────────────────┐
│ Today                      [▼] │ ← Collapse button points down
│ [ Done | Select ]              │
│                                │
│ ┌────────────────────────────┐ │
│ │ ☐ Buy groceries            │ │
│ │ #today                     │ │
│ │ ↗ daily.md                 │ │
│ └────────────────────────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │ ☐ Review PR #42            │ │
│ │ #today #code               │ │
│ │ ↗ work.md                  │ │
│ └────────────────────────────┘ │
│                                │
│ + Add new                      │
└────────────────────────────────┘
Width: 200-600px (configurable)
Height: Auto (based on content)
```

**Collapsed State (Minimal Height):**
```
┌────────────────────────────────┐
│ Today          2 tasks     [▲] │ ← Compact header with count + expand button
└────────────────────────────────┘
Width: 200-600px (same as expanded, maintains column alignment)
Height: ~40px (header only, minimal)
```

**Design rationale for vertical flows:**
- Collapsed height of ~40px saves vertical space (vs full content height)
- Width remains same as configured to maintain vertical alignment
- Horizontal layout of header (name + count + button) fits in minimal space
- Expand button (▲ in ttb, ▼ in btt) shows directionality
- No vertical text needed since width is preserved

### Collapse Control Placement

**Option 1: Header Button (Recommended)**
- Place collapse/expand button in column header
- Position: Top-right corner, next to three-dot menu (if present)
- Icon: Directional chevron that indicates collapse direction
  - LTR: `▶` (collapse right/shrink), `◀` (expand left/grow)
  - RTL: `◀` (collapse left/shrink), `▶` (expand right/grow)
  - TTB: `▼` (collapse down/shrink), `▲` (expand up/grow)
  - BTT: `▲` (collapse up/shrink), `▼` (expand down/grow)
- Always visible, clear affordance

**Option 2: Context Menu (Alternative)**
- Add "Collapse column" option to column's three-dot menu
- Less discoverable but cleaner header
- Could use in combination with header button

**Recommendation: Use both**
- Header button for quick access (primary interaction)
- Menu option for completeness and keyboard users

### Collapsed State Information

**What to show in collapsed columns:**

1. **Column Name** - Essential for identification
   - Horizontal flows: Vertical text (rotated 90° counterclockwise in ltr, clockwise in rtl)
   - Vertical flows: Horizontal text (normal orientation)

2. **Task Count** - Quick status indicator
   - Format: Just the number in horizontal flows (space-constrained)
   - Format: "X tasks" in vertical flows (more space available)
   - Include both incomplete and complete counts? Options:
     - Simple: "5" (total tasks)
     - Detailed: "3/5" (incomplete/total)
     - **Recommendation:** Simple count (less clutter)

3. **Expand Button** - Clear call-to-action
   - Directional chevron pointing toward expansion
   - Placed at bottom of collapsed column (horizontal flows) or right side (vertical flows)

4. **Visual Differentiation** - Indicate collapsed state
   - Slightly different background (lighter or darker shade)
   - Or subtle border/shadow
   - Ensures users don't think the column disappeared

**What NOT to show:**
- Individual task cards (defeats purpose of collapse)
- Mode toggle (Done/Select) - hidden until expanded
- Add new button - hidden until expanded
- Column menu - could show on hover in collapsed state

### Settings Persistence

**Storage location:** Kanban file frontmatter (like other settings)

```yaml
---
kanban-plugin: {
  "columnWidth": 300,
  "flowDirection": "ltr",
  "collapsedColumns": ["#waiting", "#backlog"],
  ...
}
---
```

**Data structure:**
- `collapsedColumns`: Array of column tags/IDs that are currently collapsed
- Empty array = all columns expanded (default)
- Missing key = backward compatible, defaults to all expanded

### Interaction Flows

#### 1. Collapse a Column

**User Action:** Click collapse button (chevron) in column header

**Behavior:**
1. Column animates to collapsed state:
   - Horizontal flows: Width shrinks to 48px with fade transition
   - Vertical flows: Height shrinks to ~40px with fade transition
2. Task cards fade out during animation
3. Column name rotates (horizontal flows) or stays horizontal (vertical flows)
4. Task count appears
5. Collapse button icon changes to expand icon (reverses direction)
6. Collapsed state saved to frontmatter
7. Animation duration: ~200-300ms (smooth but quick)

**Edge cases:**
- If dragging a task when column collapses: Drop operation should be allowed to complete
- If column is in selection mode with selected tasks: Clear selections, exit selection mode

#### 2. Expand a Column

**User Action:** Click expand button (chevron) in collapsed column

**Behavior:**
1. Column animates to expanded state:
   - Horizontal flows: Width expands to configured columnWidth
   - Vertical flows: Height expands to auto (content-based)
2. Column name rotates back (horizontal flows) or stays horizontal (vertical flows)
3. Mode toggle appears
4. Task cards fade in during animation
5. Add new button appears
6. Expand button icon changes to collapse icon
7. Collapsed state removed from frontmatter
8. Animation duration: ~200-300ms (smooth but quick)

#### 3. Drag-and-Drop to Collapsed Column

**User Action:** Drag a task over a collapsed column

**Behavior - Option A (Auto-expand):**
1. Hover over collapsed column for 800ms (delay prevents accidental expansion)
2. Column auto-expands with animation
3. User can drop task into expanded column
4. Column remains expanded after drop (user must manually re-collapse)

**Behavior - Option B (Drop without expanding):**
1. Collapsed column shows drop zone highlight on drag-over
2. Task can be dropped on collapsed column
3. Task moves to that column (updates file)
4. Column remains collapsed
5. Task count updates to reflect new task

**Recommendation: Option B (simpler, less disruptive)**
- Auto-expand could be added later if users request it
- Dropping on collapsed column is more efficient workflow
- Count update provides immediate feedback

#### 4. Keyboard Navigation

**Keyboard shortcuts (potential future enhancement):**
- `Cmd/Ctrl + Shift + C` - Collapse focused column
- `Cmd/Ctrl + Shift + E` - Expand focused column
- Left/Right arrows - Navigate between columns (focus collapsed columns too)
- Enter on collapsed column - Expand it

**Initial implementation:**
- Tab navigation reaches collapse/expand button
- Enter/Space activates button
- Focus visible states on buttons

### Animation Details

**Collapse animation (horizontal flows):**
```css
.column.collapsing {
  transition: width 250ms ease-out;
  width: 48px;
}

.column.collapsing .task-card {
  transition: opacity 200ms ease-out;
  opacity: 0;
}

.column.collapsing .column-name {
  transition: transform 250ms ease-out;
  transform: rotate(-90deg); /* or 90deg for RTL */
}
```

**Expand animation (horizontal flows):**
```css
.column.expanding {
  transition: width 250ms ease-in;
  width: var(--column-width);
}

.column.expanding .task-card {
  transition: opacity 200ms ease-in 100ms; /* delay for stagger */
  opacity: 1;
}

.column.expanding .column-name {
  transition: transform 250ms ease-in;
  transform: rotate(0deg);
}
```

**Similar transitions for vertical flows but using height instead of width.**

## Detailed Behavior

### Corner Cases and Edge Conditions

#### 1. All Columns Collapsed

**Problem:** User collapses all columns, board looks empty/confusing

**Solution:**
- Allow this state (user choice)
- Collapsed columns still visible as narrow bars (horizontal) or thin strips (vertical)
- Board never looks completely empty
- User can easily expand any column

#### 2. Collapsed Column in Different Flow Directions

**Problem:** User collapses columns, then changes flow direction

**Solution:**
- Preserve collapsed state across flow direction changes
- Collapsed columns automatically adapt to new flow direction:
  - Switch from ltr to ttb: Narrow vertical bar becomes thin horizontal strip
  - Switch from ttb to ltr: Thin horizontal strip becomes narrow vertical bar
- Smooth transition animations
- Collapsed state in frontmatter is flow-agnostic (just stores column IDs)

#### 3. Collapsed Column Width Change

**Problem:** User changes columnWidth setting while columns are collapsed

**Solution:**
- Collapsed columns maintain fixed collapsed dimensions regardless of width setting
  - Horizontal flows: Always 48px when collapsed
  - Vertical flows: Always configured width (follows width setting)
- When expanded, columns use current width setting
- No jarring jumps or re-layouts

#### 4. Very Long Column Names

**Problem:** Column name "In Progress - Waiting for Review" too long for collapsed state

**Solution - Horizontal flows:**
- Vertical text can extend downward (natural scroll)
- Or truncate with ellipsis: "In Prog..."
- Or abbreviate: Show first letter + count: "I" + count
- **Recommendation:** Truncate with ellipsis, show full name on hover tooltip

**Solution - Vertical flows:**
- Horizontal text can span full width
- Truncate if exceeds width: "In Progress - Waitin..."
- Full name on hover tooltip

#### 5. Filtered Views with Collapsed Columns

**Problem:** Filter changes, collapsed column now has different task count

**Solution:**
- Task count updates in real-time even while collapsed
- If count becomes 0, still show "0" (don't auto-expand or hide column)
- User can see at-a-glance which columns have matching tasks

#### 6. Collapsed Done Column with Auto-Archive

**Problem:** Tasks being marked done while Done column is collapsed

**Solution:**
- Tasks still move to Done column (even if collapsed)
- Count updates in collapsed state
- No auto-expansion (would be disruptive)
- User can expand Done to see newly completed tasks

#### 7. Selection Mode in Collapsed Column

**Problem:** User switches column to selection mode, then collapses it

**Solution:**
- Collapsing column clears selection state
- Exits selection mode (back to Done mode)
- Prevents confusion from invisible selections
- When expanded, column returns to Done mode (default)

#### 8. Drag Reordering Columns

**Problem:** If columns can be reordered (future feature), how to drag collapsed columns?

**Solution:**
- Collapsed columns can still be grabbed and dragged
- Drag handle could be entire collapsed column header
- Or three-dot menu in collapsed state
- **Note:** Column reordering not currently implemented, but design should allow for it

#### 9. Mobile/Touch Devices

**Problem:** Collapsed narrow columns (48px) hard to tap/expand on mobile

**Solution:**
- Maintain minimum touch target of 48px (already met)
- Entire collapsed column is tappable (not just expand button)
- Tap anywhere on collapsed column to expand
- Prevent accidental collapse on mobile (require deliberate tap on button)

#### 10. Accessibility - Screen Readers

**Problem:** Screen reader users need to understand collapsed state

**Solution:**
- `aria-label` on collapsed column: "Today column, collapsed, 5 tasks"
- `aria-expanded="false"` on collapse button
- `aria-expanded="true"` on expand button
- Announce state change: "Today column collapsed" / "Today column expanded"
- Ensure collapsed columns are in tab order and keyboard accessible

### Visual Design Specifications

#### Collapsed Column - Horizontal Flows (LTR/RTL)

**Dimensions:**
- Width: 48px (fixed)
- Height: Same as other columns in the row (auto-fit)
- Padding: 8px

**Layout (top to bottom):**
1. Rotated column name (vertical text)
   - Font size: 14px
   - Font weight: 600 (same as expanded header)
   - Rotation: -90deg (ltr) or 90deg (rtl)
   - Text direction: Reads from bottom to top (ltr) or top to bottom (rtl)
   - Truncate if too long with ellipsis
   - Position: Top of collapsed column

2. Task count
   - Font size: 16px
   - Font weight: 500
   - Color: Slightly muted (--text-muted)
   - Position: Center of collapsed column (vertically centered)

3. Expand button
   - Icon: `lucide-chevron-left` (ltr) or `lucide-chevron-right` (rtl)
   - Size: 20px
   - Position: Bottom of collapsed column
   - Hover state: Slight background highlight

**Background:**
- Use column's configured color (if custom column)
- Or default column background
- Slightly darker/lighter than expanded state (indicate collapsed)
- Or add subtle left/right border (2px accent color)

#### Collapsed Column - Vertical Flows (TTB/BTT)

**Dimensions:**
- Width: Same as configured columnWidth (200-600px)
- Height: 40px (fixed, minimal)
- Padding: 8px 12px

**Layout (left to right):**
1. Column name
   - Font size: 14px
   - Font weight: 600
   - Truncate if too long with ellipsis
   - Flex: 1 (takes available space)
   - Position: Left-aligned

2. Task count
   - Font size: 14px
   - Font weight: 500
   - Color: Slightly muted (--text-muted)
   - Format: "5 tasks"
   - Position: Right of column name
   - Margin: 0 8px

3. Expand button
   - Icon: `lucide-chevron-up` (ttb) or `lucide-chevron-down` (btt)
   - Size: 20px
   - Position: Far right
   - Hover state: Slight background highlight

**Background:**
- Use column's configured color (if custom column)
- Or default column background
- Slightly darker/lighter than expanded state
- Or add subtle top/bottom border (2px accent color)

### Hover States

**Collapsed column hover (both flows):**
- Slight brightness increase (5-10%)
- Or subtle glow effect
- Shows interactivity
- Cursor: pointer

**Expand button hover:**
- Background highlight (subtle circular background)
- Icon color brightens slightly
- Cursor: pointer

### Focus States

**Collapsed column focus:**
- Outline: 2px solid accent color
- Outline offset: 2px
- Ensures keyboard users can see focused collapsed column

**Expand button focus:**
- Focus ring around button
- High contrast for visibility

## Implementation Plan

### Phase 1: Data Model and Settings

**Goal:** Add collapsed columns tracking to settings store

1. ☐ Add `collapsedColumns: string[]` to SettingValues interface in settings_store.ts
2. ☐ Add default value (empty array) to default settings
3. ☐ Add parsing logic to handle collapsedColumns in frontmatter serialization
4. ☐ Add validation to ensure array contains valid column tags
5. ☐ Create derived store or reactive state for per-column collapsed status
6. ☐ Test: Manually add column to collapsedColumns array, verify parsing works
7. ☐ Test: Save and reload kanban, verify collapsed state persists

**Deliverable:** Collapsed state can be stored and retrieved from frontmatter

### Phase 2: Collapse Button UI

**Goal:** Add collapse/expand button to column headers

1. ☐ Add collapse button component to column header (top-right, next to menu)
2. ☐ Use lucide icons for directional chevrons based on flow direction:
   - `lucide-chevron-right` for LTR collapse
   - `lucide-chevron-left` for RTL collapse
   - `lucide-chevron-down` for TTB collapse
   - `lucide-chevron-up` for BTT collapse
3. ☐ Add click handler to toggle collapsed state for the column
4. ☐ Update collapsedColumns array in settings when button clicked
5. ☐ Add hover and focus states to button
6. ☐ Add "Collapse column" option to column menu (three-dot menu)
7. ☐ Test: Click button, verify setting updates in store
8. ☐ Test: Button appearance in all four flow directions

**Deliverable:** Collapse button visible and updates settings (no visual collapse yet)

### Phase 3: Collapsed State - Horizontal Flows (LTR/RTL)

**Goal:** Columns collapse to narrow vertical bars in horizontal flows

1. ☐ Create `.column.collapsed` CSS class for horizontal flows
2. ☐ Set collapsed width to 48px with transition
3. ☐ Implement vertical text rotation for column name (-90deg ltr, 90deg rtl)
4. ☐ Hide task cards, mode toggle, add button when collapsed
5. ☐ Show task count in center of collapsed column
6. ☐ Change collapse button icon to expand icon (reverse direction)
7. ☐ Add collapse/expand animations (width + opacity transitions)
8. ☐ Handle column name truncation with ellipsis
9. ☐ Add hover tooltip showing full column name
10. ☐ Test: Collapse column in LTR flow, verify narrow bar with vertical text
11. ☐ Test: Collapse column in RTL flow, verify text rotation direction
12. ☐ Test: Very long column names truncate properly
13. ☐ Test: Task count updates when tasks added/removed while collapsed

**Deliverable:** Horizontal flows have working collapsed state with narrow vertical bars

### Phase 4: Collapsed State - Vertical Flows (TTB/BTT)

**Goal:** Columns collapse to thin horizontal strips in vertical flows

1. ☐ Create `.column.collapsed` CSS class for vertical flows
2. ☐ Set collapsed height to 40px with transition
3. ☐ Keep column width same as configured (maintain alignment)
4. ☐ Layout header horizontally: name + count + expand button
5. ☐ Hide task cards, mode toggle, add button when collapsed
6. ☐ Format task count as "X tasks"
7. ☐ Change collapse button icon to expand icon (reverse direction)
8. ☐ Add collapse/expand animations (height + opacity transitions)
9. ☐ Handle column name truncation with ellipsis
10. ☐ Test: Collapse column in TTB flow, verify thin horizontal strip
11. ☐ Test: Collapse column in BTT flow, verify expand icon direction
12. ☐ Test: Different column widths (200px, 600px) maintain width when collapsed

**Deliverable:** Vertical flows have working collapsed state with thin horizontal strips

### Phase 5: Drag-and-Drop to Collapsed Columns

**Goal:** Users can drag tasks to collapsed columns

1. ☐ Add drop zone highlighting to collapsed columns
2. ☐ Ensure drag-over detection works on collapsed column element
3. ☐ Allow task drop on collapsed column (task moves, column stays collapsed)
4. ☐ Update task count immediately after drop
5. ☐ Test: Drag task to collapsed column in LTR flow, verify drop works
6. ☐ Test: Drag task to collapsed column in TTB flow, verify drop works
7. ☐ Test: Task count updates after drop
8. ☐ Test: Task file updated correctly with new column tag

**Deliverable:** Drag-and-drop works seamlessly with collapsed columns

**Note:** Auto-expand on hover is out of scope for initial implementation

### Phase 6: Edge Cases and State Management

**Goal:** Handle edge cases and ensure robust state management

1. ☐ Implement: Collapsing column while in selection mode clears selections
2. ☐ Implement: Collapsed state preserved when changing flow directions
3. ☐ Implement: Smooth transition when switching flow with collapsed columns
4. ☐ Implement: Filter changes update collapsed column task counts
5. ☐ Test: Collapse all columns, verify board still usable
6. ☐ Test: Switch flow direction with collapsed columns, verify adaptation
7. ☐ Test: Change column width setting while columns collapsed
8. ☐ Test: Mark tasks done in collapsed Done column, verify count updates
9. ☐ Test: Apply filter, verify collapsed column counts update correctly

**Deliverable:** All edge cases handled gracefully

### Phase 7: Accessibility and Polish

**Goal:** Ensure accessibility compliance and visual polish

1. ☐ Add ARIA labels to collapse/expand buttons
2. ☐ Add `aria-expanded` attribute to buttons
3. ☐ Add `aria-label` to collapsed columns describing state
4. ☐ Announce collapse/expand to screen readers (aria-live region)
5. ☐ Ensure keyboard navigation works (Tab to button, Enter/Space to activate)
6. ☐ Add focus-visible states to collapsed columns and buttons
7. ☐ Verify minimum touch target size (48px) for mobile
8. ☐ Test: Navigate with keyboard only, collapse/expand columns
9. ☐ Test: Screen reader announces collapsed state correctly
10. ☐ Test: Hover tooltips show full column names
11. ☐ Test: Mobile touch on collapsed column (should expand easily)
12. ☐ Run build and tests: `npm run build && npm test`

**Deliverable:** Fully accessible, polished collapsible columns feature

### Future Enhancements (Out of Scope)

1. **Auto-expand on Hover:** Collapsed column auto-expands after hovering for 800ms during drag
2. **Keyboard Shortcuts:** Cmd/Ctrl+Shift+C to collapse focused column
3. **Collapse All / Expand All:** Buttons to bulk toggle all columns at once
4. **Remember Per-Board:** Different collapsed states for different kanban boards
5. **Collapse Animations:** More sophisticated spring/elastic animations
6. **Quick Peek:** Hover over collapsed column shows tooltip with first few task titles
7. **Collapse Groups:** Collapse multiple columns into a single group (advanced)
8. **Mobile Swipe:** Swipe gesture to collapse/expand columns on touch devices

## Open Questions

1. **Task Count Format:**
   - Simple: "5" (just the number)
   - Detailed: "3/5" (incomplete/total)
   - Very detailed: "3 incomplete, 2 complete"
   - **Recommendation:** Simple count for collapsed state (less clutter)

2. **Auto-expand on Drag?**
   - Should dragging a task over a collapsed column auto-expand it after delay?
   - Or require explicit drop without expanding?
   - **Recommendation:** Start without auto-expand (simpler), add if users request

3. **Remember Collapsed State Per Kanban?**
   - Should different kanban boards remember different collapsed states?
   - Or single global collapsed state?
   - **Recommendation:** Per-kanban (already designed this way via frontmatter)

4. **Column Menu in Collapsed State?**
   - Should three-dot menu be accessible in collapsed state?
   - Or only show expand button?
   - **Recommendation:** Show on hover in collapsed state (useful for settings, delete)

5. **Transition Duration:**
   - How long should collapse/expand animation take?
   - Options: 200ms (fast), 300ms (medium), 400ms (slow)
   - **Recommendation:** 250ms (balanced - smooth but not sluggish)

## Technical Considerations

### Browser Compatibility

- CSS transitions: Supported in all modern browsers
- `transform: rotate()`: Supported in all modern browsers
- Flexbox for layout: Already used extensively in codebase
- No polyfills needed (Obsidian uses Electron with modern Chromium)

### Performance

- Minimal performance impact
- CSS transitions are GPU-accelerated
- Hiding task cards reduces DOM render cost
- Settings updates are async and non-blocking
- Large boards (100+ columns) should still perform well

### Interaction with SPEC_0005 (Column Width and Flow Direction)

**Dependencies:**
- This spec builds on SPEC_0005's flow direction system
- Uses same CSS custom properties (`--column-width`, `.flow-ltr`, etc.)
- Collapsed state adapts to flow direction automatically

**Integration points:**
- Collapse button icon direction based on `flowDirection` setting
- Collapsed dimensions (width vs height) based on flow direction
- Animations adjust based on flow direction (width vs height transitions)

**Testing together:**
- Test all combinations: 4 flow directions × collapsed/expanded states
- Verify smooth transitions when changing flow with collapsed columns
- Ensure collapsed state preserves column width setting

### Testing Strategy

1. **Unit Tests:**
   - Settings parsing and validation for collapsedColumns array
   - Collapsed state derivation logic
   - Task count calculation in collapsed state

2. **Integration Tests:**
   - Collapse/expand in all flow directions
   - Drag-and-drop to collapsed columns
   - State persistence across reload

3. **Visual Regression Tests:**
   - Screenshot comparison of collapsed state in all flows
   - Animation smoothness verification
   - Responsive behavior at different screen sizes

4. **Accessibility Tests:**
   - Keyboard navigation through collapsed columns
   - Screen reader announcement verification
   - Focus indicator visibility

5. **User Testing:**
   - Gather feedback on collapsed column usability
   - Verify intuitive collapse/expand interaction
   - Assess space savings and clutter reduction

### Rollout Strategy

1. Deploy Phase 1-2 first (settings + button UI) as foundation
2. Deploy Phase 3-4 together (collapsed states for all flows)
3. Monitor for animation performance issues
4. Deploy Phase 5 (drag-and-drop) after stability confirmed
5. Phase 6-7 as polish and refinement based on early feedback
6. Collect user feedback on transition speed and collapsed dimensions

## Success Metrics

1. **Adoption Rate:** % of users who collapse at least one column
2. **Space Savings:** Average % reduction in board width/height when columns collapsed
3. **Frequency:** How often users toggle collapse/expand (indicates usefulness)
4. **Persistence:** % of users who keep columns collapsed across sessions
5. **User Satisfaction:** Positive feedback on clutter reduction and screen space usage
6. **No Regressions:** Drag-and-drop success rate remains stable
7. **Accessibility:** No increase in keyboard navigation issues

## References

- Original feature request: [#74](https://github.com/ErikaRS/task-list-kanban/issues/74)
- Related issue: [#16](https://github.com/ErikaRS/task-list-kanban/issues/16)
- Dependency: SPEC_0005 (Column Width and Flow Direction)
- Column implementation: `src/ui/components/column.svelte`
- Columns layout: `src/ui/main.svelte`
- Settings store: `src/ui/settings/settings_store.ts`
- Spec format reference: `specs/SPEC_0004__COMPLETE__TASK_INTERACTION_CONTROLS.md`
