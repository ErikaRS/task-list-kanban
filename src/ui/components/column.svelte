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
	import type { Readable } from "svelte/store";
	import { selectionModeStore, toggleSelectionMode } from "../selection/selection_mode_store";
	import { taskSelectionStore, getSelectedTaskCount, clearTaskSelections } from "../selection/task_selection_store";

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
	$: isInSelectionMode = $selectionModeStore.get(column) || false;
	$: selectedCount = getSelectedTaskCount(tasks.map(t => t.id), $taskSelectionStore);
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

	function showMenu(e: MouseEvent) {
		const menu = new Menu();

		if (column === "done") {
			menu.addItem((i) => {
				i.setTitle(`Archive all`).onClick(() =>
					taskActions.archiveTasks(tasks.map(({ id }) => id)),
				);
			});
			menu.addSeparator();
		}

		menu.addItem((i) => {
			i.setTitle(isCollapsed ? "Expand column" : "Collapse column").onClick(onToggleCollapse);
		});

		menu.showAtMouseEvent(e);
	}

	function showBulkActionsMenu(e: MouseEvent) {
		const menu = new Menu();

		// Get selected task IDs from the current column
		const selectedTaskIds = tasks
			.filter(task => $taskSelectionStore.get(task.id))
			.map(task => task.id);

		if (selectedTaskIds.length === 0) {
			return;
		}

		const target = e.currentTarget as HTMLElement | null;
		if (!target) {
			return;
		}

		const boundingRect = target.getBoundingClientRect();
		const y = boundingRect.top + boundingRect.height / 2;
		const x = boundingRect.left + boundingRect.width / 2;

		// Add "Move to [Column]" options
		for (const [tag, label] of Object.entries($columnTagTableStore)) {
			menu.addItem((i) => {
				i.setTitle(`Move to ${label}`).onClick(() => {
					// Move all selected tasks to this column
					selectedTaskIds.forEach(taskId => {
						taskActions.changeColumn(taskId, tag as ColumnTag);
					});
					// Clear selections after action (selection mode persists)
					clearTaskSelections();
				});
				// Disable if this is the current column
				if (isColumnTag(column, columnTagTableStore) && column === tag) {
					i.setDisabled(true);
				}
			});
		}

		// Add "Move to Done" option
		menu.addItem((i) => {
			i.setTitle(`Move to Done`).onClick(() => {
				// Mark all selected tasks as done
				selectedTaskIds.forEach(taskId => {
					taskActions.markDone(taskId);
				});
				// Clear selections after action (selection mode persists)
				clearTaskSelections();
			});
			// Disable if already in Done column
			if (column === "done") {
				i.setDisabled(true);
			}
		});

		menu.addSeparator();

		// Add "Archive task" option
		menu.addItem((i) => {
			i.setTitle(`Archive task`).onClick(() => {
				taskActions.archiveTasks(selectedTaskIds);
				// Clear selections after action (selection mode persists)
				clearTaskSelections();
			});
		});

		// Add "Delete task" option
		menu.addItem((i) => {
			i.setTitle(`Delete task`).onClick(() => {
				selectedTaskIds.forEach(taskId => {
					taskActions.deleteTask(taskId);
				});
				// Clear selections after action (selection mode persists)
				clearTaskSelections();
			});
		});

		menu.showAtPosition({ x, y });
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

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDraggedOver = false;
		if (!canDrop) {
			return;
		}

		const droppedId = e.dataTransfer?.getData("text/plain");
		if (!droppedId) return;

		// If the dragged task is selected, move all selected tasks together
		const currentSelection = $taskSelectionStore;
		const droppedIsSelected = currentSelection.get(droppedId) || false;
		const taskIdsToMove = droppedIsSelected
			? [...currentSelection.entries()]
				.filter(([, selected]) => selected)
				.map(([id]) => id)
			: [droppedId];

		for (const taskId of taskIdsToMove) {
			switch (column) {
				case "uncategorised":
					break;
				case "done":
					taskActions.markDone(taskId);
					break;
				default:
					taskActions.changeColumn(taskId, column);
					break;
			}
		}

		if (droppedIsSelected) {
			clearTaskSelections();
		}
	}

	let buttonEl: HTMLSpanElement | undefined;

	$: {
		if (buttonEl) {
			setIcon(buttonEl, "lucide-plus");
		}
	}
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
				<span class="task-count">{displayTaskCount}</span>
				<div class="header-menu">
					<IconButton icon="lucide-more-vertical" on:click={showMenu} />
				</div>
			</div>
			<div class="mode-toggle-container">
				<div 
					class="segmented-control"
					class:has-color={!!columnColor}
					style:--toggle-bg-color={columnColor ? `color-mix(in srgb, ${columnColor} 25%, white)` : undefined}
					style:--toggle-active-color={columnColor || undefined}
					role="toolbar"
					aria-label="Task interaction mode"
				>
					<button
						class="segment"
						class:active={!isInSelectionMode}
						on:click={() => { if (isInSelectionMode) toggleSelectionMode(column); }}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (isInSelectionMode) {
									toggleSelectionMode(column);
								}
							}
						}}
						aria-label="Mark as done mode"
						aria-pressed={!isInSelectionMode}
						tabindex="0"
					>
						Done
					</button>
					<button
						class="segment"
						class:active={isInSelectionMode}
						on:click={() => { if (!isInSelectionMode) toggleSelectionMode(column); }}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (!isInSelectionMode) {
									toggleSelectionMode(column);
								}
							}
						}}
						aria-label="Selection mode"
						aria-pressed={isInSelectionMode}
						tabindex="0"
					>
						Select
					</button>
				</div>
				<div class="selection-count" aria-live="polite">
					{#if isInSelectionMode && selectedCount > 0}
						<span>{selectedCount} selected</span>
					{/if}
				</div>
				<div class="bulk-actions-button" class:visible={isInSelectionMode && selectedCount > 0}>
					<IconButton 
						icon="lucide-more-vertical" 
						on:click={showBulkActionsMenu} 
						aria-label="Bulk actions"
					/>
				</div>
			</div>
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
						{isInSelectionMode}
					/>
				{/each}
			</div>
			{#if isColumnTag(column, columnTagTableStore)}
				<button
					class="add-new-btn"
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
			.tasks-wrapper,
			.mode-toggle-container {
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
			.tasks-wrapper,
			.mode-toggle-container {
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

				.mode-toggle-container {
					margin-top: 0;
					margin-bottom: 0;
					gap: var(--size-4-1);

					.selection-count:empty {
						display: none;
					}

					.selection-count {
						min-width: 0;
						flex: 0;
					}
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

		.mode-toggle-container {
			display: flex;
			align-items: center;
			margin-top: var(--size-4-3);
			margin-bottom: var(--size-4-2);
			gap: var(--size-4-2);

			.segmented-control {
				display: inline-flex;
				background: var(--background-primary);
				border: none;
				border-radius: var(--radius-s);
				padding: 2px;
				gap: 0;

				&.has-color {
					background: var(--toggle-bg-color);
				}

				.segment {
					padding: 2px var(--size-4-2);
					border: none;
					background: transparent;
					border-radius: calc(var(--radius-s) - 2px);
					cursor: pointer;
					font-size: var(--font-ui-smaller);
					color: var(--text-muted);
					transition: all 0.2s ease;
					box-shadow: none;
					position: relative;
					z-index: 1;
					white-space: nowrap;

					&.active {
						background: var(--background-secondary);
						border: none;
						color: var(--text-normal);
					}

					&:focus-visible {
						outline: 2px solid var(--background-modifier-border-focus);
						outline-offset: 2px;
					}
				}

				&.has-color .segment.active {
					background: var(--toggle-active-color);
					border: none;
					color: var(--text-normal);
				}
			}

			.selection-count {
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				flex: 1;
			}

			.bulk-actions-button {
				opacity: 0;
				pointer-events: none;
				transition: opacity 0.2s ease;

				&.visible {
					opacity: 1;
					pointer-events: auto;
				}
			}
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
