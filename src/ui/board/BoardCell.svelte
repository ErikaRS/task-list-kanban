<script lang="ts">
	import { setIcon, type App, TFile } from "obsidian";
	import type { AxisBucket, BoardCell, SecondaryBucketId } from "./board_matrix";
	import {
		type ColumnTagTable,
		isColumnTag,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import TaskComponent from "../components/task.svelte";
	import IconButton from "../components/icon_button.svelte";
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
	export let cell: BoardCell;
	export let primaryTasks: Task[] = [];
	export let secondaryAxisBucket: AxisBucket<SecondaryBucketId>;
	export let primaryAxisLabel: string;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let showFilepath: boolean;
	export let consolidateTags: boolean;
	export let isVerticalFlow: boolean = false;
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let doneColumnName: string | undefined = undefined;
	export let accentColor: string | undefined = undefined;

	// The parent row or column handles collapse state for layout,
	// but cell might hide its contents if collapsed.
	export let isCollapsed: boolean = false;

	$: column = cell.primaryId;
	$: tasks = cell.tasks;
	$: columnTitle = primaryAxisLabel;
	$: fileGroupPath =
		secondaryAxisBucket.meta?.source?.kind === "file" &&
		typeof secondaryAxisBucket.meta.value === "string"
			? secondaryAxisBucket.meta.value
			: null;
	$: fileGroupTargetFile = (() => {
		if (!fileGroupPath) return null;
		const file = app.vault.getAbstractFileByPath(fileGroupPath);
		return file instanceof TFile ? file : null;
	})();
	$: effectiveTargetTaskFile = fileGroupTargetFile ?? targetTaskFile;
	$: effectiveTargetFileIsDefault = fileGroupTargetFile
		? false
		: targetFileIsDefault;

	$: isColTag = isColumnTag(column, columnTagTableStore);

	// Selection state
	$: isSelectMode = isInSelectionMode(column, $selectionModeStore);
	$: columnTaskIds = primaryTasks.map((t) => t.id);
	$: selectedIds = columnTaskIds.filter((id) =>
		isTaskSelected(id, $taskSelectionStore),
	);
	$: taskSecondaryIds = Object.fromEntries(
		primaryTasks.map((task) => [task.id, task.path]),
	);

	let isDraggedOver = false;

	$: draggingData = $isDraggingStore;
	$: hasSelectedTaskOutsideTargetFile =
		!!draggingData &&
		!!fileGroupTargetFile &&
		draggingData.draggedTaskIds.some(
			(id) => draggingData?.taskSecondaryIds[id] !== fileGroupTargetFile.path,
		);
	$: isSameSwimlaneColumnDrop =
		!!draggingData &&
		draggingData.fromColumn !== column &&
		draggingData.fromSecondaryId === cell.secondaryId;
	$: isFileSwimlaneDrop =
		!!draggingData &&
		!!fileGroupTargetFile &&
		(draggingData.fromSecondaryId !== cell.secondaryId ||
			hasSelectedTaskOutsideTargetFile);
	$: canDrop = isSameSwimlaneColumnDrop || isFileSwimlaneDrop;

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

		const droppedIds =
			draggingData.draggedTaskIds.length > 0
				? draggingData.draggedTaskIds
				: (() => {
						const id = e.dataTransfer?.getData("text/plain");
						return id ? [id] : [];
					})();

		if (droppedIds.length === 0) return;

		if (isFileSwimlaneDrop && fileGroupTargetFile) {
			const droppedIdsBySourceSwimlane = groupIdsBySecondaryId(
				droppedIds,
				draggingData.taskSecondaryIds,
			);

			for (const [sourceFilePath, ids] of droppedIdsBySourceSwimlane) {
				if (sourceFilePath === fileGroupTargetFile.path) {
					await applyColumnChange(ids);
				} else {
					await taskActions.moveTasksToFile(
						ids,
						fileGroupTargetFile,
						column,
					);
				}
			}
		} else {
			await applyColumnChange(droppedIds);
		}

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

		if (!content || !file || !isColTag) {
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
		if (!isColTag) {
			return;
		}

		if (fileGroupTargetFile) {
			pendingNewTask = fileGroupTargetFile;
			return;
		}

		taskActions.pickFileForNewTask(column, e, (file) => {
			pendingNewTask = file;
		});
	}

	function handleChooseTaskFileClick(e: MouseEvent) {
		if (!isColTag) {
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

	function groupIdsBySecondaryId(
		taskIds: string[],
		taskSecondaryIds: Record<string, string>,
	): Map<string, string[]> {
		const grouped = new Map<string, string[]>();
		for (const id of taskIds) {
			const secondaryId = taskSecondaryIds[id] ?? "";
			const ids = grouped.get(secondaryId) ?? [];
			ids.push(id);
			grouped.set(secondaryId, ids);
		}
		return grouped;
	}

	async function applyColumnChange(taskIds: string[]) {
		for (const id of taskIds) {
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
	}
</script>

<!-- The cell is hidden if the column/row is collapsed (unless vertical flow, though horizontal flow is default) -->
<div
	class="tasks-wrapper"
	class:vertical-flow={isVerticalFlow}
	class:collapsed={isCollapsed && !isVerticalFlow}
	class:vertical-collapsed={isCollapsed && isVerticalFlow}
	class:drop-active={!!draggingData}
	class:drop-hover={isDraggedOver}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
	role="region"
	aria-label="Tasks for {columnTitle}"
>
	{#if isColTag}
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
		{#if effectiveTargetTaskFile}
			<div class="file-indicator">
				<span class="file-indicator-arrow">→</span>
				<span class="file-indicator-name" title={effectiveTargetTaskFile.path}>{effectiveTargetTaskFile.name}</span>
				{#if effectiveTargetFileIsDefault}
					<span class="file-indicator-label">(default)</span>
				{/if}
			</div>
		{/if}
	{/if}
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
	<div class="tasks">
		{#each tasks as task}
			<TaskComponent
				{app}
					{task}
					{taskActions}
					{columnTagTableStore}
					{showFilepath}
					{consolidateTags}
					displayColumn={column}
					displaySecondaryId={cell.secondaryId}
					isSelectionMode={isSelectMode}
				isSelected={isTaskSelected(task.id, $taskSelectionStore)}
				onToggleSelection={() => toggleTaskSelection(task.id)}
				selectedTaskIds={selectedIds}
				{taskSecondaryIds}
				{doneColumnName}
				{accentColor}
			/>
		{/each}
	</div>
</div>

<style lang="scss">
	.tasks-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 100%;
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-s);

		/* The wrapper should be invisible if collapsed in horizontal mode */
		&.collapsed {
			display: none;
		}

		&.vertical-collapsed {
			display: none;
		}

		&.vertical-flow {
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

		&.drop-active {
			.tasks {
				opacity: 0.4;
			}
		}

		&.drop-hover {
			border-color: color-mix(in srgb, var(--column-color, var(--interactive-accent)) 75%, transparent);
			background: color-mix(in srgb, var(--column-color, var(--interactive-accent)) 10%, transparent);
		}

		.tasks {
			display: flex;
			flex-direction: column;
			gap: var(--size-4-3);
			padding-top: var(--size-4-4);
		}

		.new-task-input {
			margin-top: var(--size-4-3);
			background-color: var(--background-primary);
			border-radius: var(--radius-s);
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
			min-height: 32px;
			font-weight: var(--font-medium);

			span {
				height: 18px;
			}
		}

		.add-new-controls {
			display: inline-flex;
			align-items: center;
			align-self: flex-start;
			border: var(--border-width) solid var(--background-modifier-border);
			border-radius: var(--radius-s);
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
			font-size: var(--font-ui-small);
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
</style>
