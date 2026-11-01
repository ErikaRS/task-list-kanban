Status: COMPLETE
Implemented: 2026-11

Owner confirmed testing complete on 2026-11-01, including the final optional
column-rename behavior. The development-vault fixture is in
`test-vault/obsidian-plugin-dev/text-matching/`.

Implementation: included in the commit completing this spec. Refs #177.

# SPEC 0053 - Text Matching for Columns and Swimlanes

## Feature Request Summary

GitHub issue:
- [#177](https://github.com/ErikaRS/task-list-kanban/issues/177) - Custom matcher to match things other than tags

The reporter wants columns that match plain text in a task instead of a tag. The motivating case is GTD contexts such as `@office`, `@home` and `@anywhere`, which should behave as mutually exclusive columns. In the follow-up they ask for simple literal matching (no regular expressions) of "literals of any format", and mention wiki links such as `[[Project A]]`, which is how they organize tasks into projects.

They expect the same write-back behavior tag columns already have:
- moving a card into a column adds the matched text
- moving a card out of a column removes it

In the issue thread, the owner ruled out full regular expressions and suggested a boundary rule so that `@home` does not match inside an email address such as `me@home.com`.

Every column definition mode can also be used as a swimlane source today: name and tags columns correspond to Tag lanes, and status and priority columns correspond to property lanes. Text matching keeps that symmetry, so this spec covers both:
- a fifth per-column match mode, **Text**, extending [SPEC 0018](SPEC_0018__COMPLETE__COLUMN_TAG_MAPPING.md) and [SPEC 0024](SPEC_0024__COMPLETE__COLUMN_PROPERTY_MATCHING.md)
- a new swimlane source, **Text**, extending [SPEC 0021](SPEC_0021__COMPLETE__GROUP_BY_SWIMLANES_DESIGN.md) and [SPEC 0026](SPEC_0026__COMPLETE__TAG_GROUP_INCLUDE_LIST.md)

Name, tags, status and priority columns, and the existing swimlane sources, do not change.

## User Requirements

### Columns

1. A custom column in **Text** mode uses its title as the single text literal, such as `@office` or `[[Project A]]`. Enter it once in the column title; there is no separate matching-text field. Like Name mode, the title defines the rule, but Text mode matches literal task text rather than tags.
2. Matching is literal and case-sensitive: `@office` does not match `@Office`. There are no wildcards or regular expressions.
3. A literal only matches as a standalone token, so `@home` does not match `me@home.com` or `@homework`.
4. Moving a task into a text column adds the literal to the task line.
5. Moving a task to another active column removes or replaces the source text literal. Completing or moving to Done always preserves it.
6. Moving a task between two text columns replaces the literal where it was, so `Call Bob @phone about invoices` becomes `Call Bob @office about invoices`.
7. Text columns can be mixed with name, tags, status and priority columns on the same board.
8. Completing a task or moving it to Done always preserves its text column literal, regardless of the "keep column metadata when completing" setting. Inline text may be semantically part of the task description.

### Swimlanes

9. A board can be grouped by an ordered list of text literals, one lane per literal, plus an Unassigned lane.
10. Dragging a task between text lanes replaces the literal in place, and dragging it to Unassigned removes it.
11. Adding a task in a text lane writes that lane's literal.
12. Text lanes use the same token matching rule as text columns.

### Both

13. Done tasks are never modified by board changes, including edits to a text column's literal or a text lane list (see Hard Rules).
14. Existing boards keep working with no migration.

## Hard Rules

- **Done tasks are sacrosanct.** Changing a text column's literal, deleting the column, changing a text lane list, or any other settings change must never modify a done task. The existing "Update existing tasks" migration in `src/ui/settings/column_rename_migration.ts` already skips done rows; text columns must go through the same path and keep that behavior, with a test that proves it. Changing a text lane list never rewrites any task. Only an explicit action on one task, such as dragging it, may change a done task.

## Decisions

Settled with Erika on 2026-10-04:

1. **Boundary rule:** a literal matches after the start of the content, whitespace, or an opening bracket or quote, and before the end of the content or any character that is not a word character. Details under Matching.
2. **Card display:** text literals stay visible in task descriptions in every column, including their matching Text column. They may be intentional inline prose, context, or wiki links. Placement-tag hiding does not apply to Text columns.
3. **Completion:** always preserve the Text column literal when completing or moving to Done, as priority metadata is preserved. The keep-metadata setting continues to control placement tags on completion and text literals on archive.
4. **One literal per column, taken from the title.** Text mode uses the trimmed column title verbatim, without kebab-case or tag conversion. There is no separate matching-text input or stored field. Several literals per column are out of scope.
5. **Grouping:** text literals are also a swimlane source, so every column mode stays groupable.

## High-Level Design

### Token Matching

Columns and lanes share one matcher, `findTextLiteralMatches(content, literal)`, in a new module `src/parsing/text_literals/`.

A literal matches the task content when it appears as a token:

- **Before the literal:** start of the content, or whitespace, or one of `(`, `[`, `"`, `'`.
- **After the literal:** end of the content, or whitespace, or any character that is not a letter, digit, `_`, `-`, `/` or `@`.

Examples for `@home`:

| Task text | Match |
| --- | --- |
| `Fix sink @home` | yes |
| `Fix sink (@home)` | yes |
| `Fix sink @home.` | yes |
| `Fix sink @Home` | no (case differs) |
| `Email me@home.com` | no (preceded by a letter) |
| `Finish @homework` | no (followed by a letter) |
| `Plan @home-office` | no (followed by `-`) |
| `Fix sink @home/garage` | no (followed by `/`) |

Links need no special case: `[[Project A]]` starts with `[` and ends with `]`, so the same rule works. `[[Project A|alias]]` is a different literal and does not match `[[Project A]]`.

Matching is **case-sensitive**, and writes use the literal exactly as configured. For example, `@office` does not match `@Office` or `@OFFICE`. This applies to column placement, lane assignment, and the shared add/remove/replace writes, so differently cased inline text is left alone. For text columns, the configured literal is the trimmed column title. For text lanes, it is the configured list entry.

The match runs against the task line's content (the part after the checkbox), the same text tags are parsed from. Child lines and subtasks are not searched.

Text column titles are trimmed when used as literals; lane list entries are stored trimmed. Validation, applied to the title in Text mode and to entries in the lane list, rejects:
- an empty literal
- a literal that starts with `#` (the error suggests Tags instead)
- a literal containing a line break
- exact duplicates within the same list after trimming. Differently cased literals, such as `@office` and `@Office`, are distinct and allowed

### Text Writes

Columns and lanes share three surgical line edits in the same module, all on the edit path (`editTaskSourceRows`), never rebuilding the line:

- **Add:** if the line already has the literal as a token, nothing is written. Otherwise the literal is appended at the end of the line, before a trailing block link (`^abc123`), in the same position placement tags use.
- **Remove:** every token occurrence of the literal is removed, with the same whitespace cleanup `removeTagAt` does for tags.
- **Replace:** the first occurrence of the old literal is replaced in place by the new one, and any other occurrences of the old literal are removed.

## Columns

### Data Model

```ts
type ColumnMatchMode = "name" | "tags" | "status" | "priority" | "text";

interface ColumnDefinition {
  // ...existing fields
  label: string; // also the literal when matchMode === "text"
}
```

- `migrateColumnDefinitions` and the settings schema accept `"text"`. There is no `matchText` field; `getColumnText` derives the literal from `label.trim()` whenever the mode is Text.
- Text mode never derives a tag from the title: a title `office` matches standalone `office`, not `#office`. Name mode continues to use its existing tag normalization and matching.
- `columnRuleSignature` returns `text:<trimmed literal, preserving case>` so title renames, including case-only renames, are detected as rule changes and offered to "Update existing tasks".

### Conflict Resolution

Text columns follow the rules from SPEC 0024:

- Column order in settings is the resolver across modes. The first matching column wins.
- Text columns have specificity `1`. They do not take part in the tag specificity tie-break, so a multi-tag column does not outrank an earlier text column.
- A task with both `@home` and `@office` goes to whichever of those columns comes first. The next move through the board removes the source literal and adds the destination one, which cleans the task up toward one context. The other stray literal stays, and the board does not try to enforce exclusivity beyond that.
- Done, ignored and archived handling is unchanged. A done task with `@office` goes to Done.

### Column Moves

`changeColumnTransform` in `src/ui/tasks/column_change.ts` gains text handling:

- **Into a text column:** add the destination literal.
- **Out of a text column to another active column:** remove the source literal.
- **Text column to text column:** replace the source literal with the destination literal.
- **To Uncategorised:** remove the literals of all text columns, the same way it removes all placement tags today.
- **To Done:** always preserve the source literal, independently of "Keep column metadata when completing". This applies to the checkbox, status cycling into Done, menu/command completion, bulk moves, dragging, and Advance. Text remains visible on the done card, and unchecking returns the task to its matching Text column. Completion still updates the status and adds completion metadata normally.
- **To Archive:** retain the existing behavior: remove the source literal unless "Keep column metadata when completing" is on.
- **Restore from the Archived column** ([SPEC 0050](SPEC_0050__COMPLETE__ARCHIVED_TASK_COLUMN.md)): unchanged. Restore only removes the archive tag or marker, so a kept literal survives and an unchecked restored task returns to its text column. The Archived column stays read-only, and its cards show literals as ordinary text because they are outside any custom column.

Moving between a text column and a tag, status or priority column removes the source criteria and adds the destination criteria, as SPEC 0024 requirement 7 describes. A move between two non-text columns never touches literals.

### New Tasks in a Column

Creating a task in a text column writes the literal on the new line, the same way creating a task in a tag column writes its tag. The literal goes into the line `buildNewTaskLine` builds, so where the line lands in the file still follows the new task heading and position settings from [SPEC 0052](SPEC_0052__COMPLETE__NEW_TASK_INSERTION_LOCATION.md).

### Card Display

Keep the matched literal in the card's rendered task description, including in its own Text column. For example, `Call Bob @phone about invoices` displays in full in the `@phone` column, and `Draft plan [[Project A]]` retains its inline link in the `[[Project A]]` column. Text matching must not strip inline task content for display.

This is a display rule. Moves between active columns and archive actions still follow the write rules above. Completing or moving to Done preserves the literal in the source as well as on the card.

### Column Header

Text columns show a compact subtitle, e.g. `Text: @office`, alongside the existing tag, status and priority subtitles (`getColumnHeaderSubtitle`).

### Settings UI

The column editor's "Match by" select gains a **Text** option. The existing column title input is the only place to enter the literal. For example, title the column `@office` and choose Text; no second input appears. The match popover explains: "Uses the column title as literal text, e.g. @office or [[Project A]]. Matches whole tokens with exact case, not tags."

Renaming a text column, including changing only its case, changes its matching rule. The existing **Update existing tasks** checkbox appears directly beneath the edited column, without opening its match popover. All column match types share this placement and the existing checked-by-default behavior.

- Checked: saving rewrites matching open tasks from the old literal to the new one and skips done tasks.
- Unchecked: saving changes only the column's title and matching rule. No source text is rewritten, including on open tasks. Tasks containing the old literal may leave that column because the renamed rule no longer matches them.
- Renaming back to the original rule hides the checkbox again. The per-column choice survives opening or closing the match popover before saving.

### Setting Rename

"Keep column tag when completing" is renamed to **"Keep column metadata when completing"** in settings and the README (the README section also covers archiving), since archiving can retain text literals as well as tags. Completing or moving to Done always preserves Text literals; the setting controls placement tags on completion and text literals on archive. The stored key `keepColumnTagOnCompletion` stays the same, so no settings migration is needed. Status columns still can't keep their criteria, because completing changes the status.

## Swimlanes

### Group Source

```ts
type GroupSource =
  // ...existing kinds
  | { kind: "text"; literals: string[] };
```

Text lanes need an explicit list. Unlike tags, there is no reliable way to discover "all literals" in task text, so there is no prefix or discovery mode.

- `deriveGroupBuckets` returns one bucket per literal, in list order, plus an Unassigned bucket. The group direction toggle reverses the order, as for the tag include list.
- Lanes for listed literals show even when empty, like the tag include list.
- A task goes in the lane of the **first literal in the list** that it contains, mirroring how the tag include list resolves a task with several included tags. A task with none goes to Unassigned.
- Bucket ids are `text:<trimmed literal, preserving case>`, so collapsed lanes survive reordering the list and differently cased lanes cannot collide. A case-only literal change creates a distinct lane identity.
- `createGroupAssigner` builds the matcher once per board, keeping assignment linear in the number of tasks.

### Lane Moves

`drop_plan.ts` gains a `set-text` plan, applied with the shared text writes on the edit path (tag lanes use the rewrite path today; text lanes don't need to).

- **Lane to lane:** replace the source lane's literal with the destination lane's literal.
- **Lane to Unassigned:** remove the source lane's literal. If the task also contains a later listed literal, it moves to that lane, which is the same behavior tag lanes have with several included tags.
- **Unassigned to a lane:** add the destination lane's literal.
- **Cross-cell drops** that change both column and lane apply the lane edit, then the column move, in the same order as tag lanes.
- Dragging a done task between lanes is an explicit action on that task, so it is allowed and edits only the literal.

### New Tasks in a Lane

`cell_creation.ts` returns the lane's literal for text lanes, and `buildNewTaskLine` appends it. The Unassigned lane writes nothing. When the cell's column is also a text column, both literals are written.

### Card Display

Column and lane literals both stay visible in task descriptions, including when a column and a lane share the same literal.

### View Editor UI

The "Group tasks" select gains a **Text** option next to Tag. Choosing it shows a list labeled **Text lanes** nested within the Group setting, where the user adds literals one at a time and reorders them. Indentation and a subtle vertical guide connect it to the Group selector; no horizontal divider separates the selector from its text controls. Helper text uses compact spacing and smaller muted type. It uses the same token-matching rules and validation as a Text column title; its hint gives examples such as `@office` and `[[Project A]]`.

### Columns and Lanes Sharing a Literal

Nothing blocks a literal from being both a column and a lane, but it is a confusing setup: every task in that column lands in that lane, and lane drags would fight column placement. The view editor shows a warning under the lane list when a lane literal exactly equals a text column's trimmed title, including case. It is not an error, matching how a tag can be both a column tag and a tag lane today.

## Known Limitations

- Renaming a note in Obsidian updates `[[links]]` in task lines but not the column or lane settings, so a link column or lane loses its tasks until the column title or lane literal is edited. The column subtitle and lane label make this visible.
- A literal inside inline code or a URL is still matched if it is a standalone token. This is rare enough to leave for now.

## Out of Scope

- Regular expressions and wildcards.
- Several literals per column.
- Discovering lanes from literals found in tasks (e.g. "every word starting with `@`").
- Text matching in filters. Content filters already cover substring search.

## Future Extensions

- Optional case-insensitive Text matching, enabled explicitly. Existing boards
  retain exact matching until the user opts in; case-sensitive behavior remains
  the default. A future option must handle literals that differ only in case.

- Allow a text column's displayed title and matching literal to differ, if a
  future feature request demonstrates the need. This spec deliberately uses
  the title for both and provides no separate matching-text input or field.

## Detailed Behavior

### Column Matching Examples

Given these columns:

```text
@office        Text (literal is the title)
@home          Text (literal is the title)
[[Project A]]  Text (literal is the title)
Doing          Status marker: /
```

| Task line | Column |
| --- | --- |
| `- [ ] Print forms @office` | @office |
| `- [ ] Print forms @Office` | Uncategorised (case differs) |
| `- [ ] Email bob@office.com` | Uncategorised |
| `- [ ] Draft plan [[Project A]]` | [[Project A]] |
| `- [/] Draft plan @home` | @home (text column comes before Doing) |
| `- [ ] Fix sink @home @office` | @office (first column in order) |
| `- [x] Print forms @office` | Done |

### Column Move Examples

| Before | Move | After |
| --- | --- | --- |
| `- [ ] Call Bob @phone about invoices` | @phone to @office | `- [ ] Call Bob @office about invoices` |
| `- [ ] Print forms` | Uncategorised to @office | `- [ ] Print forms @office` |
| `- [ ] Print forms @office ^abc123` | @office to @home | `- [ ] Print forms @home ^abc123` |
| `- [ ] Print forms @office #later` | @office to Uncategorised | `- [ ] Print forms #later` |
| `- [ ] Print forms @office` | @office to Doing | `- [/] Print forms` |
| `- [ ] Print forms @office` | @office to Done | `- [x] Print forms @office` |
| `- [ ] Print forms @office` | @office to Done, keep metadata on | `- [x] Print forms @office` |

### Column Rule Edit Examples

Renaming the Text column from `@office` to `@work` with "Update existing tasks" on:

| Before | After |
| --- | --- |
| `- [ ] Print forms @office` | `- [ ] Print forms @work` |
| `- [x] Print forms @office` | unchanged (done tasks are never modified) |

### Lane Examples

Board grouped by text lanes `[[Project A]]`, `[[Project B]]`, with columns Todo and Doing:

| Task line | Lane |
| --- | --- |
| `- [ ] Draft plan [[Project A]]` | [[Project A]] |
| `- [ ] Review [[Project B]] and [[Project A]]` | Project A (first in the list) |
| `- [ ] Buy milk` | Unassigned |

| Before | Drag | After |
| --- | --- | --- |
| `- [ ] Draft plan [[Project A]]` | Project A lane to Project B lane | `- [ ] Draft plan [[Project B]]` |
| `- [ ] Buy milk` | Unassigned to Project A | `- [ ] Buy milk [[Project A]]` |
| `- [ ] Draft plan [[Project A]]` | Project A to Unassigned | `- [ ] Draft plan` |

## Implementation Plan

### Phase 1: Text columns match and display ✅ COMPLETE

**Goal:** A user can add a Text column in settings and see matching tasks land in it. Moves don't write literals yet.

1. ✅ Add the shared token matcher and validation in `src/parsing/text_literals/`.
2. ✅ Add `"text"` to `ColumnDefinition`, `migrateColumnDefinitions`, and the settings schema, using the existing title (`label`) as the literal.
3. ✅ Use the matcher in `matchesColumnDefinition`, and treat text columns as non-tag placement in `resolveMatchedColumnDefinition`.
4. ✅ Add `columnRuleSignature` and header subtitle, and keep matched text visible in card descriptions.
5. ✅ Add the "Text" option, title-based hint and title validation to the column editor, with no separate literal input.
6. ✅ Test: unit tests for the token matching table, including email, suffix, and exact-case examples.
7. ✅ Test: a board with `@office`, `@home` and `[[Project A]]` Text column titles shows the right cards in Erika's vault.

**Deliverable:** Read-only text columns.

**Implemented by:** The commit completing this spec (Refs #177).

### Phase 2: Column moves write and remove literals ✅ COMPLETE

**Goal:** Dragging a card into, out of, and between text columns edits the task line.

1. ✅ Add the shared add, remove and replace text writes.
2. ✅ Use them in `changeColumnTransform`, including Uncategorised, Done and archive.
3. ✅ Rename "Keep column tag when completing" to "Keep column metadata when completing" in settings and the README.
4. ✅ Write the literal when creating a task in a text column.
5. ✅ Test: unit tests for every row of the column move examples.
6. ✅ Test: drag cards between `@office`, `@home`, Doing and Done in Erika's vault, with keep metadata on and off.
7. ✅ Recheck the updated Done behavior in Erika's vault: completing preserves inline text with keep metadata off and on, and reopening returns the task to its Text column.

**Deliverable:** Full two-way text columns.

**Implemented by:** The commit completing this spec (Refs #177).

### Phase 3: Column rule edits update existing tasks ✅ COMPLETE

**Goal:** Renaming a Text column can rewrite open tasks, and never touches done tasks.

1. ✅ Route text rule changes through `applyChangedColumnTagUpdates`.
2. ✅ Test: a unit test that a done task with the old literal is unchanged after the update.
3. ✅ Test: rename `@office` to `@work` in Erika's vault and confirm open tasks update and done tasks don't.

**Deliverable:** Text columns behave like tag columns for rule edits.

**Implemented by:** The commit completing this spec (Refs #177).

### Phase 4: Text swimlanes ✅ COMPLETE

**Goal:** A user can group a board by a list of text literals, drag between lanes, and add tasks in a lane.

1. ✅ Add the `text` group source to settings, `deriveGroupBuckets`, `taskBelongsToGroup` and `createGroupAssigner`.
2. ✅ Add the Text option and literal list to the view editor, with the shared-literal warning.
3. ✅ Add the `set-text` drop plan using the shared text writes.
4. ✅ Write the lane literal on task creation in `cell_creation.ts`.
5. ✅ Test: unit tests for every row of the lane examples, including the first-in-list rule and collapsed lane ids.
6. ✅ Test: group a board by `[[Project A]]` and `[[Project B]]` in Erika's vault, drag between lanes and columns, and add a task in a lane, on desktop and mobile.

**Deliverable:** Text swimlanes on par with tag lanes.

**Implemented by:** The commit completing this spec (Refs #177).


## Validation evidence

- Final checks on Node 22.23.4: build passed (Svelte: 0 errors/warnings),
  74 test files / 1,103 tests passed, lint and community lint passed with
  13 existing warnings each. Whitespace checks passed for implementation files.

- Automated: token boundary/case/wiki-link tests and surgical writes in
  `src/parsing/text_literals/tests/text_literals.tests.ts`.
- Automated: exact-case matching, writes, duplicate validation, distinct lane ids,
  and title-derived matching (including Text versus Name tag behavior),
  title-renaming migrations, column precedence, serialization, creation, completion/archive,
  ordered lane assignment and stable ids in
  `src/ui/tasks/tests/text_columns.tests.ts`.
- Automated: done-row protection and opt-out behavior in
  `src/ui/settings/tests/column_rename_migration.tests.ts`.
- Automated: surgical lane action examples, drop sequencing, collapsed headers,
  desktop/mobile creation metadata, lane list interactions, card display and
  settings/saved-view persistence in the adjacent test suites.
- The Unassigned lane uses `text-unassigned`, outside the `text:` literal-id
  namespace, so a literal named `__unassigned__` cannot collide with it.
- Manual acceptance: the owner checked off all phase validations and confirmed
  testing complete on 2026-11-01. Automated tests do not claim device or theme
  validation.
