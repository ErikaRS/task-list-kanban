# Configurable Cancelled Status Markers

Status: COMPLETE

## Feature Request Summary

This spec extends `SPEC_0007__COMPLETE__CANCEL_TASK_DESIGN.md` by making cancelled markers configurable while preserving all existing cancel/restore interaction guarantees.

Current behavior writes and matches only `[-]` for cancellation. New behavior introduces `cancelledStatusMarkers` (default `-`) so users can configure which marker(s) represent cancelled tasks.

This feature is intentionally scoped: cancellation configuration only affects cancel/restore matching and cancellation markup writes. Board placement/visibility and task inclusion continue to be determined by the existing done/ignored pipelines.

## User Requirements

1. Preserve all interaction guarantees from `SPEC_0007__COMPLETE__CANCEL_TASK_DESIGN.md` (single-task menu behavior, bulk behavior, done-column constraints, and non-regression expectations).
2. Add a new setting `Cancelled status markers` in the settings dialog.
3. Validation rules for `cancelledStatusMarkers` must match `doneStatusMarkers` rules:
   - Required (cannot be empty)
   - No whitespace/control characters
   - No duplicate markers
   - Unicode-capable marker handling
4. Persist `cancelledStatusMarkers` in the same per-kanban settings path as existing marker settings (frontmatter `kanban_plugin` serialized settings payload).
5. Update cancel actions (single and bulk) to write the first configured cancelled marker as the checkbox status, replacing the hard-coded `-`.
6. Cancelled-state detection for UI action labeling (`Cancel task` vs `Restore task`, bulk equivalent) must use shared status-marker matching logic, not hard-coded character equality.
7. If a marker overlaps between cancelled and done/ignored settings, cancellation config does not override existing done/ignored semantics:
   - Ignored handling remains unchanged.
   - Done handling remains unchanged.
8. No additional UI changes are allowed beyond adding the new settings field and associated validation feedback consistent with existing marker fields.

---

## High-Level Design

### Inheritance from SPEC_0007

All flows defined in `SPEC_0007__COMPLETE__CANCEL_TASK_DESIGN.md` remain valid. This spec changes only:
- Which marker is written when cancelling
- How cancelled-state matching is detected
- Which setting controls those two behaviors

Everything else (menu locations, bulk flow, Done-column `Archive all` behavior, restore semantics, filtering expectations) remains unchanged.

### UI Changes

#### Settings Dialog

- Add text input labeled `Cancelled status markers`.
- Place adjacent to existing marker settings (`Done status markers`, `Ignored status markers`).
- Use the same immediate validation UX pattern as `Done status markers` (error border + tooltip for invalid input).

### Data Model and Persistence

- Extend settings schema/defaults with `cancelledStatusMarkers` defaulting to `-`.
- Persist/load via existing per-kanban settings serialization in note frontmatter:
  - frontmatter key: `kanban_plugin`
  - value: serialized settings JSON string

### Action and Domain Logic

- Cancel write path:
  - Single task cancel writes first configured cancelled marker.
  - Bulk cancel writes first configured cancelled marker for each selected task.
- Restore remains unchanged and writes `[ ]`.
- Cancelled-state checks use shared marker matching helper logic (same style as done/ignored matching).

### Unicode Handling

- Marker extraction for cancel writes must use first Unicode code point, not UTF-16 code unit slicing.
- Equivalent behavior target: use `Array.from(cancelledStatusMarkers)[0]` style semantics.

### Isolation of Responsibility

Cancellation configuration is isolated to cancellation matching/writing only.

Board behavior is still delegated to existing processing:
1. Ignored marker filtering decides whether a task is included.
2. Done marker classification decides done-column behavior.
3. Cancelled marker classification decides cancel/restore label and cancellation matching only.

No new precedence rules are introduced; existing done/ignored behavior is preserved.

---

## Detailed Behavior

### Settings Interaction

- **Load:** `cancelledStatusMarkers` loads with other settings on kanban open.
- **Save:** saved through existing settings save flow and persisted in frontmatter `kanban_plugin`.
- **Default:** `-` when unset or absent.
- **Validation:** same constraints and feedback model as done markers; invalid values are not accepted into settings state.

### Cancel Task Logic

#### Cancel Single Task

- User action: `Cancel task`
- Writes checkbox marker `[M]` where `M` is first Unicode code point in `cancelledStatusMarkers`.
- Uses shared row update path (same as existing cancel/restore architecture).

#### Restore Single Task

- User action: `Restore task`
- Writes `[ ]` (unchanged).

#### Bulk Cancel/Restore

- Preserves existing `SPEC_0007` behavior for labels and selection clearing.
- Cancel writes first configured cancelled marker.
- Restore writes `[ ]`.

### Cancelled-State Detection

- Task is treated as cancelled for menu labeling when its checkbox status matches any configured character in `cancelledStatusMarkers`, using shared status-match logic.
- This replaces hard-coded `status === '-'` checks.

### Marker Overlap with Existing Settings

If a marker is shared across settings, cancellation config does not override existing behavior:

1. **Overlap with ignored markers:** existing ignored logic may hide/exclude the task.
2. **Overlap with done markers:** existing done logic may classify task as done and place in Done.
3. Cancel/restore still only writes/restores checkbox status and does not alter done/ignored settings behavior.

