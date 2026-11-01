Status: IN_PROGRESS

# Today's Daily Note as a New Task Destination

## Feature Request Summary

Refs [#208](https://github.com/ErikaRS/task-list-kanban/issues/208).

Add **Today's daily note** as a named destination for new tasks. It appears in
the Add new file picker and can be chosen as the board's Default task file.
Each time a task is added, the destination becomes the current day's note,
using a Moment path pattern. The pattern comes from Obsidian's core Daily notes
settings or from a board setting with a plugin-wide default, because vaults
store daily notes at different paths and in different formats.

## User Requirements

1. The Add new file picker offers **Today's daily note** as a destination and
   shows today's dated path as a preview.
2. The Default task file can be set to **Today's daily note**. The stored value
   names the destination, never a dated path.
3. Whenever a task is added to Today's daily note, the destination becomes the
   current day's note at that moment. This applies whether it came from the
   default, the last-used file, or the picker. The destination moves to each
   new day's note without settings changes, including on a board left open
   overnight.
3. A **Daily note path** board setting takes a Moment path such as
   `daily/{{YYYY-MM-DD}}.md`. It can be inherited, so it can be set once in the
   plugin-wide board defaults and overridden per board.
4. When Daily note path is blank, the folder and date format come from
   Obsidian's core **Daily notes** plugin.
5. When today's note doesn't exist, adding a task to it creates the note and
   then inserts the task. New notes use the core Daily notes template when one
   is set, whether the location comes from core or from Daily note path.
6. A Default task file containing a `{{...}}` date pattern keeps resolving as
   it does now. This behavior is not documented; Today's daily note is the
   supported way to target a dated note.
7. Scope rules apply. A daily note outside the board's scope is shown as
   unavailable and is never created.

## High-Level Design

### Daily note path resolution

A new module, `src/ui/tasks/daily_note.ts`, turns settings plus the current
date into a target path:

```ts
type DailyNoteSource =
	// "override": pattern from the board/global setting; "core": from core options.
	// dateFormat and templatePath come from core options in both cases.
	| { kind: "override" | "core"; pattern: string; dateFormat: string; templatePath: string | null }
	| { kind: "unconfigured" };

function getDailyNoteSource(app: App, dailyNotePath: string): DailyNoteSource;
function resolveDailyNotePath(source: DailyNoteSource, now: Date): string | null;
```

- **Override.** A non-blank `dailyNotePath` is resolved with
  `resolveDateTemplate`. If the resolved path doesn't end in `.md`, `.md` is
  appended (an "any extension" check would misread dotted dates such as
  `2026.11.01`).
- **Core.** When the override is blank, the core Daily notes options (`folder`,
  `format`, `template`) build the pattern `{folder}/{{format}}.md`. An empty
  `format` means `YYYY-MM-DD`, matching core's default. These options are read
  through Obsidian's internal plugin registry, which has no public type. A
  single defensive accessor returns `unconfigured` if the plugin is disabled or
  missing, or if its options don't have the expected shape.
- **Unconfigured.** The core plugin is off and there is no override.

Daily note path only moves the note. The core template (and the core date
format used for a bare `{{date}}` in it) applies to either source.

Core formats can contain `/` for nested folders (for example
`YYYY/MM/YYYY-MM-DD`). Wrapping the whole format in one `{{...}}` handles
this, because Moment outputs `/` unchanged.

### Settings

| Field | Type | Default | Inheritable |
| --- | --- | --- | --- |
| `dailyNotePath` | string | `""` (use core Daily notes) | Yes, in `BOARD_DEFAULT_SETTING_KEYS` |
| `defaultTaskFile` | string | `""` | No |
| `lastUsedTaskFile` | string | `""` | No |

The value `$DAILY_NOTE` in `defaultTaskFile` or `lastUsedTaskFile` means
Today's daily note, following the `$TODAY` convention used by date filters.
No migration is required.

The **New tasks** settings section:

```text
New tasks
  Default task file   [ Specific file ▾ ]  [notes/tasks.md          ]
                        Specific file
                        Today's daily note
  Daily note path     [daily/{{YYYY-MM-DD}}.md   ]   (override chip)
    Path to today's daily note. Leave blank to use Obsidian's
    Daily notes settings (currently: Journal/{{YYYY-MM-DD}}.md).
  Heading             [ ... ]
  Insert at top       [ ... ]
```

- **Default task file** is a dropdown with **Specific file** and **Today's
  daily note**. The path field appears only for Specific file. Today's daily
  note stores `$DAILY_NOTE`.
- **Daily note path** appears in both board settings and the global defaults
  editor, with the standard override chip, pin, and reset. Its description
  shows the resolved core pattern, or "Daily notes core plugin is off".
- **Daily note path validation:** a non-blank value must resolve through
  `resolveDateTemplate`. A value with no `{{...}}` pattern gets a warning,
  because it names the same file every day.
- **Default task file validation for `$DAILY_NOTE`:**
  - Unconfigured source: error.
  - Resolved path outside scope: error, using the existing out-of-scope message.
  - Missing file: not an error. The setting shows "Today's note doesn't exist
    yet; it will be created on first add."

### File picker

The picker's root menu includes a daily note entry whenever the source is
configured:

```text
Choose a file
★ Today's daily note — Journal/2026-11-01.md        (when it is the default)
📅 Today's daily note — Journal/2026-11-01.md       (otherwise)
📅 Today's daily note — Journal/2026-11-01.md (new)  (file missing, will be created)
📅 Today's daily note (outside scope)                (disabled)
──────────
folder tree…
```

- When Today's daily note is the default, it is the ★ row. Otherwise it
  appears as its own row below the ★ default.
- Choosing it sets `lastUsedTaskFile` to `$DAILY_NOTE`. Choosing the same dated
  file from the folder tree saves that file's path.
- The picker hands back a new-task target (below) rather than a `TFile`, so it
  can offer a daily note that doesn't exist yet.

### New-task targets and note creation

A new task's target is either an existing file or Today's daily note, which
may not exist yet. Specific files stay plain `TFile`s, so file swimlanes,
mobile creation, and the board components keep passing files through
unchanged; only the daily note needs its own shape. Both carry a `path`, which
is all the indicator and the mobile file button display.

```ts
type DailyNoteDestination =
	{ kind: "dailyNote"; path: string; file: TFile | null; source: DailyNoteSource };
type NewTaskTarget = TFile | DailyNoteDestination;
type TaskDestination = { target: NewTaskTarget; isDefault: boolean };
```

- `getTargetDestination()` replaces `getTargetFile()`. It resolves the Default
  task file, then the last-used file: `$DAILY_NOTE` through the daily note
  source, other values as files (date templates included). Targets outside
  scope resolve to `null`. A missing daily note still resolves, with
  `file: null`, so one-click add can create it.
- `createTask` takes a `NewTaskTarget`. A daily note target is re-resolved at
  write time. When the note doesn't exist, it creates any missing parent
  folders and writes the note once, with the task already inserted using the
  board's heading and position settings.
- The new-task indicator shows `→ 2026-11-01.md (daily note)`, plus `(default)`
  when the destination came from the default setting. "Is default" comes from
  the resolution step rather than comparing strings, so templated defaults and
  `$DAILY_NOTE` are both labeled correctly.

A newly created note's initial content:

- **Core Daily notes template set:** the template, with core's tokens
  (`{{date}}`, `{{time}}`, `{{title}}`, and their `:FORMAT` variants)
  substituted as the core plugin does. This applies to both sources.
- **No core template (or the core plugin is off):** an empty file.

The plugin does not run Templater or Periodic Notes logic itself. If Templater
has "Trigger on new file creation" enabled, it processes the new file after
creation; see Risks.

## Detailed Behavior

- The destination is resolved when the picker opens, when the toolbar
  indicator renders, and again when the task is written. The `today_store`
  date tick refreshes the indicator at midnight.
- If the note already exists when creation is attempted (for example, two
  boards adding at the same moment), `vault.create` fails for the second
  attempt. In that case the file is re-read and the task is inserted.
- Any other creation failure keeps the draft and shows the path and the error
  in the new-task input's error line (Add card shows a Notice).
- One-click add, Add card, and mobile creation all use destination resolution.
  File swimlanes always use their lane's file.
- Add card applies the same heading and position settings to existing files
  and new daily notes. A new daily note includes the task in its initial
  creation write. At submission, its daily-note path, dated Selected paths
  scope, and template tokens use the same current timestamp.
- Saved views do not capture `dailyNotePath` or `defaultTaskFile`.

### Risks

- **Internal API.** The core Daily notes options come from undocumented
  internals. The defensive accessor and the override setting limit the impact
  of upstream changes. The community package `obsidian-daily-notes-interface`
  wraps the same internals and also reads Periodic Notes. It is an alternative
  if a dependency is acceptable.
- **Templater timing.** A separate insert right after creation could
  interleave with Templater's on-create processing, so a new note is written
  once with the task already in it. If Templater still rewrites the new file,
  insertion should wait for the first `modify` event or a short delay.

## Implementation Plan

### Phase 1: Daily note path setting and picker entry (existing notes) ✅ COMPLETE

**Goal:** A user can configure (or inherit from core) the daily note path and
pick **Today's daily note** in the file picker when today's note exists.

1. ✅ Add `dailyNotePath` to settings parsing, defaults, serialization, and
   `BOARD_DEFAULT_SETTING_KEYS`, with override chip, pin, and reset.
2. ✅ Implement `daily_note.ts`: core options accessor, override, `.md` suffix,
   and the unconfigured case.
3. ✅ Render Daily note path in the New tasks section (board and global), with
   the resolved core preview and validation.
4. ✅ Add the 📅 picker entry. When the note is missing, show it disabled as
   "(not created yet)"; Phase 3 makes it creatable. Choosing it saves
   `$DAILY_NOTE` as last used.
5. ✅ Unit tests: source selection, nested core formats, missing core plugin,
   override precedence, inheritance/reset round trip, last-used `$DAILY_NOTE`
   resolution across a date change.

**Deliverable:** Picking today's existing daily note from the picker works and
follows the date on later days.

**Implemented by:** 3b5556f

### Phase 2: Today's daily note as the default task file ✅ COMPLETE

**Goal:** The Default task file can be set to Today's daily note, and the
toolbar indicator labels it correctly.

1. ✅ Add the Specific file / Today's daily note dropdown; store and parse
   `$DAILY_NOTE`.
2. ✅ Introduce `NewTaskTarget`, `TaskDestination`, and `getTargetDestination()`. Move the toolbar,
   one-click add, Add card, and mobile creation onto it.
3. ✅ Derive the `(default)` label from resolution for templated and
   `$DAILY_NOTE` defaults.
4. ✅ Add Default task file validation for `$DAILY_NOTE`.
5. ✅ Unit tests: default resolution, out-of-scope handling, templated default
   compatibility, `(default)` labeling, midnight rollover via the date tick.

**Deliverable:** A board whose default is Today's daily note sends one-click
adds to today's note with no per-day configuration.

**Implemented by:**

### Phase 3: Create today's note on first add

**Goal:** Adding a task when today's note doesn't exist creates it (with the
core template when applicable) and inserts the task.

1. ✅ Enable the "(new)" picker entry and the not-yet-created default state.
2. ✅ Create the note and missing parent folders. Apply the core template with
   token substitution, recover from "already exists", and keep the draft on
   failure.
3. Verify Templater on-create behavior in the test vault; add a wait if
   needed.
4. ✅ Unit tests: empty-file creation, template token substitution (core and
   overridden locations), heading and
   position in the new file, concurrent-create recovery, failure draft
   retention.
5. ✅ Update the README Add Tasks and board configuration docs.
6. ✅ Run `npm run build` and `npm test`.

**Deliverable:** Opening a board and clicking add creates today's daily note
if needed and places the task in it.

**Implemented by:**

### Manual acceptance checks

- [ ] Core Daily notes on with a custom folder and nested format: the picker
      shows the correct dated path with no plugin configuration.
- [ ] Global default Daily note path set and one board overriding it: both
      resolve correctly; reset restores inheritance.
- [ ] Default set to Today's daily note: one-click add creates the note from
      the core template and inserts the task under the configured heading.
- [ ] Daily note outside scope: shown disabled in the picker, error in
      settings, nothing created.
- [ ] Board left open across midnight: the indicator and the next add move to
      the new day's note.
- [ ] Existing board with a `daily/{{YYYY-MM-DD}}.md` Default task file keeps
      working and shows `(default)`.
- [ ] Mobile creation and Add card use the same destination.

### Review fixes verified (2026-11-01)

Add card regression tests cover insertion settings for new and existing daily
notes, task inclusion in the initial creation write without a second task
write, concurrent-create recovery, board-file settings preservation, failed
creation draft retention, and scope resolution after midnight. Dated Selected
paths follow the new day; a literal path for the previous day remains outside
scope.

- `npm run build`: passed, including TypeScript and Svelte checks.
- `npm test`: passed, 1,105 tests in 73 files.
- ESLint for `src/ui/tasks/create_card_modal.ts`: passed.

The manual Templater acceptance check remains pending.
