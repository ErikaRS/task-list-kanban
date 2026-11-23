Status: IN_PROGRESS

# SPEC 0058 — Subtask Interaction Regressions

## Feature Request Summary

Owner report, 2026-11-23 (no issue filed yet), after [SPEC 0056](SPEC_0056__IN_PROGRESS__PLAIN_MARKDOWN_TASK_CONTENT.md) landed:

1. **Regression:** clicking a subtask's status circle no longer marks it done.
2. **Expectation:** each subtask and sub-bullet is an independently editable item whose bullet and status can be edited, not just its text. Items can be dragged to reorder, and everything saves as plain Markdown.

SPEC 0056 already specifies the expected behavior. Nested editors expose the item's marker literally (Requirement 4). Checkbox activation cycles status without opening an editor (Editing interactions). Reorder moves full node spans. Writes are plain Markdown. Its native Obsidian acceptance is still open. This spec tracks fixing what fails in the owner's vault against those rules. It does not redesign them.

## User Requirements

1. Clicking a subtask's status control cycles that item's status in the file, in Table and List, on desktop and mobile, and in both nested-task modes.
2. Activating a subtask's text opens an editor containing the item's own Markdown, marker included, as SPEC 0056 specifies. Marker changes persist and reclassify on reload.
3. Dragging a subtask reorders or re-nests it without changing sibling or descendant source.
4. Every write remains plain Markdown, with no other source changed.

## Investigation So Far

Checked on the merged code (main at `b868a7c`):

- **Component test:** clicking `.source-row-status` on a card with a subtask calls `taskActions.toggleSourceTaskStatus`.
- **Browser harness:** with the real `BoardList`, `BoardCell`, `task.svelte` and `TaskSourceRow`, a real Playwright mouse click on a subtask status button calls `toggleSourceTaskStatus`. The harness stubs `MarkdownRenderer`, and its hand-built nodes have no `source` field.
- **Write path:** the write path (`cycleSourceTaskRowStatus` with the completion-date rule from 849f16d) has passing unit tests.
- **Select mode:** status buttons are intentionally disabled in Select card-action mode.

The likely causes are therefore things only native Obsidian exercises:

- Obsidian's real `MarkdownRenderer` output for source-row previews (SPEC 0056 strips the generated list wrapper and disables incidental checkbox inputs), overlapping or intercepting the status control.
- A theme rule.
- Row-index or source-span drift after Markdown-aware parsing, making the write target the wrong row or be rejected as stale.

## High-Level Design

No new design. Each fix restores a SPEC 0056 rule and adds a regression test at the layer that owns the cause:
- a parser or source-span test for drift;
- a component test with realistic rendered preview DOM for interception;
- CSS plus a manual theme check for styling.

## Open Questions

1. **What happens on click:** nothing, the item enters edit mode, or the circle flips and then reverts? Is the board in Select mode?
2. **Scope:** do all subtasks fail, or only some shapes? For example numbered `1. [ ]` items, deep nesting, items with continuation paragraphs, legacy `<br />` content, or a parent in another file. Table, List, or both? Nested-task mode on or off?
3. **Editing and drag:** do marker editing and drag reorder work in practice, or are they also failing?
4. **Console errors:** any errors in the developer console (Ctrl/Cmd+Shift+I) when clicking? Stale-write errors in particular would point to span drift.

## Implementation Plan

### Phase 1: Reproduce and fix the status click

**Goal:** Subtask status clicks write to the file again in native Obsidian.

1. Reproduce using the owner's answers to Open Questions 1, 2 and 4.
2. Fix the cause.
3. Test: regression test at the owning layer.
4. Manual: click subtasks across layouts, platforms, and nested-task modes; inspect the file after each.

**Deliverable:** Requirement 1 verified by the owner.

**Implemented by:** *pending*

### Phase 2: Editing and drag gaps

**Goal:** Any marker-editing or drag failures found in Open Question 3 are fixed to SPEC 0056's rules.

1. Reproduce each reported failure.
2. Fix it, with a regression test per cause.
3. Manual: the SPEC 0056 nested-editing and reorder acceptance items.

**Deliverable:** Requirements 2–4 verified by the owner. Close this spec, and tick the matching SPEC 0056 acceptance items.

**Implemented by:** *pending*
