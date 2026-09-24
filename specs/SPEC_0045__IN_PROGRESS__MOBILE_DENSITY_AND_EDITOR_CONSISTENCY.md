Status: IN_PROGRESS (design only; implementation not started)

# Mobile task lists and shared editing

## Feature Request Summary

Refs #176. The [latest reporter comment](https://github.com/ErikaRS/task-list-kanban/issues/176#issuecomment-5808685063) asks for more visible tasks and matching New/Edit popups. This revision incorporates the maintainer's follow-up and familiar patterns from standard mobile task apps: a continuous task list with section-local creation. Five extra visible tasks is an aspiration to measure, not an acceptance guarantee.

## User Requirements

1. Hide the repeated creation-destination row on mobile, unconditionally. No setting or migration.
2. Consolidate board actions into compact icon controls with accessible names.
3. Tighten category/group headers without making touch targets smaller.
4. Put a floating plus at the lower right of each creation section, bounded to that section as the board scrolls. Creation is group-specific; Done/Select remains column-specific.
5. Make tasks full-width adjoining list rows with no exterior card margins or gaps.
6. Share one mobile editor for new tasks, existing tasks, and source-row edits.
7. Preserve group/file routing, task content and metadata, keyboard safety, selection, and theme integration.

## High-Level Design

One mobile page has three layers: a small board action bar, a continuous sectioned task list, and a shared editing sheet. The reading surface is quiet; the plus is the main visual action. Color remains an accent for category identity and state, not a border around every task. All action/selection accents inherit Obsidian theme variables such as `--interactive-accent`, paired with `--text-on-accent` for text on accent fills. Never hardcode purple or another brand hue. Category accents retain user-configured column colors. Mockups outside Obsidian use a neutral stand-in when those theme variables are unavailable.

Use familiar patterns from standard mobile task apps for hierarchy, list spacing, and thumb-reachable creation. Retain Obsidian's existing navigation and task-status markers.

Default mobile board toolbar: [view/layout icon] [search] — flexible space — [open files] [settings]. Group View and Search together on the left because they control what appears on the board. Group Open files and Settings on the right because they act outside the board display. Keep the separation flexible, preserving full touch targets at narrow widths. Use existing Obsidian/Lucide icons at 20–22px within 44px hit areas. Search expands a full-width field beneath the bar. An applied query keeps that field visible on reopening, including clear and search-options controls; no hidden active filter. This one-row resting toolbar is the recommended refinement of the earlier two-row proposal.

Below it, category headers hold collapse, title, one count, and Done/Select. Group labels establish the next level when present. Tasks run edge to edge within the plugin content area with inset content and fine separators. The repeated destination row and full-width Add task row disappear.

## Detailed Behavior

### Toolbar

- Icons replace permanent text labels for View, search, Open files, and Settings. Each has a specific accessible label and tooltip; active View/search state remains visible.
- On mobile, one folder icon always opens the source-file popover. Remove the chevron and direct-open action from the toolbar. The popover contains file selection, skip-already-open behavior, and an explicit Open selected files button (disabled for an empty selection). Preserve selection state. Desktop retains its split button and direct-open behavior.
- View opens a labeled, viewport-bounded sheet and source files opens a labeled, viewport-bounded popover on mobile; Settings opens the existing settings UI. Labels belong inside these surfaces so unfamiliar icons are discoverable.
- Search opens focused; closing an empty search restores the single-row toolbar. A nonempty applied filter remains visible until cleared. Preserve current Enter-to-apply and query behavior.
- Respect Obsidian's own chrome and available pane bounds. Do not add a duplicate board title or app navigation. Keep DOM focus order aligned with visual order.

### Continuous task lists

