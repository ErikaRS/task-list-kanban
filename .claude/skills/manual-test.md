---
name: manual-test
description: Run manual test cases against the task-list-kanban Obsidian plugin using the sandbox vault and agent-browser CDP automation. Use when the user asks to test the plugin, run manual tests, verify test cases, or check plugin behavior in Obsidian.
allowed-tools: Bash(npx agent-browser:*), Bash(open -a "Obsidian":*), Bash(osascript:*), Read, Edit, Grep, Glob
---

# Manual Testing via Obsidian Sandbox

Test the task-list-kanban plugin in Obsidian's sandbox vault using agent-browser for CDP automation. The sandbox vault is ephemeral — changes are lost when closed.

## Setup

### 1. Quit and relaunch Obsidian with CDP

```bash
osascript -e 'tell application "Obsidian" to quit'
sleep 3
open -a "Obsidian" --args --remote-debugging-port=9222
sleep 6
npx agent-browser connect 9222
```

### 2. Open the sandbox vault

```bash
npx agent-browser tab  # list tabs — find the one you need
npx agent-browser press "Meta+p"
sleep 1
npx agent-browser keyboard type "Open sandbox vault"
sleep 0.5
npx agent-browser press Enter
sleep 3
```

Switch to the sandbox tab if needed:
```bash
npx agent-browser tab  # find the "Obsidian Sandbox" tab number
npx agent-browser tab <N>
```

### 3. Install the plugin

The sandbox vault starts fresh. Copy the built plugin and enable it:

```bash
SANDBOX="$HOME/Library/Application Support/obsidian/Obsidian Sandbox"
mkdir -p "$SANDBOX/.obsidian/plugins/task-list-kanban"
# Copy from dev vault (already has the latest build):
cp /Users/erikars/Documents/obsidian-plugin-dev/.obsidian/plugins/task-list-kanban/{main.js,manifest.json,styles.css} \
   "$SANDBOX/.obsidian/plugins/task-list-kanban/"
# Or copy a fresh build from the repo:
# cp /Users/erikars/Code/task-list-kanban/build/{main.js,manifest.json,styles.css} \
#    "$SANDBOX/.obsidian/plugins/task-list-kanban/"
echo '["task-list-kanban"]' > "$SANDBOX/.obsidian/community-plugins.json"
```

Then reload Obsidian to pick up the plugin:
```bash
npx agent-browser press "Meta+p"
sleep 1
npx agent-browser keyboard type "Reload app without saving"
sleep 0.5
npx agent-browser press Enter
sleep 5
npx agent-browser connect 9222
npx agent-browser tab  # switch back to sandbox tab if needed
```

A "Trust author and enable plugins" dialog appears on first load. Accept it:
```bash
npx agent-browser snapshot -i  # find the trust button ref
npx agent-browser click "<ref>"  # click "Trust author and enable plugins"
npx agent-browser press Escape  # close the settings that open after
```

### 4. Create test board files

Write `.md` files to `$SANDBOX/test-boards/` with `kanban_plugin` YAML frontmatter.

**CRITICAL pitfall**: The `scope` field must be a valid enum value: `"folder"`, `"everywhere"`, or `"selectedFolders"`. The value `"file"` does NOT exist and silently causes the entire settings JSON to fail zod validation, replacing ALL settings with defaults (wrong columns, wrong scope, etc.). This is the single biggest gotcha in test setup.

Example legacy board (for migration testing):
```bash
cat > "$SANDBOX/test-boards/My Test Board.md" << 'EOF'
---
kanban_plugin: '{"columns":["Today","In Progress","Blocked"],"scope":"folder","showFilepath":true,"consolidateTags":false,"uncategorizedVisibility":"auto","doneVisibility":"always","doneStatusMarkers":"xX","cancelledStatusMarkers":"-","ignoredStatusMarkers":"","savedFilters":[],"lastContentFilter":"","lastTagFilter":[],"lastFileFilter":[],"columnWidth":300,"flowDirection":"ltr","collapsedColumns":[],"defaultTaskFile":"","lastUsedTaskFile":"","scopeFolders":[],"excludePaths":[],"uncategorizedColumnName":"Uncategorized","doneColumnName":"Done"}'
---

- [ ] Buy groceries #today
- [ ] Fix login bug #in-progress
- [ ] Waiting on API key #blocked
- [ ] No tag task
- [x] Completed item #today
EOF
```

