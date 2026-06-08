# Task List Kanban

Task List Kanban is a free, open source Obsidian plugin that turns Markdown tasks from your vault into a kanban board. Tasks stay in their original files, and changes made from the board are written back to Markdown.

Use it to:
- collect tasks from one folder, selected folders, or the whole vault
- move tasks between columns with tags
- edit, complete, cancel, archive, duplicate, and bulk-update tasks
- filter by content, tag, or file
- group tasks into swimlanes by file or tag
- sort tasks by file order, parsed task properties, or manual pinned order

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

## Everyday Use

### Task Actions

- **Edit**: click task text, edit inline, then blur or press Enter.
- **Move**: drag a task to another column, or choose a column from the task menu.
- **Complete**: click the circle icon to mark a task done and move it to **Done**.
- **Cancel or restore**: use the task menu to switch between `[-]` and `[ ]`.
- **Archive**: archive completed tasks from the task menu or bulk menu.
- **Duplicate**: duplicate a task directly below the original source line.
- **Open source file**: click the file path or arrow icon on a card.

### Filters

Open the filters sidebar to filter by content, tags, or file path. Save common filter combinations and reload them from **Saved filters**.

Enable **Consolidate tags** in settings to move non-column tags to the card footer.

### Bulk Actions

Each column header has a **Done / Select** toggle.

- **Done mode**: card check icons complete tasks.
- **Select mode**: card square icons select tasks for bulk actions.

After selecting tasks, use the column bulk menu to move, complete, cancel, restore, or archive them. Dragging one selected task moves all selected tasks in that column.

## Board Configuration

Open board settings with the settings icon in the top-right corner.

### Columns

Use the **Columns** section to rename, color, remove, and reorder custom columns. **Uncategorized** and **Done** stay fixed at the top and bottom of the settings list, with separate visibility controls.

![Column settings](https://github.com/user-attachments/assets/6b9f0e79-1cac-4976-b46b-577917d6d42c)

Column matching options:
- **Name matching**: a column named `In Progress` matches tags such as `#InProgress`, `#in-progress`, and `#In-Progress`.
- **Explicit tag matching**: configure one or more required tags for a column. A column with `status/active` and `project/alpha` matches only tasks with both tags.
- **Renaming name-matched columns**: settings can optionally update existing task tags to match the new name.

Column display options:
- **Colors**: add a hex color like `#FF5733` to tint a column.
- **Width**: set all columns between 200px and 600px.
- **Collapse**: collapse columns from the board header; collapse state is saved.
- **Visibility**: show **Uncategorized** and **Done** always, never, or only when non-empty.

### Layout

Flow direction controls how columns are arranged:
- **Left to right**: horizontal board, scrolling right.
- **Right to left**: horizontal board in reverse order.
- **Top to bottom**: vertical columns, with cards flowing horizontally.
- **Bottom to top**: vertical columns in reverse order.

### Sorting

Use the **Sort** dropdown in the board header to order tasks within each column:
- **File order**: use natural order from Markdown files.
- **Task name**: sort lexicographically by task text.
- **Property sorting**: sort by parsed task properties such as dates or priorities when a property schema is enabled.
- **Manual**: drag one task within a column to pin a custom order.

Manual sorting keeps pinned tasks together at the top of the column. Pinned cards show a pin marker; click it to unpin the task and return it to the file-order tail. When a task is first pinned, the plugin may add an Obsidian block link like `^abc123` to the source line so the order survives text edits and reloads.

Manual drag reordering is available when the board is not grouped. When grouping is active, saved manual order still displays, but the Manual sort option is readonly until grouping is turned off.

### Scope

Choose which files feed the board:
- **This folder**: files beside the kanban file.
- **Every folder**: the whole vault.
- **Selected folders**: specific vault-relative folders. The board's own folder is always included.

Use **Excluded paths** to omit directories or files after scope is applied. The board's own folder cannot be excluded directly, but its subdirectories can.

## Grouping And Swimlanes

Use **Group by** in the board header to split tasks into swimlanes.

### Group By File

Tasks are grouped by source Markdown file.

- In horizontal layouts, file groups appear as board-wide swimlane rows.
- In vertical layouts, file groups appear as repeated section headers inside each column.
- Drag tasks between file swimlanes to move their source lines between files.

### Group By Tag

Tasks are grouped by tag, optionally limited to a configured prefix.

- With a prefix, dragging between swimlanes replaces the matching prefix tag.
- Without a prefix, dragging replaces the dragged group tag.
- Dragging to **Unassigned** removes the relevant tag.
- Saved groupings let you reuse common tag grouping setups.

The **Excluded tags** setting hides configured tags from cards, tag grouping, and consolidated tag footers. A settings button can automatically exclude all tags mapped to active columns.

## Task Status Settings

Task status visuals come from your active Obsidian theme or plugin CSS.

Status marker settings control how checkbox characters behave:
- **Done markers**: characters treated as complete. Default: `xX`.
- **Ignored markers**: characters hidden from the board entirely. Default: empty.
- **Cancelled markers**: characters used by cancel/restore. Default: `-`.

Examples:
- `xX` recognizes `[x]` and `[X]` as done.
- `xX✓` also recognizes `[✓]`.
- ignored marker `-` hides `[-]` tasks.

Cancel and restore only change checkbox markers. If a cancelled marker is also configured as ignored or done, that marker setting determines whether the task is hidden or treated as complete.

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
