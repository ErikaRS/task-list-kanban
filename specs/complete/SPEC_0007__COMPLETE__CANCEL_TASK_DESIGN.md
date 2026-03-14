# Cancel Task Design

Status: COMPLETE

## Feature Request Summary

Users need the ability to mark tasks as cancelled from the Kanban UI using Obsidian checkbox syntax `[-]`, and to restore cancelled tasks back to incomplete `[ ]` from the same UI location.

This feature adds a cancel/restore action in the same interaction surfaces where per-task and bulk archive actions are currently available, while preserving existing behavior of status-marker settings.

## User Requirements

1. Add a cancel action in every task-level and selected-task bulk menu where archive actions already exist.
2. Selecting cancel updates task markdown checkbox status to `[-]`.
3. If a task is already cancelled (`[-]`), the UI action must change to **Restore task** and update markdown checkbox status to `[ ]`.
4. Restore behavior must follow existing "mark done as incomplete" semantics (no special-case alternate workflow).
5. Cancel/restore behavior must be independent of status-marker settings logic. The action only writes checkbox markdown state; existing parser/settings behavior determines resulting board placement/visibility.
6. Existing user configurability remains intact:
   - `doneStatusMarkers` remains user-defined (default `xX`).
   - `ignoredStatusMarkers` remains user-defined.
   - Users may include `-` in either setting, and the system must continue to honor those choices.
7. Done-column **Archive all** remains unchanged; no cancel/restore equivalent is added there.
8. No regressions to archive, done, move, delete, or filtering behavior.

---

## High-Level Design

### UI Changes

#### 1. Per-Task Menu

- Replace static "Cancel task" with a dynamic action label:
  - `Cancel task` when task status is not `[-]`
  - `Restore task` when task status is `[-]`
- Keep placement adjacent to existing archive/delete action area.
- Reuse existing menu visibility logic from archive entry points.

#### 2. Bulk Action Menu (Selection Mode)

- Add a cancellation action for selected tasks in column bulk menu contexts.
- Label behavior:
  - `Cancel N selected` when selection is mixed or contains non-cancelled tasks.
  - `Restore N selected` when all selected tasks are currently cancelled (`[-]`).
- After action, clear selection using existing bulk-action selection clearing behavior.

#### 3. Done Column Context Menu

- Keep existing `Archive all` behavior exactly as-is.
- Do **not** add `Cancel all` / `Restore all` in Done column menu.

### Data Model and Action Layer

- Extend task mutation logic with explicit cancel/restore operations:
  - Cancel sets checkbox marker to `-`.
  - Restore sets checkbox marker to space (` `).
- Preserve current row-update write path (single source of file modification).
- Add task status helpers needed by UI label switching (e.g., cancelled-state detection).

### Settings Interaction

- Cancel/restore action logic does not read or override `doneStatusMarkers` or `ignoredStatusMarkers`.
- Resulting board behavior after write is intentionally delegated to existing parser/settings pipeline.

---

## Detailed Behavior

### Single Task Flows

#### Cancel Single Task

**User Action:** Task menu -> `Cancel task`

**Behavior:**
- Write checkbox state `[-]` to source markdown line.
- Menu closes.
- Board refresh follows existing file modify -> parse pipeline.
- Subsequent task menu shows `Restore task` for that task.

#### Restore Single Task

**User Action:** Task menu on cancelled task -> `Restore task`

**Behavior:**
- Write checkbox state `[ ]` to source markdown line.
- Menu closes.
- Board refresh follows existing file modify -> parse pipeline.
- Subsequent task menu shows `Cancel task` for that task.

### Bulk Selection Flows

#### Cancel Selected

**User Action:** Select mode -> choose tasks -> bulk menu -> `Cancel N selected`

**Behavior:**
- All selected tasks are written as `[-]`.
- Column selections are cleared.
- Bulk action menu disappears (existing behavior after selection clear).

#### Restore Selected

**User Action:** Select mode -> choose cancelled tasks -> bulk menu -> `Restore N selected`