Color-suffixed columns (legacy format): `"Doing(#FF5733)"`, `"Review(0x3498DB)"`

Structured columns (post-migration format):
```json
[{"id":"column-today","label":"Today","matchMode":"name","matchTags":[]},
 {"id":"column-doing","label":"Doing","color":"#FF5733","matchMode":"name","matchTags":[]}]
```

## Navigation

Open files via Quick Switcher (most reliable method):
```bash
npx agent-browser press "Meta+o"
sleep 1
npx agent-browser keyboard type "My Test Board"
sleep 1
npx agent-browser press Enter
sleep 2
```

## Interacting with the board

### Screenshots and snapshots
```bash
npx agent-browser screenshot /tmp/test-result.png        # visual screenshot
npx agent-browser snapshot -i                              # interactive element refs
npx agent-browser snapshot -i -C                           # include cursor-interactive elements
npx agent-browser screenshot --annotate /tmp/annotated.png # numbered refs on screenshot
```

### Clicking elements
```bash
npx agent-browser snapshot -i  # get refs first
npx agent-browser click "e5"   # click by ref
```

### Opening settings
```bash
npx agent-browser snapshot -i | grep -i "settings\|gear\|options"
# The gear icon is typically near the top-right of the board view
npx agent-browser click "<gear-ref>"
```

### Modifying task files directly

Obsidian's file watcher picks up external edits in 1-2 seconds. This is the most reliable way to test tag matching:
```bash
SANDBOX="$HOME/Library/Application Support/obsidian/Obsidian Sandbox"
# Add a tag to a task:
sed -i '' 's/- \[ \] No tag task/- [ ] No tag task #today/' "$SANDBOX/test-boards/My Test Board.md"
sleep 2
npx agent-browser screenshot /tmp/after-edit.png
```

### Running JavaScript in Obsidian's context
```bash
npx agent-browser eval "document.querySelectorAll('.task-row').length"
npx agent-browser eval "Array.from(document.querySelectorAll('.task-row-right button')).length"
```

### Reading the board's frontmatter to verify migration
```bash
head -2 "$SANDBOX/test-boards/My Test Board.md" | tail -1 | \
  python3 -c "import sys, json; d=json.loads(sys.stdin.read().split(\"'\")[1]); print(json.dumps(d['columns'], indent=2))"
```

## Known limitations

1. **Native context menus are invisible.** The task card "..." menu uses Obsidian's `Menu` API which renders outside the web DOM. agent-browser cannot see or click menu items like "Move to column" or "Archive". Workaround: edit task files directly on disk to simulate moves.

2. **Drag and drop doesn't work** with agent-browser's ref-based selectors for Obsidian elements. Workaround: use settings UI or file edits.

3. **Sidebar file tree items** don't appear as interactive refs in snapshots. Use Quick Switcher (Cmd+O) instead.

4. **Multiple open vaults share a plugin process.** Settings or state from one vault can leak if both are active. Close other vault windows or be aware of cross-contamination.

## Verification checklist

After setting up, verify the environment is working:
- [ ] `npx agent-browser tab` shows the sandbox vault tab
- [ ] Screenshot shows "This is a sandbox vault" banner
- [ ] Test board file opens and renders as a kanban board (not raw markdown)
- [ ] Column headers match the columns defined in frontmatter
- [ ] Tasks appear in the correct columns based on their tags
- [ ] Editing a task file on disk updates the board within 2 seconds

## Test case locations

Manual test cases are defined in spec files under `specs/`. For SPEC_0018, the test cases cover:
- **Migration**: M1-M6 (legacy string → structured ColumnDefinition)
- **Name matching**: N1-N6 (label-derived tag matching)
- **Tags matching**: T1-T4 (single tag), A1-A8 (multi-tag AND)
- **Settings UI**: UI1-UI10
- **Validation**: V1-V8
- **Settings changes**: SC1-SC8
- **Rename**: R1-R3
- **Identity**: ID1-ID2
- **Reordering**: O1-O3
- **Color**: CO1-CO4
- **Tag stripping**: S1-S5
- **Headers**: H1-H3
- **Uncategorized/Done**: U1-U5
- **Archiving**: AR1-AR3
- **Conflict resolution**: C1-C2
