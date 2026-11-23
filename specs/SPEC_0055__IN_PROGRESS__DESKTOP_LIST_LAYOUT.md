Status: IN_PROGRESS

# SPEC 0055 — Desktop List Layout

## Feature Request Summary

Refs [#186](https://github.com/ErikaRS/task-list-kanban/issues/186) — Support the mobile "stacked" order on desktop.

The mobile board ([SPEC 0038](complete/SPEC_0038__COMPLETE__MOBILE_BOARD_LAYOUT.md)) renders the board matrix as a vertical, full-width hierarchy of sections instead of a grid of fixed-width columns. The issue asks for that presentation as an option on desktop. Mobile keeps it as the default and only choice.

This spec adds a **Layout** view property with two values, **Table** (today's desktop matrix) and **List** (the stacked hierarchy). Card width only makes sense for Table, so it is hidden while List is in effect.

"Columns" here means rendered board columns, not the column-versus-swimlane axes. List layout changes only how the matrix is drawn; it does not change grouping, flow semantics, sorting, or any write path.

## User Requirements

1. On desktop, a board can be switched between **Table** (the current matrix) and **List** (the stacked mobile hierarchy).
2. List layout is centered in the board pane with a maximum width (800px) so lines stay readable on wide screens. Narrower panes fill their width, as the mobile list does.
3. The **Card width** control appears only when Table is in effect. A stored width is preserved while List is active and applies again when the user returns to Table.
4. On mobile, List is always in effect. The Layout control and the Card width control are not shown there.
5. Layout is a normal view property. It follows the existing view mechanics: per-board setting, included in saved views, and settable in the plugin-wide default view.
6. The existing flow direction still decides the list hierarchy: LTR/RTL are column-dominant, TTB/BTT are group-dominant, exactly as in SPEC 0038.
7. Everything that is not the matrix renderer keeps its desktop behavior in List layout: board rail dock, toolbar and popovers, inline card editing, drag and drop, selection, and the archived column pane.
8. A board whose layout was set on desktop must not change on mobile, and opening a board on mobile must not overwrite its stored layout.

## High-Level Design

### Two concepts, currently conflated

`main.svelte` has a single `isMobileBoardLayout` flag that means both "this is a mobile device" and "draw the stacked list". List layout separates them:

| Concept | Source | Drives |
| --- | --- | --- |
| Platform mobile | `Platform.isMobile` | Rail forced to the top, mobile toolbar and sheet-style popovers, mobile card and new-task editors, soft-keyboard layout handling, floating add-task action |
| List renderer | `Platform.isMobile \ | \ | layout === "list"` | Which component renders the matrix (`BoardMobileList` instead of `BoardMatrixDesktop`), and whether Card width is offered |

`shouldUseMobileBoardLayout` in `src/ui/board/mobile_layout.ts` becomes the home for a sibling `shouldUseListRenderer(isMobile, layout)`. The existing `isMobileBoardLayout` call sites are triaged one by one: the ones above stay on platform, and only the renderer selection (`main.svelte` around the `{#if isMobileBoardLayout}` that picks `BoardMobileList`) and the width row move to the new flag.

```text
settings.layout ("table" | "list", default table)
Platform.isMobile
  -> listRenderer = isMobile || layout === "list"
       true : BoardMobileList   (Card width hidden)
       false: BoardMatrixDesktop (Card width shown)
  -> platform behaviours keep reading Platform.isMobile
```

### Data model

New optional view property `layout?: "table" | "list"`, absent meaning Table. It is added anywhere `columnWidth` and `flowDirection` already travel:

- `settings_store.ts`: board settings schema and `SavedView` schema, parsed with `.catch("table")` so a bad value cannot break a board.
- `saved_views.ts`: an entry in `SAVED_VIEW_PROPERTIES` (label `Layout`) plus capture/apply handling.
- `global_settings.ts` / `global_settings_tab.ts`: part of `GlobalDefaultViewProperties`, a Layout dropdown in the default view section, and a Layout field in the saved-view draft. The default is omitted from storage when it equals Table, matching how `columnWidth` and `flowDirection` handle their defaults.

Stored value is shared across devices by design. Mobile never reads it for rendering and never writes it, so a desktop board set to List or Table is untouched by opening it on a phone.

### UI

In the view editor (`view_editor.svelte`), a **Layout** row with a Table / List segmented control or dropdown goes above Flow. The **Card width** row is wrapped in `{#if !listRenderer}`. Both rows are absent when `Platform.isMobile`, since the result there is fixed. The global settings tab mirrors this: Card width is hidden when the default view's layout is List.

The issue floats "list view vs table view" as the naming; this spec adopts **List** and **Table**.

```text
Layout   [ Table | List ]
Flow     [ Column dominant ascending (LTR) v ]
Card width  ----o----  300px     <- Table only
```

### Desktop behavior inside the list renderer

`BoardMobileList` was written for a touch device. Four areas need explicit decisions rather than inheriting mobile behavior:

1. **Add task.** Empty cells use `NewTaskControls` with `mobileLayout`, which renders a floating action button and opens the mobile composer sheet. On desktop, compact empty cells must use the desktop inline composer ([SPEC 0014](complete/SPEC_0014__COMPLETE__INLINE_TASK_CREATION.md), [SPEC 0015](complete/SPEC_0015__COMPLETE__ONE_CLICK_ADD_TASK.md)) with an inline compact add control. The platform decides: `mobileLayout` becomes true only for `Platform.isMobile`, and a separate compact-header flag covers desktop List.
2. **Editing.** Cards keep the desktop inline editor because `task.svelte` already branches on `Platform.isMobile`. No change expected; verified in the plan.
3. **Sticky headers.** The two-level sticky offset is measured against the nearest scroll container. On desktop that container is the `.columns` pane, so the offset must be verified there, including with the archived pane open.
4. **Rail, toolbar, popovers.** Unchanged; they stay on the platform flag.

The archived column pane keeps rendering beside the list exactly as it does beside the mobile list today.

### Width and layout of the list

On desktop the list is capped at 800px and centered in the board pane, in the manner of single-column task apps such as Todoist's Upcoming view. Panes narrower than the cap fill their width. The mobile list's padding and header bleed carry over. Mobile is not capped: it always fills the screen.

The cap is a fixed reading width, not tied to Card width, which stays a Table-only setting. It lives in one CSS variable (`--tlk-list-max-width`) so it can be tuned or themed without code changes.

## Detailed Behavior

1. **Switching.** Changing Layout re-renders the board immediately. Collapse state, selection, filters, sort, and group are untouched. Layout is a pinned override like other view properties, so saved views and the unsaved-view indicator treat it the same way as flow and width.
2. **Flow direction in List.** All four flow directions work in List exactly as on mobile. An ungrouped TTB/BTT board renders the plain column sequence.
3. **Width.** In List, the `--column-width` CSS variable and `responsiveColumnWidth` are unused. The archived pane still uses `columnWidth` for its own width, so the stored value remains meaningful even though its control is hidden. If that proves confusing, the archive pane should get its own treatment under a separate spec, not here.
4. **Saved views.** A view that stores `layout: "list"` applies it on desktop. On mobile the stored value is ignored for rendering but preserved. Applying a view that omits layout leaves the current layout unchanged, like other optional properties.
5. **Global default.** New boards inherit the default view's layout. Existing boards with no explicit layout follow the default as they do for width and flow.
6. **Narrow desktop panes.** A narrow desktop window in Table layout is unchanged (it still uses responsive card widths). It does not auto-switch to List; the user chooses.
7. **Accessibility.** The Layout control has a label and exposes its selected value. List headings, counts, and live regions are already specified by SPEC 0038 and apply unchanged.
8. **Drag and drop.** Desktop drag and drop works in the list, including onto compact empty cells. Cross-section moves use the same drop planner as Table.

## Non-Goals

- Changing Table layout, mobile layout, or the flow semantics.
- A mobile Table layout, or any way to select a layout on mobile.
- Per-device layout preferences. Layout is a shared view property.
- Group collapse, which stays out of scope as in SPEC 0038.
- Renaming internal `mobile_*` identifiers as part of the behavior change (see Phase 4).
- Redesigning the archived pane or giving it its own width.

## Open Questions

1. ~~**Maximum list width on wide screens.**~~ Resolved: desktop List is capped at 800px and centered rather than filling the pane.
2. **Card width on mobile.** Today the mobile list ignores width, yet the control is still visible there. This spec hides it on mobile to match the rule "no width option in List". Confirm this is wanted.
3. ~~**Segmented control versus dropdown** for Layout.~~ Resolved: a Table / List segmented toggle.

## Implementation Plan

### Phase 1: List renderer on desktop (hard-coded switch) 🚧 IN PROGRESS

**Goal:** With a Layout value in board settings, a desktop board renders the stacked list and behaves correctly. Selection is by editing the setting, with no UI yet.

1. ✅ Add `layout` to the board settings schema and `shouldUseListRenderer` to `mobile_layout.ts`, with unit tests for the mobile/desktop and table/list combinations.
2. ✅ Split `main.svelte` into the platform flag and the renderer flag; move only the renderer selection to the new flag.
3. ✅ Replace the floating-action and mobile-composer creation path with the desktop inline composer when the list renders on desktop; keep the mobile path for `Platform.isMobile`.
4. Verify sticky outer/inner headers against the desktop scroll container, with and without the archived pane.
5. ✅ Test: a unit test for renderer selection (`shouldUseListRenderer`), plus a component test that desktop List does not use the mobile creation path.

**Deliverable:** Setting `layout: list` in the board's frontmatter makes the desktop board stack as a list.

**Implementation notes:**
- `BoardCell` gained a `mobileCreation` flag separate from `isCompactEmpty`; `BoardMobileList` receives it from `main.svelte` as `Platform.isMobile`. Compact empty cells still compact on desktop but render the inline `+ Task` control.
- `.columns` gets a `list-layout` class while the list renders: vertical scroll only, and beside the archived pane it flexes to fill instead of sizing to `max-content` (this also applies on mobile).
- Desktop List caps the list at `--tlk-list-max-width` (800px) and centers it; mobile is unaffected.
- The archived pane's header spacing is 0 under the list renderer, because only the desktop matrix reports a summary height.

**Implemented by:** *pending*

### Phase 2: Layout control and width visibility 🚧 IN PROGRESS

**Goal:** The user can switch Table/List from the view editor, and Card width appears only for Table.

1. ✅ Add the Layout row to `view_editor.svelte`, hidden on mobile.
2. ✅ Hide the Card width row when the list renderer is in effect (including on mobile).
3. ✅ Persist through the existing settings write path as a pinned override.
4. ✅ Test: view editor shows Layout and Width correctly for desktop Table, desktop List, and mobile.

**Deliverable:** Working in-board toggle with the width control appearing and disappearing.

**Implementation notes:**
- Layout is a Table / List segmented toggle (`role="group"`, `aria-pressed` buttons) sharing the tag-group mode toggle's styling. This resolves Open Question 3.
- The view editor decides its own row visibility from `layout` and `isMobile` via `shouldUseListRenderer`, so Card width is hidden on mobile as well as desktop List (Open Question 2, as specified).
- Saved-view capture does not include layout yet; that is Phase 3.

**Implemented by:** *pending*

### Phase 3: Saved views and plugin-wide default

**Goal:** Layout can be saved in views and set as the default for new boards.

1. Add `layout` to `SAVED_VIEW_PROPERTIES` and the capture/apply handling in `saved_views.ts`.
2. Add it to `GlobalDefaultViewProperties`, the default-view Layout dropdown, and the saved-view draft in `global_settings_tab.ts`, hiding Card width when the default is List.
3. Omit Table from stored defaults, as with `columnWidth`.
4. Test: saved view round trip, default view round trip and omission, invalid value falls back to Table.

**Deliverable:** Layout participates in saved views and global defaults like Flow and Width.

**Implemented by:** *pending*

### Phase 4: Naming cleanup and acceptance

**Goal:** Internal names stop implying the list is mobile-only, and the acceptance matrix passes.

1. Rename `BoardMobileList`, `MobileSectionHeader`, and related helpers to list-oriented names in a mechanical, behavior-free commit.
2. Update SPEC 0038 cross-references and `README.architecture.md`.
3. Run `npm run build` and `npm test`.
4. Manual acceptance matrix (unchecked until performed): each flow direction, ungrouped and grouped, filtered and unfiltered, in desktop List; switching Table to List and back preserves width; archived pane open beside the list; drag and drop, manual order, pinning, selection and bulk actions; a board set to List on desktop opens unchanged on mobile and mobile does not overwrite it; saved view and default view behavior.

**Deliverable:** Shipped desktop List layout with the acceptance matrix verified.

**Implemented by:** *pending*
