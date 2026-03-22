Status: IN_PROGRESS

# Column Tag Mapping and Structured Column Settings

## Feature Request Summary

Users want column display names to be independent from the tag or tags that place tasks into those columns. Today the plugin derives placement tags directly from the column label, which prevents cleaner labels, nested status tags, and explicit multi-tag mappings.

GitHub issues:
- [#32](https://github.com/ErikaRS/task-list-kanban/issues/32) - support column tags independent of column labels
- [#31](https://github.com/ErikaRS/task-list-kanban/issues/31) — filter columns by multiple tags (AND semantics)
- [#28](https://github.com/ErikaRS/task-list-kanban/issues/28) (closed as duplicate)

This change must also preserve other column settings currently embedded in the `columns` string list, such as per-column color definitions like `Doing(#FF5733)`.

## User Requirements

1. Users can give each column a display label that is independent from the tag or tags used to match tasks into that column.
2. Users can configure one or more explicit matching tags per column as an alternative to label-derived matching. When multiple tags are configured, a task must contain **all** of them to match (AND semantics).
3. Each column uses either label-derived matching or explicit tag matching, not both.
4. Label-derived matching recognizes tags that normalize to the same kebab-case form as the column label. For example, a column labeled "In Progress" matches `#in-progress` and `#InProgress` (both kebab-normalize to `in-progress`), but not `#inprogress` or `#IN_PROGRESS`.
5. Existing boards continue to work without manual migration.
6. Existing column colors are preserved when old settings are migrated.
7. Moving a task into a column writes predictable placement tags back to the source file.
8. Changing a column’s label in settings preserves its tag mapping, color, and other configuration.
9. The settings UI presents label, tags, color, and compatibility matching together in a clearer per-column editor, rather than hiding behavior inside a comma-separated text field.
10. Configurations where two columns would always match the same tasks are prevented. This includes identical `matchTags` sets and collisions between label-derived tags and single-tag explicit matches.

## High-Level Design

### Structured Column Model

Replace the current `string[]`-based `settings.columns` model with a structured array:

```ts
interface ColumnDefinition {
  id: string;
  label: string;
  color?: string;
  matchMode: 'name' | 'tags';
  matchTags: string[];
}
```

Key points:

- `id` is a stable internal identifier for UI state and future-safe references.
- `label` is the user-facing column title.
- `color` stores the existing optional hex color.
- `matchMode` selects the matching strategy: `'name'` uses label-derived tag matching (current behavior), `'tags'` uses explicit tags only. These are mutually exclusive.
- `matchTags` contains explicit task tags that place tasks into the column, stored without the `#` prefix (e.g., `"status/now"` not `"#status/now"`). Only used when `matchMode` is `'tags'`. When multiple tags are present, a task must have **all** of them to match (AND semantics).

This separates display concerns from placement logic and removes the need to overload one freeform string with multiple meanings.

### Settings Migration

Existing boards store columns as strings such as:

- `Today`
- `In Progress(#3498DB)`

On load, legacy strings should be converted to structured columns as follows:

- `label`: parsed from the legacy string
- `color`: preserved from `(#RRGGBB)` or `(0xRRGGBB)` suffix. Labels with parentheses that don't match this pattern are left as plain labels (e.g., `Stuff (misc)` → label `"Stuff (misc)"`, no color).
- `matchMode`: `'name'`
- `matchTags`: empty
- `id`: generated stable ID

After parsing, the in-memory representation is always the new structured model. Any save — whether triggered by column changes, other settings, or task edits — writes the structured format back to frontmatter. There is no attempt to preserve the legacy string format once the board has been loaded by the new plugin version.

Legacy boards should behave identically after migration: same labels, same color rendering, same name-based matching, and same serialized task tags when moving tasks.

### Matching Model

Each column uses exactly one matching strategy, determined by `matchMode`:

- **`'name'` mode:** The task matches if it contains any normalized label-derived tag (current behavior). This is the default for migrated columns and preserves backward compatibility.
- **`'tags'` mode:** The task matches if it contains **all** tags listed in `matchTags` (AND semantics). Tag order in the task text is irrelevant — matching is a set membership check. This enables filter-like columns where a task must have multiple tags to qualify, addressing the use case in issue [#31](https://github.com/ErikaRS/task-list-kanban/issues/31).

The parser should build an efficient lookup structure that can test each task's tag set against column match rules, while preserving the current behavior that column tags are not shown as regular footer tags in the board UI.

### Stable Column Identity

Today the internal column identity is effectively derived from `kebab(label)`. That is too fragile once label and tag mapping diverge, and it already mixes identity with serialization concerns.

This spec changes the internal identity model:

- Task grouping inside the app uses `column.id`
- Display uses `column.label`
- Task serialization writes a chosen placement tag, not the column ID
- Collapsed column state should be stored by `column.id`, not by normalized label

This prevents renaming a label from breaking collapse state or any future per-column preferences.

### Settings UI

Replace the comma-separated `Columns` text input with a per-column editor list, visually closer to the concept referenced in issue `#28`.

The editor should mirror the board layout:

1. **Uncategorized row** (fixed at top) — label and color only. No match mode, remove, or drag handle.
2. **Custom column rows** (drag-reorderable) — each row includes:
   - Label input
   - Match mode selector: "Match by column name" vs "Match by explicit tags"
   - Tags input (shown only when match mode is "explicit tags"), for one or more tags
   - Color input or picker
   - Remove button
   - Drag handle for reordering
3. **Done row** (fixed at bottom) — label and color only. No match mode, remove, or drag handle.

The Uncategorized and Done rows should be visually distinct from custom columns (e.g., slightly muted) to make it clear they are fixed bookends, not reorderable or removable.

The UI should make it obvious that:

- The label is for display
- The match mode determines how tasks are placed into the column
- Explicit tags mode requires at least one tag and supports multi-tag AND matching

## Detailed Behavior

### Effective Match Rules

#### Name mode

For a column with `label = "In Progress"`, `matchMode = 'name'`:

- A task with `#in-progress` matches (label-derived)
- A task with `#InProgress` matches (label-derived variant)
- A task with `#status/now` does **not** match (not a label-derived tag)

#### Tags mode — single tag

For a column with `label = "In Progress"`, `matchMode = 'tags'`, `matchTags = ["status/now"]`:

- A task with `#status/now` matches
- A task with `#in-progress` does **not** match (name matching is off)

#### Tags mode — multiple tags (AND)

For a column with `label = "Active Work"`, `matchMode = 'tags'`, `matchTags = ["project/alpha", "status/active"]`:

- A task with both `#project/alpha` and `#status/active` matches (all explicit tags present)
- A task with only `#project/alpha` does **not** match (missing `#status/active`)
- A task with only `#status/active` does **not** match (missing `#project/alpha`)
- A task with `#active-work` does **not** match (name matching is off)

### Writing Tags Back to Tasks

When the app writes a task into a column, it should write all tags needed to satisfy the column's match rule:

1. **Name mode:** Write the normalized label-derived tag.
2. **Tags mode:** Write **all** tags in `matchTags` to the task. Since matching uses AND semantics, every tag is required for the task to re-match the column on reparse.

When removing a task from a column (moving it elsewhere), **all** tags that were written for the source column should be removed from the task. This includes archiving: when a task is archived, all column placement tags should be removed (all `matchTags` for tags-mode columns, the label-derived tag for name-mode columns), consistent with current behavior for single-tag columns.

### Parsing Existing Tasks

When a task's tags satisfy a column's match rule:

- The task is assigned to the corresponding column
- All matching placement tags for that column are removed from visible task content the same way current column tags are handled
- Non-column tags remain regular task tags

If a task satisfies the match rules for multiple different columns, the parser should use the **first matching column** in column definition order. Column order is a more stable tiebreaker than tag position in task text, since AND-matched columns may have tags scattered throughout the task.

A task that has some but not all of a column's `matchTags` does **not** match that column. Those tags remain visible as regular task tags. The task is placed in the Uncategorized column, same as any task that does not fully satisfy any column's match rule.

### Uncategorized and Done Columns

The Uncategorized and Done columns behave exactly as they do today — this spec does not change their logic. They are not configurable via `ColumnDefinition` and do not use tag matching:

- **Done:** A task is done if it has a done marker (e.g., `[x]`) and does not have an archived tag. Column tags are irrelevant. (Existing behavior, unchanged.)
- **Uncategorized:** A task is uncategorized if it is not done and has no recognized column tag. With the new matching model, this means the task does not fully satisfy any configured column's match rule. A partial match (some but not all of a tags-mode column's `matchTags`) still counts as uncategorized. (Same logic as today, just applied to the new match rules.)

### Column Validation

The settings UI must prevent configurations where two columns would always match exactly the same set of tasks:

- Two tags-mode columns cannot have identical `matchTags` sets (same tags in any order)
- A name-mode column's label-derived tag cannot collide with a tags-mode column that has that same tag as its only `matchTags` entry (e.g., name-mode "In Progress" and tags-mode `matchTags = ["in-progress"]` are equivalent and should be rejected). However, a tags-mode column with *additional* tags is valid (e.g., `matchTags = ["in-progress", "high"]` is fine because it requires both tags).
- Two name-mode columns cannot normalize to the same effective label-derived tags
- A tags-mode column must have at least one tag in `matchTags`

The following configurations are **valid** and should not trigger errors:

- **Partial tag overlap** between tags-mode columns. For example, `matchTags = ["project/alpha", "status/active"]` and `matchTags = ["project/alpha", "status/blocked"]` share `project/alpha` but require different additional tags.
- **Subset relationships** between tags-mode columns. For example, column A with `matchTags = ["status/active"]` and column B with `matchTags = ["status/active", "high"]`. A task with both tags matches both columns, but column definition order determines placement. This is a legitimate use case for progressive filtering.

Validation should be inline and should block saving until errors are resolved.

### Column Header Display

For tags-mode columns, the configured `matchTags` should be displayed beneath the column label in smaller, less prominent text. This serves as a gentle reminder of which tags place tasks into the column, since the label alone may not convey the matching rule. Name-mode columns do not need this subtitle since the label itself implies the matching tag.

### Color Handling

Color is a first-class field on `ColumnDefinition`. Migration from the legacy color-in-label format (e.g., `Doing(#FF5733)`) is handled in the Settings Migration section above.

### Settings Change Behavior

#### Renaming a column label

Renaming preserves the column’s `matchTags`, color, and `id` (so collapsed state persists). For tags-mode columns, the rename is purely cosmetic. For name-mode columns, the rename changes the effective match rule (since the derived tag changes), which is treated as a match configuration change (see below).

#### Changing match configuration

A match configuration change is any change that alters which tasks a column matches: switching `matchMode`, editing `matchTags`, or renaming a name-mode column’s label. When this happens, existing tasks tagged with the old rule would become orphaned on reparse.

To handle this, each column in the settings editor should include an **"Update existing task tags"** checkbox, default checked. When checked and the user saves settings, the plugin should:

1. Find all tasks currently matching the column’s **old** match rule
2. Remove the old placement tags from those tasks
3. Write the new placement tags based on the updated match rule

When unchecked, the plugin saves the column settings without modifying any task files. The user accepts that previously-matched tasks will become uncategorized until manually re-tagged.

This checkbox is per-column and only relevant when the column’s matching configuration has actually changed. The setting is applied on save (not immediately) so that canceling the settings dialog has no side effects.

## Implementation Plan

Each phase delivers end-to-end functionality that can be tested and shipped independently.

### Phase 1: Per-Column Settings UI and Migration

**Goal:** Replace the comma-separated column input with a per-column editor, backed by the new structured model. No behavior change to matching.

1. Add `ColumnDefinition` schema. Parse legacy strings into structured columns on load (`matchMode: 'name'`, empty `matchTags`). Preserve color syntax during migration.
2. Generate stable `id` values for migrated columns. Move collapsed-column persistence from normalized labels to `column.id`.
3. Replace the comma-separated column input with a per-column editor showing label and color per row, with add and remove buttons for custom columns.
4. Add bookend rows for Uncategorized (top) and Done (bottom) with label and color only.
5. Validate: empty labels blocked, duplicate name-mode columns that normalize to the same derived tag blocked.
6. Cancel discards all changes. Save writes structured format. Legacy format is not preserved.
7. Tests: migration round-tripping, color preservation, parentheses edge cases, collapsed state by ID, add/remove columns, cancel safety, basic validation.

**Deliverable:** Better settings UI, structured data model in place, identical board behavior. Covers test cases: M1–M6, N1–N6, UI1, UI4–UI9, ID1, CO1–CO4, V4, V8.

### Phase 2: Column Rename with Task Propagation

**Goal:** Users can rename columns and optionally update existing tasks.

1. Renaming a name-mode column's label changes its effective derived tag.
2. Add "Update existing task tags" checkbox (default checked) when a name-mode column's label changes. On save: find tasks with old derived tag, replace with new derived tag.
3. Renaming preserves color, `matchTags`, `id`, and collapsed state.
4. Tests: rename preserves config, task retagging with checkbox on/off, cancel safety.

**Deliverable:** Column rename works end-to-end with optional task migration. Covers test cases: R1–R3, SC5–SC7, ID2.

### Phase 3: Column Reordering

**Goal:** Users can drag columns into a new order in the settings editor.

1. Add drag handles to custom column rows.
2. Uncategorized and Done are fixed bookends — not draggable.
3. Persist new order on save. Cancel reverts.
4. Tests: reorder + save, reorder + cancel, tasks stay in correct columns.

**Deliverable:** Drag-reorder in settings. Covers test cases: O1–O3, UI10.

### Phase 4: Single Explicit Tag Matching

**Goal:** Users can configure a column to match by a single explicit tag instead of its label.

1. Add match mode selector to the per-column editor UI ("Match by column name" vs "Match by explicit tags"). Tags input shown conditionally.
2. Refactor internal column identity: update menus, grouping, and drag/drop flows to pass `column.id` instead of `kebab(label)`. This is required before tags-mode columns can work, since their identity no longer derives from the label.
3. Update matching logic to dispatch on `matchMode`. Tags-mode columns match by explicit tag; name-mode unchanged.
4. Update task serialization: write the explicit tag when moving into a tags-mode column, remove it when moving out. Archive removes the column tag.
5. Strip the explicit tag from card display. Show it as a subtitle beneath the column header.
6. Add "Update existing task tags" checkbox when switching match mode or changing the tag.
7. Add collision validation: identical single tags across columns, name-mode label vs single-tag collision.
8. Tests: single-tag matching, tag stripping, write-back, internal ID refactoring, mode switching with/without task update, collision detection.

**Deliverable:** Full single-tag explicit matching, end to end. Covers test cases: T1–T4, S1–S2, S4, H1–H2, V2–V3, V5, SC1–SC4, SC6, SC8, UI2–UI3, UI5–UI6, AR1–AR2.

### Phase 5: Multi-Tag AND Matching

**Goal:** Tags-mode columns can require multiple tags, all of which must be present (AND semantics).

1. Allow multiple tags in the tags input field.
2. Update matching to check that a task contains **all** `matchTags`. Tag order is irrelevant.
3. Update task serialization to write **all** tags on move-in, remove **all** on move-out and archive.
4. Partial matches go to Uncategorized — those tags remain visible, not stripped.
5. Column header subtitle shows all tags. Tag stripping removes all matched tags.
6. Multi-column conflict resolution uses column definition order.
7. Extend validation: identical `matchTags` sets blocked; subset relationships and partial overlaps are valid.
8. Tests: AND matching, partial match → Uncategorized, tag order independence, write/remove all, archive, conflict resolution, subset validation.

**Deliverable:** Full multi-tag AND matching. Covers test cases: A1–A8, S3, S5, H3, C1–C2, U1–U5, V1, V3, V6–V7, AR3.

### Phase 6: Documentation and Final Audit

**Goal:** Verify no stale assumptions remain and update docs.

1. Final audit for any remaining `kebab(label)` identity patterns or legacy `settings.columns` string assumptions missed in Phase 4.
2. Update `README.md` and settings help text.
3. Run full build and test quality gates.

## Manual Test Cases

All test cases must be checked off before this spec can be marked complete.

### Migration from Legacy Settings

- [ ] **M1.** Open a board that has never been edited with the new plugin version. Columns defined as plain strings (e.g., `Today, In Progress, Blocked`) appear with unchanged labels and behavior.
- [ ] **M2.** Open a board with color-suffixed columns (e.g., `Doing(#FF5733)`, `Review(0x3498DB)`). Labels display without the color suffix. Colors render correctly.
- [ ] **M3.** Open a board with a column whose name contains parentheses but not a valid color (e.g., `Stuff (misc)`). The label is preserved as-is, no color is extracted.
- [ ] **M4.** After migration, tasks that were in specific columns remain in those same columns — nothing moves to Uncategorized unexpectedly.
- [ ] **M5.** After migration, moving a task between columns writes the same tag format that the old plugin would have written.
- [ ] **M6.** Open a legacy board and change any setting (not columns). Save. The board frontmatter now contains structured column definitions, not legacy strings. Board behavior is unchanged.

### Name Mode Matching

- [ ] **N1.** A name-mode column with label "In Progress" matches a task tagged `#in-progress`.
- [ ] **N2.** A name-mode column with label "In Progress" matches a task tagged `#InProgress`.
- [ ] **N3.** A name-mode column with label "In Progress" does **not** match a task tagged `#status/now` (arbitrary unrelated tag).
- [ ] **N4.** A task with no tags at all appears in Uncategorized, not in any name-mode column.
- [ ] **N5.** Moving a task into a name-mode column writes the normalized label-derived tag to the source file.
- [ ] **N6.** Moving a task out of a name-mode column removes the label-derived tag from the source file.

### Tags Mode — Single Tag

- [ ] **T1.** A tags-mode column with `matchTags = ["status/now"]` matches a task tagged `#status/now`.
- [ ] **T2.** A tags-mode column with `matchTags = ["status/now"]` and `label = "In Progress"` does **not** match a task tagged `#in-progress` (name matching is off).
- [ ] **T3.** Moving a task into this column writes `#status/now` to the source file.
- [ ] **T4.** Moving a task out of this column removes `#status/now` from the source file.

### Tags Mode — Multiple Tags (AND)

- [ ] **A1.** A column with `matchTags = ["project/alpha", "status/active"]` matches a task that has both `#project/alpha` and `#status/active`.
- [ ] **A2.** The same column does **not** match a task with only `#project/alpha` (missing second tag). Task appears in Uncategorized.
- [ ] **A3.** The same column does **not** match a task with only `#status/active` (missing first tag). Task appears in Uncategorized.
- [ ] **A4.** The same column does **not** match a task with `#active-work` (label-derived tag, but name matching is off).
- [ ] **A5.** Moving a task into this column writes **both** `#project/alpha` and `#status/active` to the source file.
- [ ] **A6.** Moving a task out of this column removes **both** `#project/alpha` and `#status/active` from the source file.
- [ ] **A7.** A task with both required tags plus additional non-column tags: the task matches the column, both column tags are stripped from display, and the extra tags remain visible.
- [ ] **A8.** A task with `#status/active #project/alpha` matches the same column as a task with `#project/alpha #status/active` — tag order in the task text does not affect matching.

### Archiving

- [ ] **AR1.** Archive a task from a name-mode column. The label-derived tag is removed and the archive tag is added.
- [ ] **AR2.** Archive a task from a single-tag tags-mode column. The explicit tag is removed and the archive tag is added.
- [ ] **AR3.** Archive a task from a multi-tag tags-mode column. **All** `matchTags` are removed and the archive tag is added.

### Tag Stripping from Display

- [ ] **S1.** A task matched by a name-mode column: the label-derived tag is not shown in the card's tag list.
- [ ] **S2.** A task matched by a single-tag tags-mode column: the explicit tag is not shown in the card's tag list.
- [ ] **S3.** A task matched by a multi-tag tags-mode column: all explicit tags are stripped from the card's tag list.
- [ ] **S4.** A task with both column tags and non-column tags: only the column tags are stripped; other tags remain visible.
- [ ] **S5.** A task with some but not all of a tags-mode column's tags (partial match, goes to Uncategorized): none of those tags are stripped; they all remain visible.

### Column Header Display

- [ ] **H1.** A tags-mode column shows its `matchTags` beneath the label in smaller/less prominent text.
- [ ] **H2.** A name-mode column does **not** show a tag subtitle.
- [ ] **H3.** A tags-mode column with multiple tags shows all of them in the subtitle.

### Multi-Column Conflict Resolution

- [ ] **C1.** A task satisfies two columns' match rules. It appears in the column that comes first in column definition order.
- [ ] **C2.** Reordering the columns in settings changes which column wins the conflict.

### Uncategorized and Done

- [ ] **U1.** A task with no recognized tags appears in Uncategorized.
- [ ] **U2.** A task with some but not all tags for a tags-mode column appears in Uncategorized (partial match).
- [ ] **U3.** A done task (`[x]`) appears in Done regardless of what column tags it has.
- [ ] **U4.** A done task with an archive tag does not appear on the board at all.
- [ ] **U5.** An undone task with column tags appears in the matched column, not in Uncategorized or Done.

### Settings UI

- [ ] **UI1.** The settings modal shows a per-column editor list instead of a comma-separated text field.
- [ ] **UI2.** Each column row has: label input, match mode selector, tags input (conditional), and color input.
- [ ] **UI3.** Selecting "Match by explicit tags" reveals the tags input field. Selecting "Match by column name" hides it.
- [ ] **UI4.** Adding a new column defaults to name mode.
- [ ] **UI5.** Removing a column works — tasks that were in it become Uncategorized on next reparse.
- [ ] **UI6.** Canceling the settings dialog discards all changes (no task files modified, no settings changed).
- [ ] **UI7.** Uncategorized appears as the first row in the editor. It has label and color inputs but no match mode, remove button, or drag handle.
- [ ] **UI8.** Done appears as the last row in the editor. It has label and color inputs but no match mode, remove button, or drag handle.
- [ ] **UI9.** Uncategorized and Done rows are visually distinct from custom column rows.
- [ ] **UI10.** Custom columns can be dragged to reorder, but cannot be dragged above Uncategorized or below Done.

### Settings Validation

- [ ] **V1.** Two tags-mode columns with identical `matchTags` (same tags, any order): validation error, save blocked.
- [ ] **V2.** A name-mode column "In Progress" and a tags-mode column with `matchTags = ["in-progress"]`: validation error, save blocked (equivalent match rules).
- [ ] **V3.** A name-mode column "In Progress" and a tags-mode column with `matchTags = ["in-progress", "high"]`: no validation error (multi-tag column requires more than just the label-derived tag).
- [ ] **V4.** Two name-mode columns that normalize to the same label-derived tags: validation error, save blocked.
- [ ] **V5.** A tags-mode column with empty `matchTags`: validation error, save blocked.
- [ ] **V6.** Two tags-mode columns with partial overlap but neither is a subset (e.g., `["a", "b"]` and `["a", "c"]`): no validation error.
- [ ] **V7.** One tags-mode column's `matchTags` is a subset of another's (e.g., `["a"]` and `["a", "b"]`): no validation error. Column order determines which wins.
- [ ] **V8.** An empty column label: validation error, save blocked.

### Settings Change — "Update Existing Task Tags"

- [ ] **SC1.** Change a column from name mode to tags mode with "Update existing task tags" checked. Save. Tasks previously in that column now have the new explicit tags and still appear in the column.
- [ ] **SC2.** Same as SC1 but with "Update existing task tags" unchecked. Save. Tasks previously in that column become Uncategorized (old tags remain, new tags not added).
- [ ] **SC3.** Change a tags-mode column's `matchTags` from `["old-tag"]` to `["new-tag"]` with update checked. Save. Tasks have `#old-tag` removed and `#new-tag` added.
- [ ] **SC4.** Change a tags-mode column's `matchTags` with update unchecked. Save. Task source files are not modified. Tasks with old tags become Uncategorized.
- [ ] **SC5.** Change a name-mode column's label (which changes its derived tag) with update checked. Save. Tasks have old label-derived tag replaced with new one.
- [ ] **SC6.** The "Update existing task tags" checkbox only appears for columns whose match configuration has actually changed. Unchanged columns don't show it.
- [ ] **SC7.** Make changes, then cancel the settings dialog. No task files are modified.
- [ ] **SC8.** Change multiple columns simultaneously with different update-checkbox states. Each column's tasks are updated (or not) independently.

### Rename Behavior

- [ ] **R1.** Rename a name-mode column's label. The column retains its color.
- [ ] **R2.** Rename a tags-mode column's label. The `matchTags` are preserved — tasks still match by the explicit tags, not the new label.
- [ ] **R3.** Rename a column. Its collapsed/expanded state is preserved.

### Stable Column Identity

- [ ] **ID1.** Collapse a column, close and reopen the board. The column is still collapsed.
- [ ] **ID2.** Rename a collapsed column. Close and reopen the board. The column is still collapsed (identity preserved through rename).

### Column Reordering

- [ ] **O1.** Drag a column to a new position in the settings editor. After save, the board displays columns in the new order.
- [ ] **O2.** Reorder columns and cancel the settings dialog. Column order is unchanged.
- [ ] **O3.** Reorder columns that have tasks in them. Tasks remain in their correct columns — only display order changes.

### Color

- [ ] **CO1.** A column with a configured color renders that color in the column header.
- [ ] **CO2.** Changing a column's color in settings takes effect after save.
- [ ] **CO3.** A column with no color configured uses the default styling.
- [ ] **CO4.** A migrated column that had `(#FF5733)` in the legacy format retains that color after migration.

## Open Questions

None remaining.
