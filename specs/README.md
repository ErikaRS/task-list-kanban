# Specification index

Reviewed: 2026-10-17

Active specs stay here until their required implementation and validation are complete. A shipped feature can remain `IN_PROGRESS` when manual acceptance checks are still open. `Implemented` dates record when code landed, not when every acceptance check passed.

## Active work and remaining validation

| Spec | Issue | State | Remaining work |
| --- | --- | --- | --- |
| [0044 — Filter negation and OR](SPEC_0044__IN_PROGRESS__FILTER_NEGATION_AND_LIMITED_OR.md) | [#169](https://github.com/ErikaRS/task-list-kanban/issues/169) | Merged; validation pending | Manual bar/editor and saved-view checks; large-board benchmark. |
| [0045 — Mobile task lists and shared editor](SPEC_0045__IN_PROGRESS__MOBILE_DENSITY_AND_EDITOR_CONSISTENCY.md) | [#176](https://github.com/ErikaRS/task-list-kanban/issues/176) | Merged; validation pending | Device keyboard, touch, theme, accessibility, and density validation. |
| [0046 — Reschedule overdue tasks](SPEC_0046__IN_PROGRESS__RESCHEDULE_OVERDUE_TO_TODAY.md) | [#193](https://github.com/ErikaRS/task-list-kanban/issues/193) | Merged; validation pending | Tasks/Dataview vault checks and header-button interaction checks. |
| [0049 — Inherit swimlane properties](SPEC_0049__IN_PROGRESS__NEW_TASKS_INHERIT_LANE_PROPERTY.md) | [#188](https://github.com/ErikaRS/task-list-kanban/issues/188) | Merged; validation pending | Remaining Tasks/Dataview, Unassigned-lane, and mobile vault checks. |
| [0050 — Archived task column](SPEC_0050__IN_PROGRESS__ARCHIVED_TASK_COLUMN.md) | [#174](https://github.com/ErikaRS/task-list-kanban/issues/174) | Planned | Planned; implementation, performance measurements, and validation not started. |
| [0051 — Advance card action](SPEC_0051__IN_PROGRESS__ADVANCE_CARD_TO_NEXT_COLUMN.md) | [#163](https://github.com/ErikaRS/task-list-kanban/issues/163) | Merged; validation pending | Manual workflow, persistence, keyboard, grouped/reversed, and mobile checks. |

## Completed and historical specs

Completed specs are in [`complete/`](complete/); SPEC 0031 is retained there as obsolete history.

- [0001 — Saved Filters Feature Design](complete/SPEC_0001__COMPLETE__FILTER_SAVE_DESIGN.md)
- [0002 — File Filter Feature Design](complete/SPEC_0002__COMPLETE__FILE_FILTER_DESIGN.md)
- [0003 — Filter Styling Improvements](complete/SPEC_0003__COMPLETE__FILTER_STYLING_IMPROVEMENTS.md)
- [0004 — Task Interaction Controls Design](complete/SPEC_0004__COMPLETE__TASK_INTERACTION_CONTROLS.md)
- [0005 — Column Width and Direction Configuration](complete/SPEC_0005__COMPLETE__COLUMN_WIDTH_AND_DIRECTION.md)
- [0006 — Collapsible Columns & Task Counts](complete/SPEC_0006__COMPLETE__COLLAPSIBLE_COLUMNS.md)
- [0007 — Cancel Task Design](complete/SPEC_0007__COMPLETE__CANCEL_TASK_DESIGN.md)
- [0008 — Configurable Cancelled Status Markers](complete/SPEC_0008__COMPLETE__CONFIGURABLE_CANCEL_STATUS_MARKERS.md)
- [0009 — Plugin/Theme Status Styling Compatibility](complete/SPEC_0009__COMPLETE__PLUGIN_THEME_STATUS_STYLING.md)
- [0010 — Default Task File for "Add New"](complete/SPEC_0010__COMPLETE__DEFAULT_TASK_FILE.md)
- [0011 — Multi-Folder Scope](complete/SPEC_0011__COMPLETE__MULTI_FOLDER_SCOPE.md)
- [0012 — Exclude Paths](complete/SPEC_0012__COMPLETE__EXCLUDE_PATHS.md)
- [0013 — Sticky Save Button + Dirty Check for Settings Modal](complete/SPEC_0013__COMPLETE__STICKY_SAVE_DIRTY_CHECK.md)
- [0014 — Inline Task Creation](complete/SPEC_0014__COMPLETE__INLINE_TASK_CREATION.md)
- [0015 — One-Click Add Task](complete/SPEC_0015__COMPLETE__ONE_CLICK_ADD_TASK.md)
- [0016 — Duplicate Task](complete/SPEC_0016__COMPLETE__DUPLICATE_TASK.md)
- [0017 — Rename Default Columns (Uncategorized & Done)](complete/SPEC_0017__COMPLETE__RENAME_DEFAULT_COLUMNS.md)
- [0018 — Column Tag Mapping and Structured Column Settings](complete/SPEC_0018__COMPLETE__COLUMN_TAG_MAPPING.md)
- [0019 — SPEC 0019 — Board Matrix Rendering Architecture](complete/SPEC_0019__COMPLETE__BOARD_MATRIX_RENDERING.md)
- [0020 — SPEC 0020 — Task Properties and Ordering](complete/SPEC_0020__COMPLETE__TASK_PROPERTIES_DESIGN.md)
- [0021 — SPEC 0021 — Group By and Swim Lanes](complete/SPEC_0021__COMPLETE__GROUP_BY_SWIMLANES_DESIGN.md)
- [0022 — SPEC 0022 - Transposed Vertical Board Grid](complete/SPEC_0022__COMPLETE__TRANSPOSED_VERTICAL_BOARD_GRID.md)
- [0023 — SPEC 0023 - Deeper Date Support](complete/SPEC_0023__COMPLETE__DEEPER_DATE_SUPPORT.md)
- [0024 — SPEC 0024 - Column Property Matching](complete/SPEC_0024__COMPLETE__COLUMN_PROPERTY_MATCHING.md)
- [0025 — SPEC 0025 - Parsed Subtask Display](complete/SPEC_0025__COMPLETE__SUBTASK_DISPLAY.md)
- [0026 — SPEC 0026 - Tag Group Include List](complete/SPEC_0026__COMPLETE__TAG_GROUP_INCLUDE_LIST.md)
- [0027 — SPEC 0027: Surgical Column Change (migrate changeColumn off the rewrite path)](complete/SPEC_0027__COMPLETE__SURGICAL_COLUMN_CHANGE.md)
- [0028 — SPEC 0028: Date filters with $TODAY, and overdue smooshing for date groups](complete/SPEC_0028__COMPLETE__DATE_FILTERS_AND_OVERDUE_GROUPING.md)
- [0029 — SPEC 0029: Unified filter search bar](complete/SPEC_0029__COMPLETE__UNIFIED_FILTER_SEARCH_BAR.md)
- [0030 — SPEC 0030: Global Settings, Saved Views, Tabs, and Dashboard](complete/SPEC_0030__COMPLETE__GLOBAL_SETTINGS_AND_SAVED_VIEWS.md)
- [0031 — Card Layout Orientation](complete/SPEC_0031__OBSOLETE__CARD_LAYOUT_ORIENTATION.md)
- [0032 — SPEC 0032: Tabbed Board Navigation](complete/SPEC_0032__COMPLETE__TABBED_BOARD_NAVIGATION.md)
- [0033 — SPEC 0033: Board Dashboard Panel](complete/SPEC_0033__COMPLETE__BOARD_DASHBOARD.md)
- [0034 — SPEC 0034: Board Rail](complete/SPEC_0034__COMPLETE__BOARD_RAIL.md)
- [0035 — SPEC 0035: Board Creation Surfaces](complete/SPEC_0035__COMPLETE__BOARD_CREATION_SURFACES.md)
- [0036 — SPEC 0036: Dashboard Attention Counts](complete/SPEC_0036__COMPLETE__DASHBOARD_ATTENTION_COUNTS.md)
- [0037 — SPEC 0037: Board and Selected Card Commands](complete/SPEC_0037__COMPLETE__BOARD_AND_SELECTED_CARD_COMMANDS.md)
- [0038 — SPEC 0038 — Mobile Board Layout](complete/SPEC_0038__COMPLETE__MOBILE_BOARD_LAYOUT.md)
- [0039 — SPEC 0039 - Status-Based Archiving](complete/SPEC_0039__COMPLETE__STATUS_BASED_ARCHIVING.md)
- [0040 — SPEC 0040 — Collapsible Swimlanes](complete/SPEC_0040__COMPLETE__COLLAPSIBLE_SWIMLANES.md)
- [0041 — SPEC 0041 — Shared Desktop Axis Rendering](complete/SPEC_0041__COMPLETE__SHARED_DESKTOP_AXIS_RENDERING.md)
- [0042 — SPEC 0042: Included Path Scope and Date Templates](complete/SPEC_0042__COMPLETE__INCLUDED_PATH_SCOPE_AND_DATE_TEMPLATES.md)
- [0043 — Open Filtered Source Files](complete/SPEC_0043__COMPLETE__OPEN_FILTERED_SOURCE_FILES.md)
- [0047 — Property filters](complete/SPEC_0047__COMPLETE__PROPERTY_FILTERS.md)
- [0048 — SPEC 0048 - Keep Column Tag On Completion](complete/SPEC_0048__COMPLETE__KEEP_COLUMN_TAG_ON_COMPLETION.md)

## Numbering and maintenance

- Numbers are global across active and completed specs. The next unused number is **0052**.
- Advance Card was originally also numbered 0043. It is now **0051**; **0043** remains Open Filtered Source Files. Historical commits retain the old filename.
- Keep implementation links current and leave unverified manual checks unchecked. Move a spec into `complete/` and change its status only after its required checks are verified.
- Follow [the planning guide](../README.planning.md) for new specs.
