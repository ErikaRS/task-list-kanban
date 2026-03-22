Status: IN_PROGRESS

# Column Tag Mapping and Structured Column Settings

## Feature Request Summary

Users want column display names to be independent from the tag or tags that place tasks into those columns. Today the plugin derives placement tags directly from the column label, which prevents cleaner labels, nested status tags, and explicit multi-tag mappings.

GitHub issues:
- [#32](https://github.com/ErikaRS/task-list-kanban/issues/32)
- [#28](https://github.com/ErikaRS/task-list-kanban/issues/28) (closed as duplicate)

This change must also preserve other column settings currently embedded in the `columns` string list, especially per-column color definitions like `Doing(#FF5733)`.

## User Requirements

1. Users can give each column a display label that is independent from the tag or tags used to match tasks into that column.
2. Users can configure zero, one, or multiple explicit matching tags per column.
3. Users can optionally keep the current label-derived matching behavior on a per-column basis.
4. Label-derived matching continues to recognize the current normalized variants of a column name, such as `#InProgress` and `#in-progress`.
5. Existing boards continue to work without manual migration.
6. Existing column colors are preserved when old settings are migrated.
7. Moving a task into a column writes a predictable placement tag back to the source file.
8. Renaming a column label does not silently discard that column’s explicit tag mapping or color.
9. The settings UI presents label, tags, color, and compatibility matching together in a clearer per-column editor, rather than hiding behavior inside a comma-separated text field.
10. Invalid or ambiguous configurations, especially duplicate tag mappings across columns, are prevented or clearly surfaced.

## High-Level Design

### Structured Column Model

Replace the current `string[]`-based `settings.columns` model with a structured array:

```ts
interface ColumnDefinition {
  id: string;
  label: string;
  color?: string;
  matchTags: string[];
  matchByName: boolean;
}
```

Key points:

- `id` is a stable internal identifier for UI state and future-safe references.
- `label` is the user-facing column title.
- `color` stores the existing optional hex color.
- `matchTags` contains explicit task tags that place tasks into the column.
- `matchByName` preserves current label-derived matching when enabled.

This separates display concerns from placement logic and removes the need to overload one freeform string with multiple meanings.

### Settings Migration

Existing boards store columns as strings such as:

- `Today`
- `In Progress(#3498DB)`

On load, legacy strings should be converted to structured columns as follows:

- `label`: parsed from the legacy string
- `color`: preserved from `(#RRGGBB)` or `(0xRRGGBB)` suffix
- `matchTags`: empty
- `matchByName`: `true`
- `id`: generated stable ID

After parsing, the in-memory representation should be the new structured model. Serialization may write the new object format back to frontmatter once the board is saved.

### Matching Model

Each column can be matched by:

- Explicit tags in `matchTags`
- Normalized label matching when `matchByName` is enabled

The effective match set for a column is:

- All tags in `matchTags`
- Plus the normalized legacy label variants if `matchByName` is enabled

The parser should build a single lookup table from effective tags to column IDs, while preserving the current behavior that column tags are not shown as regular footer tags in the board UI.

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

Each row should include:

- Label input
- Tags input for one or more explicit tags
- Checkbox: `Also match column name`
- Color input or picker
- Remove / reorder controls if supported by current UI patterns

The UI should make it obvious that:

- The label is for display
- The tags are for task placement
- The checkbox enables the legacy compatibility matching

## Detailed Behavior

### Effective Match Tags

For a column with:

- `label = "In Progress"`
- `matchTags = ["status/now"]`
- `matchByName = true`

The column should match:

- `#status/now`
- The same legacy normalized forms that currently resolve from `"In Progress"`

If `matchByName = false`, only `#status/now` matches.

### Writing Tags Back to Tasks

When the app writes a task into a column, it should choose one canonical placement tag:

1. First explicit tag in `matchTags`, if one exists
2. Otherwise the normalized label-derived tag, if `matchByName` is enabled
3. Otherwise no column tag is written, and the task should remain uncategorized on reparse

Rule 3 is undesirable, so the settings UI should validate against creating a column with neither explicit tags nor name-based matching unless the product intentionally wants a display-only column. Default behavior should avoid this state.

### Parsing Existing Tasks

When a task contains a recognized placement tag:

- The task is assigned to the corresponding column
- The matching placement tag is removed from visible task content the same way current column tags are handled
- Non-column tags remain regular task tags

If multiple tags on the same task match the same column, that is harmless.

If tags on the same task match multiple different columns, the parser should use the first matching tag encountered in task text, matching current “first recognized tag wins” behavior.

### Duplicate Tag Validation

The settings UI must prevent ambiguous mappings:

- The same explicit tag cannot be assigned to multiple columns
- An explicit tag on one column cannot collide with the label-derived tag of another column that has `matchByName = true`
- Two columns with `matchByName = true` cannot normalize to the same effective tag set

Validation should be inline and should block saving until ambiguity is resolved.

### Color Handling

Color is no longer parsed out of the label string. It becomes a first-class field on `ColumnDefinition`.

Migration rules:

- `Doing(#FF5733)` becomes `label = "Doing"`, `color = "#FF5733"`
- `Doing(0x3498DB)` becomes `label = "Doing"`, `color = "#3498DB"`
- Labels that merely contain parentheses but do not match the legacy color syntax should remain plain labels

### Rename Behavior

Changing a column’s label should:

- Update only display text
- Not remove explicit `matchTags`
- Not remove the column color
- Recompute effective legacy matches only if `matchByName = true`
- Preserve collapsed state and other future per-column state by keeping the same `id`

### Backward Compatibility

Legacy boards should behave exactly as before immediately after migration:

- Same labels
- Same color rendering
- Same name-based matching
- Same serialized task tags when moving tasks, unless the user later configures explicit tags

## Implementation Plan

### Phase 1: Structured Settings and Migration

**Goal:** Boards load old column settings into a new structured in-memory model without behavior change.

1. Add `ColumnDefinition` schema and supporting parsing helpers in the settings layer.
2. Extend settings parsing to accept both legacy string columns and new structured columns.
3. Preserve legacy color syntax during migration.
4. Generate stable `id` values for migrated columns.
5. Update tests for settings round-tripping and migration from legacy frontmatter.

**Deliverable:** Existing boards open with unchanged behavior, but the app can now reason about columns as structured objects.

### Phase 2: Matching and Serialization

**Goal:** Task parsing and task writes use explicit column matching rules instead of label-only identity.

1. Replace `ColumnTagTable` with a structure that can map effective tags to `column.id` and resolve `id` back to display metadata.
2. Update task parsing to use explicit tags plus optional label-based matching.
3. Update task serialization to write the canonical placement tag for the destination column.
4. Update menus, grouping, and drag/drop flows to pass column IDs internally.
5. Add tests for explicit tag matching, multi-tag columns, legacy compatibility matching, and duplicate-tag rejection.

**Deliverable:** Users can configure explicit mapping and still move tasks between columns correctly.

### Phase 3: Settings UI Replacement

**Goal:** Users can edit structured column settings directly from a clearer UI.

1. Replace the comma-separated column input with a per-column editor list.
2. Add per-column fields for label, tags, name-based matching checkbox, and color.
3. Surface inline validation for empty labels, duplicate effective tags, and unusable columns.
4. Preserve the existing overall settings modal patterns so this still feels native to the plugin.
5. Confirm the UI reflects the intent discussed in issue `#28`.

**Deliverable:** Users can configure column display and matching rules without encoding behavior into label text.

### Phase 4: State Cleanup and Follow-Through

**Goal:** Finish the migration by removing old assumptions that column identity equals normalized label.

1. Move collapsed-column persistence from normalized labels to stable `column.id` values.
2. Audit all references to `settings.columns` and `kebab(label)` assumptions.
3. Update documentation in `README.md` and settings help text.
4. Run build and test quality gates before landing.

**Deliverable:** Column behavior is fully driven by structured settings, and no major UI or persistence path depends on legacy label parsing.

## Open Questions

1. Should the settings UI allow a column with no effective match tags at all, or should every column be required to have at least one placement rule?
2. Should reordering columns remain in scope for this UI redesign, or should the first pass preserve current ordering without adding drag-reorder controls?
3. When both explicit tags and `matchByName` are enabled, should the first explicit tag always be the write-back tag, or should there be a separate “primary tag” control later if needed?
