Status: IN_PROGRESS

# SPEC 0023 - Deeper Date Support

## Feature Request Summary

Related issues:

- [#61](https://github.com/ErikaRS/task-list-kanban/issues/61) - FR: Add date support
- [#86](https://github.com/ErikaRS/task-list-kanban/issues/86) - FR: add Tasks plugin compatibility

Task List Kanban already parses Tasks-plugin and Dataview task metadata so users can display, sort, and group by fields such as due, scheduled, start, priority, done, and completion. This spec covers the next layer: writing date metadata back to the Markdown task line when users complete tasks or choose dates from the board.

This spec intentionally does not attempt full Tasks-plugin workflow delegation, recurring task expansion, or arbitrary custom status transitions. It adds predictable write-back in the selected property schema and leaves deeper Tasks-plugin runtime integration as a later decision.

## User Requirements

1. When the board's property schema is `Tasks Plugin` and a task is marked done from the board, Task List Kanban adds a Tasks completion date only if the task does not already have one.
2. When the board's property schema is `Dataview` and a task is marked done from the board, Task List Kanban adds a Dataview completion field only if the task does not already have one.
3. Completion-date write-back is disabled when the property schema is `None`.
4. When the board's property schema is `Tasks Plugin` or `Dataview`, users can set due, scheduled, and start dates from the board.
5. Date edits are stored in the selected schema's native syntax.
6. Existing task text, placement tags, non-placement tags, block links, indentation, and checkbox markers are preserved.
7. Existing property values are replaced in place when possible instead of duplicating keys.
8. Users can clear a date from the board, removing the matching property from the source line.
9. All date writes use local calendar dates in `YYYY-MM-DD` format, with no time component.

## High-Level Design

### Existing Foundation

The existing property system already gives the implementation most of the read-side infrastructure:

- `PropertySchemaOption.TasksPlugin` and `PropertySchemaOption.Dataview` choose the active schema.
- `TasksPluginSchema` parses Tasks-style date fields:
  - due: `📅 YYYY-MM-DD`
  - scheduled: `⏳ YYYY-MM-DD` or legacy `⏰ YYYY-MM-DD`
  - start: `🛫 YYYY-MM-DD`
  - done: `✅ YYYY-MM-DD` or legacy `🏁 YYYY-MM-DD`
- `DataviewSchema` parses inline fields:
  - `[due:: YYYY-MM-DD]`
  - `[scheduled:: YYYY-MM-DD]`
  - `[start:: YYYY-MM-DD]`
  - `[completion:: YYYY-MM-DD]`
- Parsed properties include `startIndex` and `endIndex`, which can be used for replacement.

### New Write Adapter

Add a write-side abstraction parallel to the read-side schema abstraction:

```typescript
type WritableDatePropertyKey = "due" | "scheduled" | "start" | "completion";

interface PropertyWriteAdapter {
  schema: PropertySchemaOption.TasksPlugin | PropertySchemaOption.Dataview;
  addCompletionDateIfMissing(rawLine: string, date: string): string;
  upsertDate(rawLine: string, key: Exclude<WritableDatePropertyKey, "completion">, date: string): string;
  removeDate(rawLine: string, key: WritableDatePropertyKey): string;
}
```

The adapter should be a pure string transformer covered by unit tests. It should use parsed property ranges when available, and otherwise append the schema-specific field before any trailing block link.

Completion date uses schema-specific keys:

| Selected schema | Completion key | Written form |
| --- | --- | --- |
| Tasks Plugin | `done` | `✅ YYYY-MM-DD` |
| Dataview | `completion` | `[completion:: YYYY-MM-DD]` |

Editable task dates use these schema-specific forms:

| Date | Tasks Plugin | Dataview |
| --- | --- | --- |
| Due | `📅 YYYY-MM-DD` | `[due:: YYYY-MM-DD]` |
| Scheduled | `⏳ YYYY-MM-DD` | `[scheduled:: YYYY-MM-DD]` |
| Start | `🛫 YYYY-MM-DD` | `[start:: YYYY-MM-DD]` |

For Tasks-plugin scheduled dates, new writes should prefer `⏳`. If an existing legacy `⏰` field is present, replacement may preserve that exact marker to minimize source churn.

### Date UI

Expose due, scheduled, and start date editing from each task card when the selected property schema is `Tasks Plugin` or `Dataview`.

These date fields are optional in the data-entry sense: users may leave any of them empty, and the plugin does not enforce that a task has due, scheduled, or start metadata. There should not be a separate setting for which date fields are editable.

The initial implementation can use compact native date inputs in the task menu or a small task-card metadata editor. A task-menu implementation is lower risk because it avoids increasing card density for users who only need occasional edits.

Expected interactions:

- Selecting a date writes or replaces the matching property.
- Clearing a date removes the matching property.
- Existing parsed values populate the control.
- Invalid or unparsable existing values are shown as empty but are not removed unless the user explicitly sets or clears that field.

### Completion Behavior

When a task transitions from not done to done through `markDone`, `toggleDone`, or a bulk completion path:

1. Update the checkbox marker using the existing done-marker behavior.
2. If the active schema supports writes and the task does not already have a completion date, add the completion property with today's local date.
3. If the task is already done and the user toggles it back to not done, leave the completion property in place for now.

Existing completion dates are historical metadata and should be left unmodified. Completing a task that already has a Tasks `done` date or Dataview `completion` date must not rewrite that date to today. Moving a task out of the Done column, moving it between non-Done columns, restoring it to open, cancelling it, archiving it, editing its content, or changing due/scheduled/start dates must not add, remove, or rewrite an existing completion date.

Leaving completion dates in place on undo is intentionally conservative. Removing them automatically can destroy useful historical data if the user temporarily reopens a task.

### Source Formatting Rules

When writing a date:

1. Prefer replacing the first recognized existing property for that key.
2. If duplicate properties exist, replace the first recognized one and leave the rest untouched.
3. Append new properties after task body content and visible tags, but before a trailing block link.
4. Keep all writes on the same task line.
5. Use one separating space before appended metadata.
6. Do not rewrite unrelated properties or normalize the entire line.

Completion write-back is the exception to the replacement rule: if a completion property already exists, the completion write should return the original line unchanged.

Examples:

```markdown
- [ ] Send invoice #today ^abc123
- [ ] Send invoice #today 📅 2026-06-15 ^abc123
```

```markdown
- [ ] Send invoice #today ^abc123
- [ ] Send invoice #today [due:: 2026-06-15] ^abc123
```

```markdown
- [ ] Send invoice [due:: 2026-06-01]
- [ ] Send invoice [due:: 2026-06-15]
```

## Detailed Behavior

### Tasks Plugin Schema

- Due writes use `📅`.
- Scheduled writes use `⏳` for new fields.
- Start writes use `🛫`.
- Completion writes use `✅`.
- Existing `⏰` scheduled and `🏁` done aliases should be recognized for replacement/removal.
- Removing a date removes the emoji and date token, then normalizes only excess adjacent spaces.

### Dataview Schema

- Writes use enclosed bracket fields such as `[due:: 2026-06-15]`.
- Completion writes use `[completion:: YYYY-MM-DD]`.
- Existing bare fields such as `due:: 2026-06-01` may be replaced in place if the parser identifies a reliable source range.
- New Dataview fields should use bracket syntax even when existing fields are bare, because bracket fields have clearer boundaries and lower risk of swallowing task text.
- Removing a bracket field removes the whole bracketed property.

### Date Semantics

- "Today" for completion write-back uses the user's local date, not UTC.
- Date inputs and stored values are date-only strings.
- The implementation should centralize formatting so tests can inject or mock the current date.

### Out Of Scope

- Delegating checkbox clicks to the Tasks plugin.
- Creating recurring follow-up tasks when a recurring task is completed.
- Supporting Tasks-plugin custom status transition workflows beyond the existing configurable done markers.
- Adding scheduled-task hiding, automatic date-based columns, or overdue badges.
- Editing arbitrary property keys beyond due, scheduled, start, and completion.

## Implementation Plan

### Phase 1: Pure Date Write Helpers ✅ COMPLETE

**Goal:** Source-line transformations can add, replace, and remove supported date fields without touching Obsidian APIs or UI.

1. ✅ Add a property write adapter for Tasks-plugin and Dataview schemas.
2. ✅ Add local-date formatting helpers for `YYYY-MM-DD`.
3. ✅ Unit test Tasks-plugin add, replace, alias replacement, remove, and block-link preservation.
4. ✅ Unit test Dataview add, replace, bare-field replacement, remove, and block-link preservation.

**Deliverable:** Pure helpers can transform representative task lines for both schemas.

**Implemented by:** Current working tree.

### Phase 2: Completion Date Write-Back ✅ COMPLETE

**Goal:** Marking a task done writes a completion date for Tasks and Dataview boards only when the task does not already have one.

1. ✅ Pass the active property schema into task actions.
2. ✅ Update `markDone`, `toggleDone`, and bulk completion paths to write completion metadata only on not-done to done transitions where no completion date already exists.
3. ✅ Ensure column moves, restore/open transitions, cancel/archive actions, and non-completion date edits never mutate existing completion dates.
4. ✅ Unit test action behavior for `None` schema, Tasks schema, Dataview schema, missing completion dates, and existing completion-date preservation.
5. ✅ Manual test completion write-back in the Obsidian test vault.

**Deliverable:** Completing a task from the board can write `✅ YYYY-MM-DD` or `[completion:: YYYY-MM-DD]`.

**Implemented by:** Current working tree.

### Phase 3: Due/Scheduled/Start Date Editing 🚧 IN PROGRESS

**Goal:** Users can set or clear task dates from the board and the selected schema receives the correct source-line update.

1. ✅ Add task action methods for setting and clearing date properties.
2. [ ] Add due, scheduled, and start controls in the task menu or task-card metadata editor when the active schema is Tasks-plugin or Dataview.
3. [ ] Populate controls from parsed task properties while allowing any field to remain blank.
4. ✅ Unit test action-level set and clear behavior for both schemas.
5. [ ] Manual test creating, changing, and clearing dates for Tasks and Dataview boards.

**Deliverable:** Due, scheduled, and start dates can be edited from a task card for Tasks and Dataview boards, with no requirement that any date be present.

**Implemented by:** Current working tree.

### Phase 4: Polish, Docs, And Edge Cases

**Goal:** The feature is documented, discoverable, and resilient around common source-line shapes.

1. [ ] Update README task property documentation.
2. [ ] Add release-note bullets for completion write-back and task date editing.
3. [ ] Verify formatting with tasks that contain placement tags, consolidated tags, non-placement tags, block links, and existing duplicate properties.
4. ✅ Run `npm run build`.
5. ✅ Run `npm test`.

**Deliverable:** Deeper date support is ready for review and release planning.

**Implemented by:** Current working tree.
