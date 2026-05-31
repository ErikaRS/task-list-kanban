<script lang="ts">
	import { setIcon, type App, TFile } from "obsidian";
	import {
		type ColumnMatchTagTable,
		type ColumnTag,
		type DefaultColumns,
		type ColumnTagTable,
		type ColumnColourTable,
		isColumnTag,
		resolveDefaultColumnName,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import TaskComponent from "./task.svelte";
	import ColumnHeader from "./ColumnHeader.svelte";
	import IconButton from "./icon_button.svelte";
	import { isDraggingStore } from "../dnd/store";
	import {
		selectionModeStore,
		isInSelectionMode,
	} from "../selection/selection_mode_store";
	import {
		taskSelectionStore,
		toggleTaskSelection,
		isTaskSelected,
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
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let showFilepath: boolean;
	export let consolidateTags: boolean;
	export let isVerticalFlow: boolean = false;
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
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
	$: isHorizontalCollapsed = isCollapsed && !isVerticalFlow;
	$: isVerticalCollapsed = isCollapsed && isVerticalFlow;

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
	$: selectedIds = columnTaskIds.filter((id) =>
		isTaskSelected(id, $taskSelectionStore),
	);

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

	// Inline task creation
	let pendingNewTask: TFile | null = null;
	let pendingCancelled = false;
	let newTaskTextAreaEl: HTMLTextAreaElement | undefined;

	async function handleNewTaskSave() {
		if (pendingCancelled) {
			pendingCancelled = false;
			pendingNewTask = null;
			return;
		}

		const content = newTaskTextAreaEl?.value?.trim();
		const file = pendingNewTask;
		pendingNewTask = null;

		if (!content || !file || !isColumnTag(column, columnTagTableStore)) {
			return;
		}

		await taskActions.createTask(file, content, column);
	}

	function handleNewTaskKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			pendingCancelled = true;
			newTaskTextAreaEl?.blur();
		} else if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			newTaskTextAreaEl?.blur();
		}
	}

	$: if (pendingNewTask && newTaskTextAreaEl) {
		newTaskTextAreaEl.focus();
	}

	function handleAddNewClick(e: MouseEvent) {
		if (!isColumnTag(column, columnTagTableStore)) {
			return;
		}

		taskActions.pickFileForNewTask(column, e, (file) => {
			pendingNewTask = file;
		});
	}

	function handleChooseTaskFileClick(e: MouseEvent) {
		if (!isColumnTag(column, columnTagTableStore)) {
			return;
		}

		taskActions.pickFileForNewTask(
			column,
			e,
			(file) => {
				pendingNewTask = file;
			},
			true,
		);
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
		<ColumnHeader
			{column}
			{tasks}
			{taskActions}
			{columnTagTableStore}
			{columnColourTableStore}
			{columnMatchTagTableStore}
			{isVerticalFlow}
			{isCollapsed}
			{onToggleCollapse}
			{uncategorizedColumnName}
			{doneColumnName}
		/>
		{#if !isVerticalFlow}
			<div class="divide"></div>
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
						{doneColumnName}
					/>
				{/each}
			</div>
			{#if pendingNewTask}
				<div class="new-task-input">
					<textarea
						bind:this={newTaskTextAreaEl}
						on:blur={handleNewTaskSave}
						on:keydown={handleNewTaskKeydown}
						placeholder="Task name..."
					></textarea>
				</div>
			{/if}
			{#if isColumnTag(column, columnTagTableStore)}
				<div class="add-new-controls">
					<button
						class="add-new-btn"
						aria-label="Add new task to {columnTitle}"
						disabled={!!pendingNewTask}
						on:click={handleAddNewClick}
					>
						<span bind:this={buttonEl}></span>
						Add new
					</button>
					<IconButton
						class="add-new-picker-btn"
						icon="lucide-chevron-down"
						aria-label="Choose file for new task in {columnTitle}"
						disabled={!!pendingNewTask}
						on:click={handleChooseTaskFileClick}
					/>
				</div>
				{#if targetTaskFile}
					<div class="file-indicator">
						<span class="file-indicator-arrow">→</span>
						<span class="file-indicator-name" title={targetTaskFile.path}>{targetTaskFile.name}</span>
						{#if targetFileIsDefault}
							<span class="file-indicator-label">(default)</span>
						{/if}
					</div>
				{/if}
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
		}

		&.vertical-flow.vertical-collapsed {
			&.drop-hover {
				border-color: var(--color-base-70);
			}

			.divide,
			.tasks-wrapper {
				display: none;
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

			.new-task-input {
				margin-top: var(--size-4-2);
				background-color: var(--background-secondary-alt);
				border-radius: var(--radius-m);
				border: var(--border-width) solid var(--background-modifier-border);
				padding: var(--size-4-2);

				textarea {
					cursor: text;
					background-color: var(--color-base-25);
					width: 100%;
				}
			}

			.add-new-btn {
				display: flex;
				align-items: center;
				align-self: flex-start;
				cursor: pointer;
				border: 0;
				border-radius: 0;
				box-shadow: none;
				margin: 0;

				span {
					height: 18px;
				}
			}

			.add-new-controls {
				display: inline-flex;
				align-items: center;
				align-self: flex-start;
				margin-top: var(--size-4-2);
				border: var(--border-width) solid var(--background-modifier-border);
				border-radius: var(--radius-m);
				overflow: hidden;
				background-color: var(--interactive-normal);
				box-shadow: var(--input-shadow);
			}

			:global(.add-new-picker-btn) {
				flex-shrink: 0;
				border: 0;
				border-left: var(--border-width) solid var(--background-modifier-border);
				border-radius: 0;
				box-shadow: none;
				margin: 0;
				background-color: transparent;
			}

			.add-new-btn,
			:global(.add-new-picker-btn) {
				background-color: transparent;
			}

			.add-new-btn:hover:not(:disabled),
			:global(.add-new-picker-btn:hover:not(:disabled)) {
				background-color: var(--interactive-hover);
			}

			.add-new-btn:active:not(:disabled),
			:global(.add-new-picker-btn:active:not(:disabled)) {
				background-color: var(--interactive-accent-hover);
			}

			.file-indicator {
				display: flex;
				align-items: center;
				gap: var(--size-2-1);
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				margin-top: var(--size-2-1);

				.file-indicator-arrow {
					flex-shrink: 0;
				}

				.file-indicator-name {
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.file-indicator-label {
					white-space: nowrap;
				}
			}
		}
	}
</style>
