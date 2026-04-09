# Manual Task Reordering

Status: COMPLETE
Implemented: 2026-04
Last Updated: 2026-04-09 (Bug fixes + default column exclusion)

## Feature Request Summary

Users want to manually control task order within columns, independent of file order. Currently, tasks always appear in the order they appear in source files. This feature allows users to drag tasks to reorder them, with order persisting across board reopens.

## User Requirements

1. Support two column order modes: File order (default) and Manual order
2. Allow dragging tasks within a column to reorder them
3. Allow dragging tasks between columns at specific positions
4. Show visual feedback (drop zones) while dragging
5. Persist manual order to the kanban file automatically
6. Support menu-based reordering (Move Up/Down) as alternative to dragging
7. Auto-initialize manual order when mode is enabled
8. Exclude default columns (uncategorised, done) from manual ordering
9. Maintain order consistency when tasks are deleted or moved

## Critical Design Constraint

**⚠️ Reordering does NOT modify original task files**

This is a fundamental design principle:
- Manual order is stored ONLY in the kanban board file (`kanban_order` frontmatter)
- Original task files remain completely unmodified by reordering operations
- Task modifications (editing, moving between columns, cancelling, etc.) still update the source files as before
- Order is a kanban-specific concern, separate from the source file

Benefits:
- Source files remain the single source of truth for task content
- Reordering is non-destructive and fully reversible
- Multiple kanban boards can have different orders for the same tasks
- Syncing task changes back to files doesn't interfere with manual order
- Clean separation of concerns: file content vs kanban presentation

---

## High-Level Design

### Dual Ordering Modes

**File Order Mode** (default):
- Tasks appear in source file order (path, then rowIndex)
- No manual order data stored
- Existing behavior preserved

**Manual Order Mode**:
- Tasks appear in manually configured order
- Order data stored in kanban file frontmatter: `kanban_order: {...}`
- Auto-initializes with current task order when mode is first enabled
- Fallback: unlisted tasks appear in file order after ordered tasks

### Data Storage Separation

**What gets stored where:**

