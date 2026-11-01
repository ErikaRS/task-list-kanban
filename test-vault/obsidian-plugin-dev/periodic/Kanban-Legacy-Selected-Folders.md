---
kanban_plugin: '{"scope":"everywhere","showArchivedColumn":false,"newTaskPosition":"top","lastUsedTaskFile":"$DAILY_NOTE","dailyNotePath":"{{YYYY-MM-DD}}.md","scopeFolders":["tasks","snippets"],"groupSource":{"kind":"text","literals":["[[Project
  B]]"]},"columns":[{"id":"column-new-column","label":"@home","matchMode":"text","matchTags":[]},{"id":"column-new-column-2","label":"Office","matchMode":"text","matchTags":[]},{"id":"column-new-column-3","label":"[[Project
  A]]","matchMode":"text","matchTags":[]}]}'
---

# Legacy Selected Folders

This board intentionally has no `kanban_plugin_path_scope_v2` sidecar. It is
the manual fixture for testing conversion from the legacy Selected folders
scope: its own `periodic` folder is implicit, and `tasks` plus `snippets` are
the additional legacy sources.

- [ ] Task in the legacy board folder
