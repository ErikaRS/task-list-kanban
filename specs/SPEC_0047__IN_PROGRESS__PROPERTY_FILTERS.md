Status: IN_PROGRESS

# Property filters

## Feature Request Summary

The filter bar handles content, tags, file paths and date comparisons. It cannot yet narrow a board by any other task property. This spec adds filter terms for every non-date property the active schema parses:

- **Built-in properties:** `priority` and `status`. `status` is the checkbox marker, and every schema provides it.
- **Custom Dataview fields:** any inline field the user invents, such as `[project:: website]`, `(owner:: sam)` or `[estimate:: 3]`. These fields are already parsed and available for sorting (see [SPEC 0020](complete/SPEC_0020__COMPLETE__TASK_PROPERTIES_DESIGN.md)).

This work builds on the unified query from [SPEC 0029](complete/SPEC_0029__COMPLETE__UNIFIED_FILTER_SEARCH_BAR.md) and the signed atoms and OR clauses from [SPEC 0044](SPEC_0044__IN_PROGRESS__FILTER_NEGATION_AND_LIMITED_OR.md). It was requested as a follow-up in [#65](https://github.com/ErikaRS/task-list-kanban/issues/65) and [#86](https://github.com/ErikaRS/task-list-kanban/issues/86).

## User Requirements

1. A user can filter by any non-date property: priority, status, and custom Dataview fields.
2. A user can match one value, any of several values, or the property being present at all.
3. A user can compare numeric properties and priority with `<`, `<=`, `=`, `>=` and `>`.
4. Property terms can be excluded with `-` and used inside OR groups, following the same rules as tag and file atoms.
5. Queries saved before this change keep their meaning. That includes unknown prefixes such as `note:x`, which still match as plain content.
6. Suggestions and the structured editor offer the property keys and values that exist on the board.

## High-Level Design

### Syntax

A property term uses a double colon, which mirrors Dataview's own `key:: value` notation:

```text
property-atom := key "::" value-spec
value-spec    := "*" | value ("," value)* | op value
op            := "<" | "<=" | "=" | ">=" | ">"
```

| Query | Meaning |
| --- | --- |
| `project::website` | `project` equals `website`, ignoring case |
| `project::website,blog` | `project` is `website` or `blog` |
| `project::*` | The task has a `project` field with any value |
| `-owner::*` | The task has no `owner` field |
| `priority::high` | Priority is high |
| `priority::>=high` | Priority is high or highest |
| `estimate::<=3` | Numeric `estimate` is 3 or less |
| `status::/` | The checkbox marker is `/` |
| `(priority::high OR tag:urgent) -status::-` | High priority or tagged urgent, and not cancelled |
| `"project::website"` | Literal content text, because it is quoted |

A double colon keeps existing queries safe. The README promises that an unknown single-colon prefix (`note:x`) is treated as content, so reusing single-colon `key:value` for custom fields would silently change what saved queries match. Double colons do not appear in any of today's filter syntax.

### Matching

Each property atom evaluates against the task's own parsed properties (`FilterableTask.properties`), looked up with `getPropertyByKey`, so the same aliases and case rules as sorting apply.

- **Text values:** the whole value is compared, ignoring case. `project::web` does not match `website`. Substring matching stays the job of content terms.
- **Numbers:** `=` and the comparison operators compare numerically. A bare value such as `estimate::3` is equality. A non-numeric value or operand never satisfies a comparison.
- **Priority:** values are the names `highest`, `high`, `medium`, `low` and `lowest`, ordered by the Tasks-plugin weights. In the Tasks plugin format, a task without a priority emoji counts as `none` for equality and sits between `medium` and `low` for comparisons, matching the Tasks plugin's "normal" priority. In the Dataview format, priority is free text: it matches by name, and comparisons apply only to values that are one of the five names.
- **Status:** the value is the literal marker character. Because a space can't be typed unquoted, `status::todo` also matches the space marker. Comparisons are not supported for status.
- **Presence:** `key::*` is true when the property exists with a non-empty value.
- **Missing properties:** a value or comparison atom is false when the property is missing, so `-project::website` does match tasks that have no project.
- **Nested cards:** property atoms read only the card's own task line. Child rows keep their own properties, and a child's project should not make the parent match.

### Query model

Add a fourth atom kind to the SPEC 0044 clause model:

```ts
| { kind: "property"; key: string; match: PropertyMatch; negative: boolean }

type PropertyMatch =
	| { type: "present" }
	| { type: "any-of"; values: string[] }
	| { type: "compare"; operator: DateFilterOperator; value: string };
```

A query that contains any property atom uses the clause path (`query.clauses`). Legacy queries without one keep their current shape. Parse and serialize must round-trip, and the serializer should output `key::a,b` for any-of atoms.

## Detailed Behavior

- **Keys:** a key is any Dataview-legal key (`[A-Za-z0-9_-]+`), matched case-insensitively. Keys need not be known in advance, so a typo such as `projetc::x` matches nothing rather than falling back to content. Suggestions should make typos rare.
- **Date keys:** for keys the schema types as dates, `::` supports only presence (`due::*`, `-due::*`). Date comparisons keep their existing single-colon form (`due:<$TODAY`). `due::2026-01-01` is invalid on Search/Enter, with the error message pointing to `due:=`.
- **Negation:** `-key::…` is valid, but `-key::a,b` is invalid on Search/Enter, like `-tag:a,b`. To exclude several values, write `-key::a -key::b`.
- **OR groups:** a property atom is a legal alternative inside `( … OR … )`. A comma list inside a group flattens into that clause, as tag lists already do.
- **Errors:** following SPEC 0044, an empty value (`project::`), an empty key (`::x`), an unknown priority name, or an operator on status shows an error only on Search/Enter and leaves the applied filter unchanged.
- **Quoting:** `project::"big launch"` matches a value containing spaces. Quoting the whole token (`"project::x"`) makes it literal content.
- **Schema "None":** only `status` exists, so other keys simply match nothing.
- **Saved views:** views store the query string as before, with no migration.

### Suggestions and structured editor

- **Bar suggestions:** after a bare word, offer `key::` for property keys seen on board tasks, plus the schema's known non-date keys. After `key::`, offer that key's distinct values on the board, capped at the existing suggestion limit. For priority, offer the five names and `none`. For status, offer the configured status markers.
- **Structured editor:** add a **Property** atom type with a key picker, a mode (is any of / exists / compare) and a value control. Property atoms get the exclude toggle, and compare mode appears only for numeric values and priority.

## Implementation Plan

The SPEC 0044 clause model and clause-row editor are already in the code (`filter_query.ts`, `filter_editor.svelte`), so property atoms extend them rather than adding a new structure.

### Phase 1: Equality, any-of and presence

**Goal:** `project::website`, `priority::high,highest`, `status::/`, `project::*` and their negations filter correctly from the bar.

1. [ ] Add the property atom to the query model, parser, serializer, validation and matcher.
2. [ ] Priority and status value handling, including `none` and `todo`.
3. [ ] Test parsing, round trips, matching per schema, negation of missing properties, OR groups, and nested cards reading only the parent line. Also test that legacy queries such as `note:x` and `tag:a,b` produce the same results as before.
4. [ ] Update the README filter table.

**Deliverable:** Property equality filters work end to end from the bar and persist in saved views.

### Phase 2: Comparisons, suggestions and editor

**Goal:** Numeric and priority comparisons work, and property atoms are discoverable.

1. [ ] Parse and evaluate `<`, `<=`, `=`, `>=` and `>` for numbers and priority, and reject them for status and text.
2. [ ] Add bar suggestions for keys and values drawn from board tasks.
3. [ ] Add the Property atom row to the structured editor, keeping bar and editor round trips intact.
4. [ ] Test comparisons, the priority ordering with `none`, suggestion replacement, and editor equivalence. Manually verify on a large Dataview board.

**Deliverable:** `estimate::<=3` and `priority::>=high` work, and keys and values appear in suggestions and the editor.

## Decisions to confirm

1. **Syntax is `key::value`,** not single-colon `key:value`. This keeps existing content queries such as `note:x` unchanged.
2. **Text matching is exact and ignores case.** It is not a substring match.
3. **Property atoms read the parent line only,** not nested children.
4. **In the Tasks plugin format, a missing priority is `none`,** ranked between medium and low as the Tasks plugin does.
