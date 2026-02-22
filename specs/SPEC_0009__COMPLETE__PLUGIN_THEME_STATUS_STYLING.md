Status: COMPLETE
Implemented: 2026-02

# Plugin/Theme Status Styling Compatibility

## Feature Request Summary

Users of popular Obsidian plugins/themes (especially Things + Tasks-style status CSS) expect kanban cards to reflect custom checkbox statuses (`[x]`, `[-]`, `[/]`, `[!]`, etc.) exactly like source markdown.

The final implementation keeps normal-mode status rendering theme-native while isolating selection mode visuals from theme CSS conflicts.

## User Requirements

1. In normal mode, status visuals should match source markdown behavior as closely as possible.
2. Selection mode must be visually stable and independent from theme status CSS conflicts.
3. Checkbox/link interactions must never trigger edit mode accidentally.
4. Nested markdown checkboxes inside task content must remain non-interactive.
5. Multi-line content and block links must render correctly.
6. No text clipping, truncation artifacts, or oversized status bars/icons.

## Final Design

### Architecture and Ownership

1. Normal mode uses markdown/theme status rendering.
2. Selection mode uses a plugin-owned selection control.
3. A single card still renders markdown for task content in both modes.

### Rendering Contract

1. Cards render full markdown task items: `- [${task.displayStatus}] ${content}`.
2. Stored `<br />` is converted to `\n` before rendering.
3. Continuation lines are indented by 2 spaces to stay within the same task item.
4. Block links are preserved in rendered markdown.
5. `task.path` remains the markdown renderer source path.

### Interaction Contract

1. Normal mode:
   - The primary rendered markdown checkbox toggles done/undone.
2. Selection mode:
   - The plugin selection control toggles selected/unselected.
   - The primary rendered markdown checkbox is disabled, removed from tab order, and visually hidden via `visibility: hidden` to preserve layout width.
3. Links and form controls in the event path do not open edit mode.
4. Nested rendered checkboxes are always disabled and non-interactive.

### Layout and Alignment Contract

1. Text position is stable across normal and selection mode.
2. The plugin selection control is visually placed in the checkbox lane without shifting text flow.
3. Row start padding is intentionally increased for improved left-edge breathing room.
4. Checkbox vertical alignment is tuned to text centerline with a small positive `translateY` offset.
5. Structural CSS is narrowly scoped; no broad status-icon visual resets are applied in normal mode.

### Accessibility Contract

1. Selection control uses checkbox semantics (`role="checkbox"` + `aria-checked`).
2. Selection control labels are explicit:
   - `Select for bulk actions`
   - `Deselect for bulk actions`
3. Done checkbox labels remain mark complete/incomplete.

## Implementation Summary

### Task Model

1. Added `Task.displayStatus` getter.
2. Added tests covering default status, parsed custom status, done marker selection, and cancel/restore transitions.

### Task Card Rendering

1. Removed plugin-owned normal-mode done icon behavior.
2. Switched card preview rendering to full markdown task line output.
3. Added interactive-target guard logic to prevent accidental edit activation.
4. Added mode-aware checkbox post-processing:
   - primary checkbox behavior differs by mode
   - nested checkboxes are always disabled

### CSS and Visual Tuning

1. Removed broad prototype resets that interfered with theme status rendering.
2. Kept structural list/card rules only.
3. Final visual tuning includes:
   - row start inset increase
   - selection-control horizontal offset into checkbox lane
   - markdown checkbox vertical offset for text-center alignment

## Validation

1. Automated quality gates passed:
   - `npm test`
   - `npm run build`
2. Visual validation was iterated with screenshot-based checks for:
   - normal mode status containment inside card bounds
   - selection mode spacing consistency
   - text-position stability between modes
   - checkbox/text vertical alignment

## Alternatives Considered

1. **Plugin-owned normal-mode done icon (separate from markdown checkbox)**
   - Rejected because it diverged from markdown/theme status rendering and caused visual mismatch for custom statuses.

2. **Use the rendered markdown checkbox for both done + selection behavior**
   - Rejected because mode switching caused mixed semantics and unstable visuals across theme CSS implementations.

3. **Hide primary markdown checkbox in selection mode with `display: none`**
   - Rejected because it changed layout width and shifted text position between modes.

4. **Broad CSS normalization for list items, pseudo-elements, masks, and checkbox visuals**
   - Rejected because it caused collateral regressions (status icon loss, clipping, oversized artifacts, misalignment).

5. **No extra row start inset**
   - Rejected because content felt crowded against the left edge after final alignment tuning.

## Explicit Non-Goals

1. Do not make selection mode depend on `input[data-task]` styling.
2. Do not patch status rendering with marker-specific hacks.
3. Do not apply broad `!important` resets to markdown task pseudo-elements in normal mode.

## References

### Internal

- `/Users/erikars/Code/task-list-kanban/src/ui/components/task.svelte`
- `/Users/erikars/Code/task-list-kanban/src/ui/tasks/task.ts`
- `/Users/erikars/Code/task-list-kanban/src/ui/tasks/tests/task.tests.ts`

### External

- [Things theme CSS](https://github.com/colineckert/obsidian-things/blob/main/theme.css)
- [Obsidian Tasks styling guide](https://publish.obsidian.md/tasks/Advanced/Styling)
- [Tasks plugin status registry](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/Statuses/StatusRegistry.ts)
