Status: IN_PROGRESS

# SPEC 0043 — Advance Card to Next Column

## Feature Request Summary

Issue [#163](https://github.com/ErikaRS/task-list-kanban/issues/163) asks for a click on a task's status to follow a workflow instead of always completing the task. The owner's [latest comment](https://github.com/ErikaRS/task-list-kanban/issues/163#issuecomment-5848920520) proposes using the board's columns as that workflow. Add **Advance** as a third card interaction mode alongside **Done** and **Select**. Move the mode control from each column header to a selector in the top board gutter beside the task count. The selector shows the current mode icon and opens a menu, inspired by Gmail's selection control. In Advance mode, the card's leading action shows an arrow and moves the task one step forward.

## User Requirements

1. Replace the per-column Done / Select controls with one board-wide **Done / Advance / Select** selector to the left of the total task count above the board. The chosen mode applies to every card on the current board, including grouped boards, on desktop and mobile.
2. In Advance mode, activating a card's leading arrow moves it to the next configured column. **Uncategorized** precedes custom columns, **Done** follows them, and advancing a task in Done archives it. The action does not skip a workflow step.
3. Workflow order follows the configured order in board settings. Reversed board layout, sorting, filtering, grouping, collapsed columns, and column visibility do not change the destination.
4. A normal advance between active columns uses the same placement and source-edit behavior as an ordinary move to that column. Entering Done uses existing completion behavior; leaving Done for archive uses existing archive behavior and the board's archive configuration.
5. Done and Select modes retain their current card behavior. Each board remembers its chosen mode across board switches and app restarts. Existing boards with no saved mode start in Done mode.
6. The Advance action is available by mouse, touch, and keyboard, with a clear accessible name describing its destination.

## High-Level Design

### Workflow and destination

Build a canonical workflow from the board's **configured** columns:

```text
Uncategorized → custom column 1 → … → custom column N → Done → Archived
```

Archived is a terminal action, not a visible column. With zero custom columns, Uncategorized advances directly to Done. The configured order comes from `settings.columns`; it must not be derived from `BoardMatrix.primaryAxis`, which reverses for RTL/BTT layouts and omits hidden built-in columns. A pure destination resolver should accept the source column and configured column IDs and return either a column ID or an archive action. It should fail safely if the source column no longer exists in the current settings (for example, after a concurrent configuration change), rather than guessing a destination.

Use the card's **display column** as the source step. The task model may have a different or undefined `column` when placement is inferred from status, priority, or done state; the visible bucket is what the user is advancing from.

### Board-wide interaction mode and board gutter control

Replace the boolean, per-column map in `selection_mode_store.ts` with one three-value mode for the current board, for example `"done" | "advance" | "select"`. Persist the last choice as a board-local frontmatter field (for example `cardActionMode`), alongside other board-local toolbar state. An absent or invalid value resolves to Done for existing boards. Changing modes updates the board setting and uses the normal save path immediately; reopening or switching back to a board restores its saved mode. The selector remains the primary way to change the mode, and saved views do not include it. Selected task IDs are transient: leaving Select or switching boards clears selections, while returning to a board saved in Select mode restores Select with zero cards selected.

Add one compact selector in the same top board gutter as the total task count, immediately to its left, on desktop and mobile. **View** and **Search** stay together in the main toolbar because they change which board content is displayed; the mode selector sits beside the count because it changes card actions across the board. The face shows only the current mode icon and a chevron. Use the same leading icons as on cards: outline square for Done, right arrow for Advance, and outline circle for Select. Activating either part opens the same menu; the face does not act on tasks or cycle modes. The menu has three labeled choices, with the current choice checked:

```text
□  Done       Click a card's status to cycle/complete
→  Advance    Move a card to the next column
○  Select     Select cards for bulk actions
```

Use the existing icon system for the face and menu. Keep the face's accessible name explicit, for example **Card action mode: Advance**, and expose menu state with `aria-expanded`. A title tooltip gives the current mode's meaning; the open menu presents all mode names and descriptions. Menu items must work by touch, pointer, and keyboard; Escape/outside click closes the menu and focus returns to the trigger after a keyboard selection. Only one menu may be open at a time with the View and source-file toolbar popovers. The compact face stays visible at narrow widths rather than moving into View settings or the settings modal. The current Done mode can follow the configured status cycle, so its description must not promise immediate completion in that configuration.

Remove the duplicated mode buttons from all desktop and mobile column headers. Column headers retain their counts, collapse control, and per-column bulk menu. In Select mode, each column menu still acts on selections in that column; selecting across columns is allowed, and leaving Select clears selections across the board.

In Advance mode, the leading card control displays a forward arrow (prefer the existing Lucide icon system), with an accessible name such as **Advance to To do**, **Advance to Done**, or **Archive task**. The arrow indicates an action, not the task's stored checkbox status. The card's rendered Markdown primary checkbox must route through the same mode-aware handler or be made non-interactive, so it cannot silently run the old status-cycle action while the arrow is visible. Nested source-block checkboxes retain their own current behavior.

### Action dispatch

Use one mode-aware card action shared by the visible leading button and any rendered primary checkbox interaction. For a custom-column or Uncategorized destination, call the existing column move action. For Done, use `moveTasksToColumn([id], "done")` so the done marker and completion metadata follow existing move semantics. For Archived, call `archiveTasks([id])` so tag-based and status-based archive settings behave exactly like other archive entry points. Do not invoke the status-cycle sequence in Advance mode; matching a status-defined destination column updates the checkbox through normal column placement logic.

The arrow action affects only its card. Select mode remains the path to bulk operations; selected tasks are not advanced together by tapping a card. Existing drag/drop, menus, task commands, and nested task actions are unchanged.

## Detailed Behavior

| Source step | Destination | Expected write |
| --- | --- | --- |
| Uncategorized | First custom column, or Done if none | Use ordinary column placement or Done move |
| Custom column *i* | Custom column *i + 1* | Use ordinary column placement; status, tags, or priority follow destination rules |
| Last custom column | Done | Set a done marker and add completion date when the active schema supports it |
| Done | Archived | Use the board's current archive action: `#archived` or configured archive status |

- A hidden or collapsed destination is still the next step. The card may disappear from the current view after the action; an automatically shown destination follows its existing visibility behavior. A filter can likewise hide the moved card.
- RTL/BTT reverses only visual presentation, never progression. Reordering custom columns in settings changes subsequent advances immediately.
- Advancement does not directly edit the task's source file, group tag, or unrelated metadata. A task may move to another visible group if that group is derived from a status or priority value changed by ordinary column placement.
- The move to Done preserves historical completion metadata and only adds a missing completion date, following `changeColumnTransform`. Advancing Done to Archived follows the existing archive action, including its current source serialization behavior.
- Failed or stale task writes use the existing task-action error handling. Do not optimistically show the task in its destination before the source write succeeds.

## Implementation Plan

Implementation progress (2026-09): the board-wide selector, sticky per-board mode,
Advance card action, and automated tests are implemented in the working tree.
`npm run build`, `npm test`, and `npm run lint` pass. Manual Obsidian UI
verification is pending.

### Phase 1: Advance between active columns

**Goal:** A card in Uncategorized or a non-final custom column can advance one configured step from either board layout.

1. [x] Add a pure workflow destination resolver with tests for configured order and zero/custom columns; the resolver does not use visual order or column visibility.
2. [ ] Replace the two-state per-column store with a board-local, persisted three-state mode; save changes immediately and clear selected IDs on mode and board changes.
3. [ ] Add the icon-and-chevron selector beside the task count on desktop and mobile, and remove the repeated column-header controls.
4. [ ] Show and wire the card arrow in Advance mode, including keyboard and rendered-Markdown-primary-checkbox handling.
5. [ ] Test active-column advancement through name/tag, status, and priority matching, and verify that Done and Select modes still work.

**Deliverable:** One click moves an active card exactly one configured custom-column step without changing its unrelated source text.

**Implemented by:** Pending.

### Phase 2: Done and archive boundary steps

**Goal:** The same arrow completes the workflow through Done and Archived.

1. [x] Route last-custom (or Uncategorized with no custom columns) to Done using the existing Done move action.
2. [x] Route Done to the existing archive action for both tag-based and status-based archive settings.
3. [ ] Test completion metadata, archived-task disappearance, toolbar mode changes, per-board mode restoration after switching/reopening, transient selections, and the three-mode interactions in grouped, reversed, and mobile layouts.
4. [ ] Update the README's Board Controls / Bulk Actions descriptions and manually verify the toolbar menu and card controls in a test vault, including narrow mobile width and keyboard focus.

**Deliverable:** Every visible workflow step advances once, including Done → Archived, while existing interaction modes remain usable.

**Implemented by:** Pending.

## Design Notes and Open Questions

1. **Mode label:** **Advance** is short and describes the action. Keep **Done** for compatibility, but consider **Status** in a later UI cleanup because Done mode currently calls `toggleDone`, which may cycle through configured status markers before completion. This feature should not silently redefine that behavior.
2. **Completed card in an active column:** Routing places `task.done` in Done even if its placement tag still names an active column. The proposed rule advances from the *displayed* column, but such a card will normally display in Done. If a stale or inconsistent task is ever rendered elsewhere, fail safely or use its visible bucket; do not derive a step from its raw tag alone.
3. **Cancelled cards:** An ordinary move into a tag- or priority-matched column may preserve a cancelled marker under current `changeColumnTransform` behavior. The recommendation is to keep ordinary move semantics in this feature and handle any desire to reopen cancelled tasks as a separate behavior decision.
4. **Mode persistence:** The mode is sticky per board, including Select. Restoring Select with no cards selected keeps the mode useful without persisting task IDs, which can become stale after source edits. Placement beside the count connects it to the board it affects.
5. **Status visibility:** The arrow replaces the card's leading status icon in Advance mode. Status-defined columns still show their marker in the column header, but a card's own marker is less visible. Confirm whether a small secondary status indicator is needed; avoid making the card action look like the Markdown marker itself.