**Behavior:**
- All selected tasks are written as `[ ]`.
- Column selections are cleared.
- Bulk action menu disappears.

### Behavior with Existing Marker Settings

1. If `ignoredStatusMarkers` contains `-`, cancelled tasks become hidden by existing ignore logic.
2. If `doneStatusMarkers` contains `-`, cancelled tasks are treated as done and move to Done column via existing done logic.
3. If users customize either setting, cancel/restore continues to only write checkbox markdown and does not override user choices.

### Accessibility

- Menu labels must accurately reflect action state (`Cancel` vs `Restore`).
- Keyboard navigation remains unchanged for menu items.
- ARIA labels/titles should match visible action text for screen readers.

### Edge Cases

1. **Already Cancelled Single Task:** action is `Restore task` and writes `[ ]`.
2. **Mixed Bulk Selection:** action defaults to `Cancel N selected` unless all are cancelled.
3. **Filtered Views:** actions only apply to tasks currently selected/acted on; filters remain unchanged.
4. **Done Column Menu:** `Archive all` remains the only all-task terminal action.

---

## Implementation Plan

### Phase 1: Single Task Cancel/Restore Vertical Slice

**Goal:** User can cancel and restore one task end-to-end from task menu.

1. Add task-level cancel/restore mutation methods and status helper(s).
2. Add action-layer handlers that write `[-]` and `[ ]` through existing row update utility.
3. Update per-task menu with dynamic label (`Cancel task` / `Restore task`).
4. Verify behavior across visible board refresh cycles.

**Deliverable:** One task can be toggled between incomplete and cancelled from its menu.

### Phase 2: Bulk Cancel/Restore Vertical Slice

**Goal:** User can cancel or restore selected tasks from bulk menu.

1. Add bulk cancel/restore action wiring in column menu.
2. Implement dynamic bulk label decision (`Cancel N selected` vs `Restore N selected`).
3. Reuse existing selection clearing after action.
4. Verify mixed-selection and all-cancelled selection behavior.

**Deliverable:** Selected tasks can be cancelled/restored in one action with correct label and cleanup.

### Phase 3: Settings Default + Regression Coverage

**Goal:** Ensure cancellation behavior coheres with status marker settings and existing features.

1. Add/extend tests for:
   - Cancel writes `[-]`
   - Restore writes `[ ]`
   - Dynamic labels for single and bulk actions
   - Interactions with `doneStatusMarkers` / `ignoredStatusMarkers`
2. Run quality gates (`npm run build`, `npm test`).

**Deliverable:** Cancel/restore behavior is verified and compatible with marker customization.

---

## Manual Test Cases

### TC-01: Single Cancel/Restore

- [x] From task menu, choose `Cancel task` on incomplete task -> line becomes `[-]`.
- [x] Reopen menu -> action now shows `Restore task`.
- [x] Choose `Restore task` -> line becomes `[ ]`.

### TC-02: Bulk Cancel

- [x] Enter Select mode and select 2+ non-cancelled tasks.
- [x] Bulk menu shows `Cancel N selected`.
- [x] Invoke action -> all selected lines become `[-]`; selections clear.

### TC-03: Bulk Restore

- [x] Select only cancelled tasks.
- [x] Bulk menu shows `Restore N selected`.
- [x] Invoke action -> all selected lines become `[ ]`; selections clear.

### TC-04: Mixed Selection Label Rule

- [x] Select a mix of cancelled and non-cancelled tasks.
- [x] Bulk menu shows `Cancel N selected`.

### TC-05: Marker Settings Interactions

- [x] Set `ignoredStatusMarkers` to include `-`; cancel a task -> task is hidden by existing logic.
- [x] Set `doneStatusMarkers` to include `-`; cancel a task -> task appears in Done by existing logic.
- [x] Remove `-` from both settings; cancel a task -> task behavior follows existing non-done, non-ignored parsing.

### TC-06: Done Column Archive-All Unchanged

- [x] Done column menu still contains `Archive all`.
- [x] No `Cancel all` / `Restore all` option appears.
