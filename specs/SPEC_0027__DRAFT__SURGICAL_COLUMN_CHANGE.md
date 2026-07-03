# SPEC 0027: Surgical Column Change (migrate changeColumn off the rewrite path)

Status: DRAFT

## Feature Request Summary

Column changes (drag to another column, "move to column" menu, bulk moves)
currently go through the *rewrite* write path: `rewriteTaskRows` in
`src/ui/tasks/actions.ts` re-serialises the entire task line from the Task
model. Re-serialisation normalises formatting the user never touched — it can
move the column tag to the end of the line, reorder or consolidate other
tags, and collapse spacing. The *edit* path (`editTaskSourceRows`) already
exists and preserves untouched text byte-for-byte; date properties and
swimlane drops use it today.

This spec migrates column changes to the edit path so that moving a card
between columns changes only the column marker on the source line.

Context: the write-path split and its naming were introduced during the
maintainability cleanups of 2026-07 (see `README.architecture.md`, "Write
Paths"). This migration was deliberately deferred because column placement
has four matching modes with different serialisation side effects.

## User Requirements

1. Moving a task to another column must change only the markdown that
   encodes its column, leaving all other text on the line byte-for-byte
   unchanged (inline tag order, spacing, properties, block links).
2. All four column matching modes keep working:
   - **tags** mode: the column's placement tag(s) are swapped.
   - **name** mode: the `#<column-id>` tag is swapped.
   - **status** mode: the checkbox marker character is changed.
   - **priority** mode: the priority property is changed.
3. Moving out of the done column reopens the task (`[x]` → `[ ]`) without
   disturbing an existing completion date property (current behavior:
   completion metadata is left in place; confirm during implementation).
4. Moving to the done column keeps the current `markDone` semantics,
   including adding completion metadata when the schema enables it.
5. Multi-task moves stay batched: one read and at most one write per
   affected file (`transformSourceRows`).
6. No behavior change for `moveTasksToFile`, which intentionally
   re-serialises for the destination column.

## High-Level Design

Replace the Task-model mutation + `serialise()` with a pure line transform:

```
changeColumnTransform(row, { fromColumn, toColumn, columnDefinitions, schemaOption }): string
```

living beside the other pure line editors (candidate home:
`src/ui/tasks/column_change.ts`), applied via `editTaskSourceRows`.

The transform composes three sub-edits, each of which already has precedent
in the codebase:

- **Tag swap** — remove the old column's placement/name tag(s), insert the
  new one. Precedent: `Task.replaceTag` and the swimlane tag logic, but as a
  string edit (regex over `#tag` boundaries, mindful of `#tag/subtag`
  prefixes).
- **Status marker swap** — replace the `[x]` marker char. Precedent:
  `parseSourceTaskLine` / `cycleSourceTaskRowStatus`.
- **Priority swap** — upsert/remove the priority property. Precedent:
  `PropertyWriteAdapter.upsertPriority` / `removePriority`
  (`src/parsing/properties/write.ts`).

Which sub-edits run is decided by the old and new columns' `matchMode`
(`ColumnDefinition` in `src/ui/columns/columns.ts`), mirroring the decisions
`serialise()` makes via `usesStatusMatching` / `usesPriorityMatching`.

### Why this is not a small change

`Task.set column` has side effects the transform must reproduce exactly:

- `done` → delegates to `markDone` semantics (stays on the rewrite of the
  status marker + completion date edit).
- `uncategorised` → removes all column tags; if the task was done, reopens
  the status marker.
- regular column → clears done state, may reset the display status, and
  placement depends on the *target* column's match mode while cleanup
  depends on the *source* column's match mode.

The cross-product of (from-mode × to-mode) is the test matrix. Get the
matrix right and the rest is bookkeeping.

## Detailed Behavior

- Tags-mode → tags-mode: old placement tags removed wherever they appear
  (not moved to end); new placement tag inserted where the old one was, or
  appended before the block link if the line had no column tag.
- Any-mode → status-mode column: marker char set to the column's
  `matchStatus`; no tag added. Old column tag (if any) removed.
- Status-mode → tags/name-mode: marker reset to `[ ]` (or kept if the
  marker also encodes done/cancelled? — see Open Questions), new tag added.
- Priority-mode transitions: priority property upserted/removed via the
  active schema's write adapter; when schema is None, falls back to the
  rewrite path (or blocks the move — see Open Questions).
- `uncategorised`: all recognised column tags removed; done marker reopened.
- Idempotence: applying the transform when the line already encodes the
  target column returns the row unchanged (so the batched write is skipped).

## Open Questions

1. Status-mode interplay with custom status marker orders and done markers:
   when leaving a status column whose marker also appears in
   `doneStatusMarkers`, what should the reopened marker be?
2. Priority-mode columns with schema None have no property writer. Options:
   fall back to rewrite for that case only, or disallow (current rewrite
   path silently does nothing useful either — verify).
3. Should `changeColumn`'s "reopen when previously done" reset the display
   status to `" "` exactly as `Task.set column` does, or preserve an
   in-progress marker? Match current behavior first; revisit separately.
4. Tag insertion position for name/tags mode when the line has no existing
   column tag: end-of-line before block link (matches serialise output) or
   after content? Proposal: before block link, matching serialise.

## Implementation Plan

### Phase 1: Golden-master characterisation tests
**Goal:** Pin current rewrite-path behavior before changing anything.

1. Table-driven tests: (from-mode × to-mode) matrix of source lines through
   the existing `changeColumn` / `moveTasksToColumn`, asserting exact output
   lines.
2. Include lines with: inline tags mid-content, date/priority properties,
   block links, indentation/nesting, consolidateTags on and off.

**Deliverable:** A failing-safe net; any later diff from these outputs is a
deliberate decision recorded in the spec.

### Phase 2: Pure transform for tags/name modes
**Goal:** Cards in tag- and name-matched columns move surgically.

1. Implement `changeColumnTransform` for tag swap + uncategorised + done
   reopen.
2. Route `changeColumn` / `moveTasksToColumn` through `editTaskSourceRows`
   when both columns are tags/name mode; other modes keep the rewrite path.
3. Tests: byte-for-byte preservation of untouched text (the property the
   rewrite path cannot satisfy) + the Phase 1 matrix rows for these modes.

**Deliverable:** Most common moves (tag/name columns) no longer reformat
lines; other modes unchanged.

### Phase 3: Status and priority modes
**Goal:** Full matrix on the edit path.

1. Status marker swap sub-edit; resolve Open Question 1.
2. Priority sub-edit via the write adapters; resolve Open Question 2.
3. Remove the rewrite fallback for column changes (keep `rewriteTaskRows`
   for content/status-cycling actions that genuinely need the model).

**Deliverable:** All column moves are surgical; golden-master diffs reviewed
and either matched or explicitly accepted in this spec.

### Phase 4: Manual verification
**Goal:** Confirm in a real vault.

1. Sandbox vault: drag cards across all four column mode combinations,
   with consolidateTags on/off, and verify file diffs show only the column
   marker changing.
2. Verify undo (Obsidian file history) shows minimal diffs.

**Deliverable:** Checked-off manual test cases (per README.planning.md,
only after actually performing them).