- Preserve the column-colored left bar on every mobile task row, including grouped lists. Use the same configured column color and uncolored-column fallback as existing cards; do not replace column identity with the theme action accent. Start with a 4px full-height left edge inside the row box so it adds no exterior gap. Keep it visible during selection and on rows containing nested content.
- Mobile rows fill the available board width; remove per-card shadow, rounded outline, external margin, inter-card gap, and nested cell side padding.
- Use approximately 12–16px horizontal content insets, 8–10px vertical content padding, and a 1px theme-derived divider. Keep existing status hit areas and readable text. Variable-height content wraps naturally; no truncation of tasks, notes, or subtasks for density.
- Align secondary metadata under task text; omit empty metadata containers. Retain configured source paths, dates, tags, nested content, and actions. Hiding the creation-destination row is unrelated to task-card source-path preferences.
- Column/group headers have about a 44px minimum interactive row, small vertical padding, and no large decorative stripe or surrounding card frame. A thin category accent and hierarchy typography distinguish sections. Long titles and larger accessibility text may wrap.
- Done/Select remains a labeled column control; it describes a mode and is less obvious as an icon. Preserve its column-wide scope even when the column appears in several groups. Do not add the creation action to this control group.
- Keep sticky hierarchy headers and measured offsets. Selection can use a subtle row fill and existing markers without reintroducing spaced cards.

### Section-local floating creation

A creation section is the innermost visible list representing one column × group intersection. Without grouping it is a column. In column-dominant grouping it is the group inside a column; in group-dominant grouping it is the column inside a group. An outer group spanning several columns cannot provide an unambiguous destination by itself.

- Each expanded, creation-eligible section owns a 48px plus with a modest shadow and 12px right/bottom inset. Use the plugin accent, and an accessible name identifying both column and group where relevant.
- For a long section, the plus stays at the bottom-right of the visible board area while scrolling within that section. As the section's trailing edge comes into view, its plus travels upward with that edge and exits with the section. It never follows the reader into a different section.
- For a short section, the plus sits at that section's lower right. Two visible sections may legitimately show two plus buttons; each stays visually within its own bounds. Do not turn them into one global button that silently changes destination.
- Clamp placement between the section header and trailing edge and the board's unobscured viewport, accounting for safe area and Obsidian chrome. If only a sliver of a section remains, clip/hide its floating button rather than overlap a header or neighboring button.
- Reserve trailing space in the last row beside the plus so its text and actions remain accessible. For short/empty lists, provide a compact minimum-height section body large enough for the button; no large empty-card placeholder. For long lists, middle rows can scroll clear of the overlay. Do not reserve an empty full-width footer under every list.
- Collapsed sections show only their header; expand to reveal the plus. While any editor is open, hide floating buttons. Honor current creation eligibility, including default/status columns.
- Open the editor with the exact section context captured on tap. Show column/group and destination file there. Preserve current file-group routing and tag metadata; do not promise new write semantics for unsupported property/folder groups.
- Move explicit file choice into the editor context control. If no default/recent/file-group target resolves, require choosing a file before Create is enabled. File-group destinations retain their current fixed routing.

### Shared mobile editor

Use a compact bottom sheet anchored to the bottom of the visual viewport, above the keyboard, with the board visible behind it. It has the same structure for create/edit: title and Cancel, destination/context, textarea, applicable date controls, and primary Create/Save action. Subtask/source-row edits use the same shell with their existing field capabilities.

- Use the same surface, spacing, textarea sizing, safe-area handling, and keyboard behavior in every mode. Limit height to available viewport space and scroll sheet content as needed; keep primary actions reachable. The supplied mockup is a design illustration, not Android keyboard validation.
- Capture board geometry before focus; opening the keyboard must not collapse background categories or jump the board's scroll position.
- Create/Save is explicit. Blur never submits. Enter inserts a newline; Ctrl/Cmd+Enter submits, Escape/Cancel discards. Backdrop dismissal follows Cancel consistently. Keep drafts on save failure and guard duplicate submission.
- Restore focus on close, trap modal focus while open, and clean up portal, viewport listeners, pending frames, and layout locks. Body-portaled styles use a plugin-specific root and Obsidian theme variables.
- Share presentation and lifecycle, keeping existing create/edit/source-row persistence adapters separate. Desktop inline behavior remains unchanged.

