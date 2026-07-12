# SPEC 0030: Global Settings, Saved Views, Tabs, and Dashboard

Status: COMPLETE

Implemented: 2026-07

## Feature Request Summary

Umbrella scoping for four related feature requests that all push the plugin
from "every board is an island" toward a coherent multi-board experience:

- [#8](https://github.com/ErikaRS/task-list-kanban/issues/8) — Global
  settings: change the default categories (and other defaults) at the plugin
  level so new boards inherit them.
- [#159](https://github.com/ErikaRS/task-list-kanban/issues/159) — Give the
  on-board view settings the search bar treatment (SPEC 0029) and add the
  ability to save views.
- [#130](https://github.com/ErikaRS/task-list-kanban/issues/130) — Tabbed
  navigation for quick switching between kanban boards.
- [#132](https://github.com/ErikaRS/task-list-kanban/issues/132) — Dashboard
  view: summary information for all boards, serving as a launchpad.

These are scoped together because they share design decisions. Whole-board
display settings (flow direction, column width, sort, group, filter) should be
extracted into **views** rather than becoming individual global settings; the
global layer (#8) then covers Tier 1 board settings plus a single **default
view**, so the views work (#159) shapes what the global layer looks like. Tabs
(#130) and the dashboard (#132) both need **board discovery** and
**plugin-level storage**, which the global settings work introduces.

## Current Architecture (facts that constrain the design)

1. **There are no plugin-level settings.** `Plugin.loadData()`/`saveData()`
   are unused; no `PluginSettingTab` is registered. `entry.ts` seeds new
   boards with `kanban_plugin: {}`, so defaults come from the hardcoded
   `defaultSettings` in `src/ui/settings/settings_store.ts`.
2. **All settings live per board**, serialized as a JSON string under the
   `kanban_plugin` frontmatter key (`src/ui/kanban_frontmatter.ts`). Parsing
   is `settingsObject.partial()` (Zod) merged over `defaultSettings`.
3. **Writes materialize everything.** `toSettingsString` serializes the fully
   resolved `SettingValues`, so after a board's first save all ~35 fields are
   pinned in its frontmatter. A global-defaults layer added naively would
   never affect existing boards, and would stop affecting new boards after
   their first save.
4. **Saved, named, per-board entities already exist** — `savedFilters`
   (SPEC 0029 unified query strings) and `savedGroupings`. Their UI (save row,
   zippy list, apply/delete) is the template for saved views.
5. The board header hosts on-board arrangement controls (sort select, group
   select + saved groupings); the settings modal's "Board layout" section
   hosts column width and flow direction (SPEC 0005).
6. `KanbanView` is a `TextFileView`; one view instance per leaf, stores
   created in the constructor, re-initialized via `setViewData` when the file
   loads or changes.

## Settings Taxonomy

The design work that unblocks everything else: classify every field in
`SettingValues` into three tiers.

### Tier 1 — Board data settings (globally inheritable; issue #8)

Define *what the board is and which tasks it shows*. Sensible vault-wide
defaults; individual boards may override.

| Field | Notes |
| --- | --- |
| `columns` | The headline request of #8 ("default categories") |
| `uncategorizedColumnName`, `doneColumnName` | Column naming conventions |
| `uncategorizedVisibility`, `doneVisibility` | Column display policy |
| `doneStatusMarkers`, `cancelledStatusMarkers`, `ignoredStatusMarkers`, `statusMarkerOrder` | Vault-wide status conventions |
| `propertySchema`, `treatNestedTasksAsSubtasks` | Vault-wide parsing conventions |
| `scope` (mode only) | Folder/everywhere default policy |
| `excludePaths`, `excludedTags`, `excludedTaskTags` | e.g. always exclude `templates/` |
| `showFilepath`, `consolidateTags`, `propertyDisplay` | Card display defaults (candidates to move into views later; see open questions) |

### Tier 2 — View settings (extracted into savable views; issue #159)

Define *how the current board is arranged*. Savable as a named view, and
globally defaultable via the plugin-level **default view** (Part C) rather
than as individual global settings.

| Field | Today lives in |
| --- | --- |
| filter query (`lastFilter`) | Search bar (SPEC 0029) |
| `columnOrderMode`, `sortProperty`, `sortDirection` | Board header sort select |
| `groupSource`, `groupDirection` | Board header group select |
| `flowDirection` | Settings modal "Board layout" |
| `columnWidth` | Settings modal "Board layout" |

### Tier 3 — Board-local state (never inherited, never in saved views)

`manualOrder`, `collapsedColumns`, `lastUsedTaskFile`, `defaultTaskFile`,
`scopeFolders` (absolute vault paths only meaningful to that board),
`savedFilters` / `savedGroupings` / `savedViews` lists themselves, and the
*current* values of the Tier 2 fields (the "anonymous current view").

## High-Level Design

### Part A — Sparse settings persistence (prerequisite)

Make board frontmatter store only **explicit overrides** rather than the full
resolved object.

- `parseSettingsString` already produces a sparse partial before merging;
  keep the partial alongside the resolved values. The settings store becomes
  two layers: `overrides` (what gets written) and `resolved` (what consumers
  read). Consumers (`main.svelte`, columns stores, task stores) keep reading
  resolved values — no churn outside the settings layer.
- On write, serialize `overrides` plus any fields changed during the session
  (a change through the settings modal or a board control marks that field as
  an override, even if the new value happens to equal the default).
- State fields (Tier 3) are effectively always overrides once used — fine.
- **Migration stance:** existing boards have every field materialized; they
  are treated as fully overridden (safe, no behavior change). Offer explicit
  affordances to shed overrides: per-section "Reset to defaults" in the board
  settings modal, and optionally a "Prune settings that match defaults"
  command.
- Wrinkle to handle: parse-time migrations (`migrateColumnDefinitions`,
  `migrateCollapsedColumns`, `showProperties` → `propertyDisplay`) must apply
  to the overrides layer so migrated shapes get persisted, without promoting
  untouched fields into overrides.

Benefit even standalone: new boards keep `kanban_plugin: {}` until the user
actually changes something, and frontmatter diffs shrink dramatically.

### Part B — Views (issue #159)

**Separate view editor.** The view controls do **not** live in the SPEC 0029
search bar's expanded editor — the search bar stays a pure filter surface.
Instead the board gains a dedicated **view editor**: a sibling panel toggled
from the board header, expandable/collapsible, with no text input of its own.
Each view property gets a control row (the same row treatment the filter
fields got in SPEC 0029), plus one save row that saves the current mix as a
named view:

```
┌ Board header ─  🔍 [ search bar (SPEC 0029) ]      [⚙︎ View] ─┐

┌ View editor (expanded) ────────────────────────────────────────┐
│  Sort     [ File order ▾ ]  [ asc ▾ ]                          │
│  Group    [ None ▾ ]  [ asc ▾ ]                                │
│  Flow     [ LTR ▾ ]                                            │
│  Card width [────●────] 300px                                  │
│  ─────────────────────────────────────────────────────────────│
│  Save view as: [ name…    ] [Save]   (saves: filter · group)  │
│  ▸ Saved views (3)                                             │
└────────────────────────────────────────────────────────────────┘
```

- Sort and group selects move from the board header into the view editor.
- Flow direction and column width move out of the settings modal's "Board
  layout" section into the view editor; the modal section is removed.
- The filter query stays owned by the search bar. Saving a view still
  captures the current query (a view's `query` slot reads the search bar
  state); the view editor just doesn't host filter controls itself.
- **Storage stays structured.** The existing settings fields remain the
  single source of truth; the editor controls write to them exactly as the
  header/modal controls do today. (An optional later enhancement can add
  `sort:` / `group:` bar tokens that compile into the structured fields on
  apply — input convenience only, never a second stored representation.)

**Saved views.** A view is a named **sparse** bundle of any mix of view
properties — like a saved filter, generalized. All property slots optional:

```ts
interface SavedView {
  id: string;
  name: string;
  query?: string;                // unified filter query
  sort?: {
    mode: ColumnOrderMode;
    property?: string | null;
    direction: SortDirection;
  };
  group?: { source: GroupSource; direction: SortDirection };
  flowDirection?: FlowDirection;
  columnWidth?: number;
}
```

- `savedViews: SavedView[]` joins the settings schema (a Tier 3 list).
- **Save captures the mix of properties currently set** (explicitly set /
  non-default in the editor); the save row indicates which properties will be
  included (e.g. "saves: filter · group"). A view can be just a filter, just
  a grouping, just a layout, or any combination.
- **Apply merges:** it sets only the properties the view contains, leaving
  the rest of the current arrangement untouched. This keeps views composable
  (apply a "group by project" view on top of an active filter). The current
  state stays an anonymous scratch view, so tweaking after applying never
  edits the saved view.
- UI mirrors saved filters: save row, zippy list, apply, delete-with-confirm.
  The saved list badges each entry with the properties it carries.
- **`savedFilters` and `savedGroupings` are both subsumed.** A saved filter
  is exactly a view containing only `query`; a saved grouping is a view
  containing only `group`. Migrate both lists into `savedViews` at parse time
  (legacy fields stay parse-only, like the SPEC 0029 filter fields) and
  retire their separate UIs in favor of one saved-views list.

### Part C — Global settings (issue #8)

- New plugin-level storage via `loadData()`/`saveData()` (`data.json`):

```ts
// A SavedView minus identity — just the sparse property mix.
type ViewProperties = Omit<SavedView, "id" | "name">;

interface GlobalSettings {
  version: 1;
  boardDefaults: Partial<SettingValues>;   // Tier 1 keys only
  defaultView?: ViewProperties;            // Tier 2 defaults for all boards
  globalViews?: SavedView[];               // Part C2
  tabs?: TabSettings;                      // Part D
}
```

- **Resolution order:** `builtinDefaults ⊕ globalDefaults ⊕ boardOverrides`,
  where the global layer contributes `boardDefaults` for Tier 1 fields and
  `defaultView` for Tier 2 fields. With sparse persistence (Part A) this
  gives true inheritance: change the global default columns or default flow
  direction → every board that never touched that field updates.
- **Default view:** the global settings include a "Default view" — the
  arrangement (sort, group, layout, optionally a filter) that boards start
  with and fall back to wherever they haven't set their own. It's a sparse
  `ViewProperties` mix, edited in the plugin tab with the same control rows
  the view editor uses.
- **The plugin tab is deliberately not a mirror of the board settings
  modal.** Tier 1 sections are shared: the section renderers in `settings.ts`
  (Columns, Task properties, Display, Status markers, the exclude side of
  Scope) get refactored to render into either the per-board modal or the
  plugin tab. But the "Default view" section exists only in the plugin tab —
  locally, those controls live in the view editor, not the modal. And
  board-only concerns (scope folder pickers relative to the board, default
  task file) stay modal-only.
- The board settings modal indicates inherited vs overridden values and gains
  per-section "Reset to global defaults".
- Open boards re-resolve live: the plugin holds a global settings store;
  each `KanbanView` receives it via the `registerView` closure and derives
  its resolved store from (global ⊕ overrides).
- A convenience command/button: "Use this board's settings as global
  defaults" (copies the board's Tier 1 values into `boardDefaults`) — the
  cheapest possible answer to #8's actual workflow.

**Part C2 — Global saved views.** `globalViews` appear in every board's saved
views list (labeled as global, e.g. a 🌐 badge). Boards can apply them;
editing/deleting them happens in the plugin settings tab. Name collisions are
allowed; board-local views list first.

### Part D — Tabbed navigation (issue #130, later phase)

- **Board discovery service** (shared with the dashboard): scan
  `vault.getMarkdownFiles()` for `metadataCache` frontmatter containing
  `kanban_plugin`; keep it current via metadata-cache events. Cheap — no file
  reads needed.
- A tab strip rendered at the top of the kanban view listing boards; clicking
  a tab opens that board **in the same leaf** (`leaf.openFile`). Obsidian's
  file lifecycle flushes pending saves on switch (verify in testing).
- Config lives in `GlobalSettings.tabs`: enabled on/off, which boards (all
  discovered vs. pinned subset), ordering (alphabetical / manual / recent).
- Non-goals: nested tab groups, drag-to-reorder in v1 (manual order can be a
  list in plugin settings first).

### Part E — Dashboard (issue #132, later phase)

- A new non-file `ItemView` (`registerView("kanban-dashboard", …)`) opened
  via ribbon icon and command palette.
- One row/card per discovered board: name, folder, last modified, open /
  done task counts; click opens the board (launchpad).
- **Counting is the expensive part**: exact counts require evaluating each
  board's scope + column + status settings against vault tasks. Approach:
  compute lazily per board on dashboard open, reusing the existing task
  parsing machinery with that board's resolved settings; cache keyed by the
  mtimes of in-scope files; show counts progressively. If this proves too
  heavy for large vaults, v1 falls back to counts of done-vs-open markers in
  in-scope files without column semantics.
- Dashboard display preferences (sort order, which stats) live in
  `GlobalSettings`.

## Detailed Behavior Notes

- **Override semantics:** touching a control marks the field overridden even
  if the value equals the inherited default (predictability beats magic).
  Shedding an override is always explicit (reset affordances).
- **Applying a saved view** sets only the properties the view contains
  (merge semantics). A "reset view" affordance (clearing all Tier 2 fields
  back to defaults) covers the "start clean, then apply" workflow.
- **What counts as "set" at save time:** a property is included in a saved
  view when its current value is explicitly set rather than default/inherited
  (the same override tracking Part A introduces). The save row shows the
  resulting mix before saving.
- **Sparse round-trip safety:** unknown frontmatter keys are already
  stripped by the Zod schema; sparse writing must not resurrect retired keys
  (`lastContentFilter` etc. remain parse-only).
- **New-board flow unchanged:** `kanban_plugin: {}` now genuinely means
  "inherit everything".

## Open Questions

1. Should card-display toggles (`showFilepath`, `consolidateTags`,
   `propertyDisplay`, done/uncategorized visibility) be part of views rather
   than Tier 1 board settings? Leaning: keep in Tier 1 for v1; views cover
   arrangement only. Revisit if a real use case appears.
	- Confirmation: Yes, keep in Tier 1 for v1. 
2. Does `collapsedColumns` belong in saved views (a "focus view" that
   collapses columns)? Leaning: no for v1; it's transient state.
   - Confirmation: collapsedColumns should be treated as transient state
3. `sort:` / `group:` query tokens — worth the grammar surface? Deferred as
   an optional enhancement in Part B.
   - Do no add sort: or group: query tokens for now
4. Header ergonomics: after sort/group move into the view editor, is a
   collapsed-state indicator (e.g. "sorted by due ↑ · grouped by file")
   needed so users can see at a glance why the board is arranged as it is?
   - Answer: Let's start with some indication that a group is applied, but
	 be fine with opening the view editor to see the details. We may change
	 this before calling this complete. 
6. Apply-merge semantics mean two applied views can stack (filter view +
   grouping view). Should the UI surface which saved views are "active", or
   is the anonymous-scratch model (views are just presets you apply) enough?
   Leaning: presets only, no active-view tracking in v1.
   - Affirm: Presets only for v1
5. Tabs: is in-leaf switching the right model, or should tabs open in new
   leaves (Obsidian-native behavior)? In-leaf is the requested UX; confirm.
   - Confirm: Let's try in-leaf. I have some concerns about it, but since
	 that's how it was requested, let's see if it works. 

## Implementation Plan

Dependency shape: Phase 1's override tracking unblocks both Phase 3 (sparse
view saves) and Phase 4 (inheritance); Phase 4's "Default view" section
reuses the control rows Phase 2 builds. Practical order: 1 → 2 → 3 → 4. Phases 6–7 depend on
Phase 4's storage plus a shared discovery service. Tabs and dashboard should
get their own specs (next available numbers) when picked up; their phases
here are scoping-level.

### Phase 1: Sparse settings persistence
**Goal:** Board frontmatter stores only explicitly-set fields; behavior
otherwise unchanged.

1. ✅ Split settings store into overrides + resolved layers; keep the parsed
   partial from `parseSettingsString`
2. ✅ Route all setting mutations through an API that records the field as
   overridden
3. ✅ Write only overrides in `toSettingsString`; keep parse-time migrations
   working on the overrides layer
4. ✅ Tests: sparse round-trip; untouched new board keeps `{}`; legacy
   fully-materialized board round-trips unchanged; migrations persist
5. ✅ Manual test: new board, change one setting, verify frontmatter contains
   exactly that field

**Implementation notes (Phase 1):**
- `createSettingsStore` now returns a `BoardSettingsStore`: `set`/`update`
  remain the mutation API for every existing call site, and the store itself
  records overrides by diffing each incoming field against a per-key JSON
  snapshot of the last resolved value. (Snapshots rather than object
  comparison because Svelte's `$store.field = x` sugar mutates the store's
  current object in place before calling `set`.) `load()` replaces the
  overrides from parsed frontmatter; `getOverrides()` feeds the write path.
- Override-recording refinement to the "touching a control" semantics: a
  field becomes an override when a write *changes* its resolved value —
  including changing it to something that equals the default — but setting a
  field to the value it already resolves to records nothing. Deleting a key
  (e.g. `writeBoardFilterState` dropping legacy filter fields) sheds the
  override. Explicit pin/reset affordances arrive with Phase 4.
- Parse-time migrations (string columns, collapsed-column labels, legacy
  `showProperties`, flat `manualOrder`) land in the overrides layer via
  `parseSettingsOverrides`, so migrated shapes persist without promoting
  untouched fields.

**Deliverable:** New boards accumulate only the settings the user touches.
**Size:** M

### Phase 2: Standalone view editor ✅ COMPLETE
**Goal:** Sort, group, flow direction, and column width all live in a new
expandable/collapsible view editor (separate from the search bar, no text
input); settings modal "Board layout" section removed.

1. ✅ Build the view editor shell: header toggle, expand/collapse panel
2. ✅ Add Sort / Group rows (reusing header select logic)
3. ✅ Add Flow and Card width rows
4. ✅ Remove header sort/group selects (decide on collapsed-state indicator)
5. ✅ Remove "Board layout" section from the settings modal
6. ✅ Automated verification: `npm run build`, `npm test`
7. ✅ Manual pass over sort, group, flow direction, and card width controls in Obsidian

**Implemented by:** [4c25ef3](https://github.com/ErikaRS/task-list-kanban/commit/4c25ef39c999c2becead5dfdf77b0a4c1d812115)

**Implementation notes (Phase 2):**
- `src/ui/view_editor.svelte` now hosts the arrangement controls. It reuses
  the existing sort/group mutation paths, keeps the tag-group prefix/include
  controls with grouping, and adds flow direction plus a card-width slider.
- The top chrome now puts the **View** toggle to the left of the search bar,
  settings on the right, and the task count inside the board matrix corner
  instead of its own chrome row. The view editor floats from the **View** button
  over the board content; no persistent group-applied chip is shown.
- The settings modal no longer renders the "Board layout" section; those
  fields are edited from the board view editor.

**Deliverable:** One consolidated arrangement editor on the board.
**Size:** M–L

### Phase 3: Saved views ✅ COMPLETE
**Goal:** Name, save, apply, and delete sparse views per board.
**Depends on:** Phase 1 (override tracking decides which properties a save
captures) and Phase 2 (the view editor hosting the controls and save row).

1. ✅ Add sparse `SavedView` type + `savedViews` to the settings schema
2. ✅ Save row with included-properties indicator + zippy saved list with
   per-entry property badges
3. ✅ Apply (merge semantics) / delete-with-confirm flows
4. ✅ Migrate `savedFilters` and `savedGroupings` → `savedViews` at parse
   time; retire both separate UIs and stop writing the legacy fields
5. ✅ Tests: sparse save captures exactly the set properties, apply-merge
   round-trip, filter + grouping migrations
6. ✅ Manual Obsidian pass over save/apply/delete interactions and visual fit

**Implemented by:** [4c25ef3](https://github.com/ErikaRS/task-list-kanban/commit/4c25ef39c999c2becead5dfdf77b0a4c1d812115)

**Deliverable:** Working saved views on a single board (closes #159).
**Size:** M–L

**Implementation notes (Phase 3):**
- `src/ui/settings/settings_store.ts` now parses `savedViews` and migrates
  legacy `savedFilters` / `savedGroupings` into query-only or group-only
  saved views.
- `src/ui/views/saved_views.ts` owns sparse capture, labels, query-only
  detection, and apply-merge behavior.
- The View popover now has a compact "Save as" row plus a saved-views zippy
  list. The filter editor's Saved list is backed by the query-only subset of
  saved views, so old saved filters keep the same affordance after migration.
- Post-review follow-up: a view-editor save now also captures the applied
  filter query (read from the `lastFilter` override; an empty/cleared query
  is treated as unset), so filter + arrangement combos can be saved
  board-locally as Part B describes. The save row shows an
  included-properties hint ("Saves: Filter · Group") mirroring the
  spec mockup.

### Phase 4: Global settings (closes #8) ✅ COMPLETE
**Goal:** Plugin-level defaults inherited by boards that haven't overridden
them.

1. ✅ `GlobalSettings` storage via `loadData`/`saveData` + global store in the
   plugin, passed into `KanbanView`
2. ✅ Three-layer resolution (builtin ⊕ global ⊕ board) with live
   re-resolution of open boards
3. ✅ Reuse the board settings editor for global defaults; register
   `PluginSettingTab` with Tier 1 defaults
4. ✅ Layout-only "Default view" section in the plugin tab, resolved as the
   Tier 2 default layer for flow direction and card width
5. ✅ Board modal: inherited-vs-overridden indication + per-section reset.
   Scope also includes the override-lifecycle gaps found in review:
   - ✅ Pinning a field at the inherited value (today only value-*changing*
	 writes record an override, so a board cannot deliberately freeze a
	 value that currently equals the global default)
   - ✅ Clearing the plugin-level default view (flow direction is force-set
	 to LTR at parse and card width has no unset affordance, so "no
	 default view" is not a representable state)
   - ✅ Shedding overrides on legacy fully-materialized boards (Part A's
	 "Prune settings that match defaults" command), without which every
	 Tier 2 field counts as set and view saves always capture all
	 arrangement properties
6. ✅ "Use this board's settings as global defaults" command (optionally
   capturing its current arrangement as the default view)
7. ✅ Tests: resolution precedence for both tiers, live propagation
8. ✅ Tests: reset flows (pin, clear, prune; clearable default view)
9. ✅ Manual Obsidian pass: chips + section resets in the board modal,
   pinning, pruning a legacy board, layout-default normalization, and live
   inheritance to open boards (verified 2026-07-10)

**Deliverable:** Change default columns once; new and untouched boards follow.
**Size:** L

**Implemented by:** earlier Phase 4 commits plus
[1b4cee8](https://github.com/ErikaRS/task-list-kanban/commit/1b4cee8)
(override lifecycle, prune command, default-view normalization)

**Implementation notes (Phase 4):**
- Added `src/ui/settings/global_settings.ts` with versioned plugin-level
  settings, Tier 1 filtering, default-view-to-settings mapping, inherited
  settings derivation, and serialization for `data.json`.
- `entry.ts` now loads/saves global settings with `Plugin.loadData()` /
  `saveData()`, passes the inherited settings store into each `KanbanView`,
  registers an initial plugin settings tab, and adds the "Use current board
  settings as global defaults" command.
- `createSettingsStore` now resolves `builtinDefaults ⊕ globalDefaults ⊕
  boardOverrides`; global changes re-resolve open boards without adding board
  frontmatter overrides.
- The plugin tab embeds `SettingsModal` in a single-page global-defaults mode
  for Tier 1 board defaults, so default columns use the same color, reorder,
  and name/tag/status/priority matching controls as individual boards. The
  embedded editor hides board-local controls such as selected folder paths,
  default task file, and "Update existing tasks" retag options. Reset all
  global board defaults now requires confirmation.
- The plugin-level default view is intentionally layout-only: it inherits
  flow direction and card width, while filter, sort, and grouping remain
  temporary board options with no global default. Legacy/default data that
  includes query/sort/group is pruned during global settings parse.
- "No default view" is a representable state, reached by normalization
  rather than extra UI: the default-view controls always show a value, and
  choosing the builtin defaults (left-to-right flow, 300px width) stores
  nothing. Parse applies the same normalization, which sheds the
  `flowDirection: "ltr"` that earlier Phase 4 builds pinned into data.json.
- Override lifecycle (task 5): `BoardSettingsStore` gained explicit
  `pinOverrides` / `clearOverrides` / `pruneOverridesMatchingDefaults` /
  `getBaseSettings` operations alongside the diff-based tracking. The board
  settings modal shows an Inherited/Overridden chip beside every Tier 1
  field (clicking toggles pin ↔ reset-to-inherited), and each section header
  gains "Reset to defaults" covering that section's Tier 1 keys; board-local
  (Tier 3) fields have no chip and are untouched by section resets. The
  modal reports pinned/cleared keys to `KanbanView` on save, which applies
  them after the value write. A new command — "Prune board settings that
  match the defaults" — sheds every override on the active board that equals
  its inherited/builtin value (the legacy fully-materialized board escape
  hatch, which also stops view saves from capturing every arrangement
  property on such boards).
- Manual testing found and fixed a save bug in the embedded global-defaults
  editor: the tab passed its resolved-settings object into the modal by
  reference, and since the modal mutates its settings in place, the
  change-detection diff compared the object against itself — the first edit
  after opening the tab was silently dropped. The editor now gets its own
  clone (board mode already did).
- The override chips render as small bold text (not buttons): "Reset to
  defaults" when overridden (click resets), "Inherited" otherwise (click
  pins). Each section header carries a slightly larger section-level "Reset
  to defaults" beside the title; the aggregate `columns` field is covered by
  the Columns section reset rather than a chip of its own.
- Tests cover global settings sanitization, Tier 1 copy behavior, default
  view inheritance, live propagation, board override precedence, pin/clear
  lifecycle, prune behavior against the inherited base, and
  builtin-equal layout-default normalization.

### Phase 5: Global saved views ✅ COMPLETE
**Goal:** Views defined once, available on every board.

1. ✅ `globalViews` in `GlobalSettings` + management UI in the plugin tab
2. ✅ Merge into each board's saved views list with a global badge
3. ✅ Tests: merge order, apply, no cross-board leakage

**Deliverable:** Vault-wide views like "Overdue only".
**Size:** S–M

**Implementation notes (Phase 5):**
- Global saved views are stored under plugin-level `globalViews`, parsed with
  the same saved-view schema as board-local views, and empty global view
  entries are discarded during parse.
- The plugin settings tab now has a "Global saved views" section for creating
  and deleting vault-wide presets. Global views can include query, sort,
  group, flow direction, and card width properties.
- Boards merge local saved views first, then global saved views with a
  global badge. Global entries apply like local presets but cannot be deleted
  from board-local saved view or saved filter lists.
- Tests cover global-view parsing isolation, local-before-global merge order,
  and the existing apply-merge behavior.

### Phase 6: Tabbed navigation (scoping level; spun out — #130) ✅ COMPLETE
**Goal:** Switch between boards without leaving the kanban view.

Spun out into `SPEC_0032__COMPLETE__TABBED_BOARD_NAVIGATION.md`
(plus a tab-menu board rename added during review); implemented 2026-07.
The tab strip UI was later superseded by SPEC 0033's board dashboard
(strip removed before release; discovery, in-leaf switching, rename, and
the curation model — now `GlobalSettings.boardList` — carry over).

1. ✅ Board discovery service on `metadataCache`
2. ✅ Tab strip UI + in-leaf switching (save-on-switch verified manually)
3. ✅ `tabs` config in plugin settings (enable, curated board list, order)

**Deliverable:** In-view tab bar across kanban boards (superseded by the
SPEC 0033 dashboard).
**Size:** M

### Phase 7: Dashboard (scoping level; spun out — #132) ✅ COMPLETE
**Goal:** Summary + launchpad view over all boards.

Spun out into `SPEC_0033__COMPLETE__BOARD_DASHBOARD.md`; tracking
below is scoping-level only — the implementation spec is the source of truth.
The quick-switching follow-up from #130 was completed in
`SPEC_0034__COMPLETE__BOARD_RAIL.md`, which restores one-click
board switching on top of the dashboard model.

1. ✅ Dashboard panel command entry point
2. ✅ Board cards from discovery service (name, folder, last modified)
3. ✅ Lazy open/done counts using each board's resolved settings, with
   mtime-keyed caching
4. ✅ Perf validation on a large vault; fallback strategy if needed

**Deliverable:** Dashboard listing all boards with task stats (closes #132).
**Size:** L
