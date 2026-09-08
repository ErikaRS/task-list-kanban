Status: COMPLETE
Implemented: 2026-09

# SPEC 0039 - Status-Based Archiving

## Feature Request Summary

Extend archive handling so a board can use one or more checkbox status markers
as its archive classification instead of the built-in `#archived` tag. This
finishes the status-column workflow requested in
[#170](https://github.com/ErikaRS/task-list-kanban/issues/170): users who use
extended checkbox statuses should not need a tag solely to archive a task.

The existing `#archived` behavior remains the default and stays available for
existing boards.

## User Requirements

1. Add a board/default setting that enables **Replace `#archived` with status**.
2. When enabled, require at least one archive status marker; allow more than
   one marker for recognizing previously archived tasks.
3. Archive markers must not overlap any other configured status role. Invalid
   settings show the normal settings validation message and disable Save.
4. When enabled, every archive action writes the first configured archive
   status marker, rather than adding `#archived`.
5. When disabled, archive behavior remains unchanged: open tasks are completed
   and `#archived` is written.

## High-Level Design

### Settings and Persistence

Add two inherited settings, stored with board defaults and board overrides:

```ts
replaceArchiveTagWithStatus?: boolean; // default false
archiveStatusMarkers?: string;         // default ""
```

The status-marker string follows the existing marker conventions: each entry
is one Unicode code point, duplicates and invalid whitespace are rejected, and
the unchecked space is not a valid archive marker. The setting is deliberately
a string rather than a single marker because old tasks may use several archive
markers. The first code point is the marker written by archive actions.

Settings UI belongs with **Task Status Settings**:

```text
Replace #archived with status  [toggle]
Archive status markers          [ input: e.g. dD ]
```

The marker input is visible (or enabled) only while the toggle is on. Its
description makes the write rule explicit: “The first marker is used when
archiving; all listed markers are recognized as archived.” Both controls share
one inheritance/override chip, since the markers do not affect behavior while
the toggle is off.

### Archive Classification

Task parsing gains an archive classification independent of `done` and of a
custom column match:

```text
status replacement off: task is archived iff it has #archived
status replacement on:  task is archived iff its checkbox marker is in
                        archiveStatusMarkers
```

Archived tasks are omitted everywhere the current synthetic `archived` column
is omitted: board cells, task counts, dashboard attention/statistics, and
manual-order presentation. This keeps archive markers from appearing as
ordinary active status-column cards even if a persisted invalid configuration
is loaded.

The `Task.column === "archived"` implementation detail may remain or be
replaced by an explicit archive predicate, but all consumers must use one
shared classification rule. The rule must be evaluated before the built-in
Done routing: an archive marker is archived even if it would otherwise be a
done marker (although settings validation prevents that configuration).

### Archive Writes

With status replacement enabled, archive from the card menu, column bulk
menu, and selected-card command performs this source change:

```markdown
- [/] Review notes #this-week
→ - [d] Review notes #this-week
```

- Write `archiveStatusMarkers[0]` as the checkbox marker.
- Do not add, retain as a placement value, or remove unrelated tags merely
  because the task is archived. In particular, the old `#archived` tag is not
  written by this path. An existing `#archived` tag is left intact; it may be
  meaningful to another board that still uses tag-based archiving.
- Preserve the existing source-column cleanup rule: leaving a status- or
  priority-defined column removes its placement value; leaving a tag-defined
  column removes that column's placement tag(s). This is the same archive
  cleanup behavior as today.
- Do not force the normal done marker when the archive marker is written. The
  archive predicate itself hides the task and directs archive statistics.

When replacement is off, retain the current write exactly: preserve an
already-done marker or set the normal archive completion marker, remove active
placement criteria as applicable, and write `#archived`.

### Validation

Extend the modal's existing `getColumnValidationError`-backed validation path
(or rename it if appropriate) so it checks archive settings whenever they
change. The first returned error is shown in the existing header pill and Save
is disabled.

When replacement is enabled, validation blocks:

1. an empty archive-marker value;
2. malformed, duplicate, multi-code-point, or whitespace archive markers;
3. any archive marker also present in Done, Cancelled, or Ignored markers;
4. any archive marker used by the status cycle sequence or a status-defined
   custom column.

The error should name both conflicting roles, for example:

```text
Archive status marker "d" is also used by column "Done done".
Archive status marker "d" is also a done status marker.
```

Existing saved settings are not migrated. A board whose persisted values would
be invalid is still parsed safely, but the settings modal prevents saving the
conflict until the user resolves it.

## Detailed Behavior

### Examples

With replacement enabled and `archiveStatusMarkers: "dD"`:

| Source task | Result |
| --- | --- |
| `- [d] Read proposal` | Archived and hidden |
| `- [D] Read proposal` | Archived and hidden |
| `- [/] Read proposal` → Archive | `- [d] Read proposal` |
| `- [ ] Read proposal #today` → Archive | `- [d] Read proposal` after the `#today` placement tag is removed |

With replacement disabled, `- [d] Read proposal` is an ordinary task unless
another configured status rule applies; archiving a task writes `#archived` as
it does today.

### Interaction with Columns and Status Actions

- Archive statuses cannot be configured as custom status-column markers, so
  they never need column-order conflict resolution.
- Moving a task to a non-archive status column changes it to that column's
  marker and therefore unarchives it in status-replacement mode.
- Completing, reopening, cancelling, restoring, and cycling a task retain
  their current semantics. If one changes an archived marker to a non-archive
  marker, the task becomes visible again; there is no separate “unarchive”
  action in this slice.
- Nested-task source-block archive actions continue to apply to the parent
  task row and keep the owned block together, as they do now.

### Compatibility and Documentation

- Defaults preserve current behavior (`replaceArchiveTagWithStatus: false`).
- Boards using `#archived` keep recognizing that tag while replacement is off.
- Turning replacement on intentionally changes recognition to status markers;
  it ignores, but does not remove or bulk-convert, existing `#archived` tags.
  This permits the same task to remain archived on a tag-based board while a
  status-based board determines archive state from its checkbox marker.
- Update the README Task Actions and Task Status Settings sections to explain
  both archive modes and the first-marker write behavior.

## Test Plan

1. Unit-test settings parsing/defaults and inherited board/default behavior.
2. Unit-test validation for empty, invalid, duplicate, and each conflicting
   status role; assert the standard validation state disables Save.
3. Unit-test parsing and serialization for first-marker archive writes,
   multiple recognized markers, disabled legacy behavior, and each column
   match mode as an archive source.
4. Unit-test board grouping/counts, dashboard statistics, and manual order to
   confirm status-archived tasks are excluded just like `#archived` tasks.
5. Manually verify the setting UI, invalid-save feedback, card-menu archive,
   selected-card archive, and column bulk archive on a board with status,
   tag, and priority columns.

## Open Questions

1. Should enabling this setting offer a one-time migration of existing
   `#archived` tasks to the first archive status marker? The proposed scope has
   no automatic migration to avoid a surprising vault-wide rewrite.
2. Should status-based archiving be global only, per-board only, or inherit as
   proposed? The existing board-default model strongly favors inheritable
   settings, but archive semantics can differ by board when scopes overlap.

## Implementation Plan

### Phase 1: Configure and Validate ✅ COMPLETE

**Goal:** A user can save valid archive-status settings and cannot save an
ambiguous configuration.

1. ✅ Add persisted settings, defaults, inheritance wiring, and Task Status
   Settings controls.
2. ✅ Add archive-marker validation and normal modal error/save-disable state.
3. ✅ Add parsing and validation tests.

**Deliverable:** Valid settings persist at the appropriate board/default level;
invalid settings display the normal error and cannot be saved.

**Implemented by:** Uncommitted workspace changes

### Phase 2: Archive by Status End to End ✅ COMPLETE

**Goal:** Every archive action writes the configured first marker and archived
tasks are hidden/count correctly.

1. ✅ Centralize archive classification in task parsing/model state.
2. ✅ Route all archive writes through status mode while preserving legacy
   tag mode.
3. ✅ Update board, dashboard, and manual-order consumers and add regression
   coverage.
4. ✅ Update README documentation and run `npm run build` and `npm test`.

**Deliverable:** A board using archive statuses archives, hides, and counts
tasks consistently across all archive entry points.

**Implemented by:** Uncommitted workspace changes
