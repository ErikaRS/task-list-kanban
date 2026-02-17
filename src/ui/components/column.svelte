<script lang="ts">
	import { Menu, setIcon, type App } from "obsidian";
	import {
		type ColumnTag,
		type DefaultColumns,
		type ColumnTagTable,
		type ColumnColourTable,
		isColumnTag,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import TaskComponent from "./task.svelte";
	import IconButton from "./icon_button.svelte";
	import { isDraggingStore } from "../dnd/store";
	import {
		selectionModeStore,
		isInSelectionMode,
		toggleSelectionMode,
	} from "../selection/selection_mode_store";
	import {
		taskSelectionStore,
		toggleTaskSelection,
		isTaskSelected,
		getSelectedTaskCount,
		clearColumnSelections,
	} from "../selection/task_selection_store";
	import type { Readable } from "svelte/store";

	export let app: App;
	export let column: ColumnTag | DefaultColumns;
	export let hideOnEmpty: boolean = false;
	export let tasks: Task[];
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let showFilepath: boolean;
	export let consolidateTags: boolean;
	export let isVerticalFlow: boolean = false;
	export let isCollapsed: boolean = false;
	export let onToggleCollapse: () => void;

	function getColumnTitle(
		column: ColumnTag | DefaultColumns,
		columnTagTable: ColumnTagTable,
	) {
		switch (column) {
			case "done":
				return "Done";
			case "uncategorised":
				return "Uncategorised";
			default:
				return columnTagTable[column];
		}
	}

	$: columnTitle = getColumnTitle(column, $columnTagTableStore);
	$: columnColor = isColumnTag(column, columnTagTableStore) ? $columnColourTableStore[column] : undefined;
	$: taskCountLabel = tasks.length === 1 ? "1 task" : `${tasks.length} tasks`;
	$: collapseIcon = isCollapsed ? "▶" : "▼";
	$: isHorizontalCollapsed = isCollapsed && !isVerticalFlow;
	$: isVerticalCollapsed = isCollapsed && isVerticalFlow;
	$: displayTaskCount = isCollapsed ? `${tasks.length}` : taskCountLabel;

	$: sortedTasks = [...tasks].sort((a, b) => {
		if (a.path === b.path) {
			return a.rowIndex - b.rowIndex;
		} else {
			return a.path.localeCompare(b.path);
		}
	});

	// Selection state
	$: isSelectMode = isInSelectionMode(column, $selectionModeStore);
	$: columnTaskIds = sortedTasks.map((t) => t.id);
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
					i.setTitle(`Move ${selectedCount} selected to Done`).onClick(
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

	let isDraggedOver = false;

	$: draggingData = $isDraggingStore;
	$: canDrop = !!draggingData && draggingData.fromColumn !== column;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!canDrop) {
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = "none";
			}
			return;
		}

		isDraggedOver = true;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = "move";
		}
	}

	function handleDragLeave(e: DragEvent) {
		isDraggedOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDraggedOver = false;
		if (!canDrop || !draggingData) {
			return;
		}

		// Prefer the IDs from the drag store (supports multi-drag);
		// fall back to the single ID from dataTransfer for robustness.
		const droppedIds =
			draggingData.draggedTaskIds.length > 0
				? draggingData.draggedTaskIds
				: (() => {
						const id = e.dataTransfer?.getData("text/plain");
						return id ? [id] : [];
					})();

		if (droppedIds.length === 0) return;

		for (const id of droppedIds) {
			switch (column) {
				case "uncategorised":
					break;
				case "done":
					await taskActions.markDone(id);
					break;
				default:
					await taskActions.changeColumn(id, column);
					break;
			}
		}

		// Clear selections for the source column after a successful drop
		clearColumnSelections(droppedIds);
	}

	let buttonEl: HTMLSpanElement | undefined;

	$: {
		if (buttonEl) {
			setIcon(buttonEl, "lucide-plus");
		}
	}

	// Whether to show the context menu button
	$: showContextMenu = column === "done" || (isSelectMode && selectedCount > 0);
</script>

