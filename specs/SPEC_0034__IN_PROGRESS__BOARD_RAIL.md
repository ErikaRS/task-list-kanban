# SPEC 0034: Board Rail

Status: IN PROGRESS

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
   strip on the left edge of the board area (below the chrome row) with
   the dashboard button on top and one tab per shown board below it, in
   the dashboard's curated order. No modes, no toggle.
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

Non-goals (v1 — candidates for later phases):

- Hover-expand / auto-hide behaviors (cut from an earlier draft; the
  panel opens by explicit click only).
- Top docking (the rail is left-side only to start).
- A user setting to hide the rail in multi-board vaults.
- Tab context menus and count badges on tabs — hide/show, rename, and
  stats stay in the dashboard panel. (Drag-reorder, by contrast, is in:
  the rail and dashboard share one order, so both surfaces reorder.)
- Keyboard-driven resize (pointer drag only in v1).
- Any change to hidden boards: they stay out of the rail and reachable
  via the dashboard's "Other boards" zippy.

## High-Level Design

### Rail component (`src/ui/dashboard/board_rail.svelte`)

- Rendered by `main.svelte` as a flex sibling **left of the columns
  wrapper inside `.board-area`** — the rail takes layout space (columns
  shrink) rather than overlaying, and sits below the chrome row like the
  panel does.
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
  or board select. Focus management, toolbar inert/dimming, animation,
  and reduced-motion behavior all stay exactly as shipped in SPEC 0033.
- When the rail is visible, the panel (and its scrim) anchor to the
  columns region **right of the rail** instead of the full board area:
  the existing slide-over, offset by the rail width. The rail is the
  trigger, so the overlay must not cover it; its button and tabs stay
  one-click live while the panel is open (selecting via tab closes the
  panel and switches, same as selecting a card). The rail is **never**
  inert — only the toolbar's other controls dim, as today.
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

- Top docking and an explicit hide-the-rail preference, if living with
  the always-on rail demands them.
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
   (overlay never covers the rail; rail stays live while open); focus
   return targets the visible button
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
