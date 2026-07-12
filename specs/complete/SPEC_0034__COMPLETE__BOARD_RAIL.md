# SPEC 0034: Board Rail

Status: COMPLETE

Implemented: 2026-07

## Feature Request Summary

[#130](https://github.com/ErikaRS/task-list-kanban/issues/130) — quick
switching between boards. SPEC 0033 replaced the tab strip with the
dashboard panel, deliberately trading one-click switching down to two
interactions and leaving a redesigned quick-switch affordance as a
follow-up. This spec is that follow-up: a **board rail** — a
browser-style vertical tab bar on the left edge of the board that
restores one-click switching. The rail's top entry is the dashboard
button itself, so the rail reads as the collapsed form of the dashboard:
tabs for the fast path, the button at the top for the full launchpad.

Design direction chosen from the post-0033 ideation, then simplified
twice in review: an earlier draft had hover-dwell expansion (cut — the
dashboard opens only by explicit click) and a pin/unpin mode (cut — the
rail is always present in multi-board vaults). What remains has exactly
one piece of user state: the rail's width, which defaults to just the
dashboard button and drag-widens to reveal board names.

## User Requirements

1. **Multi-board vaults always show the rail**: a persistent vertical
   strip on the left edge of the view, spanning the view's **full
   height — chrome row included** (updated from "below the chrome row"
   after Phase 1 manual testing) — with the dashboard button on top and
   one tab per shown board below it, in the dashboard's curated order.
   No modes, no toggle.
2. **Single-board (and empty) vaults show no rail at all** — the whole
   surface is about switching, so it earns no space until there is
   something to switch to. The dashboard stays reachable via the chrome
   button (as today) and the command.
3. **By default the rail is just the width of the dashboard button.** At
   that width each board tab shows a first-letter chip; the full name and
   folder are the tooltip. Clicking the top button toggles the dashboard
   panel, which behaves exactly as today — same slide-over, same close
   paths (button, X, Esc, scrim, board select). No hover behavior.
4. **Dragging the rail's right edge widens it**, revealing board names
   (ellipsis-truncated as needed, tooltip always the full path). The
   width persists plugin-wide across restarts; dragging back to the
   minimum returns the rail to button-width chips.
5. **Clicking a tab switches boards in one click** (the existing in-leaf
   switch). The current board's tab is highlighted; clicking it is a
   no-op.
6. **The rail and the dashboard are two views of one list.** Tabs are
   exactly the dashboard's shown boards in the dashboard's order (the
   same resolver), and **tabs are drag-reorderable** — a reorder in
   either surface writes the same `boardPaths` order and both update.
   Hidden boards ("Other boards" zippy) have no tab; they stay reachable
   through the dashboard.
7. **When the rail is visible it owns the dashboard button** — the
   chrome-row button (SPEC 0033 req. 1) appears only when the rail is
   hidden, so there is exactly one visible dashboard trigger. The panel
   slides out from the rail's right edge and **never covers the rail**
   (the trigger stays visible, per the project's overlay rules); the
   rail's button and tabs stay live while the panel is open.
8. The gated "Show board dashboard" command is unchanged and works in
   both layouts.
9. **The rail can dock to the top instead** (added in Phase 2): a
   plugin-wide "Board rail position" setting in the global settings
   tab's top-level behavior block, defaulting to the left side.
   Top-docked, the rail is a horizontal strip across the full width of
   the view — dashboard button anchored top-left, tabs in a row after
   it, always labels (chips and drag-resize are left-dock responses to
   narrow width, so neither applies; a crowded strip scrolls
   horizontally). The dashboard panel slides **down** out of the strip
   instead of out from the left. Tab reorder still works (horizontal
   midpoint, left/right accent cues). The persisted width applies only
   while left-docked and survives a round trip through top docking.

Non-goals (v1 — candidates for later phases):

- Hover-expand / auto-hide behaviors (cut from an earlier draft; the
  panel opens by explicit click only).
- Drag-the-rail-to-an-edge re-docking — the dock side changes via the
  setting only. (The physical drag gesture has to coexist with tab
  reorder and the resize handle; it stays a follow-up until top docking
  has proven itself.)
- A user setting to hide the rail in multi-board vaults.
- Tab context menus and count badges on tabs — hide/show, rename, and
  stats stay in the dashboard panel. (Drag-reorder, by contrast, is in:
  the rail and dashboard share one order, so both surfaces reorder.)
- Keyboard-driven resize (pointer drag only in v1).
- Any change to hidden boards: they stay out of the rail and reachable
  via the dashboard's "Other boards" zippy.

## High-Level Design

### Rail component (`src/ui/dashboard/board_rail.svelte`)

- Rendered by `main.svelte` as a flex sibling **left of the whole
  toolbar+board column (`.board-body`)**, spanning the view's full
  height — the rail takes layout space (columns shrink) rather than
  overlaying. Because the dashboard slide-over anchors inside
  `.board-body` (the toolbar+board column), it covers the toolbar and
  board together while the rail sits outside the overlay's positioning
  subtree and can never be covered by it.
- **Visibility rule:** the rail renders only when the board index has
  more than one board (`$boardIndexStore.length > 1`). That count is
  shown + hidden together — every kanban the vault contains — so hiding
  boards in the dashboard can never make the rail (and with it the
  dashboard button) vanish from a genuinely multi-board vault. The chrome-row dashboard button renders in exactly the
  complementary case, so creating a second board swaps the trigger from
  chrome to rail reactively, and deleting back to one board swaps it
  back. The command works regardless.
- **Top entry: the dashboard button.** Same icon and aria pattern as the
  chrome button it replaces, wired to the same toggle on
  `dashboardOpenStore`; active state while the panel is open; separator
  below it.
- Tabs come from `resolveBoardList($boardIndexStore,
  $boardListSettingsStore).shown` — the same resolver the panel grid
  uses, so rail order always matches dashboard order and reacts to
  in-panel curation live. Hidden boards do not appear as tabs.
- **Two display modes by width**, decided by a pure helper
  (`railDisplayMode(width)`, threshold `RAIL_LABEL_MIN_WIDTH` ≈ 72px):
  - **Chip mode** (at/near minimum): each tab is the board name's first
    character, centered — a column of letter chips under the button.
  - **Label mode** (wider): single-line board name,
    `text-overflow: ellipsis`.
  In both modes the `title` tooltip is the full path, and the current
  board (`$currentPathStore`) gets the active highlight (same visual
  language as the dashboard card highlight). Click routes through the
  existing `openBoard` glue; the current board's tab is inert to clicks.
- Tabs and the dashboard entry are real buttons (keyboard focusable,
  Enter/Space activate).
- **Tab drag-reorder** reuses the dashboard's reorder machinery: the
  same plugin-owned `onReorderBoards` callback, a drop materializing the
  full shown order via `movePathRelativeTo` (self-cleaning, exactly like
  a panel-card drop), and the accent-bar drop cue — on the landing edge
  above/below the target tab, with before/after decided by the pointer's
  side of the tab's **vertical** midpoint (the rail is a vertical list
  where the panel grid was horizontal-midpoint). Because both surfaces
  write the same `boardPaths`, a reorder in either is immediately
  reflected in the other. Reorder works in chip and label mode alike.
- The rail displays names only — no stats, no menus. It stays a cheap,
  dumb list; everything richer lives one click away in the panel.

### Resize (`board_rail.svelte` + persisted width)

- A drag handle on the rail's right edge (few-px hit area, `col-resize`
  cursor). Pointer-capture drag updates width live; release persists.
