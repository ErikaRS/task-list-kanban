Status: COMPLETE

# SPEC 0056 — Plain Markdown Task Content

## Feature Request Summary

Refs [#210](https://github.com/ErikaRS/task-list-kanban/issues/210): newlines entered in task notes were stored as `<br />` instead of physical source lines. Task descriptions and notes should use ordinary Markdown throughout creation, editing, rendering, and source actions.

Implementation and automated checks are verified, and the owner approved the editing behavior for commit on 2026-11-22. Broader native Obsidian, theme, and physical mobile acceptance remains open. No proactive legacy migration is included.

This spec supersedes SPEC 0009's newline codec and SPEC 0025's row-per-node and blank-line ownership rules where they conflict with Markdown structure. Existing task status and metadata rules otherwise apply.

## User Requirements

1. Save newlines as physical Markdown lines, preserving intentional whitespace, escapes, hard breaks, paragraphs, lists, quotes, and code.
2. Render through Obsidian's Markdown renderer. A soft source newline need not produce a visible hard break.
3. Keep each rendered item separately editable. Parent text edits exclude existing nested items and later blocks; descendants and siblings stay visible and interactive.
4. Expose a nested item's own list/checkbox marker as plain text in its editor. Changing `- Note` to `- [ ] Note`, changing bullet style, or removing the marker must persist and be reclassified on reload.
5. Keep nested tasks visible and interactive in either nested-task mode. When the setting is off, they also remain independently extracted board cards.
6. Keep marker-to-text spacing compact without overriding Markdown's internal block formatting.
7. Preserve complete Markdown ownership through duplicate, move, delete, reorder, archive, and restore, including paragraphs separated by blank lines.
8. Leave existing legacy `<br />` content untouched until its first saved text edit. Opening/cancelling an editor, rendering, and header-only actions must not migrate it.
9. Retain drafts on failed or stale saves; preserve unrelated source, formatting, and metadata. Keep platform submission gestures and mobile combined text/date saves.

## High-Level Design

### Shared Markdown source model

`markdown_source.ts` uses `mdast-util-from-markdown` for block/list positions. The existing header parser recognizes supported task statuses only inside real Markdown list items. YAML, code, HTML blocks, and blockquotes do not generate task cards. Custom status markers remain supported.

`MarkdownSource` retains exact offsets, raw source, row bounds, structural indentation, continuation prefix, list prefix, leading-block bounds, children, and reference definitions. The syntax tree supplies positions only; it is never serialized back to the vault.

Build the source tree in both nested-task modes. The setting controls independent card extraction and existing descendant-filter semantics. Tags, properties, grouping, placement, and task identity continue to use the task's own header.

### Item editors with disjoint source ranges

Preview and editing share `editableMarkdownSource`. For a list item, this selects its leading paragraph/block and excludes separately rendered children and later blocks. Other Markdown blocks retain their complete span. Structural actions still use the full source item.

- The parent editor uses `markdownBody` and `replaceMarkdownBody`: its outer task wrapper remains managed, while header text, tags, properties, block ID, and paragraph continuation lines are editable.
- Nested editors use `markdownBlock` and `replaceMarkdownBlock`: remove only the parent container indentation and expose the item's own marker literally.
- Later paragraphs, quotes, and code blocks have their own block editors. Multiline blocks are not split into physical-row editors.
- Existing descendants and siblings stay visible during editing. No existing text appears in both a parent field and a child field.
- `MarkdownBodyEditor` owns desktop draft/save/error behavior. `MobileEditorSheet` provides the shared mobile surface; the parent wrapper adds date controls.

For example:

```markdown
- [ ] Plan release
  First note line

  Another paragraph.

  - [ ] Check package
    Child note
```

The parent field contains `Plan release` and `First note line`. The later paragraph has its own field. The child field contains `- [ ] Check package` and its indented `Child note`. Editing the parent leaves both other blocks intact.

### Validated source writes

An editor captures its exact source span when opened. Text saves validate that slice against the current file, then replace only that span through `Vault.process` where available. A changed task ID, stale offset, or stale source produces an error and retains the draft rather than overwriting newer content.

Header-only actions remain surgical. Full-item structural actions use complete Markdown spans. Multi-range replacements are validated against one revision and applied from the end of the file. Reparse after successful writes rather than reusing row indexes after line-count changes.

Preserve BOM, line-ending convention, final-newline convention, unrelated bytes, and untouched header formatting. An unchanged Markdown draft skips the write. Mobile parent text/date changes are combined into one replacement against the captured snapshot.

### Rendering and controls

Render each block with its source path and shared reference definitions. Keep normal Markdown soft breaks and code whitespace. Remove the generated outer list wrapper from source-row previews because the row supplies its marker; preserve inner block formatting and normalize direct paragraph spacing under the plugin root.

Attach status controls to actual parsed task nodes. Disable incidental checkbox inputs inside rendered examples; do not map task actions by checkbox ordinal. Preserve links, source navigation, keyboard access, progress, selection, and drag/reorder behavior.

`TaskSourceRows` renders all nested nodes in either mode. With nested mode on, roots are cards with inline children and progress. With it off, children stay inline and also have independent cards; the setting does not filter children out of parent previews.

## Detailed Behavior

### Markdown ownership and formatting

- A list item's parsed span includes continuation paragraphs and nested blocks. A blank line alone does not terminate ownership.
- Following siblings and unrelated separators remain outside that span.
- Accept existing lazy continuation without rewriting it on load or unchanged save. New continuation text receives structural indentation.
- Deindent/reindent only the containing block. Preserve relative indentation, tabs, backslashes, trailing spaces, blank lines, and code contents. Do not trim the full draft.
- Require nonempty text on the first line. Empty drafts do not implicitly delete items; explicit delete controls remain available.
- Newly created tasks use the shared Markdown builder, with metadata on the first line and continuation text indented inside the list item.

### Existing legacy breaks

There is no vault scan or load-time migration. Opening a text editor converts exact old `<br />` HTML tokens in that editable span into draft newlines. Saving persists the conversion even if no further typing occurred. Cancel leaves the original bytes intact. Separately rendered children migrate only when their own text edit is saved.

Inline/fenced/indented code, escapes, and link destinations/titles retain literal text. Other spellings, such as `<br>`, `<br/>`, and uppercase HTML, follow normal Markdown/HTML behavior. Intentional HTML with the exact legacy spelling is indistinguishable from the old codec and receives the same conversion on text save.

Recognized tags, schema properties, and block IDs after an encoded break retain their header role on migration. Status, column, archive/restore, date-only, and other header actions do not migrate legacy text.

### Editing interactions

- Activate parent text to edit its leading block. Activate a nested item to edit its own Markdown, including its marker. Existing descendants and later blocks remain separate.
- Marker conversion/removal changes source classification after parsing. It must not delete or duplicate sibling/descendant source.
- Subtask checkbox activation cycles status without opening a text editor, in every card-action mode including Select. Parent editing must not remove those controls.
- A failed subtask status change or drag move shows a notice with the reason; it never fails silently.
- Desktop Enter saves and Shift+Enter inserts a newline. Existing desktop Escape/blur submission behavior is retained. Mobile Enter inserts a newline; Save or Ctrl/Cmd+Enter submits and Cancel discards.
- Prevent duplicate submission. Failed/conflicting saves retain the draft and offer retry/cancel. Disable dragging the actively edited item.
- Explicit mobile date controls win when the same date is edited in source text. Merge dates on the first line, preserving hard-break whitespace.

### Source actions and creation

| Action | Source behavior |
| --- | --- |
| Status, dates, column/tag/text/property changes, pin | Transform only the selected header; preserve body bytes. |
| Parent text edit | Replace its captured leading block, restoring its managed task wrapper. |
| Nested text edit | Replace its captured block, including the marker literally entered. |
| Duplicate | Copy the full item, preserving existing root-only status/block-ID reset rules. |
| Delete | Remove the full item without consuming a following sibling or unrelated separator. |
| Move between files | Write the full destination item first; validate the source again before removing it. |
| Reorder/reparent | Move the full node span and adjust structural indentation while preserving relative Markdown indentation. |
| Archive scan/restore | Share parsing boundaries, retain bounded paging/cancellation, and restore through a header-only change. |

When a structural selection includes an ancestor and descendant, copy/delete the ancestor span once. Apply requested header changes to explicitly selected descendants within that copied span. Header-only bulk operations may target both independently.

Desktop inline creation, mobile creation, Add card, file/group destinations, heading placement, and daily notes share the builder and physical-newline policy. Metadata belongs on the header, including when drafts contain multiple blocks.

## Test Plan

Keep decision matrices at their owning layer and representative interaction checks at the component boundary. Retain existing failed-write, race, source-formatting, and compatibility regressions.

| Suite | Regression risks covered |
| --- | --- |
| `markdown_source.tests.ts` | Markdown boundaries, task contexts, container round trips, editable/full span separation, literal markers, legacy migration protections. |
| `tasks.tests.ts` | Extraction in both nested modes and retained source ownership. |
| `source_line_editor.tests.ts` | Validated writes, stale rejection, unchanged writes, BOM/EOL/final-newline preservation, failures. |
| `actions.tests.ts` | Exact parent/nested edits, full structural spans, overlapping selections, stale child rows, header preservation, failed destination writes. |
| `archive_reader.tests.ts` | Shared parsing, multiline paging boundaries, bounded scans, restore preservation. |
| `task_line_builder.tests.ts` | Real newlines, relative indentation, hard-break whitespace, first-line metadata. |
| `task_markdown.tests.ts` | Literal Markdown rendering input and shared reference context. |
| `task_markdown_editing.tests.ts` | Real desktop/mobile actions, disjoint fields, child interaction in both modes, marker conversion/removal, cancellation, failed/stale drafts, combined dates, wrapper/link handling. |
| Existing creation suites | Representative Markdown handoff for desktop, mobile, and Add card without repeating the builder matrix. |

Generic sheet lifecycle coverage stays in `mobile_editor_sheet.tests.ts`. Renderer mocks do not establish native theme layout.

### Manual acceptance

- ✅ Create/edit soft and hard breaks, multiple paragraphs, lists, quotes, and fenced code. Inspect source, reload, and compare with Obsidian's normal rendering.
- ✅ Edit the parent while children stay visible. Save a title change and verify child Markdown/status are retained without duplicated editor content.
- ✅ Edit nested bullets/tasks individually, including deep nesting. Convert bullet to checkbox, checkbox to bullet, change bullet style, and remove the marker. Verify siblings and descendants after reload.
- ✅ Toggle nested checkboxes, inspect progress, add/delete/reorder items, navigate links/source, and use selection in both modes. Confirm children stay inline and independent cards appear when the setting is off.
- ✅ Check compact marker spacing, long lines, code blocks, focus, and controls at narrow widths in the current and an alternate theme. Check light/dark modes for color changes.
- ✅ Load/preview legacy breaks and change status/dates/columns without migration. Open/cancel a text edit, then save it. Confirm only that editable block migrates and code/escaped breaks remain literal.
- ✅ On mobile, create/edit/cancel nested and parent drafts, save text with dates, and exercise keyboard submission. Verify keyboard visibility and recovery after a failed save.
- ✅ Edit source externally while a draft is open. Confirm conflicting save retains the draft and newer source; reopen against current source to resolve.
- ✅ Duplicate/move/delete/archive/restore a multiline item beside unrelated prose. Include ancestor/descendant selection, verify exact boundaries, and inspect archive paging.
- ✅ Review other board layouts and archived cards for source-block rendering and controls.

## Implementation Plan

### Phase 1: Markdown authoring and reload — automated slice verified

**Goal:** Create/edit real multiline Markdown and recover it on reload in either mode.

1. ✅ Share source-positioned parsing, container conversion, first-line metadata, and validated writes.
2. ✅ Route creation through the Markdown builder and combine mobile text/date saves.
3. ✅ Preserve legacy files until a text edit is saved; retain protected literal contexts.
4. ✅ Exercise parser, builder, write, persistence, and editor/creation wiring regressions.

**Deliverable:** Plain Markdown storage with unchanged-source and failed-save protection.

**Implemented by:** The implementation commit introducing this spec; Refs #210.

### Phase 2: Independent nested editing and complete actions — automated slice verified

**Goal:** Keep nested items interactive and separately editable without overlapping parent fields.

1. ✅ Share the editable-span projection between preview and editing; expose nested markers literally.
2. ✅ Render inline children in both modes and preserve status/link controls during parent editing.
3. ✅ Use full spans for structural actions and archive parsing; protect overlapping selections and stale writes.
4. ✅ Verify marker conversion/removal, desktop/mobile saves, source integrity, and list-wrapper interaction through focused tests.

**Deliverable:** Item-level Markdown editors and complete source actions with compact preview structure.

**Implemented by:** The implementation commit introducing this spec; Refs #210.

### Phase 3: Review and acceptance ✅ COMPLETE

**Goal:** Leave one consistent implementation and document verified behavior and remaining native checks.

1. ✅ Remove obsolete codecs, redundant editor paths, and superseded design language. Share desktop draft handling and editable source projections.
2. ✅ Update README and architecture documentation; link the new rules from historical specs without rewriting their history.
3. ✅ Run the final build, complete tests, lint, and style checks. Prepare verified assets for development-vault review.
4. ✅ Complete native/theme/mobile acceptance above. Owner confirmed all manual checks on 2026-11-23.

**Deliverable:** Reviewable code and documentation, with native acceptance recorded accurately.

**Implemented by:** The implementation commit introducing this spec; owner manual acceptance 2026-11-23.

## Validation Record

- `npm run build`: passed after cleanup; Svelte checks reported zero errors and zero warnings.
- `npm test`: 75 files and 1,168 tests passed in 3.20 seconds after cleanup.
- `npm run lint` and `npx stylelint styles.css`: passed after cleanup.
- Copied `main.js`, `manifest.json`, and `styles.css` into the development vault's plugin directory and verified matching SHA-256 hashes.
- Production dependency audit: zero vulnerabilities. Full audit: 13 moderate findings in existing development tooling; no audit fixes applied.
- Native Obsidian access was not approved during this session. No native visual result is inferred from DOM tests. The owner completed all manual acceptance checks in native Obsidian on 2026-11-23.

### Release-note draft

- Save multiline descriptions and notes as plain Markdown, retaining attached paragraphs, lists, and code through source actions. Edit nested markers directly while keeping subtask controls available. Refs [#210](https://github.com/ErikaRS/task-list-kanban/issues/210).
- Existing legacy `<br />` breaks convert only when that item's text edit is saved. Code and escaped text remain literal; task-header metadata stays on its header.