| Data | Location | Modified By | Scope |
|------|----------|-------------|-------|
| Task content, status, tags | Source files (*.md) | Direct edits, file sync, task actions (edit/move/cancel/archive) | All kanban boards |
| Column assignment | Source files (via #[tag]) | Direct edits, Move to Column action | All kanban boards |
| **Manual task order** | **Kanban board file** | **Drag-to-reorder, Move Up/Down** | **This board only** |

Key insight: Reordering is **kanban-specific metadata**, not task metadata. It stays in the board file and never touches source files.

### Data Model

**Manual Order Store** (`ManualOrderStore`):
```typescript
type ManualOrderStore = Record<string, string[]>
// Maps column ID to array of stable task keys
// Example: {
//   "column-today": [
//     "path/to/file.md::blockLink",
//     "path/to/file.md::task content"
//   ],
//   "done": [...]
// }
```

**Stable Task Keys**:
```typescript
function stableTaskKey(task: Task): string {
  // Prefer blockLink (survives content edits)
  if (task.blockLink) return `${task.path}::${task.blockLink}`
  // Fallback to content (loses position if edited)
  return `${task.path}::${task.content}`
}
```

### Drag-to-Reorder Flow

#### Within-Column Reorder
```
User drags task in Manual mode
         ↓
isReorderingStore set with taskId + fromColumn
         ↓
Drop zones appear in column (20px tall)
         ↓
User hovers over zone → zone highlights
         ↓
User drops → reorderAfterDrop() computes new index
         ↓
manualOrderStore updated for that column
         ↓
Changes persisted to kanban_order YAML
```

#### Cross-Column Move with Reorder
```
User drags task from column A to column B
         ↓
isReorderingStore + isDraggingStore both set
         ↓
Drop zones appear in ALL columns
         ↓
User hovers over zone in column B → zone highlights
         ↓
User drops → both columns reordered:
  - Task removed from column A's order
  - Task inserted at index in column B's order
  - Task moved via changeColumn action
         ↓
Both columns' orders updated in manualOrderStore
         ↓
Changes persisted to kanban_order YAML
```

### Menu-Based Reordering

**Move Up/Down Commands**:
```
User right-clicks task in Manual mode
         ↓
Context menu shows "Move up" / "Move down"
         ↓
User clicks "Move up"
         ↓
moveTaskUp() swaps with previous task
         ↓
manualOrderStore updated
         ↓
Changes persisted
```

**Button State**:
- "Move up" disabled if task is at index 0
- "Move down" disabled if task is at last index
- Always enabled (never disabled for untouched tasks)

### Auto-Initialization

When column order mode changes from File to Manual:

```
Mode switch detected
         ↓
For each configured column (exclude uncategorised, done):
  - Get all tasks in that column
  - If no manual order exists for that column:
    - Sort by file order (path, then rowIndex)
    - Convert to stable keys
    - Add to manualOrderStore
         ↓
Save to kanban_order YAML
```

Benefits:
- Menu commands work immediately without dragging first
- Smooth transition: existing order preserved
- Default columns (uncategorised, done) use file order only

### Order Consistency & Synchronization

Manual order is kept in sync with actual task list through reactive reconciliation:

```
Whenever allTasksByColumn changes (in Manual mode):
         ↓
For each configured column:
  - Compute valid keys from COMPLETE task list (unfiltered)
  - Prune stale keys (tasks deleted or moved)
  - Append missing keys (new or moved-in tasks)
  - Update manualOrderStore if changed
         ↓
Clean up any uncategorised/done entries from YAML
         ↓
Save only if actual changes detected
```

Benefits:
- Deleted tasks don't leave stale keys in YAML
- Moved tasks maintain correct position in new column
- Order automatically heals when tasks change
- No manual cleanup needed

### Filter Compatibility (Important)

**Filtering is purely view-level and never modifies the persistent manual order.**

- The sync block reads from `allTasksByColumn` (the complete, unfiltered task list grouped by column)
- The display layer reads from `tasksByColumn` (filtered tasks grouped by column)
- Hidden tasks keep their keys in `kanban_order` YAML
- When a filter is cleared, previously hidden tasks return to their exact original positions
- Applying, modifying, or clearing a filter **never triggers a write to `kanban_order`**

This separation ensures that filtering is a safe, view-only operation that respects manually configured task order across board sessions.

---

## UI/UX Details

### Drop Zones

**Visual Style**:
- Height: 20px (transparent, expanded hit target)
- Negative margin: -10px (maintains visual spacing)
- Color: Accent color when active
- Border radius: 4px

**Behavior**:
- Appear between and before/after all tasks in reorder mode
- Highlight on dragover
- Support both within-column and cross-column drops

### Drag Behavior

**Single Task Drag**:
- Manual mode + single task → reorder mode
- Drop zones in all columns visible
- Can drop in source (reorder) or dest (move + reorder)

**Multi-Task Drag**:
- Selection mode with multiple selected → cross-column move (no reorder)
- Drop zones not shown

### Default Columns Exclusion

**Uncategorised and Done columns exclude manual ordering**

Rationale:
- These columns can hold unlimited tasks (not bounded by user configuration)
- Manual ordering impractical for unlimited-size columns
- File order is simpler and more appropriate for system-generated groups
- Keeps manual ordering focused on user-configured, bounded columns

Behavior:
- **Drop zones**: Do not appear in uncategorised/done columns
- **Menu commands**: Move Up/Down not shown for tasks in these columns
- **YAML storage**: Entries for these columns are cleaned up on next save
- **Task movement**: Tasks can still be dragged into/out of these columns (uses file order)

**Key design**: Default columns behave as if manual order mode doesn't apply to them, regardless of the global mode setting.

### Menu Integration

Added to task context menu (right-click):
```
┌──────────────────────────────────┐
│ Go to file                       │
├──────────────────────────────────┤
│ Move up (if Manual, not default) │
│ Move down (if Manual, not default)│
├──────────────────────────────────┤
│ Move to [Column A]               │
│ Move to [Column B]               │
│ ... (more columns)               │
├──────────────────────────────────┤
│ Duplicate task                   │
│ Cancel / Restore                 │
│ Archive                          │
│ Delete                           │
└──────────────────────────────────┘
```

---

## Technical Implementation

### Core Functions

**`stableTaskKey(task: Task): string`**
- Creates stable identifiers that persist across edits (with blockLink)
- Format: `path::blockLink` or `path::content`

**`reorderAfterDrop(currentOrder: string[], draggedKey: string, dropIndex: number): string[]`**
- Removes dragged task from current position
- Inserts at drop index
- Returns new order array

**`moveTaskUp(order: string[], taskKey: string): string[]`**
- Swaps task with previous one
- Returns unchanged if at top or not found

**`moveTaskDown(order: string[], taskKey: string): string[]`**
- Swaps task with next one
- Returns unchanged if at bottom or not found

**`applyManualOrder(tasks: Task[], orderedKeys: string[]): Task[]`**
- Sorts tasks by manual order keys
- Appends unlisted tasks in file order
- Handles stale keys gracefully

### YAML Persistence

**Location**: Order stored ONLY in kanban board file frontmatter, never in source files

**Serialization** (in `text_view.ts`):
```typescript
parsed.attributes["kanban_order"] = JSON.stringify(get(this.manualOrderStore))
```

**Format in kanban board file**:
```yaml
---
kanban_plugin: '...'
kanban_order: "{\"column-today\":[\"path::key1\",\"path::key2\"]}"
---
```

**Important**: Source task files (*.md) are never modified by reordering. Only the kanban board file is updated.

**Key Fix**: Use `JSON.stringify()` instead of single-quote escaping to properly handle special characters.

### Store Architecture

```
text_view.ts
  ├─ manualOrderStore: Writable<ManualOrderStore> (loaded from kanban_order)
  └─ passes to main.svelte
      ├─ $tasksStore (unfiltered)
      │   └─ allTasksByColumn = groupByColumnTag($tasksStore)
      │       └─ Reactive sync block (reads allTasksByColumn):
      │           ├─ Prunes stale keys (deleted or moved tasks)
      │           ├─ Appends missing keys (new or moved-in tasks)
      │           ├─ Cleans up default column entries
      │           └─ Saves if changed
      │
      ├─ Filtering pipeline:
      │   $tasksStore → filteredByText → filteredByTag → filteredByFile → tasksByColumn
      │
      └─ passes tasksByColumn to Column component
          ├─ sortedTasks computed with applyManualOrder when Manual mode
          ├─ handleDrop() detects reorder vs cross-column
          └─ onReorder/onCrossColumnReorder callbacks update store

Stores used:
- isDraggingStore: { fromColumn, draggedTaskIds }
- isReorderingStore: { taskId, fromColumn }
- manualOrderStore: Record<column, stableKey[]> (configured columns only)
```

**Key Safety Properties:**
- Reactive sync reads from `allTasksByColumn` (complete, unfiltered task list) to preserve hidden tasks' positions
- Reactive sync uses `get(manualOrderStore)` not `$manualOrderStore` to avoid feedback loops
- References `allTasksByColumn` and `columns` directly so Svelte re-runs on changes
- Only saves when actual changes detected (debounced by Obsidian)
- Filtering never triggers sync block writes (uses separate `tasksByColumn` for display)

---

## Testing

**Unit Tests** (`text_view.tests.ts`):
- YAML serialization with special characters
- JSON escaping validation
- Object structure preservation

**Unit Tests** (`manual_order.tests.ts`):
- `stableTaskKey` blockLink preference and fallback
- `reorderAfterDrop` insertion at various indices
- `moveTaskUp/Down` boundary conditions
- `applyManualOrder` sorting behavior

**All 318 tests pass** (14 test files) with full coverage of reordering logic.

---

## Bug Fixes & Improvements (April 2026)

### Problem 1: Stale Keys Accumulating in YAML

**Issue**: When a task was deleted, its stable key remained in `kanban_order` forever. Stale keys accumulated and caused subtle ordering shifts.

**Root Cause**: Manual order was only synchronized once (on mode initialization), never reconciled when tasks changed.

**Solution**: Added reactive sync block in `main.svelte` that:
- Runs whenever `tasksByColumn` changes (in Manual mode)
- Prunes stale keys (tasks no longer in that column)
- Saves only if actual changes detected

**Result**: Deleted tasks no longer pollute YAML; order stays clean.

### Problem 2: Tasks Lose Position When Moved

**Issue**: When a task was moved via "Move to Column" menu, its key stayed in the old column's order. In the new column, it had no key → appeared at the bottom after all ordered tasks, seeming "lost".

**Root Cause**: Cross-column moves didn't remove the key from the source column or add it to the dest column's order.

**Solution**: Reactive sync block also handles this case:
- Detects when a task is no longer in a column
- Removes its key from that column's order
- Appends the key to new columns it appears in

**Result**: Moved tasks maintain their intended position in the new column.

### Improvement: Default Columns Excluded from Manual Ordering

**Rationale**: Uncategorised and done columns can hold unlimited tasks, making manual ordering impractical and confusing.

**Implementation**:
- Initialization: Excludes these columns from setup (only configured columns init)
- UI: Drop zones and Move Up/Down menu hidden for default column tasks
- YAML Cleanup: Existing entries for these columns cleaned up on next save

**Behavior**: Default columns always use file order, regardless of mode setting.

---

## Future Enhancements

- Keyboard shortcuts for Move Up/Down (configurable)
- Drag handle visual indicator (optional)
- Undo/redo for manual order changes
- Export/import manual order configurations
- Per-column vs global manual order toggle
