Status: IN_PROGRESS (implementation and automated checks complete; manual acceptance pending)

# New Task Insertion Location

## Feature Request Summary

Refs [#189](https://github.com/ErikaRS/task-list-kanban/issues/189).
The issue requests choosing where newly created tasks go instead of always
appending to the destination file. The user's clarification is the primary UI
requirement: one optional heading and one **At top / At bottom** setting in the
same section, applied uniformly across all destination files. There are no
per-file rules.

## User Requirements

1. Configure an optional heading under which new tasks are inserted.
2. Configure **At top** or **At bottom** in the same settings section. This
   applies to the heading's section when configured, or to the whole file when
   the heading is blank. Keep the position control enabled in both cases.
3. Apply the board's effective settings to every destination: default file,
   recently used file, manually chosen file, and file swimlane destination.
   Do not store placement preferences by file or offer file-specific overrides.
4. Use the same behavior for desktop Add new, mobile creation, and Add card.
5. Preserve today's append-to-file behavior for existing boards by default.
6. Keep destination file selection, column placement, tags, dates, and inherited
   swimlane properties working as they do today.

## High-Level Design

### Settings and scope

Add a **New tasks** section in board settings. Move the existing Default task
file control into it and add the two placement controls:

```text
New tasks
  Default task file   [notes/tasks.md             ]
  Heading            [e.g., Tasks                ]
    Optional heading text, without # marks. Leave blank to use the whole file.
  Insert at top      [off]
    When off, insert at the bottom. Applies to the heading's section,
    or the whole file if Heading is blank.
    If the heading is missing, create it at the selected end of the file.
```

Use a native toggle labeled **Insert at top**, on for `top` and off for
`bottom` (the default). Keep the stored position values unchanged. The heading
placeholder is an example, **e.g., Tasks**; the actual default is blank.

These are board settings, consistent with the issue's request. Support normal
plugin-wide board defaults and board overrides for the two new fields; the
existing Default task file remains board-local. In the global defaults editor,
show the heading and position together without the file control. Different
boards may use different settings; within one board every file uses the same
pair. Saved views do not capture insertion settings.

Settings:

| Field | Type | Default |
| --- | --- | --- |
| `newTaskHeading` | string | `""` |
| `newTaskPosition` | `"top" \| "bottom"` | `"bottom"` |

Add both to settings parsing, defaults, serialization, and
`BOARD_DEFAULT_SETTING_KEYS`, with the existing inheritance/pin/reset behavior.
Trim the heading on save; whitespace-only means no heading. Reject multiline
values and Markdown heading prefixes with an inline validation message.

### Write path

`TaskActions.createTask` currently builds the task line with `buildNewTaskLine`
and appends through `updateRow(..., undefined, ...)`. Keep line construction
and replace only that creation write with a dedicated insertion helper.
Do not change the default behavior of `updateRow`, which has other callers.

Add a pure helper in `src/ui/tasks/task_insertion.ts` that accepts file contents,
the new task line, and placement settings, and returns the new contents. Read
the latest file contents and calculate the insertion point for each creation;
do not cache line offsets or section positions. Retain the existing
`prepareFileContentsForWrite` hook and write-error handling. Inspect existing
creation flows so a failed write retains the user's draft on desktop and mobile.

## Detailed Behavior

### Placement rules

| Heading | Position | Result |
| --- | --- | --- |
| Blank | At top | Insert before the first body content, after YAML frontmatter. |
| Blank | At bottom | Append after the file's existing content. |
| Present in file | At top | Insert at the beginning of that heading's section. |
| Present in file | At bottom | Insert at the end of that heading's section. |
| Missing from file | At top | Create `## <heading>` at the top of the body, with the task beneath it. |
| Missing from file | At bottom | Append `## <heading>` and the task at the end of the file. |

Missing-heading creation ensures the task
always goes under the configured heading without a per-file fallback preference.
A new section is separated from existing body content by a blank line.

### Heading matching and section boundaries

- Match top-level Markdown ATX headings (`#` through `######`, allowing up to
  three leading spaces), by trimmed heading text, case-sensitively. Ignore
  optional closing hash marks. The setting contains text, not a heading level.
- Select the first matching heading in document order, regardless of level.
  Repeated headings do not produce a picker or a saved file-specific choice.
- Ignore apparent headings inside YAML frontmatter, fenced code blocks,
  blockquotes, and indented code. Setext headings and rendered-text equivalence
  (such as matching `Tasks` to `**Tasks**`) are outside this iteration.
- A section begins after its heading and ends immediately before the next
  heading of equal or lower level, or at EOF. Deeper subsections belong to the
  section. At bottom therefore follows those subsections, if present; it does
  not search for the last checkbox or rearrange existing content.
- At top skips existing blank separator lines immediately after the heading;
  at bottom inserts before trailing blank separator lines at the section end.
  Empty sections work with either position.
- New tasks are root task lines, never children of the preceding list item.
  Add a separating blank line where needed to avoid a preceding nested block
  or code block absorbing the task; preserve all existing content and order.

### File integrity and compatibility

- At top never inserts into frontmatter. Recognize a frontmatter block only at
  file start (after an optional BOM), through its closing YAML delimiter.
  Keep a BOM at file start. If opening frontmatter has no closing delimiter,
  fail visibly without writing or clearing the draft.
- If the insertion point falls inside an unclosed fenced code block, fail
  visibly without writing or clearing the draft. The user can close the fence
  or choose a safe placement.
- Preserve existing line endings, unrelated whitespace, and terminal-newline
  style. Empty files receive just the task, or the new heading and task.
- Resolve placement independently against each destination's actual contents.
  Switching files never changes the heading or position settings.
- Read effective settings at creation time; changing settings affects future
  creations only. Do not relocate existing tasks or headings.
- Duplicate stays directly below its original source block. Adding a subtask
  stays inside its parent's block. Moving existing tasks between file lanes
  retains its current behavior; these preferences govern new root tasks only.
- File placement affects Markdown order. Board sorting, grouping, and filtering
  still determine where or whether the created card appears on the board.
- File existence and scope validation remain the existing destination-selection
  responsibility; this feature creates missing headings, not missing files.

## Implementation Plan

### Phase 1: Choose top or bottom of the whole file ✅ COMPLETE

**Goal:** A user can save the position preference and create tasks at either end
of any chosen file through all supported creation entry points.

1. ✅ Add position parsing, defaults, persistence, inheritance, and the New
   tasks section with the existing file control and position toggle.
2. ✅ Implement whole-file placement and connect it to `createTask`, keeping
   task line construction and the write-preparation hook intact.
3. ✅ Test both positions, frontmatter, empty files, BOM, CRLF, terminal
   newlines, settings reload, inheritance/reset, and legacy default behavior.
4. ✅ Test shared action integration with default, recent, manually selected,
   and swimlane files; verify creation metadata and failed-write draft retention.

**Deliverable:** Working, persistent whole-file placement without file-specific
preferences.

**Implemented by:** Codex; included in the feature commit for Refs #189.

### Phase 2: Place tasks under the shared heading 🚧 IN PROGRESS

**Goal:** The heading and position controls work together across all files,
including files that need the heading created.

1. ✅ Add heading parsing, validation, inheritance, persistence, and control
   beside position, with the conditional-scope help text specified above.
2. ✅ Extend insertion to match headings, determine section boundaries, and
   create missing sections at the selected end of the file.
3. ✅ Test all six placement cases, duplicate headings, heading levels,
   subsections, empty sections, closing hashes, case matching, and ignored
   headings inside frontmatter, fences, blockquotes, and indented code.
4. ✅ Test sequential creations and changing destination files; assert one
   shared pair of settings applies and unrelated content stays intact.
5. ✅ Update README Add Tasks and board configuration documentation.
6. ✅ Run `npm run build` and `npm test` successfully.
7. [ ] Manually validate desktop Add new, Add card, and mobile creation in
   Obsidian; inspect the resulting Markdown in at least two destination files.
8. [ ] Manually check settings save/cancel, pin/reset, keyboard navigation,
   narrow layouts, and rendering in the test vault and another theme/vault.

**Deliverable:** New root tasks consistently use the configured heading and
position for every destination file on the board.

**Implemented by:** Codex; included in the feature commit for Refs #189.

## Validation and Review

The user requested implementation of SPEC 52, accepting the specified edge
behavior: missing headings are level 2, the first exact heading match wins, and
section bottoms include subsections. The user reviewed the controls, requested the example placeholder and toggle,
and authorized committing and pushing the implementation.

Automated verification:

- `npm run build`: passed, including TypeScript and Svelte checks.
- `npm test`: passed, 1,020 tests in 71 files.
- New tests cover six placement cases, YAML/BOM, newline preservation, heading
  matching and boundaries, safe root placement, repeated creation, settings
  round trips and inheritance/pin/reset, current settings at save time, all
  four destination selection paths, and desktop failed-write draft/date retry.
- Existing mobile creation and shared mobile editor failure/retry tests pass.

Manual Obsidian desktop/mobile, Add card, settings interaction, and theme/vault
checks remain open above. The spec stays in progress until those are verified
or explicitly waived.
