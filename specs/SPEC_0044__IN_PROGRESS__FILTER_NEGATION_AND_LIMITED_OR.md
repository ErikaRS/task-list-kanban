Status: IN_PROGRESS

# Filter negation and limited OR

## Feature Request Summary

[Issue #169](https://github.com/ErikaRS/task-list-kanban/issues/169) asks for exclusions such as finding tasks mentioning Paul Krugman while omitting those mentioning Keynes. This spec proposes atom-level negation and a deliberately narrow form of OR. It builds on the unified query and structured editor in [SPEC 0029](complete/SPEC_0029__COMPLETE__UNIFIED_FILTER_SEARCH_BAR.md).

## User Requirements

1. A user can exclude a content word or phrase with `-`, such as `"Paul Krugman" -Keynes`.
2. A user can negate one tag or file path without changing the existing meaning of positive filters. Date comparisons remain positive-only.
3. A user can search for any of several atomic conditions, while combining that choice with other clauses using AND.
4. The search bar and expanded editor show the same query and preserve it when editing either view, saving a view, or reopening a board.
5. Filtering remains responsive on large boards; a query's cost grows with its number of atoms rather than with combinations of OR branches.
6. Draft editing produces no syntax error. Search/Enter validates the draft; malformed syntax shows an error and leaves the applied filter unchanged.

## High-Level Design

Use a limited conjunctive normal form (CNF): AND across clauses, OR across atoms within a clause, and optional NOT only on individual content, tag, and file atoms. A date comparison is a positive atom. OR may combine atom kinds; the editor must display every alternative in the same clause.

```text
query         := clause (whitespace clause)*
clause        := signed-atom | or-group | existing-positive-list
or-group      := "(" group-arm (whitespace OR whitespace group-arm)+ ")"
group-arm     := signed-atom | existing-positive-list
signed-atom   := atom | "-" non-date-atom
```

`OR` is uppercase and only recognized inside a parenthesized group. There is no nesting, general `AND` keyword, or group negation. Parentheses around ordinary content retain their current literal meaning; parentheses with an `OR` marker are parsed as a group or reported as invalid. Outside parentheses, `OR` retains its current meaning as a literal content token. Quotes preserve literal operator-looking content, for example `"-Keynes"` searches for the hyphenated text.

Examples:

| Query | Meaning |
| --- | --- |
| `"Paul Krugman" -Keynes` | Mentions Paul Krugman and does not mention Keynes |
| `(Krugman OR Friedman) -Keynes` | Mentions either economist and not Keynes |
| `("Paul Krugman" OR "Milton Friedman") tag:reading` | Either phrase and the reading tag |
| `(tag:reading OR file:essays) -Keynes` | Reading tag or essay path, without Keynes |
| `(due:<$TODAY OR tag:urgent) -tag:waiting` | Due before today or urgent, without waiting |
| `tag:home,errand -tag:archived` | Home or errand tag, without archived |
| `file:projects,notes -file:archive` | Path contains projects or notes, but not archive |

### Why this OR boundary

Flat CNF makes query cost predictable and gives the editor a direct representation: each clause is a row, and each row contains one or more typed atoms joined by **Any of**. Arbitrary nesting, OR of conjunctions, and NOT of groups are excluded because they would require an expression tree or expansion into many clauses. A user can AND multiple OR groups: `(a OR b) (c OR d)`.

Evaluate clauses directly with short-circuiting: AND across clauses, OR inside each clause, and negation as the Boolean complement of a content, tag, or file atom. Never distribute AND over OR or materialize matching task sets for each branch. Cost is O(tasks × atoms) in the worst case, with no exponential expansion. Keep filtering on commit, as today. Benchmark realistic large boards before setting an arbitrary query-length cap; if needed, introduce one with an error shown only on Search/Enter.

## Detailed Behavior

### Syntax and matching

- `-foo` excludes cards whose rendered block contains `foo`; `-"big rocks"` excludes the whole phrase. Content matching remains case-insensitive. For nested cards, a match in the parent or any rendered child makes the negated atom false for the whole card.
- `-tag:x` excludes cards carrying `x` in the parent or any rendered child. Tag matching retains its current exact, case-sensitive set semantics.
- `-file:x` excludes a top-level task when its path contains `x`, case-insensitively. Repeated positive `file:` tokens still merge into one any-of group, even if negative file atoms appear between them: `file:a -file:b file:c` means `(a OR c) AND NOT b`.
- Date comparisons remain positive-only. `-due:<$TODAY` (or a negated comparison for any active date key) is invalid when submitted. Positive date comparisons keep their current behavior, including missing-date matches and `$TODAY` refresh at local midnight.
- A leading minus is an operator only directly before one recognized, nonempty non-date atom. `-tag:a,b` and `-file:a,b` are invalid: the minus cannot negate a comma OR list. Write `-tag:a -tag:b` to exclude either tag, or `-file:a -file:b` to exclude either path. Positive comma lists remain unchanged.
- `(-foo OR tag:urgent)` is allowed because each minus applies to one atom. `-(foo OR bar)` is invalid. OR groups require two or more alternatives, with no nested parentheses. `(tag:a OR tag:b)` is valid and equivalent to `tag:a,b`; `(tag:a OR -tag:b)` is also valid and intentionally means something different from `tag:a -tag:b`.
- A positive `tag:a,b` is one clause with two tag atoms. Repeated `tag:` tokens are separate AND clauses, as today. All ungrouped positive `file:` tokens continue to merge into one OR clause for compatibility; a `file:` atom inside an explicit group stays in that group. Negative file atoms stay separate clauses. This means `file:a -file:b file:c` remains `(file:a OR file:c) AND -file:b`.
- Positive comma lists within an explicit OR group are flattened into that one clause: `(tag:a,b OR file:notes)` means `tag:a OR tag:b OR file:notes`. This adds no nested expression. Empty comma entries retain the current behavior of being dropped. Negation still cannot apply to the whole comma list.
- Unknown prefixes and malformed date tokens continue to fall back to content matching when they occur outside boolean syntax, preserving SPEC 0029. Within an OR group, an unknown-prefix token is a content alternative. Negating a fallback content token is allowed if it is nonempty; the editor should make its content interpretation visible.
- Existing quoted terms beginning with `-` remain literal. Quoted phrases beginning with `(` or containing `OR` remain literal. A literal unquoted leading minus must be quoted.

### Invalid input and compatibility

Typing in the bar or editing the dropdown never shows a syntax error, even for incomplete or malformed drafts. On Search/Enter, validate the complete draft. Missing operands, unmatched OR-group parentheses, nested groups, a minus before a group or comma list, and negated date comparisons show a visible error **then**. The attempted search is a no-op: do not change the applied filter, task results, counts, persisted `lastFilter`, or search UI state beyond the error. In the dropdown, keep it open. Keep the draft intact for correction. Clear the error as soon as the user edits the draft, without validating again until the next Search/Enter. Clearing the filter remains an explicit action and works regardless of draft validity.

Do not drop invalid tokens or reinterpret them as a broader query. A malformed draft must not be saved as a view; Save is a no-op for that draft and does not surface a syntax error during editing. If a persisted query cannot be interpreted after a property-schema change, keep its text visible and avoid silently applying a broader filter; resolve the exact recovery behavior during implementation with a targeted test.

Existing queries with no new syntax must retain their results, serialization, and saved-view behavior. In particular, `tag:a,b` stays one OR group, repeated tags stay AND, repeated positive files stay OR, and unknown prefixes stay content terms. Parse/serialize must round-trip the new clauses. Saved views continue to store one query string; there is no frontmatter migration.

| Existing query | Required meaning after upgrade |
| --- | --- |
| `tag:a,b` | `tag:a OR tag:b` |
| `tag:a,b tag:c` | `(tag:a OR tag:b) AND tag:c` |
| `file:a,b` | `file:a OR file:b` |
| `file:a file:b` | `file:a OR file:b` (legacy repeated-file merge) |
| `file:a,b tag:x,y` | `(file:a OR file:b) AND (tag:x OR tag:y)` |
| `tag:a,,b,` | Same result as `tag:a,b`; empty entries are ignored |
| `file:"weekly notes",projects` | Either path substring, including the quoted space |

Compatibility tests must compare the old and new matchers over a task fixture, not merely compare parsed shapes. Include existing saved views and board `lastFilter` strings, legacy saved-filter conversion, quoted paths, nested cards, and date filters. Keep their persisted query strings valid without migration. Canonical serialization may preserve or normalize spacing/quotes as today, but must not change these results or cause the editor to split one old comma OR list into AND clauses.

### Expanded editor and suggestions

- Replace the four separate filter sections with one clause list, grouped visually by AND. A clause row contains one or more atom controls joined by **Any of**; each atom has a type selector (Content, Tag, File, Date) and a value control. Content, tag, and file atoms also have an exclude toggle. Add/remove alternative and add/remove clause controls keep the editor fully expressive for the supported syntax.
- Preserve convenient comma-list entry for positive tags and files where possible, but display them as alternatives within one clause. Distinguish an explicit mixed clause from the legacy merged positive-file clause so an edit cannot move an atom between clauses.
- A quoted content phrase remains one value. A date atom uses the existing property/operator/value controls and has no exclude toggle.
- The editor must never flatten an OR group into AND clauses or split an explicit mixed group. Editing any row reserializes to the bar draft; bar edits rebuild the rows. Existing saved-view structural equality and duplicate detection use the canonical serialization. The serializer may choose `tag:a,b` / `file:a,b` for homogeneous positive groups, but must preserve the exact clause structure and distinguish legacy file merging.
- While a bar draft is incomplete, opening the dropdown must not rewrite or discard its raw text. The editor may defer its structured rows for an unparseable draft, but must preserve the draft until the user submits or corrects it. Do not display a syntax error during this editing state.
- Bar suggestions recognize `-tag:` and `-file:` and replace only the atom being edited. They do not suggest negated date prefixes. Suggestions inside an OR group operate on one alternative.

## Implementation Plan

### Phase 1: Atom negation

**Goal:** Exclusions work from both the bar and expanded editor.

1. [ ] Add signed atoms to the query model, parser, serializer, matcher, and empty-query checks. Compare the old and new matchers on the compatibility matrix above.
2. [ ] Add exclude controls for content, single tags, and individual file paths; keep bar/editor round trips intact. Date rows stay positive-only.
3. [ ] Validate on Search/Enter, show no error while editing, and leave the applied filter unchanged for malformed negation. Prevent saving malformed drafts. Verify that an error clears on the next edit and the dropdown stays open after a failed Search.
4. [ ] Test parsing, matching, nested-card exclusions, invalid negated dates, persistence, saved views, and suggestion replacement. Manually verify bar ↔ editor edits and a large board.

**Deliverable:** `"Paul Krugman" -Keynes` and the other single-atom exclusions work end to end.

### Phase 2: Flat OR clauses

**Goal:** Users can choose between atomic alternatives of any supported type without changing the meaning of other filters.

1. [ ] Add flat parenthesized OR groups to parsing, serialization, validation, and direct short-circuit evaluation. Preserve comma OR lists, repeated-tag AND, and legacy positive-file merging.
2. [ ] Refactor the editor into clause rows with typed atom controls and an OR-row affordance, including per-atom exclusion.
3. [ ] Make suggestions and caret replacement work inside a group; show syntax errors only on Search/Enter and leave the applied filter unchanged.
4. [ ] Test multiple groups, mixed atom types, AND precedence, quotes, malformed/nested groups, saved-view round trips, and editor equivalence. Verify that malformed drafts show no error while typed, an invalid Search changes nothing applied or persisted, and a correction can then be submitted. Manually compare filtering and editor state after typing, saving, reopening, and editing a group.
5. [ ] Benchmark a representative large board with multiple OR groups and update README filter syntax.

**Deliverable:** `(Krugman OR tag:reading) -Keynes` works end to end, with a matching structured editor and measured linear-cost behavior.

## Decisions

1. Negated dates are outside this version. Date atoms remain positive-only.
2. Syntax errors appear only after Search/Enter. A malformed search leaves the last applied filter in place.
3. OR requires explicit parentheses. Unparenthesized `OR` retains its existing literal-content meaning.
