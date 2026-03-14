# Multi-Folder Scope

Status: IN_PROGRESS

**Related issues:** [#10](https://github.com/ErikaRS/task-list-kanban/issues/10) (FR: Look for Tasks in 2 or more Folders)

## Feature Request Summary

Users with tasks spread across multiple (but not all) vault folders currently have to choose between scoping to a single folder or the entire vault. This feature adds a "Selected folders" scope option so users can specify exactly which folders a kanban board pulls tasks from.

## User Requirements

1. Users can select "Selected folders" as a scope option alongside "This folder" and "All folders"
2. When "Selected folders" is chosen, a folder list UI appears where users can add/remove vault-relative folder paths
3. "This folder" and "All folders" continue to work exactly as today
4. Tasks from all listed folders (and their subfolders) appear on the board
5. The folder list persists in the board's frontmatter settings
6. Invalid folder paths are accepted (the folder may be created later) but validated with a warning
7. The default task file validation respects the new scope option

## High-Level Design

### Scope Setting (C3 approach)

The existing "Folder scope" dropdown gains a third option:

```
Folder scope: [ This folder ▾ ]          ← existing (unchanged)
              [ All folders  ▾ ]          ← existing (unchanged)
              [ Selected folders ▾ ]      ← new
```

When "Selected folders" is chosen, an additional UI section appears below the dropdown:

```
Folder scope: [ Selected folders ▾ ]

  [ projects/active          ] [Add]
  ┌──────────────────────────────┐
  │ projects/active            ✕ │
  │ work/tasks                 ✕ │
  └──────────────────────────────┘
```

- A text input + "Add" button for entering vault-relative folder paths
- A list of currently-included folders, each with a remove (✕) button
- The folder list section is hidden when "This folder" or "All folders" is selected

### Data Model

Add to `SettingValues`:
- `ScopeOption.SelectedFolders = "selectedFolders"` — new enum value
- `scopeFolders: string[]` — list of vault-relative folder paths (default `[]`)

The `scopeFolders` field is only read when `scope === "selectedFolders"`. In other modes it is ignored (but preserved, so switching back to "Selected folders" restores the previous list).

No schema migration is needed: `parseSettingsString()` uses `settingsObject.partial().parse()`, so existing boards without `scopeFolders` will get the default `[]` automatically.

### Filter Plumbing

The `filenameFilter` in `text_view.ts` changes from `string | null` to `string[] | null`:

| Scope Mode | `filenameFilter` value |
|---|---|
| All folders | `null` |
| This folder | `[boardFile.parent.path]` |
| Selected folders | `settings.scopeFolders` (the array as-is) |

`shouldIncludeFilePath` is updated to accept `string[] | null`:
- `null` → include everything (no filter)
- `string[]` → include if the file path matches any folder in the array
- Empty array → include nothing (no folders selected = no tasks shown)

**Important implementation note:** JavaScript's `[]` is truthy, so the existing `!filter` guard would incorrectly treat an empty array as "include everything." The rewritten function must explicitly check for `null` (not just falsiness) to distinguish "no filter" from "empty filter."

All consumers of the filter (`store.ts`, `actions.ts`) already receive it via the `getFilenameFilter` callback, so they adapt automatically.

### Default Task File Validation

The existing `validateDefaultTaskFile` in `settings.ts` builds a `scopeFilter` inline: either `this.boardFolderPath` (for Folder mode) or `null` (for Everywhere). This must gain a third branch: when `scope === SelectedFolders`, pass `this.settings.scopeFolders` (the array). Since `shouldIncludeFilePath` is updated to accept `string[] | null`, the "This folder" case should also change to `[this.boardFolderPath].filter(Boolean)` for type consistency. When scope is "Selected folders", the validation checks whether the default file is inside any of the selected folders.

## Detailed Behavior

### Adding Folders
- User types a vault-relative folder path into the text input and clicks "Add" (or presses Enter — requires explicit `keydown` handler since Obsidian text inputs don't natively submit on Enter)
- Leading/trailing whitespace is trimmed; leading `/` is stripped
- If the path is empty after trimming, nothing happens
- If the path is already in the list, nothing happens (no duplicates)
- The folder is added to `scopeFolders` and appears in the list below
- The text input is cleared after a successful add
- Validation: if the folder doesn't exist in the vault, show an italic "(not found)" suffix on the list entry using `var(--text-error)` styling (non-blocking — the folder may be created later). Folder existence is checked on modal open and on add, not in real-time.
- Adding or removing a folder re-runs `validateDefaultTaskFile()` so the default-file warning stays current

### Removing Folders
- Clicking the ✕ button removes the folder from `scopeFolders`
- Removing a folder re-runs `validateDefaultTaskFile()` so the default-file warning stays current
- The task list updates on save to reflect the new scope

### Subfolder Inclusion
- Adding `projects` includes `projects/active/tasks.md`, `projects/archive/old.md`, etc.
- This matches the existing `shouldIncludeFilePath` behavior — a file is included if its path starts with `folderPath/` or equals `folderPath`

### Switching Scope Modes
- Switching from "Selected folders" to "This folder" or "All folders" does not clear `scopeFolders` — the list is preserved but ignored
- Switching back to "Selected folders" restores the previous folder list
- This avoids accidental data loss when experimenting with scope modes

### Empty Folder List
- If "Selected folders" is selected but the list is empty, no tasks are shown (the board is effectively empty)
- This is a valid state — the user may be in the process of adding folders

### Edge Cases
- Folder paths with special characters are stored as-is (Obsidian handles them internally)
- A folder path that matches another as a prefix won't cause double-inclusion — `shouldIncludeFilePath` checks for exact match or prefix + `/`, so `project` won't match `project-archive`

### Plugin Downgrade Behavior
If a user downgrades to an older plugin version after using "Selected folders," the old version will encounter `scope: "selectedFolders"` in the frontmatter. The Zod schema's `z.nativeEnum(ScopeOption).default(ScopeOption.Folder)` will fail to parse the unknown value, and the `partial().parse()` + spread with `defaultSettings` pattern will fall back to `ScopeOption.Folder`. The `scopeFolders` array remains in the frontmatter but is ignored by the old version. This is safe and reasonable degradation.

## Implementation Plan

### Phase 1: Data Model & Filter Logic
**Goal:** The scope enum, settings schema, and filter function support multiple folders. Testable via unit tests.

1. Add `ScopeOption.SelectedFolders = "selectedFolders"` to `settings_store.ts`
2. Add `scopeFolders: z.array(z.string()).default([]).optional()` to the Zod schema
3. Add `scopeFolders: []` to `defaultSettings`
4. Rewrite `shouldIncludeFilePath` in `scope.ts` to accept `string[] | null` instead of `string | null`. Use explicit `=== null` check (not `!filter`) to distinguish "no filter" from "empty array"
5. Add unit tests in `scope.tests.ts`: multi-folder array, empty array returns `false`, single-element array, null returns `true`, mixed matches/misses
6. `npm run build` and `npm test` pass

**Deliverable:** Filter logic supports multiple folders, verified by unit tests.

### Phase 2: View Plumbing
**Goal:** The kanban view correctly passes multi-folder filters to the task store. Testable by changing settings JSON manually and verifying tasks appear from multiple folders.

1. Update `text_view.ts` to set `filenameFilter` to `string[] | null` based on the new scope option
2. Update `getFilenameFilter` type signature in `store.ts` from `() => string | null` to `() => string[] | null`
3. Update `shouldHandle` in `store.ts` to pass the array filter
4. Update `actions.ts` `getFilenameFilter` type to match
5. `npm run build` and `npm test` pass

**Deliverable:** Multi-folder scope works end-to-end when settings are configured via frontmatter.

### Phase 3: Settings UI
**Goal:** Users can select "Selected folders" and manage their folder list through the settings modal.

1. Add the `ScopeOption.SelectedFolders` option to the scope dropdown in `settings.ts`
2. Add a container div below the dropdown that shows/hides based on scope selection
3. Add a text input + "Add" button for entering folder paths
4. Add a folder list display with ✕ remove buttons for each entry
5. Wire up add/remove to modify `settings.scopeFolders`; clear text input on successful add; handle Enter key via `keydown` listener
6. Add folder existence validation (italic "(not found)" suffix using `var(--text-error)`)
7. Update `validateDefaultTaskFile` to handle the third scope branch: pass `this.settings.scopeFolders` when scope is `SelectedFolders`, and wrap `this.boardFolderPath` in an array for the `Folder` case
8. Call `validateDefaultTaskFile()` from folder add/remove handlers (not just scope dropdown change)
9. `npm run build` and `npm test` pass

**Deliverable:** Complete working feature — users can configure multi-folder scope through the UI.

## Files to Modify

| File | Change |
|------|--------|
| `src/ui/settings/settings_store.ts` | Add `SelectedFolders` enum value, `scopeFolders` to schema and defaults |
| `src/ui/tasks/scope.ts` | Update `shouldIncludeFilePath` to accept `string[] \| null` |
| `src/ui/tasks/tests/scope.tests.ts` | Add multi-folder filter tests |
| `src/ui/text_view.ts` | Update `filenameFilter` to `string[] \| null`, handle new scope option |
| `src/ui/tasks/store.ts` | Update `getFilenameFilter` type signature |
| `src/ui/tasks/actions.ts` | Update `getFilenameFilter` type signature |
| `src/ui/settings/settings.ts` | Add "Selected folders" dropdown option, folder list UI, validation |

## Out of Scope

- Folder autocomplete/suggest in the add input (can add later based on user feedback)
- Drag-and-drop reordering of the folder list
- Glob/pattern-based folder matching (e.g., `projects/*`)
- Per-folder include/exclude toggles
- Empty-state message on the board when "Selected folders" is active with no folders listed (can add later if users are confused)
- Real-time detection of vault folder renames that invalidate `scopeFolders` entries (consistent with how other settings like `defaultTaskFile` work — validation only on settings modal open)