### Marker Reconfiguration (No Migration)

- Cancelled detection is always based on the current `cancelledStatusMarkers` value only.
- If a user changes `cancelledStatusMarkers` such that old task markers are no longer included, those tasks are no longer considered cancelled by plugin cancel/restore matching.
- Automatic migration/rewriting of existing task markers to a new cancelled marker set is out of scope.
- Recommended transition workflow: temporarily include both old and new markers in `cancelledStatusMarkers` until old markers are no longer in use.

---

## Implementation Plan

### Phase 1: Settings Vertical Slice
**Goal:** User can configure and persist cancelled markers end-to-end.

1. Add `cancelledStatusMarkers` to settings schema/default settings.
2. Add validation function(s) mirroring done-marker constraints.
3. Add settings UI field with same validation feedback pattern as done markers.
4. Verify frontmatter `kanban_plugin` roundtrip persists the new field.

**Deliverable:** Configurable, validated cancelled-marker setting that survives reopen/reload.

### Phase 2: Single-Task Cancel/Restore Vertical Slice
**Goal:** Per-task cancel/restore uses configurable cancelled markers while preserving SPEC_0007 behavior.

1. Pass `cancelledStatusMarkers` through task parse/model/action flow.
2. Replace hard-coded single-task cancellation marker writes with configured marker write.
3. Replace hard-coded cancelled detection with shared marker matching.
4. Verify per-task menu labels and restore behavior are unchanged except for configured marker matching.

**Deliverable:** Single-task cancel/restore works with custom cancelled markers and unchanged UX contract.

### Phase 3: Bulk + Regression Vertical Slice
**Goal:** Bulk operations and overlap behavior remain consistent with SPEC_0007 and marker-setting rules.

1. Update bulk cancel flows to write configured cancelled marker.
2. Ensure bulk label logic uses configurable cancelled detection.
3. Add/extend automated tests for:
   - Default marker behavior (`-`)
   - Custom marker behavior
   - Unicode marker behavior
   - Validation (non-empty, duplicates, whitespace/control chars)
   - Overlap with done/ignored markers
4. Run quality gates: `npm run build`, `npm test`.

**Deliverable:** Configurable cancellation is fully integrated across single/bulk flows with regression coverage.

---

## Manual Test Cases

### TC-01: Setting Configuration and Persistence

- [x] Open settings and verify `Cancelled status markers` shows default `-`.
- [x] Change value to `cC`.
- [x] Save and reopen kanban file.
- [x] Confirm value persists (frontmatter `kanban_plugin` roundtrip).

### TC-02: Validation Rules Match Done Markers

- [x] Attempt empty value -> invalid feedback shown, value not accepted.
- [x] Attempt whitespace-containing value (`c C`) -> invalid feedback shown.
- [x] Attempt duplicate markers (`cc`) -> invalid feedback shown.
- [x] Enter valid Unicode markers (e.g., `✓❌`) -> accepted.

### TC-03: Cancel Write Uses First Configured Marker

- [x] Set `cancelledStatusMarkers` to `cx`.
- [x] Cancel an incomplete task.
- [x] Confirm markdown becomes `[c]` (first marker used).

### TC-04: Unicode First-Marker Write

- [x] Set `cancelledStatusMarkers` to `✅❌`.
- [x] Cancel an incomplete task.
- [x] Confirm markdown uses first Unicode marker `[✅]`.

### TC-05: Custom Cancelled Matching for Restore Label

- [x] Set `cancelledStatusMarkers` to `CA`.
- [x] Manually set task to `[A]`.
- [x] Verify task menu shows `Restore task`.
- [x] Run restore and confirm task becomes `[ ]`.

### TC-06: Bulk Behavior Preserved from SPEC_0007

- [x] In selection mode, select mixed non-cancelled tasks.
- [x] Verify label `Cancel N selected`.
- [x] Run action; all selected tasks written with configured cancelled marker.
- [x] Select only cancelled tasks; verify `Restore N selected`, run action, all become `[ ]`.

### TC-07: Overlap with Done Markers

- [x] Configure `cancelledStatusMarkers` to include marker also present in `doneStatusMarkers`.
- [x] Cancel a task.
- [x] Verify board handling follows existing done logic (unchanged), while cancel action still only writes configured marker.

### TC-08: Overlap with Ignored Markers

- [x] Configure `cancelledStatusMarkers` to include marker also present in `ignoredStatusMarkers`.
- [x] Cancel a task.
- [x] Verify board handling follows existing ignored logic (unchanged), while cancel action still only writes configured marker.

### TC-09: Done Column Menu Unchanged

- [x] Confirm Done column still exposes `Archive all` only.
- [x] Confirm no new `Cancel all` or `Restore all` options appear.

### TC-10: Marker Change Without Migration

- [x] Set `cancelledStatusMarkers` to `-` and create at least one `[-]` cancelled task.
- [x] Change `cancelledStatusMarkers` to `c` (without `-`).
- [x] Verify existing `[-]` tasks are no longer treated as cancelled for cancel/restore matching.
- [x] Change `cancelledStatusMarkers` to `c-`.
- [x] Verify both `[c]` and `[-]` tasks are treated as cancelled for matching during transition.