- Width clamps to `RAIL_MIN_WIDTH`–`RAIL_MAX_WIDTH` (initial values:
  min = the button-column width ≈ 44px, which is also the default;
  max 320px — constants, tuned in manual testing).

### Settings (`GlobalSettings.boardRail`)

```ts
interface BoardRailSettings {
	width?: number; // px, clamped on parse; absent = default (minimum)
}
```

- Parsed defensively like `boardList` (junk dropped; the key stays out of
  `data.json` when the width is the default).
- Usage state rather than a setting, persisted plugin-wide in `data.json`
  like `lastOpenedByPath` — no settings-tab UI; the drag handle is the
  only control.
- The write flows through a plugin-owned callback threaded entry → view,
  the same shape as the existing curation callbacks.
- Nothing here stores paths, so vault renames need no rewrite handling.

### Panel anchoring beside the rail

- The panel open/close model is untouched: `dashboardOpenStore` stays a
  boolean, opened by the rail's top button (or the chrome button in
  single-board vaults, or the command); closed by button, X, Esc, scrim,
  or board select. Focus management, toolbar inert state, animation, and
  reduced-motion behavior all stay exactly as shipped in SPEC 0033.
- When the rail is visible, the panel (and its scrim) anchor to the
  toolbar+columns body **right of or below the rail**: the existing
  slide-over emerges from the rail's edge, and the top-docked version
  slides down from the strip. The rail is the trigger, so the overlay
  must not cover it; its button and tabs stay one-click live while the
  panel is open (selecting via tab closes the panel and switches, same
  as selecting a card). The rail is **never** inert. The toolbar is
  covered by the dashboard in both dock modes.
