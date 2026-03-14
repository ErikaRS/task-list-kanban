# Default Task File for "Add New"

Status: COMPLETE
Implemented: 2026-03

**Related issues:** [#34](https://github.com/ErikaRS/task-list-kanban/issues/34) (FR: Set default add note path)

## Feature Request Summary

Users who consistently add tasks to the same file find it cumbersome to navigate the folder/file picker menu every time. This feature adds a per-board `defaultTaskFile` setting so the default file appears as a prominent first item in the menu, reducing the common case to 2 clicks (open menu → click default).

## User Requirements

1. Users can configure a default task file per board via board settings
2. When a default is set, the "Add new" file picker shows the default file as a prominent first item
3. A separator visually distinguishes the default from the full file tree
4. The full file picker remains available below the separator (no functionality removed)
5. When no default is set, behavior is identical to today
6. The default file path is stored in the board's frontmatter settings
7. The setting UI provides a text input for the file path (plain text, no autocomplete in v1)
8. If the configured default file doesn't exist or is outside scope, show a disabled indicator in the menu and a warning in settings

## High-Level Design

### Setting

A new optional `defaultTaskFile` field in `SettingValues` storing a vault-relative file path (e.g., `"notes/tasks.md"`). Empty string or undefined means no default.

No schema migration is needed: `parseSettingsString()` uses `settingsObject.partial().parse()`, so existing boards without this field will get the default value automatically.

### Menu Behavior

When `defaultTaskFile` is set and the file exists in the vault:

```
┌──────────────────────────┐
│ Choose a file             │  ← header (disabled, as today)
│ ★ folder/tasks.md         │  ← default file (always full vault-relative path)
│ ─────────────────────     │  ← separator (via Menu.addSeparator())
│ folder-a →                │  ← full tree as today
│ folder-b →                │
│ notes.md                  │
└──────────────────────────┘
```

When `defaultTaskFile` is not set: menu is unchanged from current behavior.

When `defaultTaskFile` is set but the file doesn't exist or is outside scope: a disabled menu item is shown (e.g., `"★ path/file.md (not found)"` or `"★ path/file.md (outside scope)"`) so the user knows their setting is taking effect but the file is unavailable.

### Settings Modal

New setting placed after "Folder scope":

```
Default task file
  "New tasks from 'Add new' will be created in this file by default.
   Leave empty to always show the full file picker."
  [ notes/tasks.md              ]   ← text input
```

## Detailed Behavior

### Default File Resolution
- The stored path is vault-relative (e.g., `"folder/tasks.md"`)
- On menu open, resolve via `vault.getAbstractFileByPath(defaultTaskFile)`
- If it resolves to a `TFile` and is within scope, show it as a clickable default entry
- If it doesn't resolve (file deleted/renamed), show a disabled `"★ path (not found)"` item
- If it resolves but is outside the board's folder scope, show a disabled `"★ path (outside scope)"` item
- The default file may appear both as the default entry and in the tree below — minor duplication is acceptable and simpler than filtering it out

### Menu Item Appearance
- Always show the full vault-relative path with `★` prefix: `"★ folder/tasks.md"`
- For root-level files: `"★ tasks.md"`
- Clicking the default item creates the task immediately (same as clicking any file today)

### Settings Validation
- The text input shows a red border and tooltip warning when:
  - The file doesn't exist in the vault ("File not found")
  - The file is outside the board's folder scope ("File is outside the board's folder scope")
- Validation re-runs when the user changes the text input OR when the folder scope dropdown changes
- Warnings are non-blocking — the user can still save the setting (the file may be created later)
- Empty string = no default (same as undefined), no warning shown

### Edge Case: Default File = Board File
- The board's own file is typically excluded from the file list by existing scope filtering, so this is unlikely to occur in practice. No special handling needed.

## Implementation Plan

### Phase 1: Full Working Feature — Setting + Menu Integration ✅ COMPLETE

**Goal:** User can set a default task file in board settings, and the "Add new" menu shows it as the first item with a separator.

1. ✅ Add `defaultTaskFile: z.string().default("").optional()` to the Zod schema in `src/ui/settings/settings_store.ts`
2. ✅ Add `defaultTaskFile: ""` to `defaultSettings` in `src/ui/settings/settings_store.ts`
3. ✅ Add a text input to the settings modal in `src/ui/settings/settings.ts`, placed after the "Folder scope" setting
4. ✅ Modify `createTaskActions` in `src/ui/tasks/actions.ts` to accept a `getDefaultTaskFile` callback: `getDefaultTaskFile: () => string | null`
5. ✅ In `createTasksStore` (`src/ui/tasks/store.ts`), create the callback reading from the settings store: `() => get(settingsStore).defaultTaskFile || null` and pass it to `createTaskActions`
6. ✅ In the `addNew` method (`src/ui/tasks/actions.ts`), before building the folder tree menu:
   - Call `getDefaultTaskFile()` to get the path
   - If non-null, resolve via `vault.getAbstractFileByPath(path)`
   - If resolved to a `TFile`, insert it as the first menu item (after the header) with `★ {path}` title, then call `menu.addSeparator()`
   - If not resolved, skip — proceed with normal menu
7. ✅ Verify: set a valid default path → "Add new" shows it at top → clicking it creates a task in that file
8. ✅ Verify: set an invalid/empty path → "Add new" shows disabled item / normal menu
9. ✅ Verify: default file outside the board's folder scope shows disabled "outside scope" item
10. ✅ `npm run build` and `npm test` pass

**Deliverable:** Complete working feature — default task file setting persists, and the menu shows it prominently.

**Implemented by:** (pending commit)

### Phase 2: Edge Case Verification & Polish ✅ COMPLETE

**Goal:** Confirm robust behavior across path variations and ensure no regressions.

1. ✅ Test with deeply nested default paths (e.g., `"a/b/c/tasks.md"`)
2. ✅ Test with root-level default paths (e.g., `"tasks.md"`)
3. ✅ Test that clearing the setting and reopening the board reverts to normal menu behavior
4. ✅ Test that the default file entry correctly creates a task with the right column tag
5. ✅ `npm run build` and `npm test` pass

**Deliverable:** Feature handles all path variations correctly.

**Implemented by:** (pending commit)

## Files to Modify

| File | Change |
|------|--------|
| `src/ui/settings/settings_store.ts` | Add `defaultTaskFile` to Zod schema and `defaultSettings` |
| `src/ui/settings/settings.ts` | Add text input with validation for default task file; re-validate on scope change |
| `src/ui/tasks/actions.ts` | Accept `getDefaultTaskFile`, show default/error as first menu item with separator |
| `src/ui/tasks/store.ts` | Create `getDefaultTaskFile` callback from settings store, pass to `createTaskActions` |
| `src/ui/text_view.ts` | Pass board folder path to `SettingsModal` constructor |

## Out of Scope

- File autocomplete/suggest in settings input (nice-to-have for a future enhancement; plain text input is sufficient for v1 since paths are easy to type/paste)
- Single-click add without menu (Approach A/C from brainstorm — can revisit if users request)
- Default file per column (over-engineering for now)
