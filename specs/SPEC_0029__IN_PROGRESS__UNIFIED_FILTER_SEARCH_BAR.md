# SPEC 0029: Unified filter search bar

Status: DRAFT

## Feature Request Summary

Issue [#127](https://github.com/ErikaRS/task-list-kanban/issues/127) asks to
mix the existing filters into a single always-visible search bar with
`file:<x>`, `tag:<x>`, and content-search syntax. The owner's follow-up
comment refines the design:

- The filter sidebar goes away. The search bar sits on top, and expands into
  a dropdown editor (based on the current section UIs) that opens underneath
  the bar, over the board content.
- Typing in the bar and editing in the expanded UI are two views of the same
  filter: type a filter, expand to see it structured, edit it structured,
  see the text update.
- Suggestions while typing, typed per token kind, rendered as plain text —
  the chip/tag multi-select UI goes away (it has always been inconsistent
  across surfaces).
- One saved-filter list covering every filter type and any combination
  thereof.
- Semantics: **everything is AND-ed** — across filter types and across
  multiple filters of the same type. Never OR. No negation.

This absorbs subissue [#128](https://github.com/ErikaRS/task-list-kanban/issues/128)
(multiple content filters): quoted strings like
`"[[•project name]]" "[[+concept name]]"` must match tasks containing both
strings in any order. #128 floats optional OR logic; the #127 comment
rejects general OR, so OR stays out — with one deliberate carve-out: the
existing tag filter is OR across its selected tags, and existing boards
depend on that. Tags therefore keep OR *within a single `tag:` token* via
comma syntax (`tag:home,errand`), while repeated tokens AND like every
other filter type. No other OR, no negation.

Current state this builds on: content/tag/file filters and SPEC_0028's
AND-ed date conditions each live in their own sidebar section with their own
saved list (`src/ui/main.svelte`), persisted per board via four
`last*Filter` settings fields and a shared `savedFilters` array
(`src/ui/settings/settings_store.ts`), with external-edit sync through
`BoardFilterState` (`src/ui/filters/filter_state.ts`).

## User Requirements

1. A single search bar, always visible at the top of the board, replaces
   the filters sidebar entirely (including its toggle button and resize
   handle).
2. Query syntax expresses every filter type as text:
   - bare or quoted terms → content filters,
   - `tag:<x>` or `tag:<x>,<y>` → tag filters (comma = any of),
   - `file:<x>` or `file:<x>,<y>` → file filters (comma = any of),
   - `<dateKey>:<op><value>` (e.g. `due:<$TODAY`) → date conditions.
3. Any number of tokens of any type may be combined; all tokens are
   AND-ed, both across types and within a type, with two disjunctions:
   *inside* a single `tag:` token, comma-separated tags mean "any of"
   (preserving the current tag filter's OR behavior), and the **file
   list is one "any of" group** — a task has exactly one path, so
   AND-ing path substrings is rarely satisfiable; repeated `file:`
   tokens merge into that list. No other OR, no negation.
4. Multiple content terms are supported (#128): each term is an independent
   case-insensitive substring match, order-independent.
5. An expand control on the bar opens a structured editor underneath it
   (overlaying board content, not pushing it), with sections derived from
   the current sidebar UIs. Bar and editor stay in sync both ways: text
   edits reflect in the editor, editor edits re-serialize into the bar.
6. While typing in the bar, plain-text suggestions appear based on the
   token under the caret (tag names, file paths, date property keys, saved
   filter names). No chip UI anywhere in the filter surface.
7. One saved-filter list. A save captures the whole current query (any
   combination of types) with an optional user-chosen name. Existing
   per-type saved filters keep working via migration.
8. Filter state persists per board (frontmatter) as it does today,
   including the external-edit sync behavior.
9. Unchanged semantics carried forward: content and file matching is
   case-insensitive substring; tag matching is exact against the task's
   tag set; the current multi-tag OR behavior is preserved (a legacy
   multi-tag selection becomes one comma token with identical results);
   date conditions never hide tasks missing the referenced property;
   `$TODAY` re-evaluates on day rollover; filtered counts and the
   is-filtered indicator reflect the active query.
10. New expressiveness: repeated `tag:` tokens AND, so "has both tags"
    (`tag:home tag:errand`) becomes expressible for the first time, while
    `tag:home,errand` keeps today's "has either tag". Repeated `file:`
    tokens instead merge into the single "any of" list.

## High-Level Design

### Query language

A query is a whitespace-separated list of tokens. Every token is one of:

| token shape | filter | match rule |
| --- | --- | --- |
| `word` or `"quoted phrase"` | content | task content contains the term (case-insensitive) |
| `tag:x` or `tag:x,y,z` | tag | task's tag set contains `x` exactly (comma list: contains **any** of the listed tags) |
| `file:x`, `file:x,y`, or `file:"a b"` | file | task's file path contains **any** listed entry (case-insensitive) |
| `<dateKey>:<op><value>` | date | SPEC_0028 condition semantics |

Date tokens map operators to the existing `DateFilterOperator` set:

| text op | operator |
| --- | --- |
| `<`  | `before` |
| `<=` | `on-or-before` |
| `=`  | `on` |
| `>=` | `on-or-after` |
| `>`  | `after` |

`<value>` is `$TODAY` or `YYYY-MM-DD`. `today` (any case) is accepted on
parse as an alias and canonicalizes to `$TODAY`. `<dateKey>` must be a
date-typed key of the active property schema (`due`, `scheduled`, `start`,
`done`, `created` for the built-in schemas); the schema's key, not its
display label, is the token key.

Parsing rules:

- Prefixes (`tag:`, `file:`) are case-insensitive.
- A `tag:` value splits on commas into an OR-group; each entry is one
  exact tag. Task tags are kebab-normalized by the parser, so they never
  contain commas, spaces, or quotes — no quoting is needed inside `tag:`
  values, and empty entries (`tag:a,,b`, trailing comma) are dropped.
- A `file:` value splits on commas into the file "any of" list; a comma
  inside a file name is not expressible (the same class of loss as a
  literal quote).
- Values may be double-quoted to include spaces; a quoted region runs to
  the next `"`. No escape syntax — a literal `"` inside a term is not
  expressible (acceptable; task content search rarely needs it).
- Fallback to content: a token with a colon whose prefix is neither
  `tag`/`file` nor a date-typed key of the active schema is treated as a
  plain content term (so `note: call mom` or a pasted URL never errors).
  A date-shaped token whose op/value doesn't parse (e.g. `due:tomorrow`)
  also falls back to a content term rather than being silently dropped —
  the board visibly over-filters instead of invisibly under-filtering.
- Empty query = no filtering.

Serialization is the inverse: terms containing whitespace (or a leading
recognized prefix) are quoted; date conditions render as
`key:<op><$TODAY|date>`; token order in the model is preserved. Round-trip
guarantee: `parse(serialize(model))` ≡ `model`, and serializing after a
structured edit produces text whose parse equals the edited model.

### Query model and module

New pure module `src/ui/filters/filter_query.ts`:

```ts
export interface FilterQuery {
	contentTerms: string[];
	// AND of OR-groups: each inner array is one `tag:` token; a task
	// matches a group by carrying any tag in it, and must match every group.
	tagGroups: string[][];
	// One OR-group: a task matches when its path contains any entry.
	filePaths: string[];
	dateConditions: DateFilterCondition[];
}

export function parseFilterQuery(text: string, dateKeys: string[]): FilterQuery;
export function serializeFilterQuery(query: FilterQuery): string;
export function isEmptyFilterQuery(query: FilterQuery): boolean;
export function taskMatchesFilterQuery(task, query, today): boolean;
```

`taskMatchesFilterQuery` ANDs the four predicates, reusing
`taskMatchesDateConditions` from `src/ui/filters/date_filter.ts` for the
date part. The `main.svelte` pipeline collapses from four chained derived
arrays (`filteredByText → filteredByTag → filteredByFile → filteredByDate`)
into one `filteredTasks` derivation over the parsed query and
`$todayStore`. `isFiltered` becomes `!isEmptyFilterQuery(query)`.

The **parsed model is the source of truth**; the bar's text is derived
state. While the bar has focus the raw text is left as typed (so the caret
and half-typed tokens survive); on structured edits or blur the text is
re-serialized to canonical form.

### Persistence

- `lastFilter: z.string().optional()` joins the settings schema and
  replaces `lastContentFilter` / `lastTagFilter` / `lastFileFilter` /
  `lastDateFilter` as the written field. Read-time migration: when
  `lastFilter` is absent and any legacy field is non-empty, compose the
  equivalent query string. Legacy fields stay in the schema (parse-only)
  so old frontmatter never fails validation; they are dropped from writes.
- `BoardFilterState` shrinks to the query string; its
  read/write/serialize helpers and `shouldApplyIncomingBoardFilterState`
  (external-edit sync) operate on that string unchanged in spirit.
- `savedFilterSchema` gains `query: z.string().optional()`. New saves
  write `{ id, name?, query }`. Legacy slot-based entries (`content` /
  `tag` / `file` / `date`) are converted to a query string at read time by
  a `savedFilterToQuery` helper; they are rewritten to `query` form only
  when the user next touches them (lazy migration, no bulk rewrite of
  frontmatter on load).
- `filtersSidebarExpanded` / `filtersSidebarWidth` become dead settings:
  kept in the schema (parse-only) for backward compatibility, no longer
  written or read.

### UI

**Search bar** — its own row at the top of the board content, above the
existing `board-header` controls (grouping, group-by, counts):

```
┌──────────────────────────────────────────────────────────────┐
│ [🔍  "big rocks" tag:home file:projects due:<$TODAY      ▾]  │
├──────────────────────────────────────────────────────────────┤
│ (grouping controls · group-by · counts — unchanged)          │
└──────────────────────────────────────────────────────────────┘
```

- The bar is a centered, width-constrained pill (Google-search styling)
  rather than a full-width row; a sliders icon (Gmail's "show search
  options") toggles the editor. `Esc` collapses; clicking outside
  collapses.
- The bar holds an **uncommitted draft**: filtering applies on commit —
  Enter in the bar, the editor's Search button, or clear (×) — never
  mid-keystroke, so the board doesn't churn while an intermediate query
  is being typed. Committing canonicalizes the bar text (quoting,
  `$TODAY` casing, token order); only the applied query persists.
- A clear (×) affordance empties both the draft and the applied query.

**Suggestions** (typing in the bar): a plain-text list anchored under the
bar, filtered by the token under the caret:

- bare word → saved filter names (selecting one applies that saved
  filter) and the literal prefixes `tag:` / `file:` / date keys;
- inside `tag:` → known tags from the board's task set (completing the
  segment after the last comma, so OR-groups build up naturally);
- inside `file:` → file paths present on the board;
- inside a date token → operator/value completions (`<$TODAY`, `<=$TODAY`,
  …).

Keyboard: up/down to move, Enter/Tab to accept, Esc to dismiss. Selecting
a suggestion replaces only the token under the caret. All text — no chips.

**Expanded editor** — a panel that opens under the bar, overlaying the
board (absolute positioning, board does not reflow):

```
[🔍 "big rocks" tag:home file:projects due:<$TODAY           ▴]
┌──────────────────────────────────────────────────────────────┐
│ Content   ["big rocks" fix     ]  words/"quoted phrases"     │
│ Tags      [home, errand        ] [×]   (any of, comma list)  │
│           [+ Add tag group]     (groups AND together)        │
│ Files     [projects, archive   ]       (any of, comma list)  │
│ Date      [Due ▾] [before ▾] (•) Today  ( ) Date [____] [×]  │
│           [+ Add condition]                                  │
│ ──────────────────────────────────────────────────────────── │
│ Saved filters                                                │
│   × overdue                                                  │
│   × home projects                                            │
│   [Name (optional) ______]  [Save]  [Clear all]              │
│ ──────────────────────────────────────────────────────────── │
└──────────────────────────────────────────────────────────────┘
```

- Gmail-style layout: a label column on the left (Content / Tags /
  Files / Date) with underlined inputs. **Content** is a single field
  with the bar's content semantics — bare words match anywhere, quotes
  bind a phrase; same parsed form, different affordance. **Files** is a
  single comma-separated "any of" field. **Tags** keep one row per
  OR-group with per-row remove and "+ Add tag group"; **Date** rows use
  the SPEC_0028 condition controls. Tag and file inputs offer the same
  text suggestions as the bar.
- Every section starts expanded with an empty row (Gmail-style). The
  date property/comparison dropdowns include an empty option; an
  incomplete date row is simply not part of the query until completed.
- The Date section appears only when the active schema exposes date-typed
  keys, mirroring the current sidebar rule (with the same hint text when
  the schema is "None" but the query contains a date-shaped token).
- Every editor change re-serializes into the bar's draft immediately; a
  bottom action row (Gmail-style) offers Clear and a primary Search
  button that applies the query and collapses the panel. Enter in any
  editor field also applies.
- The saved list is single and flat: click a name to apply (replacing the
  current query), click again to clear, × to delete (reusing
  `delete_filter_modal.svelte`). The active saved filter is highlighted
  when the current query, parsed, equals the saved query, parsed
  (structural comparison, so whitespace/quoting differences don't break
  the match). Unnamed saves display their query text.
- Save is disabled when the query is empty or an identical saved query
  exists (same rule as today's per-type `*FilterExists` checks).

**Removed UI**: the filters sidebar (`<aside class="filters-sidebar">`),
its toggle button, resize handle, all four per-type sections and their
per-type saved lists, the `SelectTag` chip multi-select usage for tag
filtering, and the content/file `datalist` autocompletes. The
`CompactTagSelect` used by the tag-*grouping* control in the board header
is out of scope and stays.

## Detailed Behavior

- All tokens AND: `fix tag:home,errand file:projects due:<$TODAY` keeps
  tasks whose content contains "fix", that carry `home` **or** `errand`,
  whose path contains "projects", and whose due date is before today (or
  that have no due date — SPEC_0028 rule). Repeated `tag:` tokens AND
  (`tag:home tag:errand` requires **both** tags); repeated `file:`
  tokens merge into one "any of" list (`file:a file:b` ≡ `file:a,b`).
- The #128 example works as: `"[[•project name]]" "[[+concept name]]"` —
  two content terms, both required, any order in the task text.
- Tag behavior is preserved exactly: a legacy multi-tag `lastTagFilter`
  or saved tag filter migrates to a **single** comma token
  (`tag:home,errand`), which is the same OR over the same tags. Boards
  produce identical results before and after upgrade. The AND-of-groups
  capability is purely additive.
- Date conditions keep every SPEC_0028 rule: missing/unparseable property
  values always pass, invalid conditions are skipped, `$TODAY` resolves
  via the today store and re-evaluates at local midnight, datetime values
  truncate to the local calendar day.
- A date token whose key stops being date-typed after a schema change
  falls back to a content term on the next parse (per the fallback rule),
  which almost certainly matches nothing — the user sees the stale token
  in the bar and can delete it. This replaces SPEC_0028's orphaned-row
  behavior in the structured UI.
- External edits to the board file (or the same board open twice) sync
  through the persisted query string exactly as today: incoming state
  applies only when the local state is unchanged from the last persisted
  key. The bar's draft is the sync guard, so an incoming change never
  clobbers a query the user is still composing.
- Filtering, counts, and the is-filtered indicator follow the **applied**
  query only; the draft affects nothing until committed.
- **Subtask matching:** content terms and `tag:` tokens match against the
  card's whole rendered block — the task line plus every nested
  subtask/note row (when "treat nested tasks as subtasks" is on). Each
  token is satisfied independently by any row, so `fix tag:home` matches
  a card whose parent carries `#home` while a subtask says "fix". File
  and date tokens keep matching the top-level task, whose properties are
  the only ones parsed.
- The editor's tag and file inputs strip a typed `"` (the query syntax's
  quoting character, not expressible there); allowing it would serialize
  into text that cannot round-trip back to the same model. In the
  Content field quotes are meaningful phrase syntax, parsed by the same
  tokenizer as the bar.
- Counts: `filteredTaskCount` derives from the single `filteredTasks`
  array; the `x/y tasks` indicator and clear-all behavior are otherwise
  unchanged.
- Applying a saved filter replaces the whole query (it does not merge),
  matching how per-type chips behave today but across all types at once.

## Open Questions

1. **Unknown-prefix fallback vs. error surface.** Falling back to a
   content term is safe and never hides tasks unexpectedly, but a typo
   like `tga:home` silently becomes a content search that matches
   nothing. A subtle "no tasks match; 1 token treated as text" hint in
   the expanded editor could help. Proposed: ship the fallback, add the
   hint only if it proves confusing in practice.
2. **Suggestion source for file paths.** Paths of files currently
   contributing tasks (cheap, already in the store) vs. all vault
   markdown files in scope. Proposed: task-contributing paths, matching
   what the filter can actually affect.
3. **`$TODAY` offsets** (`$TODAY+7`): still deferred from SPEC_0028; the
   token grammar leaves room (`due:<$TODAY+7`) without schema changes.

## Implementation Plan

### Phase 1: Query engine + basic search bar 🚧 IN PROGRESS
**Goal:** Typing a full query in an always-visible bar filters the board
and persists, replacing the sidebar's filtering role.

1. ✅ Implement `src/ui/filters/filter_query.ts` (`parseFilterQuery`,
   `serializeFilterQuery`, `isEmptyFilterQuery`,
   `taskMatchesFilterQuery`) with unit tests: each token kind, quoting,
   multiple terms per type, AND-of-tokens semantics, tag comma OR-groups
   (OR within a token, AND across tokens, empty comma entries dropped),
   unknown-prefix and bad-date fallback, `today` alias, round-trip
   parse/serialize, empty query.
2. ✅ Add `lastFilter` to the settings schema; read-time migration from
   the four legacy `last*Filter` fields (unit tests: each legacy field
   alone, combined, legacy multi-tag → one comma `tag:` token preserving
   OR, `lastFilter` present wins). Rework `BoardFilterState` and
   `filter_state.tests.ts` around the query string.
3. ✅ Render the search bar row above the board header; wire the parsed
   query + `$todayStore` into a single `filteredTasks` derivation;
   switch board matrix, counts, and `isFiltered` to it; clear (×)
   affordance.
4. ✅ Remove the filters sidebar, its toggle/resize UI, and the four
   per-type filtering code paths from `main.svelte` (saved-filter
   application temporarily unavailable — restored in Phase 4; note in
   commit message).
5. ✅ Test: type `fix tag:home file:projects due:<$TODAY`, verify
   filtering and counts; reopen board, verify persistence; open a legacy
   board with old `last*Filter` frontmatter, verify migration.

**Deliverable:** A working single search bar covering all four filter
types with AND semantics and per-board persistence.

### Phase 2: Expanded structured editor 🚧 IN PROGRESS
**Goal:** Bar and structured editor are two synced views of one query.

1. ✅ Expand/collapse control on the bar; overlay panel with Content /
   Tags / Files / Date sections (per-row inputs + remove + add; a tag
   row is one comma-separated OR-group), date rows reusing the
   SPEC_0028 condition-row markup.
2. ✅ Two-way sync: editor edits re-serialize into the bar's draft; bar
   edits re-parse into the editor; filtering applies on commit (Enter /
   Search / clear), which canonicalizes the bar text; raw draft text is
   preserved while typing.
3. ✅ Esc / outside-click collapse; date section visibility follows the
   schema's date keys.
4. ☐ Test: type a mixed query, expand, verify structured view; edit each
   section, verify bar text updates; round-trip a query with quoted
   phrases.

**Deliverable:** The #127 round-trip — type → expand → edit → see text.

### Phase 3: Typed text suggestions
**Goal:** The bar suggests completions per token kind, all as text.

1. ☐ Caret-token detection + suggestion sources (tags, file paths, date
   keys/operators, saved filter names + literal prefixes); pure helper
   with unit tests for token boundary and replacement logic.
2. ☐ Suggestion list UI: keyboard navigation (up/down/Enter/Tab/Esc),
   token-scoped replacement; same suggestions on the editor's tag/file
   inputs.
3. ☐ Test: suggestions narrow as you type in each token kind; accepting
   replaces only the current token; Esc dismisses without changing text.

**Deliverable:** Discoverable syntax — users can compose queries without
memorizing tags or paths.

### Phase 4: Unified saved filters
**Goal:** One saved list capturing any query, with legacy filters intact.

1. ☐ Add `query` to `savedFilterSchema`; `savedFilterToQuery` conversion
   for legacy slot-based entries (unit tests: each legacy type, combined
   slots, named and unnamed).
2. ☐ Saved list in the expanded editor: apply (replace query) / toggle
   off / delete via `delete_filter_modal.svelte`; optional-name save
   flow; active-save highlight by structural query equality;
   duplicate-save guard.
3. ☐ Saved-filter names as bar suggestions (hook into Phase 3 source).
4. ☐ Test: legacy saved filters of every type apply correctly; save a
   mixed-type query with a name, reapply from the list and from a bar
   suggestion; delete with confirmation.

**Deliverable:** One saved list covering all filter types and
combinations; legacy saves keep working.

### Phase 5: Cleanup + manual verification
**Goal:** No dead filter code; end-to-end confidence in a real vault.

1. ☐ Remove now-unused code and styles: sidebar CSS, `SelectTag` filter
   usage (component itself stays if still used elsewhere), per-type
   saved-filter helpers, legacy write paths; mark
   `filtersSidebarExpanded`/`filtersSidebarWidth` parse-only.
2. ☐ Sandbox vault: verify bar filtering across all types and
   combinations; expanded-editor round-trip; suggestions; saved filters
   (legacy + new, named + unnamed); persistence and external-edit sync
   (same board open twice); counts and clear-all; schema-change fallback
   for date tokens; day rollover still re-filters `$TODAY` queries.
3. ☐ Update README.md filter documentation for the query syntax.

**Deliverable:** Checked-off manual test cases (per README.planning.md,
only after actually performing them) and no orphaned sidebar code.