{#if !hideOnEmpty || tasks.length}
	<div
		role="group"
		aria-labelledby="column-title-{column}"
		aria-label={isCollapsed ? `${columnTitle} column, collapsed, ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}` : undefined}
		class="column"
		class:drop-active={!!draggingData}
		class:drop-hover={isDraggedOver}
		class:vertical-flow={isVerticalFlow}
		class:collapsed={isHorizontalCollapsed}
		class:vertical-collapsed={isVerticalCollapsed}
		style:--column-color={columnColor}
		style={columnColor ? `background-color: ${columnColor};` : ''}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
	>
		<div class="column-header" class:row-header={isVerticalFlow}>
			<div class="header">
				<button
					class="collapse-btn"
					on:click={onToggleCollapse}
					aria-expanded={!isCollapsed}
					aria-label="{isCollapsed ? 'Expand' : 'Collapse'} {columnTitle} column"
				>{collapseIcon}</button>
				<h2 id="column-title-{column}">{columnTitle}</h2>
				<span class="task-count" aria-live="polite" aria-label={taskCountLabel}>{displayTaskCount}</span>
				<div class="header-menu">
					<!-- Done / Select segmented toggle -->
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
					{#if showContextMenu}
						<IconButton
							icon="lucide-more-vertical"
							on:click={showMenu}
							aria-label="Column options for {columnTitle}"
						/>
					{/if}
				</div>
			</div>
			{#if isSelectMode && selectedCount > 0}
				<div class="selection-info" aria-live="polite">
					{selectedCount} selected
				</div>
			{/if}
		</div>
		{#if !isVerticalFlow}
			<div class="divide" />
		{/if}
		<div class="tasks-wrapper">
			<div class="tasks">
				{#each sortedTasks as task}
					<TaskComponent
						{app}
						{task}
						{taskActions}
						{columnTagTableStore}
						{showFilepath}
						{consolidateTags}
						displayColumn={column}
						isSelectionMode={isSelectMode}
						isSelected={isTaskSelected(task.id, $taskSelectionStore)}
						onToggleSelection={() => toggleTaskSelection(task.id)}
						selectedTaskIds={selectedIds}
					/>
				{/each}
			</div>
			{#if isColumnTag(column, columnTagTableStore)}
				<button
					class="add-new-btn"
					aria-label="Add new task to {columnTitle}"
					on:click={async (e) => {
						if (isColumnTag(column, columnTagTableStore)) {
							await taskActions.addNew(column, e);
						}
					}}
				>
					<span bind:this={buttonEl} />
					Add new
				</button>
			{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	.column {
		display: flex;
		flex-direction: column;
		align-self: flex-start;
		width: var(--column-width, 300px);
		flex-shrink: 0;
		padding: var(--size-4-3);
		border-radius: var(--radius-m);
		border: var(--border-width) solid var(--background-modifier-border);
		background-color: var(--background-secondary);
		transition: width 250ms ease;
		overflow: hidden;

		&.collapsed {
			width: 48px;
			cursor: pointer;

			&.drop-hover {
				border-color: var(--color-base-70);
			}

			.divide,
			.tasks-wrapper {
				display: none;
			}

			.column-header {
				.header {
					flex-direction: column;
					align-items: center;
					min-height: unset;
					gap: var(--size-4-2);

					h2 {
						writing-mode: vertical-rl;
						text-orientation: mixed;
						white-space: nowrap;
						overflow: visible;
						text-overflow: unset;
						order: 2;
						flex: 0 0 auto;
					}

					.task-count {
						order: 3;
						writing-mode: horizontal-tb;
					}

					.header-menu {
						display: none;
					}

					.collapse-btn {
						order: 1;
					}
				}
			}
		}

		&.vertical-flow.vertical-collapsed {
			&.drop-hover {
				border-color: var(--color-base-70);
			}

			.divide,
			.tasks-wrapper {
				display: none;
			}

			.column-header.row-header {
				margin-bottom: 0;

				.header-menu {
					display: none;
				}
			}
		}

		&.vertical-flow {
			width: 100%;

			.tasks-wrapper {
				width: 100%;
				display: flex;
				flex-direction: column;
				gap: var(--size-4-2);

				.tasks {
					flex-direction: row;
					flex-wrap: wrap;
					align-items: flex-start;

					:global(.task) {
						width: min(var(--column-width, 300px), 100%);
						flex-shrink: 0;
					}
				}
			}
		}

		.column-header {
			&.row-header {
				display: flex;
				align-items: center;
				gap: var(--size-4-2);
				margin-bottom: var(--size-4-2);

				.header {
					margin-right: 0;
				}
			}
		}

		&.drop-active {
			.tasks-wrapper {
				.tasks {
					opacity: 0.4;
				}
			}

			&.drop-hover {
				.tasks-wrapper {
					border-color: var(--color-base-70);
				}
			}
		}

		.header {
			display: flex;
			align-items: center;
			min-height: 24px;
			flex-shrink: 0;
			gap: var(--size-2-2);

			h2 {
				font-size: var(--font-ui-larger);
				font-weight: var(--font-bold);
				margin: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.task-count {
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				white-space: nowrap;
			}

			.header-menu {
				margin-left: auto;
				flex-shrink: 0;
				display: flex;
				align-items: center;
				gap: var(--size-2-1);
			}

			.collapse-btn {
				background: transparent;
				border: none;
				cursor: pointer;
				color: var(--text-muted);
				padding: 0;
				width: 28px;
				height: 28px;
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
			background: color-mix(in srgb, var(--column-color, var(--background-modifier-border)) 20%, var(--background-secondary));
			border-radius: var(--radius-s);
			padding: 2px;
			gap: 0;

			.mode-btn {
				font-size: var(--font-ui-smaller);
				padding: 2px 7px;
				border: none;
				background: transparent;
				color: var(--text-muted);
				border-radius: calc(var(--radius-s) - 2px);
				cursor: pointer;
				transition: background 0.15s ease, color 0.15s ease;
				white-space: nowrap;
				box-shadow: none;
				line-height: 1.4;

				&:hover {
					background: transparent;
					color: var(--text-normal);
					box-shadow: none;
				}

				&.active {
					background: color-mix(in srgb, var(--column-color, var(--background-modifier-border)) 60%, var(--background-secondary));
					color: var(--text-normal);
					font-weight: var(--font-medium);
				}

				&:focus-visible {
					outline: 2px solid var(--background-modifier-border-focus);
					outline-offset: 1px;
				}
			}
		}

		.selection-info {
			font-size: var(--font-ui-smaller);
			color: var(--text-muted);
			margin-top: var(--size-2-1);
		}

		.divide {
			width: calc(100% + calc(2 * var(--size-4-3)));
			border-bottom: var(--border-width) solid
				var(--column-color, var(--background-modifier-border));
			margin: var(--size-4-3) calc(-1 * var(--size-4-3));
		}

		.tasks-wrapper {
			min-height: 50px;
			border: var(--border-width) dashed transparent;
			border-radius: var(--radius-m);

			.tasks {
				display: flex;
				flex-direction: column;
				gap: var(--size-4-2);
			}

			.add-new-btn {
				display: flex;
				align-items: center;
				align-self: flex-start;
				cursor: pointer;
				margin-top: var(--size-4-2);

				span {
					height: 18px;
				}
			}
		}
	}
</style>
