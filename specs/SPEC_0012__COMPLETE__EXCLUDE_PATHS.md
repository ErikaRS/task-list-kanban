# Exclude Paths

Status: COMPLETE
Implemented: 2026-03

**Related issues:** [#27](https://github.com/ErikaRS/task-list-kanban/issues/27) (FR: Option to exclude a directory or file)

## Feature Request Summary

Users who scope their kanban broadly (e.g., "Every folder" for a whole vault) pick up tasks from template files, AI-generated examples, and other directories they don't want on the board. This feature adds an exclude list that removes specific directories or files from the kanban's scope, applied as a second-pass filter after the existing include logic.

## User Requirements

1. Users can add directories or files to an exclude list that applies across all scope modes
2. Excluded paths are removed after the scope (include) filter runs — i.e., exclude is always a refinement of the current scope
3. The board's own folder is always included regardless of exclude paths — users can exclude parent directories or the board folder itself, but files within the board's own folder will still be included. Subdirectories of the board folder, files within it, and paths outside it can all be excluded normally.
4. Both directories and individual files can be excluded using the same input
5. Non-existent paths are accepted (shown with a "(not found)" warning using the same styling as scopeFolders and defaultTaskFile) but still saved
6. The exclude list persists in the board's frontmatter settings
7. The exclude list UI is always visible (regardless of scope mode), shown as a separate section below the scope settings
8. The UI makes clear that excludes are applied after includes

## High-Level Design

### Exclude Setting

A new "Excluded paths" section appears below the scope settings (below the "Selected folders" UI when visible), always visible regardless of scope mode:

```
Folder scope: [ Every folder ▾ ]

Excluded paths
Directories and files excluded from the scope above. The board's own folder is always included.
  [ templates/daily                ] [Add]
  ┌──────────────────────────────────────┐
  │ templates/daily                    ✕ │
  │ AI/examples/sample-tasks.md        ✕ │
  └──────────────────────────────────────┘
```

- Text input + "Add" button (same pattern as scopeFolders UI)
- Enter key to add (keydown handler, same as scopeFolders)
- Each entry has a remove (✕) button
- Non-existent paths show italic "(not found)" in `var(--text-error)` (same styling as scopeFolders)
- Input placeholder: `e.g., templates or notes/scratch.md`

### Data Model

Add to `SettingValues`:
- `excludePaths: string[]` — list of vault-relative paths to exclude (default `[]`)

Add to Zod schema:
- `excludePaths: z.array(z.string()).default([]).optional()`

No schema migration needed: `parseSettingsString()` uses `settingsObject.partial().parse()`, so existing boards without `excludePaths` will get the default `[]` automatically.

### Filter Logic

The `shouldIncludeFilePath` function in `scope.ts` gains an optional `excludeFilter: string[] | null` parameter:

```typescript
function shouldIncludeFilePath(
  filePath: string,
  filenameFilter: string[] | null,
  excludeFilter?: string[] | null
): boolean
```

Logic:
1. First, apply the existing include filter (unchanged)
2. If the file passes the include filter AND `excludeFilter` is a non-empty array, check if the file matches any exclude path
3. A file matches an exclude path if `filePath === path` or `filePath.startsWith(path + "/")`  (same matching as include, reusing the normalize logic)
4. If matched by an exclude path, return `false`

### Board Folder Override

The board's own folder is always included, even if an exclude path would match it. This is enforced at the filter level by accepting an optional `boardFolderPath` parameter:

```typescript
function shouldIncludeFilePath(
  filePath: string,
  filenameFilter: string[] | null,
  excludeFilter?: string[] | null,
  boardFolderPath?: string | null
): boolean
```

For files within the board folder, only exclude paths that are **more specific** than the board folder (children of it) are applied. Exclude paths that are at or above the board folder level are ignored for those files.

An exclude path is "at or above" the board folder if: `boardFolder === excludePath || boardFolder.startsWith(excludePath + "/")`.

This means:
- Excluding a **parent directory** of the board folder (e.g., excluding `projects/` when the board is at `projects/active/`) will exclude everything in `projects/` **except** files in `projects/active/`
- Excluding the **board folder itself** is a no-op for files in that folder (the exclude is "at" the board folder level)
- Excluding **subdirectories** of the board folder works normally (e.g., excluding `projects/active/templates/` removes those files — the exclude is more specific)
- Excluding **individual files** within the board folder works normally (e.g., excluding `projects/active/scratch.md` — the exclude is more specific)

### UI: Board Folder Exact Match Blocked

The exclude paths UI silently rejects adding a path that exactly matches the board's folder path (same pattern as scopeFolders). This reinforces the mental model that the board's own folder is special. Parent directories of the board folder are allowed in the UI — the filter-level board folder override handles protecting the board folder's files at runtime.

### View Plumbing

In `text_view.ts`, the `excludeFilter` is computed from `settings.excludePaths` and passed alongside `filenameFilter`:

```typescript
this.excludeFilter = settings.excludePaths?.length
  ? settings.excludePaths
  : null;
```

The `getExcludeFilter` callback is passed to the task store and actions, mirroring the existing `getFilenameFilter` pattern.

### Add Task File Picker

The "Add new task" file picker in `actions.ts` already filters files by scope (include filter). It must also apply the exclude filter (with board folder override) so that excluded files and folders do not appear as options. This ensures users can't accidentally create tasks in excluded locations.

### Default Task File Validation

`validateDefaultTaskFile` should also check the exclude list (with board folder override): if the default task file matches an exclude path, show a warning: "File is excluded from the board's scope".

## Detailed Behavior

### Adding Exclude Paths
- User types a vault-relative path and clicks "Add" or presses Enter
- Leading/trailing whitespace is trimmed; leading `/` and trailing `/` are stripped
- Empty strings after trimming are ignored
- Duplicates are ignored (path already in list)
- Path exactly matching the board folder is rejected silently (reinforces that this folder is special)
- Parent directories of the board folder are allowed (filter-level override protects the board folder at runtime)
- The text input is cleared after successful add
- `validateDefaultTaskFile()` is re-run after add

### Removing Exclude Paths
- Click ✕ to remove
- `validateDefaultTaskFile()` is re-run after remove

### Path Matching
- Directory exclude: `templates` excludes `templates/daily.md`, `templates/sub/file.md`, etc.
- File exclude: `notes/scratch.md` excludes only that exact file
- Same prefix-safe matching as includes: `template` does NOT match `templates/file.md`

### Interaction with Scope Modes
- **This folder** + excludes: Tasks from the board's folder, minus excluded paths (but the board folder itself is never fully excluded)
- **Every folder** + excludes: Tasks from the whole vault, minus excluded paths (primary use case from issue). Board folder always survives.
- **Selected folders** + excludes: Tasks from selected folders, minus excluded paths. Board folder always survives.

### Board Folder Override Examples

Given board at `projects/active/kanban.md` (board folder = `projects/active`):

| Exclude path | Effect |
|---|---|
| `projects/` | Excludes everything under `projects/` **except** `projects/active/` |
| `projects/active` | No-op — board folder is always included |
| `projects/active/templates` | Excludes `projects/active/templates/` and its contents |
| `projects/active/scratch.md` | Excludes that specific file |

### Plugin Downgrade Behavior
Older plugin versions will encounter `excludePaths` in frontmatter. The Zod `partial().parse()` pattern will ignore the unknown field. The array remains in frontmatter but is unused. Safe degradation.

## Implementation Plan

### Phase 1: Data Model & Filter Logic
**Goal:** The settings schema and filter function support exclude paths. Testable via unit tests.

1. Add `excludePaths: z.array(z.string()).default([]).optional()` to the Zod schema in `settings_store.ts`
2. Add `excludePaths: []` to `defaultSettings`
3. Update `shouldIncludeFilePath` in `scope.ts` to accept optional `excludeFilter` and `boardFolderPath` parameters
4. Add unit tests in `scope.tests.ts`: exclude single path, exclude multiple paths, exclude with null/empty/undefined (no-op), exclude exact file path, exclude doesn't match prefix-similar paths, exclude combined with include filter, board folder override (parent dir excluded but board folder survives, board folder itself excluded is no-op, subdirectory of board folder excluded works, file within board folder excluded works)
5. `npm run build` and `npm test` pass

**Deliverable:** Filter logic supports exclude paths, verified by unit tests.

### Phase 2: View Plumbing
**Goal:** The kanban view correctly passes exclude filters to the task store and actions. Testable by editing frontmatter settings manually and verifying tasks are excluded.

1. Add `getExcludeFilter` callback to `text_view.ts`, computed from `settings.excludePaths`
2. Pass `boardFolderPath` alongside exclude filter so the board folder override is applied at the filter level
3. Thread `getExcludeFilter` through to `store.ts` (file discovery and event handlers)
4. Thread `getExcludeFilter` and `boardFolderPath` through to `actions.ts` so the "Add new task" file picker excludes files/folders matching the exclude list (with board folder override)
4. `npm run build` and `npm test` pass

**Deliverable:** Exclude paths work end-to-end when configured via frontmatter.

### Phase 3: Settings UI
**Goal:** Users can manage exclude paths through the settings modal.

1. Add "Excluded paths" section below the scope settings in `settings.ts`
2. Add text input + "Add" button (same pattern as scopeFolders)
3. Add exclude path list with ✕ remove buttons and "(not found)" validation
4. Add board folder exact match rejection on add (silent, same as scopeFolders)
5. Update `validateDefaultTaskFile` to also check exclude paths (respecting board folder override)
6. `npm run build` and `npm test` pass

**Deliverable:** Complete working feature — users can manage exclude paths through the UI.

## Files to Modify

| File | Change |
|------|--------|
| `src/ui/settings/settings_store.ts` | Add `excludePaths` to schema and defaults |
| `src/ui/tasks/scope.ts` | Add exclude filter parameter to `shouldIncludeFilePath` |
| `src/ui/tasks/tests/scope.tests.ts` | Add exclude filter tests |
| `src/ui/text_view.ts` | Compute `excludeFilter` from settings, pass to store/actions |
| `src/ui/tasks/store.ts` | Accept and use `getExcludeFilter` callback |
| `src/ui/tasks/actions.ts` | Accept and use `getExcludeFilter` callback |
| `src/ui/settings/settings.ts` | Add exclude paths UI section, update validation |

## Out of Scope

- Glob/pattern-based exclude matching (e.g., `*.template.md`)
- Per-path include/exclude toggles in a unified list
- Folder autocomplete/suggest in the exclude input
- Real-time vault watching for path renames that invalidate exclude entries