## Implementation Plan

### Phase 1: A readable mobile task list

**Goal:** Deliver a denser, coherent reading surface before changing creation.

1. [ ] Add an explicit mobile-list presentation to BoardCell/task components; remove card gaps, outlines, shadows, and nested horizontal padding only in that presentation, while preserving each task’s column-colored left bar.
2. [ ] Tighten mobile headers and section spacing while preserving counts, selection, rule subtitles, and sticky offsets.
3. [ ] Hide the creation-destination row on mobile with no preference.
4. [ ] Implement the icon toolbar, expandable search with visible active filters, and viewport-safe labeled control surfaces in main.svelte.
5. [ ] Verify long tasks, metadata, nested rows, large text, theme overrides, filter/menu behavior, and desktop regressions.

**Deliverable:** Full-width adjoining task rows with compact board chrome.

**Implemented by:** Pending.

### Phase 2: One working mobile editing sheet

**Goal:** New/Edit/source-row editing share presentation and keyboard behavior.

1. [ ] Extract the shell/lifecycle from MobileTaskEditor.svelte and NewTaskControls.svelte; centralize viewport handling with mobile_editor_layout.ts.
2. [ ] Connect existing persistence adapters; add context/file choice for creation and explicit submit/cancel behavior.
3. [ ] Verify date-field focus, multiline text, error retention, duplicate-submit protection, focus restoration, and listener cleanup.

**Deliverable:** Matching keyboard-safe editing flows, initially invoked from existing creation triggers.

**Implemented by:** Pending.

### Phase 3: Creation that travels with its section

**Goal:** Replace the body creation row with a floating plus that retains exact destination context.

1. [ ] Separate creation-session ownership from trigger placement; keep the shared editor outside conditionally mounted list content.
2. [ ] Let board_mobile_list.svelte assign each eligible cell a bounded overlay trigger. Prefer section-constrained sticky placement; prototype and verify clipping/scroll behavior before choosing a small measured overlay fallback.
3. [ ] If measurement is needed, use board-local section rectangles, ResizeObserver and coalesced scroll updates, not window-fixed buttons with guessed offsets. Derive placement from section/viewport intersections.
4. [ ] Reuse deriveCellCreationMetadata and file resolution; remove duplicate mobile Add controls.
5. [ ] Test grouped/ungrouped flow directions, two visible sections, short/empty/collapsed lists, last-row access, section removal/filtering, file choice, and correct tags/destination on save.

**Deliverable:** Section-specific thumb-accessible creation without repeated full-width control rows.

**Implemented by:** Pending.

### Validation for every code phase

1. [ ] Run npm run build and npm test. Add focused behavioral tests for changed interactions/context routing and floating geometry; avoid tests that merely duplicate CSS declarations.
2. [ ] Inspect 320–430 CSS-pixel widths, larger text, light/dark themes and another theme configuration. Verify all controls remain touchable without overlap.
3. [ ] Validate actual Android Obsidian keyboard open/resize/close, portrait/landscape, and stable background scroll. Check iOS where available and document any untested device behavior.
4. [ ] Compare visible complete tasks and toolbar/section heights using the same board, query, and scroll position. Report measured gains, not a promised five-task increase.

### Selected View icon and scope

Use Lucide `panels-top-left` for View on both desktop and mobile (selected by the maintainer). All other design changes in this spec are mobile-only. Desktop retains the View text label and existing trigger behavior. Verify the icon exists in the minimum supported Obsidian icon set before implementation.

The grouped mockup shows column-dominant hierarchy: Uncategorized → 2022-04-23 (empty) and Unassigned (populated), then a second illustrative column. Column totals and Done/Select live only on column headers. Group counts/collapse and section-specific floating plus buttons belong below those headers. Two hierarchy levels remain visible without nesting task rows in padded cards.

No application code or commits are part of this design revision.
