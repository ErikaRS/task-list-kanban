# Task List Kanban

Task List Kanban is a free, open source Obsidian plugin that turns Markdown tasks from your vault into a kanban board. Tasks stay in their original files, and changes made from the board are written back to Markdown.

Use it to:
- collect tasks from one folder, selected folders, or the whole vault
- move tasks between columns with tags
- edit, complete, cancel, archive, duplicate, and bulk-update tasks
- filter by content, tag, or file
- group tasks into swimlanes by file or tag
- sort tasks by file order, parsed task properties, or manual pinned order
- display, sort, group, and edit Tasks Plugin or Dataview date metadata

![Task List Kanban Screenshot](https://github.com/ErikaRS/task-list-kanban/assets/80379257/ddde01aa-3098-4cfc-8860-6af34f0ece57)

## Getting Started

### Create a Board

Right-click the folder where you want the board file, then choose **New kanban**.

![Creating a new kanban](https://github.com/ErikaRS/task-list-kanban/assets/80379257/fbe25c3f-824f-4feb-b1b3-5acbdf1c8901)

### Add Tasks

Create Markdown tasks in any included file:

```markdown
- [ ] Write release notes #this-week
```

Task List Kanban supports the standard Markdown task bullets `-`, `*`, and `+`.

Tasks without a column tag appear in **Uncategorized**. To place a task in a column, either add the column tag in Markdown or drag the task to that column on the board. Placement tags are hidden from task cards so the board stays clean.

Click **Add new** at the bottom of a column to create a task from the board. If a default or recently used task file is available, the input opens immediately; otherwise, choose a file first.

## Board Configuration

Open board settings with the settings icon in the top-right corner.

### Scope

Choose which files feed the board:
- **This folder**: files beside the kanban file.
- **Every folder**: the whole vault.
- **Selected folders**: specific vault-relative folders. The board's own folder is always included.

Use **Excluded paths** to omit directories or files after scope is applied. The board's own folder cannot be excluded directly, but its subdirectories can.

### Columns

Use the **Columns** section to rename, color, remove, and reorder custom columns. **Uncategorized** and **Done** stay fixed at the top and bottom of the settings list, with separate visibility and name controls.

![Column settings](https://github.com/user-attachments/assets/6b9f0e79-1cac-4976-b46b-577917d6d42c)

Column matching options:
- **Name matching**: a column named `In Progress` matches tags such as `#InProgress`, `#in-progress`, and `#In-Progress`.
- **Explicit tag matching**: configure one or more required tags for a column. A column with `status/active` and `project/alpha` matches only tasks with both tags.
- **Status marker matching**: configure a column to match an active checkbox marker such as unchecked `[ ]`, in-progress `[/]`, or blocked `[!]`. Moving a task into that column updates the checkbox marker.
- **Priority matching**: configure a column to match Tasks Plugin or Dataview priority metadata when a property schema is enabled. Moving a task into that column writes the matching priority value.
- **Updating changed match rules**: settings can optionally update existing tasks when a name-matched column is renamed, an explicit tag mapping changes, a status marker mapping changes, or a priority mapping changes.

Column display options:
- **Colors**: add a hex color like `#FF5733` to show a color bar on the column and its cards.
- **Width**: set all columns between 200px and 600px.
- **Visibility**: show **Uncategorized** and **Done** always, never, or only when non-empty.

### Tag Display

Enable **Consolidate tags** in settings to move non-column tags to the card footer.

The **Excluded tags** setting hides configured tags from cards, tag grouping, and consolidated tag footers. A settings button can automatically exclude all tags mapped to active columns.

### Layout

Flow direction controls how columns are arranged:
- **Left to right**: horizontal board, scrolling right.
- **Right to left**: horizontal board in reverse order.
- **Top to bottom**: transposed board, with board columns as rows and cards flowing horizontally.
- **Bottom to top**: transposed board in reverse row order.

### Obsidian Tasks plugin / Dataview integration

Enable a **Property schema** in settings to read and write task metadata from the Obsidian Tasks plugin or Dataview inline fields.

Task List Kanban can display, sort, group, and edit metadata from either integration while keeping each task in its source Markdown format.

- **Obsidian Tasks plugin**: due, scheduled, start, done, created, priority, and recurrence metadata.
- **Dataview**: due, scheduled, start, done, completion, created, priority, repeat, and arbitrary inline fields.

The **Show properties** setting controls whether parsed metadata appears on task cards:
- **None**: leave parsed properties inline as task text.
- **Pretty**: show formatted property values, with Tasks plugin dates and priorities using familiar labels and icons.
- **Debug (JSON)**: show the raw parsed data for troubleshooting schemas and unusual task lines.

When the schema is **Tasks Plugin** or **Dataview**, task cards show a compact **+ Date** control. Use it to set or clear due, scheduled, and start dates directly from the board. New tasks created from the board can include the same dates.

Date writes use the selected integration's native format:

```markdown
- [ ] Send invoice 📅 2026-06-15 ⏳ 2026-06-16 🛫 2026-06-17
- [ ] Send invoice [due:: 2026-06-15] [scheduled:: 2026-06-16] [start:: 2026-06-17]
```

Completing an open task from the board adds a completion date when the selected schema supports it and the task does not already have one:

```markdown
- [x] Send invoice ✅ 2026-06-15
- [x] Send invoice [completion:: 2026-06-15]
```

Existing completion dates are preserved. Reopening, moving, cancelling, archiving, or editing a task does not remove or rewrite historical completion metadata.

### Task Status Settings

Task status visuals come from your active Obsidian theme or plugin CSS.

Status marker settings control how checkbox characters behave:
- **Status marker order**: controls how status markers sort and group when using status as a parsed property.
- **Done markers**: characters treated as complete. Default: `xX`.
- **Ignored markers**: characters hidden from the board entirely. Default: empty.
- **Cancelled markers**: characters used by cancel/restore. Default: `-`.

Examples:
- `xX` recognizes `[x]` and `[X]` as done.
- `xX✓` also recognizes `[✓]`.
- ignored marker `-` hides `[-]` tasks.

Cancel and restore only change checkbox markers. If a cancelled marker is also configured as ignored or done, that marker setting determines whether the task is hidden or treated as complete.

## Board Controls

### Column Controls

- **Collapse**: collapse columns from the board header; collapse state is saved.

### Task Actions

- **Edit**: click task text, edit inline, then click away or press Enter.
- **Move**: drag a task to another column, or choose a column from the task menu.
- **Complete**: click the task checkbox to mark a task done and move it to **Done**.
- **Cancel or restore**: use the task menu to switch between cancelled and active.
- **Archive**: archive tasks from the task menu or bulk menu. This marks open tasks done and adds the `#archived` tag.
- **Duplicate**: duplicate a task directly below the original source line.
- **Open source file**: click the file path or arrow icon on a card.

### Sorting

Use the **Sort** dropdown in the board header to order tasks within each column:
- **File order**: use natural order from Markdown files.
- **Task name**: sort lexicographically by task text.
- **Property sorting**: sort by parsed task properties such as dates or priorities when a property schema is enabled.
- **Manual**: drag one task within a column to pin a custom order.

Manual sorting keeps pinned tasks together at the top of the column. Pinned cards show a pin marker; click it to unpin the task and return it to the file-order tail. When a task is first pinned, the plugin will add an Obsidian block link like `^abc123` to the source line unless one already exists, so the order survives text edits and reloads.

Manual drag reordering is available when the board is not grouped. When grouping is active, saved manual order still displays, but the Manual sort option is readonly until grouping is turned off because relative order would not be stable across different groupings.

### Filters

Open the filters sidebar to filter by content, tags, or file path. Save common filter combinations and reload them from **Saved filters**.

### Bulk Actions

Each column header has a **Done / Select** toggle.

- **Done mode**: cards complete tasks.
- **Select mode**: cards select tasks for bulk actions.

After selecting tasks, use the column bulk menu to move, complete, cancel, restore, or archive them. Dragging one selected task moves all selected tasks in that column.

### Grouping And Swimlanes

Use **Group by** in the board header to split tasks into swimlanes.

- In horizontal layouts, groups appear as board-wide swimlane rows.
- In vertical layouts, groups appear as columns across the top of the transposed grid.
- Dragging tasks between swimlanes updates the relevant file, tag, or property.

#### Group By File

Tasks are grouped by source Markdown file.

#### Group By Tag

Tasks are grouped by tag, optionally limited to a configured prefix.

- Saved groupings let you reuse common tag grouping setups.

## Screenshot Refresh Candidates

The current README still uses older screenshots. Useful new or replacement screenshots would be:
- the main board screenshot, showing current card footers, properties, and the **+ Date** control
- the task date editor, showing due, scheduled, and start date inputs on a card
- a grouped **Top to bottom** or **Bottom to top** board, showing the transposed grid with board columns as rows and groups across the top
- the **Task properties** settings section, showing **Property schema** and **Show properties**
- the **Status markers** settings section, showing status marker order alongside done, ignored, and cancelled markers

## Development

### Prerequisites

- Node.js
- npm
- Obsidian for manual testing

### Setup

```bash
npm install
npm run dev
```

Build output is written to the repository root for Obsidian plugin loading.

### Quality Checks

```bash
npm run build
npm test
```

`npm run build` runs TypeScript checking and a production ESBuild bundle. `npm test` runs the Vitest suite.

### Manual Testing

Deploy to the vendored test vault:

```bash
./tools/deploy_for_manual_test.sh
```

This copies the built plugin into `test-vaults/obsidian-plugin-dev/.obsidian/plugins/task-list-kanban/`. You can pass a target directory to deploy somewhere else.

### Release

1. Bump the version:

   ```bash
   npm version patch
   ```

2. Push `main` and the new tag.
3. Wait for GitHub Actions to create the draft release with built assets.
4. Edit and publish that draft from the releases page.

Do not create a release draft manually with `gh release create` or the GitHub UI; the automated draft is the one with the correct assets.
