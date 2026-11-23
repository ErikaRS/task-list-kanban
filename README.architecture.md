# Architecture Guide

## Project Structure
- `src/entry.ts` - Plugin entry point
- `src/ui/` - Svelte UI components and views
- `src/ui/tasks/` - Task model, store, and actions
- `src/parsing/` - Parsing utilities (tags, kebab case)
- `src/ui/settings/` - Settings store and configuration
- `specs/` - Design documents (tracked in git)
- `tmp_specs/` - Temporary planning artifacts (gitignored)

## System Architecture

This plugin follows a modular architecture with clear separation between parsing, UI, and business logic layers.

### Core Components

**Plugin Entry** (`src/entry.ts`)
- Main plugin class extending Obsidian's Plugin
- Handles view registration and file menu integration
- Manages plugin lifecycle and workspace events

**View Layer** (`src/ui/`)
- `text_view.ts`: Main view controller extending TextFileView
- `main.svelte`: Primary Svelte component for the kanban interface
- Component-based UI with reactive stores for state management

**Desktop Board Rendering** (`src/ui/board/`)
- `board_matrix.ts` retains the canonical category × group matrix and semantic visibility rules.
- `desktop_matrix_projection.ts` selects visual axes and resolves each intersection back to canonical buckets and cells.
- `DesktopMatrixGrid.svelte` owns tracks, continuous row bands, sticky layers, collapse geometry, and visual-role typography without branching on semantic kind or flow.
- `DesktopAxisHeader.svelte` supplies category controls or group labels; category accents use the full-width decoration slot for visual columns and the left edge for visual rows.
- `board_matrix_desktop.svelte` connects the projection, header adapters, and unchanged `BoardCell` task interactions. Mobile retains its separate list renderer.

**Task Management** (`src/ui/tasks/`)
- `task.ts`: Core Task model with parsing and serialization
- `markdown_source.ts`: Source-positioned Markdown item/block parsing, reversible container indentation, and legacy-break conversion limited to text-edit drafts
- `store.ts`: Reactive task store with file system integration
- `actions.ts`: Task manipulation operations (move, done, cancel/restore, archive, delete)

**Parsing Layer** (`src/parsing/`)
- `text_literals/`: Shared case-sensitive token matching, validation, and surgical text edits for column placement and swimlanes. Task parsing retains original content for lane matching; card rendering keeps matched text literals visible in task descriptions.
- `kebab/`: String normalization utilities for consistent naming
- `tags/`: Tag extraction and processing from task content

**Configuration** (`src/ui/settings/`)
- Settings store with reactive updates
- Column management and color configuration
- Scope and filtering preferences

### Data Flow

```
Obsidian Files → File System Events → Task Parsing → Reactive Stores → Svelte UI
                     ↓                                    ↑
                 Task Actions ← User Interactions ← UI Components
```

**File Monitoring**: The plugin watches for file changes using Obsidian's vault events and automatically updates the task store when markdown files are modified.

**Task Parsing**: `mdast-util-from-markdown` supplies Markdown list-item and block positions. The existing task-header parser recognizes supported checkbox/status markers only within real list items; code, YAML, HTML blocks, and blockquotes do not create task cards. Source spans and continuation bodies are retained in both nested-task modes. The setting controls card extraction and descendant filter behavior. Tags, placement, and properties remain tied to the task's first source line.

**State Management**: Svelte stores provide reactive state management, automatically updating the UI when tasks or settings change.

**Bidirectional Sync**: Changes made in the kanban UI are serialized back to the original markdown files, maintaining consistency between the kanban view and file content.

**Write Paths**: Actions preserve raw Markdown rather than serializing the display model:
- Header changes (`editTaskSourceRows` / `editTasks`) transform only the selected raw header. Columns, status, dates, priority, and tag/text/property swimlane changes preserve the continuation body.
- Text edits use validated source-range replacements. An editor captures only its rendered block's editable span and exact source when opened; the write rejects stale content even when a body-only edit leaves the task ID unchanged. Replacements use `Vault.process` where available, preserve the file's line-ending convention, and skip unchanged saves. Mobile parent-text/date edits are combined in one replacement.
- Structural actions use complete Markdown item/block spans, including blank-separated paragraphs and code. Moves coalesce selected ancestor/descendant spans, write the destination before deleting the source, and validate the source again before removal. Row-based structural helpers preserve BOM and line-ending conventions.

The Markdown AST supplies positions only; it is never serialized back to the vault. Legacy `<br />` conversion occurs only in text-edit drafts and is persisted by saving that edit. Indexing, rendering, and header-only actions do not migrate files. Archive scans share the same source parsing and cache at most one file's syntax positions while retaining paginated Task objects.

**Item Editing**: Preview and editing share `editableMarkdownSource`: a list
item's leading paragraph/block is editable separately from its descendants
and later blocks. The parent editor restores its managed task wrapper;
nested item editors expose their own list/checkbox markers through
`markdownBlock` and write them literally through `replaceMarkdownBlock`.
Desktop fields share `MarkdownBodyEditor`; mobile fields share
`MobileEditorSheet`, with the parent wrapper adding date controls.
`TaskSourceRows` renders all nested nodes in either board mode. The nested-task
setting controls independent card extraction, rather than removing rows from
the parent's source preview. A generated outer list wrapper is unwrapped
because the row supplies its own marker; inner Markdown retains its formatting.

### Key Design Patterns

- **Observer Pattern**: File system events trigger task store updates
- **Brand Types**: Type-safe string validation for markers and identifiers
- **Reactive Stores**: Svelte-based state management for UI consistency
- **Command Pattern**: Task actions encapsulate operations for undo/redo support
