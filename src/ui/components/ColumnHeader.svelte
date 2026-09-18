<script lang="ts">
	import { Menu } from "obsidian";
	import {
		type ColumnTag,
		type DefaultColumns,
		type ColumnTagTable,
		type ColumnColourTable,
		type ColumnMatchTagTable,
		type ColumnSubtitleTable,
		isColumnTag,
		resolveDefaultColumnName,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import IconButton from "./icon_button.svelte";
	import {
		selectionModeStore,
		isInSelectionMode,
		toggleSelectionMode,
	} from "../selection/selection_mode_store";
	import {
		taskSelectionStore,
		getSelectedTaskCount,
		isTaskSelected,
		clearColumnSelections,
	} from "../selection/task_selection_store";
	import type { Readable } from "svelte/store";
	import type { ColumnHeaderSubtitle } from "../columns/definitions";
	import TaskStatusMarker from "./TaskStatusMarker.svelte";

	export let column: ColumnTag | DefaultColumns;
	export let tasks: Task[];
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let isCollapsed: boolean = false;
	export let onToggleCollapse: () => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;
	// A nested renderer can retain this header's column actions while showing a
	// count scoped to one matrix cell instead of the whole column.
	export let taskCountOverride: number | undefined = undefined;
	export let showTaskCount: boolean = false;
	export let headingId: string | undefined = undefined;
	export let headingLevel: 2 | 3 = 2;
	// Desktop frames own all sticky positioning; this opt-in styles content only.
	export let desktopAxis: "column" | "row" | undefined = undefined;
	let columnSubtitle: ColumnHeaderSubtitle | undefined;

	function getColumnTitle(
		col: ColumnTag | DefaultColumns,
		columnTagTable: ColumnTagTable,
	) {
		switch (col) {
			case "done":
			case "uncategorised":
				// The case match cannot narrow away the branded ColumnTag type,
				// but only the default-column literals reach this branch.
				return resolveDefaultColumnName(
					col as DefaultColumns,
					uncategorizedColumnName,
					doneColumnName,
				);
			default:
				return columnTagTable[col];
		}
	}

	$: columnTitle = (() => {
		// Reference name props so Svelte re-derives when they change
		void uncategorizedColumnName;
		void doneColumnName;
		return getColumnTitle(column, $columnTagTableStore);
	})();

	$: columnColor = isColumnTag(column, columnTagTableStore) ? $columnColourTableStore[column] : undefined;
	$: columnMatchTags = isColumnTag(column, columnTagTableStore) ? ($columnMatchTagTableStore[column] ?? []) : [];
	$: columnSubtitle = isColumnTag(column, columnTagTableStore) ? $columnSubtitleTableStore[column] : undefined;
	$: columnStatusMarker = columnSubtitle?.kind === "status" ? columnSubtitle.value : undefined;
	$: columnStatusLabel = columnSubtitle?.kind === "status" ? columnSubtitle.label : "";
	$: columnPriorityLabel = columnSubtitle?.kind === "priority" ? columnSubtitle.label : "";
	$: columnPriorityIcon = columnSubtitle?.kind === "priority" ? columnSubtitle.icon : undefined;
	$: displayedTaskCount = taskCountOverride ?? tasks.length;
	$: taskCountLabel = displayedTaskCount === 1 ? "1 task" : `${displayedTaskCount} tasks`;
	$: collapseIcon = isCollapsed ? "▶" : "▼";
	$: folded = desktopAxis === "column" && isCollapsed;
	$: displayTaskCount = isCollapsed ? `${displayedTaskCount}` : taskCountLabel;
	$: showColumnMatchTags = columnMatchTags.length > 0 && !isCollapsed;
	$: showColumnStatus = columnStatusMarker !== undefined && !isCollapsed;
	$: showColumnPriority = columnSubtitle?.kind === "priority" && !isCollapsed;

	// Selection state
	$: isSelectMode = isInSelectionMode(column, $selectionModeStore);
	$: columnTaskIds = tasks.map((t) => t.id);
	$: selectedCount = getSelectedTaskCount(columnTaskIds, $taskSelectionStore);
	$: selectedIds = columnTaskIds.filter((id) =>
		isTaskSelected(id, $taskSelectionStore),
	);

	function showMenu(e: MouseEvent) {
		const menu = new Menu();

		if (isSelectMode && selectedCount > 0) {
			// Bulk actions for selected tasks
			if (column !== "done") {
				menu.addItem((i) => {
					i.setTitle(`Move ${selectedCount} selected to ${resolveDefaultColumnName("done", uncategorizedColumnName, doneColumnName)}`).onClick(
						async () => {
							await taskActions.moveTasksToColumn(selectedIds, "done");
							clearColumnSelections(columnTaskIds);
						},
					);
				});
			}

			// Move to column options
			for (const [tag, label] of Object.entries($columnTagTableStore)) {
				const tagAsColumn = tag as ColumnTag;
				if (tagAsColumn === column) continue;
				menu.addItem((i) => {
					i.setTitle(`Move ${selectedCount} selected to ${label}`).onClick(
						async () => {
							await taskActions.moveTasksToColumn(selectedIds, tagAsColumn);
							clearColumnSelections(columnTaskIds);
						},
					);
				});
			}

			menu.addSeparator();

			const selectedTasks = selectedIds.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[];
			const allCancelled = selectedTasks.length > 0 && selectedTasks.every(t => t.isCancelled);

			if (allCancelled) {
				menu.addItem((i) => {
					i.setTitle(`Restore ${selectedCount} selected`).onClick(async () => {
						await taskActions.restoreTasks(selectedIds);
						clearColumnSelections(columnTaskIds);
					});
				});
			} else {
				menu.addItem((i) => {
					i.setTitle(`Cancel ${selectedCount} selected`).onClick(async () => {
						await taskActions.cancelTasks(selectedIds);
						clearColumnSelections(columnTaskIds);
					});
				});
			}

			menu.addSeparator();

			menu.addItem((i) => {
				i.setTitle(`Archive ${selectedCount} selected`).onClick(async () => {
					await taskActions.archiveTasks(selectedIds);
					clearColumnSelections(columnTaskIds);
				});
			});
		}

		if (column === "done") {
			menu.addItem((i) => {
				i.setTitle(`Archive all`).onClick(() =>
					taskActions.archiveTasks(tasks.map(({ id }) => id)),
				);
			});
		}

		menu.showAtMouseEvent(e);
	}

	$: showContextMenu = column === "done" || (isSelectMode && selectedCount > 0);
</script>

<div
	class="column-header"
	class:collapsed={isCollapsed}
	class:folded
	class:desktop-axis={desktopAxis !== undefined}
	class:desktop-row={desktopAxis === "row"}
	style:--column-color={columnColor}
>
	<div class="header">
		<span
			class="collapse-btn"
			role="button"
			tabindex="0"
			on:click={onToggleCollapse}
			on:keydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onToggleCollapse();
				}
			}}
			aria-expanded={!isCollapsed}
			aria-label="{isCollapsed ? 'Expand' : 'Collapse'} {columnTitle} column"
		>{collapseIcon}</span>
		<div class="column-title-group">
			<svelte:element this={`h${headingLevel}`} id={headingId ?? `column-title-${column}`} title={columnTitle}>{columnTitle}</svelte:element>
		</div>
		{#if isCollapsed || showTaskCount}
			<span class="task-count" aria-live="polite" aria-label={taskCountLabel}>{displayTaskCount}</span>
		{/if}
		<div class="header-menu">
			{#if showContextMenu}
				<IconButton
					icon="lucide-more-vertical"
					on:click={showMenu}
					aria-label="Column options for {columnTitle}"
				/>
			{/if}
		</div>
	</div>
	{#if !isCollapsed}
		<div class="column-meta">
			<div class="column-meta-line">
				{#if showColumnMatchTags}
					<div class="column-match-tags" title={columnMatchTags.map((tag) => `#${tag}`).join(" ")}>
						{columnMatchTags.map((tag) => `#${tag}`).join(" ")}
					</div>
				{/if}
				{#if showColumnStatus}
					<div class="column-match-status" title="Status: {columnStatusLabel}">
						<span class="column-match-status-label">Status</span>
						<span
							class="column-status-preview"
							aria-label="Status: {columnStatusLabel}"
						>
							<TaskStatusMarker status={columnStatusMarker ?? " "} size={18} />
						</span>
					</div>
				{/if}
				{#if showColumnPriority}
					<div class="column-match-priority" title="Priority: {columnPriorityLabel}">
						<span class="column-match-status-label">Priority</span>
						<span class="column-priority-preview" aria-label="Priority: {columnPriorityLabel}">
							{#if columnPriorityIcon}
								<span class="column-priority-icon" aria-hidden="true">{columnPriorityIcon}</span>
							{/if}
							<span>{columnPriorityLabel}</span>
						</span>
					</div>
				{/if}
				<span class="task-count" aria-live="polite" aria-label={taskCountLabel}>{displayTaskCount}</span>
				<div
					class="mode-toggle"
					role="toolbar"
					aria-label="Column interaction mode"
				>
					<button
						class="mode-btn"
						class:active={!isSelectMode}
						aria-pressed={!isSelectMode}
						aria-label="Done mode: click tasks to mark complete"
						on:click={() => {
							if (isSelectMode) toggleSelectionMode(column);
						}}
					>Done</button>
					<button
						class="mode-btn"
						class:active={isSelectMode}
						aria-pressed={isSelectMode}
						aria-label="Select mode: click tasks to select for bulk actions"
						on:click={() => {
							if (!isSelectMode) toggleSelectionMode(column);
						}}
					>Select</button>
				</div>
			</div>
		</div>
	{/if}
	{#if isSelectMode && selectedCount > 0}
		<div class="selection-info" aria-live="polite">
			{selectedCount} selected
		</div>
	{/if}
</div>

<style lang="scss">
	.column-header {
		width: 100%;
		--header-accent: var(--column-color, var(--background-modifier-border-hover));
		--column-header-x-padding: var(--column-header-x-padding-override, var(--size-4-4));
		--column-header-y-padding: var(--column-header-y-padding-override, var(--size-4-4));
		display: flex;
		flex-direction: column;
		gap: var(--size-2-3);

		&::before {
			content: "";
			display: block;
			width: calc(100% + calc(2 * var(--column-header-x-padding)));
			height: 12px;
			margin: calc(-1 * var(--column-header-y-padding))
				calc(-1 * var(--column-header-x-padding)) 0;
			border-radius: 2px;
			background: var(--header-accent);
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-normal) 10%, transparent);
			flex: 0 0 auto;
		}

	}

	.column-header.desktop-axis {
		position: relative;
		align-self: auto;
		box-sizing: border-box;
		padding: 14px 8px 8px 0;
		gap: 4px;
		--column-header-x-padding: 0px;
		--column-header-y-padding: 0px;

		&::before {
			position: absolute;
			inset: 0 0 auto;
			width: 100%;
			height: 6px;
			margin: 0;
			border-radius: 0;
		}
		// Visual-column accents are painted across the full grid frame.
		&:not(.desktop-row)::before { display: none; }
		&.desktop-row::before { inset: 0 auto 0 0; width: 4px; height: 100%; }
		.header, .header h2, .header h3 { position: static; }
		.header h2, .header h3 {
			font-size: var(--axis-label-size);
			font-weight: var(--axis-label-weight);
			letter-spacing: var(--axis-label-spacing);
			text-transform: var(--axis-label-transform);
			line-height: 1.3;
		}
		.header { gap: 4px; }
		.collapse-btn { width: var(--axis-folded-width); flex: 0 0 var(--axis-folded-width); }
		.column-meta, .selection-info { box-sizing: border-box; padding-left: 32px; }
		// A category in a row is a single compact toolbar. Flatten only its
		// content wrappers; sticky containment and row height belong to the grid.
		&.desktop-row {
			padding: 4px 8px 4px 0;
			flex-direction: row;
			align-items: center;
			flex-wrap: wrap;
			gap: 4px 8px;

			.header, .column-meta, .column-meta-line { display: contents; }
			.column-title-group { flex: 0 1 auto; max-width: min(36ch, 45%); }
			.header-menu { margin-left: 0; order: 2; }
			.task-count { margin: 0; align-self: center; line-height: 1.3; }
			.column-match-tags { flex: 0 1 auto; max-width: 30ch; }
			.selection-info { margin: 0; padding: 0; order: 3; }
		}
		&.folded {
			width: var(--axis-folded-width);
			padding-right: 0;
			.column-title-group, .header-menu, .column-meta, .selection-info { display: none; }

			.header { flex-direction: column; gap: 0; }
			.collapse-btn { flex: 0 0 24px; }
			.task-count {
				display: block;
				align-self: center;
				font-size: var(--font-ui-smaller);
				line-height: 18px;
			}
		}
	}

	.header {
		display: flex;
		align-items: center;
		min-height: 22px;
		width: 100%;
		flex-shrink: 0;
		gap: var(--size-4-2);

		.column-title-group {
			min-width: 0;
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 2px;
			flex: 1 1 auto;
		}

		h2,
		h3 {
			font-size: var(--font-ui-medium);
			font-weight: var(--font-bold);
			margin: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			line-height: 1.2;
			position: sticky;
			left: calc(var(--sticky-left-offset, 0px) + var(--column-header-x-padding, var(--size-4-4)));
			max-width: 100%;
		}

		.task-count {
			font-size: var(--font-ui-small);
			color: var(--text-muted);
			white-space: nowrap;
			align-self: flex-start;
			line-height: 28px;
		}

		.header-menu {
			margin-left: auto;
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: var(--size-2-1);
			height: 24px;
		}

		.collapse-btn {
			background: transparent;
			border: none;
			box-shadow: none;
			cursor: pointer;
			color: var(--text-muted);
			padding: 0;
			width: 14px;
			height: 24px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 10px;
			line-height: 1;
			flex-shrink: 0;
			transition: color 0.15s ease;

			&:hover {
				color: var(--text-normal);
				background: transparent;
			}

			&:focus-visible {
				outline: 2px solid var(--background-modifier-border-focus);
				outline-offset: 2px;
			}
		}

	}

	.mode-toggle {
		display: flex;
		align-items: center;
		background: var(--background-modifier-form-field, var(--background-secondary));
		border-radius: var(--radius-s);
		padding: 2px;
		gap: 0;
		width: fit-content;
		max-width: 100%;
		flex: 0 0 auto;

		.mode-btn {
			font-size: var(--font-ui-smaller);
			padding: 1px 5px;
			min-width: 0;
			width: auto;
			border: none;
			background: transparent;
			color: var(--text-muted);
			border-radius: calc(var(--radius-s) - 2px);
			cursor: pointer;
			transition: background 0.15s ease, color 0.15s ease;
			white-space: nowrap;
			box-shadow: none;
			line-height: 1.2;

			&:hover {
				background: transparent;
				color: var(--text-normal);
				box-shadow: none;
			}

			&.active {
				background: var(--background-primary);
				color: var(--text-normal);
				box-shadow: var(--input-shadow);
				font-weight: var(--font-medium);
			}

			&:focus-visible {
				outline: 2px solid var(--background-modifier-border-focus);
				outline-offset: 1px;
			}
		}
	}

	.column-meta {
		display: flex;
		flex-direction: column;
		gap: var(--size-2-1);
		width: 100%;
		align-items: flex-start;

		.column-meta-line {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			gap: var(--size-2-3);
			min-width: 0;

			.task-count {
				font-size: var(--font-ui-small);
				color: var(--text-muted);
				white-space: nowrap;
				line-height: 1.3;
				margin-left: auto;
				flex: 0 0 auto;
			}
		}
	}

	.column-match-tags,
	.column-match-status,
	.column-match-priority {
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.3;
		min-width: 0;
		flex: 1 1 auto;
	}

	.column-match-status,
	.column-match-priority {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-2);
		flex: 0 0 auto;
		overflow: visible;
	}

	.column-match-status-label {
		font-weight: var(--font-medium);
	}

	.column-priority-preview {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		min-width: 0;
	}

	.column-priority-icon {
		line-height: 1;
	}

	.column-status-preview {
		display: inline-flex !important;
		align-items: center !important;
		justify-content: center !important;
		width: 18px !important;
		height: 18px !important;
		min-width: 18px !important;
		min-height: 18px !important;
		max-width: 18px !important;
		max-height: 18px !important;
		margin: 0 !important;
		padding: 0 !important;
		text-indent: 0 !important;
		line-height: 1 !important;
		list-style: none !important;
		color: var(--text-normal);
		vertical-align: middle;
	}

	.selection-info {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		margin-top: var(--size-2-1);
	}
</style>
