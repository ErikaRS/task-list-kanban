# One-Click Add Task

Status: IN_PROGRESS

**Related issues:** [#34 (comment)](https://github.com/ErikaRS/task-list-kanban/issues/34#issuecomment-4063392401) (FR: Skip file picker when default/last-used file is known)

## Feature Request Summary

Users who consistently add tasks to the same file find the mandatory file picker menu friction on every task creation. SPEC_0010 added a default task file that appears first in the picker, reducing clicks from many to 2 (open menu → click default). This feature takes it further: when a target file is known (via default setting or last-used memory), clicking "Add new" skips the picker entirely and opens the inline textarea immediately. A small file indicator below the button shows which file will be used, with a "(change)" link to access the picker when needed.

## User Requirements

1. When a default task file is configured and valid, clicking "Add new" skips the file picker and opens the inline textarea immediately
2. When no default is configured but a file was previously used on this board, that last-used file is remembered and used the same way
3. When no file is known (no default, no last-used — i.e. first use), clicking "Add new" shows the file picker as today
4. A small file indicator appears below the "Add new" button showing the target file path (e.g., `→ tasks.md`)
5. A clickable "(change)" link next to the indicator opens the file picker, allowing the user to pick a different file for this task
6. The file indicator and "(change)" link only appear when a target file is known (not on cold start)
7. Last-used file memory is global per board (not per column)
8. When a file is selected via "(change)", that file becomes the new last-used file
9. When a file is selected via the picker on cold start, that file becomes the last-used file (and the indicator appears for subsequent additions)
10. The default task file (from settings) always takes priority over last-used memory
11. If the target file becomes invalid (deleted, moved outside scope), fall back to picker behavior

## High-Level Design

### Target File Resolution

The system resolves which file to use in priority order:

1. **Default task file** (from board settings, SPEC_0010) — if configured and valid
2. **Last-used file** (in-memory, per board) — if set and still valid
3. **None** — show file picker as today

"Valid" means the file exists in the vault AND is within the board's folder scope.

### Button Area Layout

**When a target file is known:**

```
┌─────────────────────┐
│     + Add new        │  ← click skips picker, opens textarea directly
└─────────────────────┘
  → tasks.md (change)    ← file indicator + clickable change link
```

**When no target file is known (cold start):**

```
┌─────────────────────┐
│     + Add new        │  ← click opens file picker (same as today)
└─────────────────────┘
                          ← no indicator
```

### Last-Used File Storage

The last-used file path is stored in-memory only (not persisted to settings). It resets when the board is closed and reopened. This keeps the implementation simple and avoids polluting settings with transient state. The default task file setting (SPEC_0010) serves as the persistent preference.

### Interaction Flow

**With known target file:**
```
[Add new] → Inline textarea appears immediately (using target file)
            User types → Enter/blur saves → task created

[change]  → File picker menu appears → User picks file
            → That file becomes last-used
            → Inline textarea appears → User types → saves
```

**Without known target file (cold start):**
```
[Add new] → File picker menu appears → User picks file
            → That file becomes last-used
            → Inline textarea appears → User types → saves
            (Next time: indicator appears, button skips picker)
```

## Detailed Behavior

### Target File Resolution

- Resolution happens on each "Add new" click and each "(change)" click
- If the default task file is set in settings, it is always checked first regardless of last-used
- If the resolved file no longer exists or is outside scope, treat as if no target file is known (fall back to picker)
- After a file is selected through the picker (either via cold start or "(change)"), update the last-used file reference

### File Indicator

- Displayed as small muted text below the "Add new" button
- Format: `→ {filename} (change)` where filename is just the file name (not the full path) for brevity
- The full vault-relative path is shown as a tooltip on hover over the filename
- "(change)" is styled as a clickable link (subtle color, e.g., matching theme accent)
- Clicking "(change)" opens the same file picker menu as today (with default file at top if configured)
- The indicator only renders when a target file is known

### File Picker Menu (via "(change)" or cold start)

- The menu is identical to today's menu (SPEC_0010 behavior preserved — default file starred at top with separator)
- When opened via "(change)", selecting a file:
  1. Updates the last-used file
  2. Opens the inline textarea (same as selecting a file via "Add new" today)
- The "(change)" click should position the menu relative to the "(change)" link, not the "Add new" button

### Last-Used File Memory

- Stored as a single `TFile` reference (or vault-relative path string) on the task actions instance
- Scoped to the board's lifecycle — resets when the board view is destroyed and recreated
- Updated whenever a file is selected through the picker (cold start or "(change)")
- Not updated when the default task file is used (the default is authoritative; last-used is the fallback)

### Edge Cases

- **Default file becomes invalid after board opens:** Next "Add new" click falls back to last-used, then to picker
- **Last-used file becomes invalid:** Next "Add new" click falls back to picker; indicator disappears
- **User changes default file in settings:** Next "Add new" click uses the new default; indicator updates
- **User clears default file in settings:** Falls back to last-used file if available; indicator updates reactively. If no last-used file exists, indicator disappears and next "Add new" shows the picker.
- **Multiple columns:** All columns share the same last-used file and show the same indicator (global per board). Since the target file is board-scoped state, updating it (via any column's "(change)" or cold-start pick) reflects in all columns via Svelte reactivity.

## Implementation Plan

### Phase 1: Skip picker when target file is known

**Goal:** Clicking "Add new" skips the file picker and opens the inline textarea directly when a default or last-used file is available.

1. In `actions.ts`, add a `lastUsedFile` variable (string path or null) to the `createTaskActions` closure
2. Add a `getTargetFile()` helper that resolves: default file → last-used file → null, validating each
3. Modify `pickFileForNewTask` to check `getTargetFile()` first — if a valid file is found, call `onFileSelected` directly without showing the menu
4. After any file selection through the picker, update `lastUsedFile`
5. Verify: set default file → click "Add new" → textarea appears immediately (no menu)
6. Verify: no default, add a task via picker → next "Add new" skips picker
7. Verify: no default, no last-used → picker appears as today
8. `npm run build` and `npm test` pass

**Deliverable:** One-click task creation when a target file is known.

### Phase 2: File indicator with "(change)" link

**Goal:** A file indicator below the "Add new" button shows the target file and provides a way to pick a different file.

1. Export a method or reactive value from task actions that exposes the current target file path for the UI
2. In `column.svelte`, render the file indicator below the "Add new" button when a target file is known
3. Style the indicator: small muted text, `→ {filename}`, with a tooltip showing the full path
4. Add a clickable "(change)" span that calls `pickFileForNewTask` directly — the existing method uses `e.target` for menu positioning, so calling it from the "(change)" link naturally positions the menu there. Add a `skipTargetFile` boolean parameter so it always shows the picker.
5. Wire "(change)" file selection to update last-used and open the inline textarea
6. Verify: indicator appears after first task add, shows correct file
7. Verify: clicking "(change)" opens picker, selecting a file updates indicator and opens textarea
8. Verify: indicator does not appear on cold start (no default, no last-used)
9. `npm run build` and `npm test` pass

**Deliverable:** Complete UI with file indicator and change affordance.

## Files to Modify

| File | Change |
|------|--------|
| `src/ui/tasks/actions.ts` | Add `lastUsedFile` state, `getTargetFile()` resolver, skip-picker logic, expose target file for UI |
| `src/ui/components/column.svelte` | Add file indicator + "(change)" link below "Add new" button, wire to picker |
| `src/ui/tasks/store.ts` | Expose target file state to components (if needed for reactivity) |

## Out of Scope

- Persisting last-used file across board reopen (the default task file setting serves this purpose)
- Per-column last-used file memory (global per board is sufficient)
- Per-board setting to force skip picker (explicitly avoiding per-board settings per maintainer preference)
- Keyboard shortcut for "(change)"
