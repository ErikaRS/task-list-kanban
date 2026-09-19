# SPEC 0042: Included Path Scope and Date Templates

Status: COMPLETE
Implemented: 2026-09

**Related issue:** [#172](https://github.com/ErikaRS/task-list-kanban/issues/172) — Add Included paths (like excluded paths)

## Feature Request Summary

Boards can currently search their own folder, the whole vault, or a union of
selected folders, then subtract excluded paths. That works well for broad
boards, but it cannot express a board that follows a small set of individual
files — in particular, a board that shows only today's daily note.

Add **Selected paths**, a precise source-selection mode that accepts files and
folders and resolves date templates such as `daily/{{YYYY-MM-DD}}.md` using
the device's local calendar date. Existing Selected folders settings remain a
supported legacy representation so upgrades and downgrades do not lose board
configuration. Selected paths is not a board filter or saved-view property.

The requested date template directly covers the daily-note workflow. Because
the configured path remains portable, a board can target any daily-note
convention without depending on which plugin created the note.

## User Requirements

1. New board configurations can choose **Selected paths** alongside **Just
   board folder** and **Every folder**. Existing Selected folders
   configurations remain available as a clearly marked legacy state.
2. In Selected paths mode, users can add and remove vault-relative file paths
   and folder paths. A folder includes all descendants; a file includes only
   that file.
3. Selected paths offers an explicit **Include the board's own folder**
   switch. New use of the mode starts with it off, allowing a board to show
   only one chosen note even when the board lives beside other task files.
   Existing Selected folders boards remain in their existing legacy mode
   unless a user explicitly converts them.
4. Users can put local-date templates in selected paths, for example
   `daily/{{YYYY-MM-DD}}.md`, so the resolved source changes at local
   midnight.
5. Excluded paths still take precedence after the selected-path scope has
   been resolved. In precise Selected paths mode they may exclude a selected
   path, including one in the board's own folder.
6. Existing scope modes, selected-folder values, and board-folder protection
   retain their current behavior without an automatic migration.
7. Task loading, dashboard counts, add-card target selection, default-file
   validation, file pickers, task actions, and column-migration operations
   all use the same resolved scope policy.
8. Scope remains board configuration. Search filters, saved views, grouping,
   sorting, and layout never expand or narrow the files a board loads.

## High-Level Design

### Canonical path scope and compatibility

Selected paths is stored as a versioned top-level frontmatter value, separate
from the existing `kanban_plugin` JSON payload:

```ts
// YAML frontmatter key: kanban_plugin_path_scope_v2
interface PathScopeV2 {
  version: 2;
  mode: "selectedPaths";
  active: boolean;
  paths: string[];                 // exact files and recursive folders
  includeBoardFolder: boolean;
  compatibilityProjection: {
    scope: "folder" | "everywhere" | "selectedFolders";
    scopeFolders: string[];
  };
}
```

The accompanying `compatibilityProjection` is the equivalent representation
for the current plugin schema. A new version uses `PathScopeV2` while the
current `kanban_plugin` scope semantically matches that projection: the same
scope mode and the same normalized, de-duplicated set of folder entries
(order is immaterial). The path scope is applied only when `active` is true.
It writes both values whenever Selected paths changes.

Older versions read the compatibility projection and preserve the unknown
top-level `kanban_plugin_path_scope_v2` key when they rewrite
`kanban_plugin`. If scope is changed in an older version, the changed
projection no longer matches the sidecar, so a later new version honors the
user's explicit legacy scope change instead of restoring stale path scope. A
non-matching sidecar is stale: the next write from a new version must remove
it unless the user explicitly selects Selected paths again.

| Scope mode | Candidate files before exclusions | Board folder automatically included | Board-folder exclusion protection |
| --- | --- | --- | --- |
| Just board folder | The board folder and descendants | Yes | Yes (existing behavior) |
| Every folder | Every Markdown file in the vault | N/A | Yes (existing behavior) |
| Legacy selected folders | Board folder plus each legacy `scopeFolders` entry and descendants | Yes | Yes (existing behavior) |
| **Selected paths** | Each configured file exactly, plus each configured folder and descendants; add the board folder only when its switch is on | Only when switched on | No |

The candidate set is a union: a file matching any selected path is in scope.
After candidates are chosen, `excludePaths` is applied as a final subtraction.
The result is then parsed into tasks; the search bar may hide tasks from that
result but cannot cause another file to be read.

This ordering is deliberate:

```text
scope mode + raw configured paths
        │
        ├─ resolve {{date template}} using local today
        ▼
candidate files (union)
        │
        ├─ subtract excluded paths
        ▼
board task source set
        │
        ├─ apply search/filter query to rendered tasks only
        ▼
visible cards
```

For example, a board with Selected paths enabled, its board-folder switch off,
and
`paths: ["daily/{{YYYY-MM-DD}}.md", "projects/alpha"]` in its path-scope
sidecar shows today's
daily note plus every task under `projects/alpha`. Adding `daily` to
`excludePaths` removes the daily note. With the same exclusions under the
legacy modes, the existing board-folder protection remains unchanged.

### Date templates

An entry may contain one or more `{{...}}` date-format segments. Each segment
uses Moment-compatible formatting against **the local calendar date at the
time scope is evaluated**. The recommended daily-note entry is:

```text
daily/{{YYYY-MM-DD}}.md
```

`MM` means month; lower-case `mm` means minutes in Moment formatting and is
therefore not the recommended spelling for a monthly daily-note path. Paths
may combine static and date-formatted portions, for example
`journal/{{YYYY}}/{{YYYY-MM-DD}}.md`.

The raw template is stored in frontmatter; the resolved date is never written
back. No globbing, arbitrary JavaScript, Templater execution, relative-date
arithmetic, or automatic interaction with the Daily Notes plugin is included.
An existing file is not created when the resolved path is absent.

Unmatched braces or an empty template segment are validation errors. Both the
configured expression and each resolved path must be vault-relative: reject
absolute paths and `.` or `..` path segments after normalization. A valid
template that currently resolves to a missing file/folder is allowed and
shown with its resolved path plus the existing non-blocking **(not found)**
warning. It may appear later when a daily-note workflow creates it.

### Shared scope resolution

`resolveScopeFilter` resolves the selected scope into a normalized list of
included paths (`null` means every vault path), including date-template
resolution. `shouldIncludeFilePath` is the single boundary-aware matcher: it
first checks that a file is included, then applies exclusions. Callers pass
the board folder only for modes that protect it from exclusions; Selected
paths passes no protected board folder, so exclusions can remove every source.

The live board, dashboard, picker, task actions, default-file validation, and
column migration all use these shared functions rather than reconstructing
scope locally.

### Persistence and inheritance

`PathScopeV2` is board-local, like `defaultTaskFile`; it is not a global board
default and is never captured in a saved view. Switching away from Selected
paths sets `active` to false and updates the compatibility projection to the
chosen legacy scope; switching back restores the saved paths. New boards use
the existing global Folder/Everywhere defaults, then may opt into Selected
paths locally. The plugin settings page does not offer Selected paths as a
global default: board-specific paths have no global default value, and the
global-settings store cannot retain a compatibility sidecar through an older
plugin's parse-and-save cycle.

Existing global `boardDefaults.scope: "selectedFolders"` remains a legacy
global default and keeps its current semantics. Boards that inherit it can
continue using selected folders, or a user can explicitly create a local
Selected-paths sidecar. This is a compatibility rule, not a new source model.

### Upgrade and downgrade compatibility

Opening a board never writes a migration. The following table defines the
stored forms and their behavior:

| Stored state | Behavior in the new version | Write behavior |
| --- | --- | --- |
| No `scope` override (builtin or inherited Folder) | Just board folder | No sidecar or new scope field. |
| `scope: "folder"` | Just board folder | Unchanged. |
| `scope: "everywhere"` | Every folder | Unchanged. |
| `scope: "selectedFolders"`, no `scopeFolders` | Legacy Selected folders: implicit board folder | Unchanged; no sidecar is created merely by opening. |
| `scope: "selectedFolders"`, folder entries in `scopeFolders` | Legacy Selected folders: board folder plus configured descendants | Keeps the same array and semantics. |
| Global `boardDefaults.scope: "selectedFolders"` | Legacy global Selected folders default | Unchanged; new global UI preserves it but does not create a new Selected-paths default. |
| A board saved with `PathScopeV2` | Canonical exact paths plus optional board folder | Writes its matching compatibility projection into `kanban_plugin`. |
| An inactive `PathScopeV2` board | Its selected paths are retained but not applied | Writes the active legacy scope plus a matching inactive sidecar. |
| A `PathScopeV2` board saved by an old plugin after a non-scope change | Canonical sidecar still matches the compatibility projection | Exact Selected paths is restored when reopened in a new plugin. |
| A `PathScopeV2` board whose compatibility projection changed while downgraded | The changed legacy scope takes precedence | The next new-version write removes the stale sidecar unless the user selects Selected paths again. |

An older version cannot express “do not include the board folder.” While
downgraded, it therefore may show the board folder in addition to the intended
paths. The canonical sidecar remains intact across ordinary old-version saves
and restores the exact Selected-paths behavior on upgrade. An intentional
scope change made while downgraded takes precedence. Date-template entries are
retained as raw strings by older versions and generally match no file there.

### Settings UI

The board Scope section offers **Selected paths** and uses a path editor:

```text
Task source: [ Selected paths ▾ ]

  [ ] Include this board's folder

  [ daily/{{YYYY-MM-DD}}.md                         ] [Add]
  ┌──────────────────────────────────────────────────────┐
  │ daily/{{YYYY-MM-DD}}.md → daily/2026-09-19.md       ✕ │
  │ projects/alpha                                      ✕ │
  └──────────────────────────────────────────────────────┘

Excluded paths
Folders and files the board skips after its scope is chosen.
```

- Use a task-source path suggester, not `FolderSuggest`, so an existing note is selectable
  as well as a folder. Its file suggestions are limited to Markdown files;
  the user may type a date template directly.
- Normalize leading/trailing slashes and whitespace without altering the
  contents of a template.
- Deduplicate raw entries after normalization. Do not deduplicate templates
  by today's resolved result; two different templates can legitimately
  converge today and diverge tomorrow.
- Date-template rows show both their saved expression and today's resolution.
  Static rows continue to use the current path display and missing-path
  warning treatment.
- Folders contribute only their Markdown descendants. An existing selected
  file or template resolution that is not Markdown is rejected with a clear
  task-source validation error rather than silently creating an empty source.
- The board folder is represented only by its toggle. When on, show it as a
  non-removable “(this board)” row, as the old UI did; when off, do not show
  or inject it into the include list. It cannot also appear as a removable
  selected-path row.
- The scope dropdown and both path lists trigger revalidation of the default
  task file and the normal dirty/override lifecycle.

Opening a legacy Selected folders board shows a clearly marked **Legacy
selected folders** state and its existing folder editor. Choosing **Selected
paths** immediately copies its selected folder entries into the new list and
turns on the board-folder toggle, preserving the legacy mode's implicit board
folder without duplicating it as a removable row. No conversion is written on
open or by an unrelated settings save. Confirming the selection writes a
`PathScopeV2` sidecar plus its matching compatibility projection, so its behavior
stays the same while its canonical data becomes explicit.

The global-defaults editor offers Folder and Everywhere for new defaults. If
it loads an existing Selected folders default, it displays a clearly marked
**Legacy selected folders** value so the user can retain it or switch away;
it must not relabel that legacy stored behavior as a new Selected-paths
default.

The default task-file control also accepts the same date-template syntax. It
uses the same vault-relative and Markdown-file validation, resolves
immediately before validation and before creating a task. This makes
the common daily-note board usable for adding cards without a manual file
picker each morning. A missing resolved default remains invalid; the plugin
does not create the note or apply another plugin's template.

`lastUsedTaskFile` remains a literal path. It simply ceases to be a candidate
when the day changes and it is outside the newly resolved scope; a valid
resolved default file takes priority as it does today.

## Detailed Behavior

### Empty, missing, overlapping, and renamed paths

- Selected paths must have at least one effective source: one selected file or
  folder, or the enabled board-folder toggle. The settings modal shows an
  inline error and disables Save otherwise.
- A configured file is included only on an exact path match. A configured
  folder matches itself and descendants using the existing boundary-aware
  `path === entry || path.startsWith(entry + "/")` rule.
- Overlapping paths cause no duplicate parsing; files are enumerated once.
- Missing static entries and currently missing template resolutions stay
  saved. A vault create/rename event re-evaluates scope as today.
- A static path or a template's resolved output that is not vault-relative is
  rejected before it reaches task loading, file pickers, or task-write paths.
- Only Markdown files can be exact task-source paths; folder paths remain
  valid and are filtered to Markdown descendants during enumeration.
- A date rollover re-resolves all template entries, drops tasks from the
  previous resolved file, and loads the next resolved file. It must not write
  settings or modify either note.

### Local-midnight refresh

Each open board with one or more date-template entries schedules the next
local-midnight refresh. At that refresh it re-resolves its scope and
reinitializes its task store. Dashboard-count cache entries for requested
boards whose path scope contains a date template are invalidated and
recomputed. Dashboard tests inject time; production uses the device's local
time.

Changing the system clock, reopening the board, reopening the dashboard, or a
vault event also performs a fresh resolution. No background timer is needed
for boards without templates, and teardown clears every timer/subscription.

### All scope consumers

The following consume the shared scope resolver and matcher rather than
reconstructing scope locally:

| Consumer | Required behavior |
| --- | --- |
| `KanbanView` / task store | Parse only in-scope Markdown files; reinitialize on policy/date change. |
| Task actions | Reject a stale default/last-used target that is no longer in scope. |
| Add-card file picker and command-modal board options | Offer only currently in-scope files. |
| Default task-file validation | Evaluate templates and distinguish missing, excluded, and outside-scope errors. |
| Column rename/tag migration | Apply changes only to the policy's current source files. |
| Dashboard count service | Receive the path-scope sidecar from full frontmatter, match live-board sources, and include date resolution in its cache key. |

### Interaction with filters, saved views, and global defaults

- The `file:` query token is a **card filter** applied after loading. It can
  hide part of Selected paths but cannot reveal a file outside it. Clearing a
  filter never changes scope.
- Saved views retain their sparse view-only set (filter, sort, group, flow,
  width). Applying a view cannot change the board's source scope, `PathScopeV2`,
  `excludePaths`, or `defaultTaskFile`.
- Board-default inheritance may supply legacy `scope` and `excludePaths`.
  `PathScopeV2` and default task file stay specific to one board; global UI
  must not serialize them.
- Exclusions always win after whichever scope mode resolved the include set.
  The board-folder exception is legacy-mode behavior, not a universal rule.

## Implementation Plan

### Phase 1: Precise static path scope ✅ COMPLETE

**Goal:** A board can include an exact mix of static files and folders without
implicitly including its own directory.

1. ✅ Add the versioned `PathScopeV2` parser/writer and its top-level
   frontmatter key, with a matching compatibility projection in
   `kanban_plugin`.
2. ✅ Write and compare the compatibility projection; add parsing/inheritance/downgrade
   regression fixtures for every row of the compatibility matrix, including an
   old client saving an unrelated setting and an old client changing scope;
   verify stale sidecars are removed on the next new-version write.
3. ✅ Extend the shared scope resolver and matcher, preserving legacy
   folder-protection behavior only for the existing modes.
4. ✅ Add scope unit tests for exact files, folders, empty lists, overlaps,
   excludes, board-folder behavior, legacy regression cases, and invalid
   static/template-resolved vault paths and non-Markdown file selections.
5. ✅ Update the settings modal with a Markdown-file-and-folder Selected paths editor
   and empty-scope validation.
6. ✅ Verify manually: a board beside several files can show one chosen file
   only; a selected folder still recurses; an exclusion removes a selected
   file.

**Deliverable:** A testable, persisted Selected paths scope for static file
and folder selection.

**Implemented by:** [b60b607](https://github.com/ErikaRS/task-list-kanban/commit/b60b607) (Refs #172).

### Phase 2: One policy across every file consumer ✅ COMPLETE

**Goal:** Every operation agrees on what the board tracks.

1. ✅ Migrate the task store, actions, file picker, command modal,
   default-file validation, and column migration to the shared scope resolver.
2. ✅ Migrate dashboard stats and its cache-key dependencies.
3. ✅ Add integration tests covering file-picker/default-file/action rejection
   and dashboard/live-board parity for Selected paths.
4. ✅ Verify manually: only selected targets can receive a new card, and the
   dashboard count matches the opened board.

**Deliverable:** Selected paths works consistently for reading, counting, and
writing tasks.

**Implemented by:** [b60b607](https://github.com/ErikaRS/task-list-kanban/commit/b60b607) (Refs #172).

### Phase 3: Date-template daily-note scope ✅ COMPLETE

**Goal:** A board can follow a daily note across local midnight without
external-plugin coupling.

1. ✅ Add the shared template parser/resolver, validation messages, resolved
   row display, and template-aware default task-file validation.
2. ✅ Add local-midnight refresh for open boards and dashboard count
   invalidation with complete cleanup.
3. ✅ Add deterministic tests for formatting, malformed templates, missing
   resolved paths, template deduplication, date rollover, picker behavior,
   default-target behavior, and dashboard cache invalidation.
4. ✅ Verify manually with `daily/{{YYYY-MM-DD}}.md`: open a board on a
   fixture date, advance the injected date across midnight, and confirm cards
   switch files without any settings write.
5. ✅ Run `npm run build` and `npm test`.

**Deliverable:** A daily-note board that tracks the locally resolved note and
can add cards to it when the note exists.

**Implemented by:** [b60b607](https://github.com/ErikaRS/task-list-kanban/commit/b60b607) (Refs #172).

## Files Expected To Change

| File | Change |
| --- | --- |
| `src/ui/settings/settings_store.ts` | Expose resolved path-scope state to consumers while continuing to parse existing scope settings. |
| `src/ui/kanban_frontmatter.ts` | Parse, validate, compare, preserve, and write the `kanban_plugin_path_scope_v2` sidecar plus compatibility projection. |
| `src/ui/tasks/path_scope.ts` | Define, validate, compare, and resolve the canonical path scope and date templates. |
| `src/ui/tasks/scope.ts` | Extend the shared scope resolver and matcher. |
| `src/ui/tasks/tests/path_scope.tests.ts` | Cover path-scope persistence and template resolution. |
| `src/ui/tasks/tests/scope.tests.ts` | Cover Selected-path inclusion and exclusion behavior. |
| `src/ui/settings/settings.ts` | Render/edit Selected paths and validate template-aware default files. |
| `src/ui/settings/suggest.ts` | Limit exact task-source file suggestions to Markdown while retaining folder suggestions. |
| `src/ui/text_view.ts` | Hold the path scope, refresh filters at local midnight, and pass shared filters to the existing task store. |
| `src/ui/tasks/actions.ts` | Validate template-aware task-write targets through the shared scope filter. |
| `src/ui/tasks/create_card_modal.ts` | Restrict command-modal file choices with the shared scope resolver. |
| `src/ui/settings/column_rename_migration.ts` | Use shared scope-derived sources for migration writes. |
| `src/ui/dashboard/board_stats.ts` | Receive and resolve path-scope frontmatter, then invalidate date-dependent counts. |
| `src/entry.ts` | Pass full board frontmatter or an extracted path-scope payload to dashboard counting. |
| Relevant settings, task, action, dashboard, and view tests | Add regression and rollover coverage. |
| `README.md` | Document Selected paths, date templates, precedence, and daily-note example. |

## Out of Scope

- Reading or modifying core Daily Notes, Periodic Notes, Templater, or other
  plugins' private configuration.
- Creating a missing daily note, applying another plugin's file template, or
  guessing a vault's daily-note convention.
- Globs, regular expressions, arbitrary code in path templates, and relative
  date arithmetic.
- Including scope/default-file configuration in saved views.
- Per-path exclusions, path ordering, or a scope mode that combines multiple
  include lists by intersection.
