Status: IN_PROGRESS

# SPEC 0024 - Column Property Matching

## Feature Request Summary

GitHub issue:
- [#142](https://github.com/ErikaRS/task-list-kanban/issues/142) - Add support for columns defined by status

Issue #142 has no body text, but the desired direction is that columns should be able to use static, user-defined task properties as placement rules. This is different from **Group by**, which derives dynamic buckets from whatever values are currently present in the task set.

Columns are static and pre-specified. Grouping is dynamic. This means columns by tag, status, or priority make sense; columns by due date do not, because date buckets change continuously and are better handled by sorting, filtering, or future dynamic grouping behavior.

This spec extends the existing column model from [SPEC 0018](complete/SPEC_0018__COMPLETE__COLUMN_TAG_MAPPING.md). It does not replace string/name columns or tags-mode columns, and it does not introduce a board-wide "column type." Each custom column chooses its own definition mode.

## User Requirements

1. Users can define a custom column by task checkbox status marker.
2. Users can define a custom column by priority.
3. Users can continue defining columns by name-derived tags or explicit tags.
4. Column definition mode is per column. A single board can mix columns defined by name, explicit tags, status, and priority.
5. Moving a task into a status-defined column updates the task's checkbox marker.
6. Moving a task into a priority-defined column updates the task's priority metadata using the active property schema.
7. Moving a task removes the source column's match criteria and adds the destination column's match criteria. This rule applies the same way for name, tags, status, and priority columns.
8. Existing boards keep their current behavior without manual migration.
9. Settings validation prevents unreachable, duplicate, or ambiguous column definitions where practical.
10. Column headers make non-tag definition modes visible enough that users can tell why a task belongs in that column.

## High-Level Design

### Conceptual Model

Current columns already have stable IDs and per-column matching through `matchMode: "name" | "tags"`. This spec broadens that idea:

```ts
type ColumnMatchMode = "name" | "tags" | "status" | "priority";

interface ColumnDefinition {
  id: ColumnTag;
  label: string;
  color?: string;
  matchMode: ColumnMatchMode;
  matchTags: string[];
  matchStatus?: string;
  matchPriority?: string;
  matchPropertySchema?: "tasks" | "dataview";
}
```

The new fields are only meaningful for their corresponding mode:

- `name`: existing behavior. The column matches a tag derived from the column label.
- `tags`: existing behavior. The column matches when all configured tags are present.
- `status`: the column matches the task's universal `status` property, parsed from the checkbox marker.
- `priority`: the column matches the canonical `priority` property parsed by the active property schema. Priority columns also store the property schema they were defined for, so Tasks Plugin priority `high` and Dataview priority `high` remain distinct.

The mode belongs to each column. The board does not choose between status columns, priority columns, or tag columns globally.

### Static Columns vs Dynamic Grouping

Status and priority columns are static because the user names and orders the target buckets in settings. For example:

```text
Todo       -> status " "
Doing      -> status "/"
Blocked    -> status "!"
High       -> priority high
Later      -> tag #later
```

Group-by remains the tool for dynamic buckets generated from the current task set. Due date is explicitly not a column definition mode in this spec because date-based buckets are time-relative and can change without the task text changing.

### Matching and Conflict Resolution

A task may satisfy more than one custom column. For example, it may have `#this-week`, status `/`, and high priority. Matching therefore uses the existing specificity model from tags-mode columns and extends it to property modes:

- name mode specificity: `1`
- single-tag tags mode specificity: `1`
- multi-tag tags mode specificity: number of required tags
- status mode specificity: `1`
- priority mode specificity: `1`

The matching column is the highest-specificity match. Equal-specificity ties use column definition order. This preserves current multi-tag behavior and gives users an understandable way to prioritize mixed-mode columns.

Special task visibility rules still take precedence:

- ignored status markers remain hidden from the board
- done status markers still route to the built-in Done column
- archived tasks remain hidden according to existing archive behavior

Custom status columns are for active, non-ignored task statuses. A status-mode custom column that targets a done or ignored marker would be unreachable and should be blocked in settings validation.

### Status Columns

Status-mode columns match the exact marker between `[` and `]` in a Markdown task. The unchecked marker is represented as a single space.

Examples:

```markdown
- [ ] Draft outline
- [/] Write first pass
- [!] Waiting on API access
- [-] Cancelled but still visible
```

Column examples:

```text
Todo       matchStatus = " "
Doing      matchStatus = "/"
Blocked    matchStatus = "!"
Cancelled  matchStatus = "-"
```

Moving a task into a status-mode column rewrites the checkbox marker to the target marker because the destination match criteria is a status value. Moving a task out of a status-mode column removes the source status criteria by restoring the default open marker (`" "`) unless the destination column writes another status marker afterward. Moving between columns that are not status-mode columns must not change the checkbox marker as a side effect.

### Priority Columns

Priority-mode columns match the parsed `priority` property from the active property schema.

For the Tasks Plugin schema, priority columns use the canonical five priority levels:

```text
Highest -> 🔺
High    -> ⏫
Medium  -> 🔼
Low     -> 🔽
Lowest  -> ⏬
```

For the Dataview schema, priority columns match an explicit text value case-insensitively after trimming whitespace:

```markdown
- [ ] Triage support queue [priority:: high]
- [ ] Clean up notes priority:: later
```

Priority columns are unavailable when `propertySchema` is `none`, because there is no configured priority syntax to write back to task source lines.

Moving a task into a priority-mode column upserts the target priority metadata through the active property schema. Moving a task out of a priority-mode column removes the source priority property unless the destination column writes another priority value afterward. Moving between columns that are not priority-mode columns must not change priority metadata as a side effect.

### Header and Card Display

Column headers should show a compact subtitle for non-name modes:

- tags mode: existing tag subtitle, e.g. `#status/now`
- status mode: `Status: /` or `Status: unchecked`
- priority mode: `Priority: High`

Placement metadata should not be duplicated on cards when it is the reason the task matched the current column, except for parsed task properties that are part of the active property display:

- tags used by a matched tags-mode column remain stripped from card tag display
- status is already represented by the checkbox, so no additional card footer is needed
- priority remains visible in the parsed property footer according to the existing property display setting, even when it is also the reason the task matched a priority-mode column

If a task contains priority metadata but matches a different column mode, its priority remains visible according to the existing property display settings.

### Settings UI

The column editor keeps the existing per-column row structure and extends the match mode selector:

```text
Define by: [Column name | Explicit tags | Status marker | Priority]
```

Mode-specific controls:

- Column name: existing label-derived behavior; no extra field.
- Explicit tags: existing tags input.
- Status marker: marker input or selector. It must support the unchecked space marker with a clear label.
- Priority: schema-aware priority selector. Tasks Plugin shows fixed priority choices. Dataview allows an explicit text value and may offer discovered existing values as suggestions.

Changing a column's mode or match value changes which tasks belong in that column. The existing "Update existing task tags" behavior should become "Update existing tasks" and apply to name, tags, status, and priority modes.

The **Priority** mode option should only be offered for new selections when the active property schema supports priority columns. Existing priority-defined columns for another schema remain visible and retain their stored value, but their value control is read-only until the matching property schema is selected again.

### Data Compatibility

Existing column definitions remain compatible as follows:

- string columns remain a supported shorthand for name-defined columns
- existing name-mode and tags-mode columns keep their behavior
- missing `matchStatus` and `matchPriority` fields default to `undefined`
- missing `matchPropertySchema` on priority columns defaults to `tasks` for compatibility with Phase 2 boards
- unknown future modes should degrade safely to name mode during validation/parsing rather than replacing the full settings object with defaults

No automatic board migration creates status or priority columns. Users opt in by editing individual columns.

## Detailed Behavior

### Matching Examples

Given these columns:

```text
This Week      tags: #this-week
Doing          status: /
High Priority  priority: high
Review         name-derived tag: #review
```

Task placement:

- `- [/] Draft API plan` matches Doing.
- `- [ ] Draft API plan #this-week` matches This Week.
- `- [/] Draft API plan #this-week` matches whichever of This Week and Doing appears first, because both have specificity `1`.
- `- [/] Draft API plan #project/alpha #this-week` matches a multi-tag column requiring both tags if one exists, because specificity `2` beats the status match.
- `- [ ] Fix release blocker ⏫` matches High Priority when Tasks Plugin schema is active and the column targets High.

### Moving Between Mixed Column Modes

When moving a task between columns, the app applies this sequence:

1. Remove the placement value for the source column if the task still has it.
2. Write the placement value for the destination column.
3. Preserve unrelated task text, unrelated tags, unrelated properties, indentation, and block links.

This is the core placement invariant:

```text
source column match criteria = C
destination column match criteria = D

move task:
  remove C
  add D
```

The rule is independent of the relative types or values of `C` and `D`. The app should not infer extra cleanup from the destination column type, and it should not rewrite unrelated placement dimensions. A status marker changes only when `C` or `D` is a status-mode match criterion. Priority metadata changes only when `C` or `D` is a priority-mode match criterion. Tags change only when `C` or `D` is a name-derived or explicit tag criterion.

Examples:

- Status `/` -> tag `#this-week`: remove status `/` by restoring `[ ]`; add `#this-week`.
- Tag `#this-week` -> status `/`: remove `#this-week`; add status `/` by changing the checkbox to `[/]`.
- Priority High -> status `/`: remove high-priority metadata; add status `/` by changing the checkbox to `[/]`.
- Status `/` -> priority High: remove status `/` by restoring `[ ]`; add high-priority metadata.
- Tag `#this-week` -> priority High: remove `#this-week`; add high-priority metadata; leave the checkbox marker unchanged.
- Priority High -> tag `#this-week`: remove high-priority metadata; add `#this-week`; leave the checkbox marker unchanged.
- Priority High -> priority Low: remove priority High; add priority Low.

### Completing, Reopening, Cancelling, and Archiving

Existing explicit task actions keep their semantics:

- Completing a task uses the configured done marker and moves it to Done, regardless of custom status columns.
- Reopening a done task restores it to the default open marker unless an existing action already has more specific restore behavior.
- Cancelling and restoring continue to use the configured cancelled marker.
- Archiving removes the active custom column placement value, whether that value is a tag, status marker, or priority property, then applies the archive behavior.

### Settings Validation

Validation must block:

- empty labels
- existing duplicate name/tag definitions from SPEC 0018
- status-mode columns with no marker selected
- status-mode columns targeting a configured done marker
- status-mode columns targeting a configured ignored marker
- duplicate status-mode columns targeting the same marker
- priority-mode columns with no priority value
- priority-mode columns while property schema is `none`
- duplicate priority-mode columns targeting the same canonical priority value for the active schema

Validation should allow:

- mixing modes on the same board
- a tag-mode column and a status-mode column that may both match the same task
- a priority-mode column and a tag-mode column that may both match the same task
- subset relationships among tags-mode columns, preserving the existing specificity behavior

### Explicitly Out Of Scope

- Columns defined by combinations of different properties, such as "high priority with `#client/foo`."
- Columns defined by due date, scheduled date, start date, completion date, or other time-relative fields.
- Dynamic column generation from discovered statuses, priorities, tags, dates, or files.
- Group-by changes. Existing property grouping remains separate from this feature.
- Multi-value priority matching in a single column.
- More than one status marker per column.
- Changing how the built-in Done or Uncategorized columns are defined.

## Implementation Plan

Each phase should produce an end-to-end feature slice that can be tested independently.

### Phase 1: Status-Defined Columns ✅ COMPLETE

**Goal:** Users can define columns by active checkbox status markers and move tasks between those columns.

1. ✅ Extend `ColumnMatchMode`, `ColumnDefinition`, settings parsing, and migration with `status` mode and `matchStatus`.
2. ✅ Update matching helpers to accept task properties, not only task tags, while preserving current name and tags behavior.
3. ✅ Add status-mode settings UI with unchecked marker support and validation against done/ignored markers.
4. ✅ Update board placement and drag/drop write-back so moving into a status column rewrites the checkbox marker.
5. ✅ Generalize source-column cleanup so moving out of a status column clears the old marker only because the source criteria is status-mode.
6. ✅ Add header subtitles for status-mode columns.
7. ✅ Tests: status matching, mixed status/tag resolution, status write-back, source cleanup, done/ignored precedence, migration safety, settings validation.

**Deliverable:** A board can mix existing tag/name columns with status-defined columns such as Todo, Doing, Blocked, and Cancelled.

**Implemented by:** Pending commit

### Phase 2: Tasks Plugin Priority Columns

**Goal:** Users using the Tasks Plugin schema can define and move tasks through priority-defined columns.

1. ✅ Add `priority` mode and `matchPriority` to the column schema.
2. ✅ Add canonical Tasks priority values and display labels for column settings and headers.
3. ✅ Extend property write adapters to upsert and remove Tasks Plugin priority emoji.
4. ✅ Match priority columns against parsed Tasks Plugin priority values.
5. ✅ Update drag/drop placement so moving into a priority column writes the target priority and moving out removes/replaces source priority placement.
6. ✅ Keep priority visible in parsed card metadata when it is the active placement reason.
7. ✅ Tests: priority matching for all five Tasks Plugin values, priority write/replace/remove, mixed-mode resolution, property footer omission, validation.

**Deliverable:** With `propertySchema: tasks`, columns like High, Medium, and Low can be static board columns backed by Tasks Plugin priority metadata.

**Implemented by:** Pending

### Phase 3: Dataview Priority Columns

**Goal:** Users using the Dataview schema can define priority columns with text values.

1. [ ] Add Dataview priority matching using trimmed, case-insensitive text comparison.
2. [ ] Extend the Dataview write adapter to upsert and remove `[priority:: value]` while preserving existing inline-field replacement behavior.
3. [ ] Add schema-aware settings UI so Dataview priority mode accepts a text value and can suggest values discovered from current tasks.
4. [ ] Ensure switching property schema leaves invalid priority columns visible in settings with validation errors instead of silently deleting them.
5. [ ] Tests: Dataview priority match casing, upsert/replace/remove, schema switch validation, discovered-value suggestions if implemented.

**Deliverable:** With `propertySchema: dataview`, columns can be backed by Dataview priority values such as `high`, `medium`, `low`, or user-defined labels.

**Implemented by:** Pending

### Phase 4: Definition Change Migration, Documentation, and Final Audit

**Goal:** Settings changes, docs, and quality gates reflect the generalized column definition model.

1. [ ] Rename user-facing "Update existing task tags" copy to "Update existing tasks"
2. [ ] Generalize changed-column migration so name, tags, status, and priority rule changes can update existing matching tasks.
3. [ ] Audit archive, duplicate, add-task defaults, bulk move, and move-menu paths for mode-specific placement consistency.
4. [ ] Update `README.md` and any settings help text for status and priority column modes.
5. [ ] Run `npm run build`.
6. [ ] Run `npm test`.

**Deliverable:** The feature is documented, all placement entry points are consistent, and quality gates pass.

**Implemented by:** Pending

## Manual Test Cases

### Status Columns

- [ ] **S1.** Configure a column for unchecked status. Unchecked active tasks appear there.
- [ ] **S2.** Configure a column for `/`. Tasks with `[/]` appear there.
- [ ] **S3.** Drag an unchecked task into the `/` column. The source line changes from `[ ]` to `[/]`.
- [ ] **S4.** Drag a task from a `/` status-defined column into a tag-defined column. The checkbox returns to `[ ]` and the destination tag is written.
- [ ] **S5.** A status-mode column cannot target a done marker configured in Done markers.
- [ ] **S6.** A status-mode column cannot target an ignored marker configured in Ignored markers.

### Priority Columns

- [ ] **P1.** With Tasks Plugin schema active, a task containing `⏫` appears in a High priority column.
- [ ] **P2.** Drag a task into a High priority column. The source line gains `⏫`.
- [ ] **P3.** Drag a High priority task into a Low priority column. `⏫` is replaced with `🔽`.
- [ ] **P4.** Drag a priority-matched task into a status or tag column. The source priority property is removed.
- [ ] **P5.** With Dataview schema active, `[priority:: high]` matches a Dataview priority column for `high`.
- [ ] **P6.** Dataview priority matching is case-insensitive.
- [ ] **P7.** Drag a task from a tag-defined column into a priority-defined column. Priority metadata is written and the checkbox marker is unchanged.

### Mixed Mode Boards

- [ ] **M1.** A board can contain name, tags, status, and priority columns at the same time.
- [ ] **M2.** A task matching two equal-specificity columns appears in the one that comes first in settings order.
- [ ] **M3.** A task matching a multi-tag column and a status column appears in the multi-tag column.
- [ ] **M4.** Reordering columns changes equal-specificity tie resolution but does not rewrite tasks by itself.

### Settings and Compatibility

- [ ] **V1.** String columns load as name-defined columns with unchanged behavior.
- [ ] **V2.** Existing tags-mode columns load with unchanged behavior.
- [ ] **V3.** Duplicate status markers are blocked.
- [ ] **V4.** Duplicate priority values for the active schema are blocked.
- [ ] **V5.** Priority mode is blocked or shown invalid when property schema is None.
- [ ] **V6.** Changing a status column's marker with "Update tasks to match new column definition" checked updates existing tasks.
- [ ] **V7.** Changing a priority column's value with "Update tasks to match new column definition" checked updates existing tasks.
- [ ] **V8.** Cancelling the settings dialog after changing status or priority placement rules does not modify task files.

## Open Questions

1. Should Dataview priority columns store the user-entered value exactly for write-back while matching case-insensitively, or should write-back use a normalized lowercase value?
2. Should priority be hidden from the property footer by default when it defines the active column, or should that be controlled by a later display preference?
