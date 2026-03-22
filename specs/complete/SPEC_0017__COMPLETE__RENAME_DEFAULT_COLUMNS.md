Status: COMPLETE
Implemented: 2026-03

# Rename Default Columns (Uncategorized & Done)

## Feature Request Summary

Users want to rename the two default columns ("Uncategorized" and "Done") to labels that better fit their workflow (e.g., "Backlog" instead of "Uncategorized").

GitHub issue: [#13](https://github.com/ErikaRS/task-list-kanban/issues/13)

## User Requirements

1. Users can set a custom display name for the Uncategorized column (per board)
2. Users can set a custom display name for the Done column (per board)
3. Default display names are "Uncategorized" and "Done"
4. Custom names appear everywhere the column name is shown: column header, collapsed column strip, bulk action menus, task context menus
5. Internal identifiers (`"uncategorised"` / `"done"`) remain unchanged -- only display labels change
6. Settings UI groups each default column's name and visibility settings together, positioned immediately after the user-defined columns setting

## High-Level Design

### Settings Changes

Two new optional string fields in the settings schema:

- `uncategorizedColumnName` (default: `"Uncategorized"`)
- `doneColumnName` (default: `"Done"`)

Note: this also changes the default spelling from British "Uncategorised" to American "Uncategorized".

### Settings UI Layout

Reorder the settings modal so the default column settings sit right below the "Columns" input:

```
Columns: [comma-separated input]
Column width: [slider]
Flow direction: [dropdown]

--- Uncategorized column ---
  Name: [text input, placeholder "Uncategorized"]
  Visibility: [dropdown]

--- Done column ---
  Name: [text input, placeholder "Done"]
  Visibility: [dropdown]

Folder scope: [dropdown]
...rest of settings...
```

### Display Name Resolution

`getColumnTitle()` in `column.svelte` currently hardcodes the labels. It will be updated to read from settings, falling back to the defaults. The settings will be passed through from `main.svelte` where they are already available.

### What Does NOT Change

- Internal column identifiers (`DefaultColumns` type stays `"uncategorised" | "done"`)
- Collapsed column state storage (still uses internal IDs)
- Task grouping logic in `groupByColumnTag()`
- The visibility setting labels in the settings modal (they keep saying "Uncategorized" and "Done")
- Any tag-matching or kebab-case logic

## Detailed Behavior

### Display Name Usage

Everywhere a default column's name appears to the user, the custom name is used:

| Location | Current | After |
|----------|---------|-------|
| Column header title | Hardcoded "Uncategorised" / "Done" | Setting value or default |
| Collapsed column strip | Same | Same source |
| Bulk action menu ("Move selected to Done") | Hardcoded | Setting value or default |
| Task context menu ("Move to Done") | Hardcoded | Setting value or default |

### Empty Name Handling

If a user clears the name field entirely, the default name is used (not an empty string). The setting stores empty string, but display resolution falls back to the default.

### Default Spelling Change

The hardcoded "Uncategorised" (British) becomes "Uncategorized" (American) as the default. This is a cosmetic-only change; the internal identifier remains `"uncategorised"` for backwards compatibility.

## Implementation Plan

### Phase 1: Settings & Display ✅ COMPLETE

**Goal:** User can rename default columns and see the new names on the board.

1. ✅ Add `uncategorizedColumnName` and `doneColumnName` to the Zod schema and `defaultSettings` in `settings_store.ts`
2. ✅ Update `getColumnTitle()` in `column.svelte` to read names from settings (passed as new props), falling back to defaults
3. ✅ Thread the setting values from `main.svelte` into `Column` component
4. ✅ Reorder settings modal: move visibility dropdowns under columns input, add name text fields above each visibility dropdown
5. ✅ Update the default display from "Uncategorised" to "Uncategorized"
6. ✅ Add tests for settings parsing with new fields and default fallback behavior

**Deliverable:** Renaming works end-to-end: change name in settings, see it on the board.

### Phase 2: Menus ✅ COMPLETE

**Goal:** Custom names appear in all action menus.

1. ✅ Find all references to hardcoded "Done" and "Uncategorised" in task context menus and bulk action menus
2. ✅ Thread display names into menu-building code (column.svelte bulk menu + task_menu.svelte context menu)
3. ✅ Verify menu items show custom names

**Deliverable:** Context menus and bulk action menus reflect custom column names.