- Focus return on panel close targets whichever dashboard button is
  visible (rail or chrome).

## Detailed Behavior

- **Tab click while the panel is open:** closes the panel and switches
  board — identical choreography to selecting a dashboard card.
- **Curation while the panel is open:** hiding or drag-reordering boards
  in the panel updates the rail live (shared resolver + stores). Hiding
  boards can leave the rail with few or zero tabs while the vault still
  has multiple boards — the rail (and its dashboard button) stays, since
  visibility counts discovered boards, not shown ones.
- **Crossing the one-board threshold while a view is open** (create or
  delete a board): the rail appears/disappears reactively and the
  dashboard trigger swaps between rail and chrome; an open panel stays
  open, re-anchoring to the new geometry.
- **Duplicate first letters** in chip mode are expected and fine — the
  active highlight, position, and tooltips disambiguate; widening the
  rail is the real answer.
- **Rename/delete:** tabs re-derive from the board index store; no
  rail-specific handling.
- **Narrow views:** the rail's width is clamped but not responsive in
  v1; at the default (button) width the cost is negligible, and a
  user-widened rail on a narrow view squeezes the columns. If manual
  testing finds this painful, a "cap rail at N% of view width" rule is
  the fallback — noted here rather than pre-built.

## Follow-ups

- Drag-the-rail-to-an-edge re-docking (the gesture form of the Phase 2
  setting) and an explicit hide-the-rail preference, if living with the
  always-on rail demands them.
- Hover affordances if wanted after living with v1: hover-dwell peek of
  the panel, or tooltips upgraded to a hover-expanded label overlay in
  chip mode.
- Rail tab affordances if wanted after living with v1: context menu
  parity, count badges.

## Implementation Plan

One phase: the rail is a pure additional trigger surface for the
unchanged dashboard, so there is no open-model work to stage separately.

### Phase 1: Board rail — button, tabs, chip/label modes, resize

**Goal:** Multi-board vaults get a permanent left rail (dashboard button
on top, board tabs below) that defaults to button-width letter chips and
drag-widens to names; single-board vaults are untouched. The dashboard
panel itself behaves exactly as today.

1. ✅ `GlobalSettings.boardRail` (`width`): defensive parse + serialize
   (absent at default width, clamped on parse); plugin-owned write
   callback threaded entry → view, alongside the existing curation
   callbacks
2. ✅ `board_rail.svelte`: dashboard button as top entry (same icon/aria
   as the chrome button, toggles `dashboardOpenStore`, active state
   while open); tab list from `resolveBoardList(...).shown` with
   current-board highlight and full-path tooltips; `railDisplayMode`
   helper switching first-letter chips ↔ ellipsized labels at
   `RAIL_LABEL_MIN_WIDTH`; click → `openBoard` (current tab inert); all
   entries keyboard-activatable
3. ✅ Tab drag-reorder via the existing `onReorderBoards` callback:
   vertical-midpoint drop position, accent-bar cue, full shown order
   materialized on drop (shared `boardPaths` keeps rail and panel in
   lockstep)
4. ✅ Resize handle: pointer-capture drag, live width + live mode switch,
   clamp constants, persist on release
5. ✅ `main.svelte` layout: `.board-area` becomes rail + board row when
   the board index has >1 board; chrome dashboard button renders only
   when the rail does not; panel and scrim anchor right of the rail
   (overlay never covers the rail; rail stays live while open; toolbar
   coverage handled in Phase 1b); focus return targets the visible
   button
