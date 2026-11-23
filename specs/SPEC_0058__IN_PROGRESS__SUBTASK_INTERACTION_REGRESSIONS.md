Status: IN_PROGRESS

# SPEC 0058 — Subtask Interaction Regressions

## Feature Request Summary

Owner report, 2026-11-23 (no issue filed yet), after [SPEC 0056](SPEC_0056__IN_PROGRESS__PLAIN_MARKDOWN_TASK_CONTENT.md) landed:

1. **Regression:** clicking a subtask's status circle no longer marks it done.
2. **Expectation:** each subtask and sub-bullet is an independently editable item whose bullet and status can be edited, not just its text. Items can be dragged to reorder, and everything saves as plain Markdown.

SPEC 0056 already specifies the expected behavior. Nested editors expose the item's marker literally (Requirement 4). Checkbox activation cycles status without opening an editor (Editing interactions). Reorder moves full node spans. Writes are plain Markdown. Its native Obsidian acceptance is still open. This spec tracks fixing what fails in the owner's vault against those rules. It does not redesign them.

## User Requirements

1. Clicking a subtask's status control advances that item's status in the file in every card-action mode, including Select, in Table and List, on desktop and mobile, and in both nested-task modes.
2. Activating a subtask's text opens an editor containing the item's own Markdown, marker included, as SPEC 0056 specifies. Marker changes persist and reclassify on reload.
3. Dragging a subtask reorders or re-nests it without changing sibling or descendant source.
4. Every write remains plain Markdown, with no other source changed.

## Investigation So Far

Checked on the merged code (main at `b868a7c`):

- **Component test:** clicking `.source-row-status` on a card with a subtask calls `taskActions.toggleSourceTaskStatus`.
- **Browser harness:** with the real `BoardList`, `BoardCell`, `task.svelte` and `TaskSourceRow`, a real Playwright mouse click on a subtask status button calls `toggleSourceTaskStatus`. The harness stubs `MarkdownRenderer`, and its hand-built nodes have no `source` field.
- **Write path:** the write path (`cycleSourceTaskRowStatus` with the completion-date rule from 849f16d) has passing unit tests.
- **Select mode:** status buttons were intentionally disabled in Select card-action mode. The owner wants them active in every mode (Requirement 1).
- **Realistic files:** action-level toggle and move succeed on fresh parses of realistic files: frontmatter and headings, CRLF line endings, tab indentation, nested raw notes, and `*` bullets.
- **Drag:** a real Playwright mouse drag between subtask rows in the harness calls `moveSourceBlockRow` with the expected rows and depth.
- **Silent failures:** both actions were fired with `void`, so any rejection (for example a stale-span "Task changed" error) vanished silently. This would hide exactly the reported symptom.

The likely causes are therefore things only native Obsidian exercises:

- Obsidian's real `MarkdownRenderer` output for source-row previews (SPEC 0056 strips the generated list wrapper and disables incidental checkbox inputs), overlapping or intercepting the status control.
- A theme rule.
- Row-index or source-span drift after Markdown-aware parsing, making the write target the wrong row or be rejected as stale.

## High-Level Design

No new design. Each fix restores a SPEC 0056 rule and adds a regression test at the layer that owns the cause:
- a parser or source-span test for drift;
- a component test with realistic rendered preview DOM for interception;
- CSS plus a manual theme check for styling.

## Owner Answers (2026-11-23)

- Clicking should advance status in both Done and Select modes.
- No particular item shape works or fails; it fails generally.
- Reordering by drag does not work either.

## Open Questions

1. **Notice text.** With the diagnostics build (Phase 1 step 1), what notice appears when a click or drop fails? If no notice appears, the action is never reached, which points to native event interception rather than the write.
2. **Console errors.** Are there errors in the developer console (Ctrl/Cmd+Shift+I) on click or drop?
3. **Marker editing.** Does editing a subtask's marker (for example `- note` → `- [ ] note`) work?

## Implementation Plan

### Phase 1: Reproduce and fix the status click and drag 🚧 IN PROGRESS

**Goal:** Subtask status clicks and drag reorder write to the file again in native Obsidian.

1. ✅ Diagnostics: failed subtask status changes and drops show an Obsidian notice with the reason instead of failing silently. Status clicks are enabled in Select mode.
2. Reproduce using the notice and console output (Open Questions 1–2).
3. Fix the cause.
4. ✅ Test: a failed status write shows a notice (`task_source_status_button.tests.ts`). Add a regression test for the root cause at its owning layer.
5. Manual: click and drag subtasks across layouts, platforms, card-action modes, and nested-task modes; inspect the file after each.

**Deliverable:** Requirements 1 and 3 verified by the owner.

**Implemented by:** *pending*

### Phase 2: Editing and drag gaps

**Goal:** Any marker-editing failures found in Open Question 3 are fixed to SPEC 0056's rules.

1. Reproduce each reported failure.
2. Fix it, with a regression test per cause.
3. Manual: the SPEC 0056 nested-editing and reorder acceptance items.

**Deliverable:** Requirements 2 and 4 verified by the owner. Close this spec, and tick the matching SPEC 0056 acceptance items.

**Implemented by:** *pending*
