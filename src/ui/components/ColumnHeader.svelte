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
	import Icon from "./icon.svelte";
	import { getStatusColumnLabel } from "../columns/definitions";

	export let column: ColumnTag | DefaultColumns;
	export let tasks: Task[];
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let isVerticalFlow: boolean = false;
	export let isCollapsed: boolean = false;
	export let onToggleCollapse: () => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;

	function getColumnTitle(
		col: ColumnTag | DefaultColumns,
		columnTagTable: ColumnTagTable,
	) {
		switch (col) {
			case "done":
			case "uncategorised":
				return resolveDefaultColumnName(col, uncategorizedColumnName, doneColumnName);
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
	$: columnStatusMarker = isColumnTag(column, columnTagTableStore) ? $columnSubtitleTableStore[column] : undefined;
	$: columnStatusLabel = getStatusColumnLabel(columnStatusMarker);
	$: taskCountLabel = tasks.length === 1 ? "1 task" : `${tasks.length} tasks`;
	$: collapseIcon = isCollapsed ? "▶" : "▼";
	$: isHorizontalCollapsed = isCollapsed && !isVerticalFlow;
	$: isVerticalCollapsed = isCollapsed && isVerticalFlow;
	$: displayTaskCount = isCollapsed ? `${tasks.length}` : taskCountLabel;
	$: showColumnMatchTags = columnMatchTags.length > 0 && !isCollapsed;
	$: showColumnStatus = columnStatusMarker !== undefined && !isCollapsed;

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
							for (const id of selectedIds) {
								await taskActions.markDone(id);
							}
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
							for (const id of selectedIds) {
								await taskActions.changeColumn(id, tagAsColumn);
							}
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

	function shouldRenderStatusAsText(status: string): boolean {
		return status.length > 1 || /\p{Extended_Pictographic}/u.test(status);
	}
</script>

<div
	class="column-header"
	class:row-header={isVerticalFlow}
	class:collapsed={isHorizontalCollapsed}
	class:vertical-collapsed={isVerticalCollapsed}
	style:--column-color={columnColor}
>
	<div class="header">
		<button
			class="collapse-btn"
			on:click={onToggleCollapse}
			aria-expanded={!isCollapsed}
			aria-label="{isCollapsed ? 'Expand' : 'Collapse'} {columnTitle} column"
		>{collapseIcon}</button>
		<div class="column-title-group">
			<h2 id="column-title-{column}" title={columnTitle}>{columnTitle}</h2>
		</div>
		{#if isCollapsed}
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
							class:uses-status-marker={columnStatusMarker !== " "}
							class:markdown-rendered={columnStatusMarker !== " "}
							class:markdown-preview-view={columnStatusMarker !== " "}
							class:task-list-item={columnStatusMarker !== " "}
							class:is-checked={columnStatusMarker !== " "}
							data-task={columnStatusMarker !== " " ? columnStatusMarker : undefined}
							aria-label="Status: {columnStatusLabel}"
						>
							{#if columnStatusMarker === " "}
								<Icon name="lucide-square" size={18} opacity={0.5} />
							{:else if shouldRenderStatusAsText(columnStatusMarker ?? "")}
								<span class="status-text-marker">{columnStatusMarker}</span>
							{:else}
								<span
									class="task-list-item-checkbox source-status-checkbox"
									data-task={columnStatusMarker}
									aria-hidden="true"
								></span>
							{/if}
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

		&.row-header {
			position: relative;
			display: flex;
			align-items: stretch;
			margin-bottom: 0;

			&::before {
				position: absolute;
				top: calc(-1 * var(--column-header-y-padding));
				bottom: calc(-1 * var(--column-header-y-padding));
				left: calc(-1 * var(--column-header-x-padding));
				width: 12px;
				height: auto;
				margin: 0;
			}

			.header {
				margin-right: 0;
				padding-left: var(--size-4-3);
				box-sizing: border-box;
			}

			.column-meta,
			.selection-info {
				padding-left: var(--size-4-3);
				box-sizing: border-box;
			}

			.column-meta {
				margin-top: var(--size-2-2);

				.column-meta-line {
					justify-content: flex-start;
					flex-wrap: wrap;
					gap: var(--size-2-2) var(--size-4-2);

					.column-match-tags,
					.column-match-status {
						order: 1;
						flex: 0 0 100%;
					}

					.task-count {
						order: 2;
						flex: 0 0 100%;
						margin-left: 0;
					}

					.mode-toggle {
						order: 3;
						flex: 0 0 auto;
					}
				}
			}
		}

		&.collapsed {
			position: sticky;
			top: 0;
			align-self: flex-start;
			z-index: 1;

			.header {
				flex-direction: column;
				align-items: center;
				min-height: unset;
				gap: var(--size-4-2);

				.column-title-group {
					order: 2;

					h2 {
						writing-mode: vertical-rl;
						text-orientation: mixed;
						white-space: nowrap;
						overflow: visible;
						text-overflow: unset;
						flex: 0 0 auto;
						line-height: normal;
					}
				}

				.task-count {
					order: 3;
					writing-mode: horizontal-tb;
					align-self: center;
					line-height: normal;
				}

				.header-menu {
					display: flex;
					margin-left: 0;
					order: 4;
				}



				:global(.header-menu button) {
					width: 20px;
					height: 20px;
				}

				.collapse-btn {
					order: 1;
				}
			}
		}

		&.vertical-collapsed {
			&.row-header {
				margin-bottom: 0;

				.header-menu {
					display: flex;
				}


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
			gap: 2px;
			flex: 1 1 auto;
		}

		h2 {
			font-size: var(--font-ui-medium);
			font-weight: var(--font-bold);
			margin: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			line-height: 1.2;
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
			cursor: pointer;
			color: var(--text-muted);
			padding: 0;
			width: 20px;
			height: 24px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: var(--radius-s);
			font-size: var(--font-ui-smaller);
			line-height: 1;
			flex-shrink: 0;
			transition: color 0.15s ease, background 0.15s ease;

			&:hover {
				color: var(--text-normal);
				background: var(--background-modifier-hover);
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
	.column-match-status {
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.3;
		min-width: 0;
		flex: 1 1 auto;
	}

	.column-match-status {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-2);
		flex: 0 0 auto;
		overflow: visible;
	}

	.column-match-status-label {
		font-weight: var(--font-medium);
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

	.column-status-preview .source-status-checkbox,
	.column-status-preview .status-text-marker {
		display: inline-flex !important;
		position: static !important;
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
		pointer-events: none;
		text-indent: 0 !important;
		line-height: 1 !important;
		vertical-align: middle !important;
	}

	.column-status-preview .status-text-marker {
		font-size: 15px;
	}

	.selection-info {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		margin-top: var(--size-2-1);
	}
</style>