6. ✅ Tests: `boardRail` parse round-trip + junk rejection + width clamp,
   `railDisplayMode` threshold, rail visibility rule (0/1/many boards,
   hidden boards counted), first-letter chip derivation, rail entry
   derivation reuses the resolver (shown-only, order), vertical
   drop-position logic
7. ✅ Automated verification: `npm run build`, `npm test`
8. ✅ Manual: two-board vault shows the rail at button width with chips;
   chrome button gone, rail button toggles the panel; drag wider →
   names appear, truncate, tooltips correct; width persists across
   restart; one-click switch with highlight following; tab click while
   panel open closes + switches; panel sits beside (not over) the rail;
   drag a tab to reorder → panel order follows (and vice versa),
   persists across reopen; hide/rename in the panel reflect in the
   rail; delete down to one board → rail gone, chrome button back;
   create a second board → rail returns

**Deliverable:** One-click board switching restored (#130), always on
where it matters and invisible where it doesn't.
**Size:** M
**Implemented by:** [8c9eb3b](https://github.com/ErikaRS/task-list-kanban/commit/8c9eb3b80a859fea9dd0ed7b82ee71a92f396ac2)

### Phase 1b: Full-height rail

**Goal:** The rail spans the view's full height — chrome row included —
instead of starting below the toolbar (requirement 1 update from Phase 1
manual testing). The toolbar and board become one column (`.board-body`)
to the rail's right.

1. ✅ `main.svelte` layout: `.board-content` becomes a row of rail +
   `.board-body` (toolbar, modals, `.board-main`); the body carries the
   old content padding so toolbar/columns geometry is unchanged; the
   rail carries its own top/left padding and runs edge to edge
   vertically
2. ✅ Overlay simplification: with the rail outside `.board-body`'s
   positioning subtree, the `--dashboard-overlay-left` override is no
   longer needed — the panel's fixed left bleed now ends exactly at the
   rail's border, so it emerges from the rail, covers the toolbar, and
   can never cover the rail
3. ✅ Automated verification: `npm run build`, `npm test`
4. ✅ Manual/review: rail runs the view's full height beside the toolbar;
   panel still slides out from the rail's edge (not over it) and covers
   the toolbar; single-board layout unchanged; chrome-button layout
   unchanged when the rail is hidden

**Deliverable:** The rail reads as the view's spine rather than a board
inset.
**Size:** S

### Phase 2: Top docking via a plugin setting

**Goal:** Requirement 9 — the rail can dock to the top of the view as a
horizontal strip, chosen by a plugin-wide setting (default: left). The
cheap version deliberately: no drag-to-dock gesture, no top-mode resize.

1. ✅ `boardRail.dock` (`"left" | "top"`, absent = left): defensive
   parse stores only an explicit `"top"`; width and dock are
   independent fields that survive each other's writes (the width
   write merges instead of replacing)
2. ✅ "Board rail position" dropdown in the settings tab's top-level
   plugin-behavior block, above the defaults sections
3. ✅ `board_rail.svelte` top mode: horizontal strip (button top-left,
   separator, tab row), always label mode with per-tab max-width,
   horizontal scroll on overflow, horizontal-midpoint reorder with
   left/right accent cues, no resize handle
4. ✅ `main.svelte`: `.board-content` flips to a column when the rail is
   top-docked; the panel gets `slideFrom="top"`, a translateY variant
   of `panelSlide`, so the dashboard slides down out of the strip and
   covers the toolbar
5. ✅ Tests: dock parse (round-trip, junk, default shedding, field
   independence), horizontal drop midpoint
6. ✅ Automated verification: `npm run build`, `npm test`
7. ✅ Manual/review: setting shows at the top of the plugin settings; default
   (left) behavior unchanged; switch to top → full-width strip with
   button top-left and labeled tabs, reorder works with side cues,
   panel slides down from the strip and covers the toolbar without
   covering the rail, close paths and focus return intact; switch back
   to left → prior width
   restored; single-board vaults show no rail and no behavior change
   in either dock

**Deliverable:** Browser-style tabs for those who want them on top,
one dropdown away, with the side rail as the default.
**Size:** M
