# Task List Kanban

The Task List Kanban is a free and open source Obsidian plugin that automatically imports all your 'tasks' within Obsidian files into a kanban view. This plugin was created to reduce duplication of effort when managing and prioritising tasks. Simply note down tasks using the 'task' format in any Obsidian file, and they will automatically appear in your Task List Kanban.

By adding tags to your tasks using '#', you can allocate tasks to specific columns in your kanban, as well as add additional tags for filtering. From the kanban view, you can easily move tasks between columns, cancel or restore tasks, archive tasks, apply or change filters, and even jump straight to the file where the task sits. Any change made to a task from the kanban view will also update the task in its file, and vice versa.

![Task List Kanban Screenshot](https://github.com/ErikaRS/task-list-kanban/assets/80379257/ddde01aa-3098-4cfc-8860-6af34f0ece57)

## Getting Started

### Creating Your First Kanban

Right click on the folder in which you want your Task List Kanban to appear. Choose 'New kanban'. Your new Task List Kanban file has been created!

![Creating a new kanban](https://github.com/ErikaRS/task-list-kanban/assets/80379257/fbe25c3f-824f-4feb-b1b3-5acbdf1c8901)

### Adding Tasks

Create a 'task' in any Obsidian file. Tasks will automatically appear in your kanban under the 'Uncategorised' column. The plugin supports tasks standard Markdown task markers (`-`, `*`, and `+`).

To assign a task to a specific column:

1. **In the file**: Add `#[column-name]` to your task text
2. **In the kanban**: Drag and drop the task to the desired column

The `#[column-name]` text won't be visible in the kanban view, keeping your tasks clean!

**Creating tasks from the kanban**: Click the **+ Add new** button at the bottom of any column. If a default task file is configured (in settings) or you've previously added a task, the text input appears immediately — no file picker needed. A small indicator below the button shows which file will be used. If no file is known yet, a file picker appears to choose where the task should be saved; that choice is remembered for next time. You can click **(change)** on the indicator to pick a different file.

### Basic Task Management

**Editing tasks**: Click any task text in the kanban view to edit it directly. Changes sync to the original file.

**Moving tasks**: Drag and drop between columns, or use the task's settings menu to select a column.

**Completing tasks**: Click the circle icon on each task card to quickly mark it as done and move it to the Done column. Click again on a completed task to uncheck it.

**Cancelling tasks**: Use the task menu to set a task to cancelled (`[-]`) with **Cancel task**. For cancelled tasks, the same menu item becomes **Restore task**, which sets the task back to incomplete (`[ ]`).

**Navigate to file**: Click the arrow icon or file path at the bottom of any task card to jump directly to that task in its source file.

## Configuration

### Setting Up Columns

Access settings via the settings icon in the top right corner of your kanban.

**Columns editor**: Manage columns directly in the **Columns** section of settings. You can rename columns, assign optional header colors, remove columns, and drag custom columns to reorder them. The built-in **Uncategorized** and **Done** rows stay fixed at the top and bottom of the list, and each has its own visibility setting.

![Column settings](https://github.com/user-attachments/assets/6b9f0e79-1cac-4976-b46b-577917d6d42c)

**Column Colors**: Enter a hex color like `#FF5733` in a column's **Color** field to tint its header.

**Renaming columns**: For standard name-based columns, renaming changes the derived placement tag. When you rename an existing column, settings can optionally update existing task tags to match the new name.

**Tag Mapping**: Column names are case-insensitive and ignore spaces when matching tags.
- "In Progress" matches tags like `#InProgress`, `#in-progress`, and `#In-Progress`.
- Nested tags like `#Parent/Child` are preserved and will map to a column named "Parent/Child".

**Column Width**: Adjust the width of all columns (200-600px) in the settings menu.

**Flow Direction**: Choose how columns are arranged:
- **Left to right** (default) - Columns flow horizontally, scrolling right
- **Right to left** - Columns flow horizontally in reverse order
- **Top to bottom** - Columns stack vertically, with cards flowing horizontally within each column
- **Bottom to top** - Columns stack vertically in reverse order

### Folder Scope

**This folder** (default): The kanban shows tasks from files in the same folder as the kanban file.

**Every folder**: The kanban shows tasks from your entire Obsidian vault.

**Selected folders**: The kanban shows tasks from specific folders you choose. When selected, a folder list appears where you can add vault-relative folder paths (e.g., `projects/active`). The board's own folder is always included and cannot be removed. Folders that don't exist in the vault are shown with a "(not found)" warning but are still saved (useful if the folder will be created later).

### Excluded Paths

You can exclude specific directories or files from the kanban's scope. Add paths in the "Excluded paths" setting (e.g., `templates` or `notes/scratch.md`). Excluded paths are applied after the folder scope, so they work with all three scope modes.

The board's own folder is always protected — you cannot exclude it directly. However, you can exclude subdirectories within it.

Change these settings in the kanban's settings menu.

## Advanced Features

### Task Status Customization

Task status visuals are inherited from your active Obsidian theme/plugin CSS for markdown checkboxes.

**Done Status Markers**: Customize which characters mark tasks as completed. By default, tasks marked with 'x' or 'X' are considered done, but you can configure any combination of single character markers (including Unicode/emoji).

Examples:
- `xX` (default) - Recognizes `[x]` and `[X]` as done
- `xX✓` - Also recognizes `[✓]` as done
- `✅👍` - Use emoji markers

**Ignored Status Markers**: Configure characters that mark tasks to be completely ignored by the kanban. This is useful for cancelled or irrelevant tasks.

Examples:
- Leave empty (default) - All task-like strings are processed
- `-` - Tasks like `[-] Cancelled task` are ignored
- `-~` - Tasks with `[-]` or `[~]` are ignored
- `❌` - Tasks like `[❌] Not relevant` are ignored

**Cancel/Restore + marker settings**: Cancel and restore actions only change checkbox markers (`[-]` and `[ ]`). What happens next on the board is still controlled by your status marker settings. For example, if `-` is in ignored markers, cancelled tasks are hidden; if `-` is in done markers, cancelled tasks are treated as done.

### Tagging and Filtering

**Adding tags**: Add `#[tag-name]` anywhere in your task text. Tags appear in both the kanban and original files.

**Filtering**: Use the filters sidebar (toggle with the ◂/▸ button) to show only tasks with specific criteria. You can filter by:
- **Content**: Search for tasks containing specific text
- **Tags**: Select one or multiple tags to filter tasks
- **Files**: Select specific files to show only tasks from those files

**Saved Filters**: Save frequently used filter combinations for quick access:
1. Set up your desired content, tag, and/or file filters in the sidebar
2. Click the "Add" button to save the current filter combination
3. Your saved filters appear under "Saved filters" and can be activated with one click
4. Remove saved filters by clicking the ✕ button next to each one

![Filters view](https://github.com/user-attachments/assets/da40a567-d638-43a3-aedd-7ffe8112adc4)

**Tag consolidation**: Enable "Consolidate tags" in settings to move all non-column tags to the task footer for cleaner display.

### Advanced Task Management

**Bulk operations**: Each column header has a **Done / Select** toggle:

- **Done mode** (default) — clicking the circle icon on a task card marks it complete and moves it to the Done column.
- **Select mode** — clicking the square icon on a task card selects it (highlighted with an accent border). Select as many tasks as you like across the column.

Once tasks are selected, a count ("N selected") appears under the column title and a **⋯** menu button appears. The menu lets you:
- **Move selected to Done** — mark all selected tasks complete at once.
- **Move selected to [Column]** — move all selected tasks to any other column.
- **Cancel selected / Restore selected** — cancel selected tasks (`[-]`) or restore them (`[ ]`) when all selected tasks are already cancelled.
- **Archive selected** — archive all selected tasks in one action.

You can also **drag** any selected task to a different column and all selected tasks in that column will move together. The Done column has an additional option to archive all tasks at once.

**Duplicating tasks**: Use the task menu to duplicate a task. The duplicate is inserted directly below the original in the source file, with its checkbox reset to unchecked. Content, tags, column assignment, and formatting are all preserved.

**Archive tasks**: Use the task settings menu (or bulk actions) to archive completed tasks. This marks them as done and removes them from the active kanban while preserving them in the original file.

**Task formatting**: The plugin preserves original indentation and formatting when moving tasks between columns.

### Visibility Controls

**Collapsing columns**: Click the **▼** button in any column header to collapse it. A collapsed column shrinks to a narrow strip showing only the column name and task count, freeing up space for the columns you're actively working in. Click **▶** to expand it again. Collapse state is saved automatically, so columns stay collapsed across sessions.

**Uncategorised column**: Choose when to show tasks without column assignments:
- Hide when empty (default)
- Always show
- Never show

**Done column**: Control visibility of the completed tasks column with the same options.

## Development

### Prerequisites
- Node.js and npm
- Obsidian for testing

### Setup
1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start development mode
4. Copy the built plugin to your Obsidian plugins folder for testing

For detailed Obsidian plugin development guidance, see the [official plugin development guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin).

### Testing
- Run `npm test` to execute the test suite
- The project includes comprehensive tests for task parsing, validation, and kanban functionality

### Deployment

When ready to make a new deployment:

1. Bump the version (updates `package.json`, `manifest.json`, and `versions.json`, then commits and tags):
   ```bash
   npm version patch   # or minor / major
   ```
2. Push the commit and tag:
   ```bash
   git push origin main
   git push origin <tag>
   ```
3. Wait for the GitHub Action to create a draft Release with built assets (`main.js`, `manifest.json`, `styles.css`)
5. Go to the [releases page](https://github.com/ErikaRS/task-list-kanban/releases)
6. Edit the draft created by `github-actions` for that tag, paste in your release notes, and publish
7. Do not create a release draft manually (`gh release create` or UI), or you may end up with duplicate drafts and missing assets
