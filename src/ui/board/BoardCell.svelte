<script lang="ts">
	import { type App, TFile } from "obsidian";
	import type { AxisBucket, BoardCell, SecondaryBucketId } from "./board_matrix";
	import {
		type ColumnTagTable,
		isColumnTag,
	} from "../columns/columns";
	import { deriveCellCreationMetadata } from "./cell_creation";
	import type { TaskActions } from "../tasks/actions";
	import { deriveDropPlan } from "./drop_plan";
	import type { Task } from "../tasks/task";
	import TaskComponent from "../components/task.svelte";
	import DateInputFields, { type DateFieldValues } from "../components/DateInputFields.svelte";
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
	import { PropertyDisplayMode } from "../settings/settings_store";
	import { getPropertyWriteAdapter, PropertySchemaOption, type EditableDatePropertyKey } from "../../parsing/properties";
	import {
		computePinnedIds,
		type ManualOrderKey,
	} from "../tasks/manual_order";

	export let app: App;
	export let cell: BoardCell;
	export let primaryTasks: Task[] = [];
	export let secondaryAxisBucket: AxisBucket<SecondaryBucketId>;
	export let primaryAxisLabel: string;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let showFilepath: boolean;
	export let propertyDisplay: PropertyDisplayMode = PropertyDisplayMode.None;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let consolidateTags: boolean;
	export let excludedTags: string[] = [];
	export let isVerticalFlow: boolean = false;
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let doneColumnName: string | undefined = undefined;
	export let accentColor: string | undefined = undefined;
	export let treatNestedTasksAsSubtasks: boolean = false;
	// Manual ordering. `isManualOrder` controls marker display; `reorderEnabled`
	// controls whether the drag handle can mutate this cell's order.
	export let isManualOrder: boolean = false;
	export let manualOrderEntries: ManualOrderKey[] | undefined = undefined;
	export let reorderEnabled: boolean = false;

	// The parent row or column handles collapse state for layout,
	// but cell might hide its contents if collapsed.
	export let isCollapsed: boolean = false;

	$: column = cell.primaryId;
	$: tasks = cell.tasks;
	$: columnTitle = primaryAxisLabel;
	$: creationMetadata = deriveCellCreationMetadata(secondaryAxisBucket);
	$: fileGroupTargetFile = (() => {
		if (!creationMetadata.targetFilePath) return null;
		const file = app.vault.getAbstractFileByPath(creationMetadata.targetFilePath);
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

	$: pinnedIds = isManualOrder
		? computePinnedIds(tasks, manualOrderEntries)
		: new Set<string>();
	$: displayIds = tasks.map((t) => t.id);

	// Intra-cell manual reorder. A single-task, same-cell drag
	// is treated as a reorder; everything else (cross-column, multi-select) keeps
	// the existing column-change behavior handled at the wrapper level.
	let reorderOverId: string | null = null;
	let reorderPlaceBefore = false;

	$: isManualReorderDrag =
		reorderEnabled &&
		!!draggingData &&
		draggingData.fromColumn === column &&
		draggingData.fromSecondaryId === cell.secondaryId &&
		draggingData.draggedTaskIds.length === 1;

	function computeTargetIndex(
		draggedId: string,
		overId: string,
		placeBefore: boolean,
	): number {
		const without = displayIds.filter((id) => id !== draggedId);
		const overPos = without.indexOf(overId);
		if (overPos === -1) return without.length;
		return placeBefore ? overPos : overPos + 1;
	}

	function handleReorderDragOver(e: DragEvent, overTaskId: string) {
		if (!isManualReorderDrag) return;
		e.preventDefault();
		e.stopPropagation();
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		reorderPlaceBefore = e.clientY < rect.top + rect.height / 2;
		reorderOverId = overTaskId;
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}

	function handleReorderDragLeave() {
		reorderOverId = null;
	}

	async function handleReorderDrop(e: DragEvent, overTaskId: string) {
		if (!isManualReorderDrag || !draggingData) return;
		e.preventDefault();
		e.stopPropagation();
		const draggedId = draggingData.draggedTaskIds[0];
		const placeBefore = reorderPlaceBefore;
		reorderOverId = null;
		// Dropping a task onto itself is a no-op.
		if (!draggedId || draggedId === overTaskId) return;
		const targetIndex = computeTargetIndex(draggedId, overTaskId, placeBefore);
		await taskActions.reorderTask(cell.secondaryId, column, displayIds, draggedId, targetIndex);
	}

	$: draggingData = $isDraggingStore;
	$: dropPlan = deriveDropPlan({
		dragging: draggingData,
		column,
		secondaryId: cell.secondaryId,
		bucketMeta: secondaryAxisBucket.meta,
		fileGroupTargetFilePath: fileGroupTargetFile?.path ?? null,
		canWriteProperties: getPropertyWriteAdapter(propertySchemaOption) !== null,
	});
	$: canDrop = dropPlan !== null;

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
		const plan = dropPlan;
		if (!plan || !draggingData) {
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

		switch (plan.kind) {
			case "move-to-file": {
				if (!fileGroupTargetFile) return;
				const droppedIdsBySourceSwimlane = groupIdsBySecondaryId(
					droppedIds,
					draggingData.taskSecondaryIds,
				);

				for (const [sourceFilePath, ids] of droppedIdsBySourceSwimlane) {
					if (sourceFilePath === plan.targetFilePath) {
						if (plan.changeColumn) await applyColumnChange(ids);
					} else {
						await taskActions.moveTasksToFile(
							ids,
							fileGroupTargetFile,
							column,
						);
					}
				}
				break;
			}
			case "set-tag":
				await taskActions.updateSwimlaneTag(
					droppedIds,
					plan.tag,
					plan.prefix,
					excludedTags,
					plan.includeTags,
				);
				if (plan.changeColumn) await applyColumnChange(droppedIds);
				break;
			case "set-property":
				await taskActions.updateSwimlaneProperty(droppedIds, plan.key, plan.value);
				if (plan.changeColumn) await applyColumnChange(droppedIds);
				break;
			case "column-only":
				await applyColumnChange(droppedIds);
				break;
		}

		clearColumnSelections(droppedIds);
	}

	// Inline task creation
	let pendingNewTask: TFile | null = null;
	let pendingCancelled = false;
	let newTaskTextAreaEl: HTMLTextAreaElement | undefined;
	let newTaskInputEl: HTMLDivElement | undefined;
	const emptyDateValues: DateFieldValues = { due: "", scheduled: "", start: "" };
	let newTaskDateValues: DateFieldValues = { ...emptyDateValues };
	$: canEditNewTaskDates = getPropertyWriteAdapter(propertySchemaOption) !== null;

	async function handleNewTaskSave(event?: FocusEvent) {
		const nextTarget = event?.relatedTarget;
		if (nextTarget instanceof Node && newTaskInputEl?.contains(nextTarget)) {
			return;
		}

		if (pendingCancelled) {
			pendingCancelled = false;
			pendingNewTask = null;
			newTaskDateValues = { ...emptyDateValues };
			return;
		}

		const content = newTaskTextAreaEl?.value?.trim();
		const file = pendingNewTask;
		const targetColumn = column;
		pendingNewTask = null;

		if (!content || !file || !isColumnTag(targetColumn, columnTagTableStore)) {
			newTaskDateValues = { ...emptyDateValues };
			return;
		}

		await taskActions.createTask(
			file,
			content,
			targetColumn,
			creationMetadata.additionalTags,
			newTaskDateValues,
		);
		newTaskDateValues = { ...emptyDateValues };
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

	function handleAddNewClick(e: MouseEvent | KeyboardEvent) {
		const targetColumn = column;
		if (!isColumnTag(targetColumn, columnTagTableStore)) {
			return;
		}

		newTaskDateValues = { ...emptyDateValues };
		if (fileGroupTargetFile) {
			pendingNewTask = fileGroupTargetFile;
			return;
		}

		taskActions.pickFileForNewTask(targetColumn, e, (file) => {
			newTaskDateValues = { ...emptyDateValues };
			pendingNewTask = file;
		});
	}

	function handleChooseTaskFileClick(e: MouseEvent | KeyboardEvent) {
		const targetColumn = column;
		if (!isColumnTag(targetColumn, columnTagTableStore)) {
			return;
		}

		taskActions.pickFileForNewTask(
			targetColumn,
			e,
			(file) => {
				newTaskDateValues = { ...emptyDateValues };
				pendingNewTask = file;
			},
			true,
		);
	}

	function handleNewTaskDateChange(
		key: EditableDatePropertyKey,
		value: string,
	) {
		newTaskDateValues = {
			...newTaskDateValues,
			[key]: value,
		};
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
		await taskActions.moveTasksToColumn(taskIds, column);
	}
</script>

<!-- The cell is hidden if the column/row is collapsed (unless vertical flow, though horizontal flow is default) -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="tasks-wrapper"
	class:vertical-flow={isVerticalFlow}
	class:collapsed={isCollapsed && !isVerticalFlow}
	class:vertical-collapsed={isCollapsed && isVerticalFlow}
	class:drop-active={!!draggingData && !isManualReorderDrag}
	class:drop-hover={isDraggedOver}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
>
	{#if isColTag}
		<div class="add-new-controls">
			<div
				class="add-new-btn"
				class:disabled={!!pendingNewTask}
				role="button"
				tabindex={pendingNewTask ? -1 : 0}
				aria-label="Add new task to {columnTitle}"
				aria-disabled={!!pendingNewTask}
				on:click={!pendingNewTask ? handleAddNewClick : undefined}
				on:keydown={(e) => {
					if (!pendingNewTask && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						handleAddNewClick(e);
					}
				}}
			>
				<span aria-hidden="true">+</span>
				Task
			</div>
			<IconButton
				class="add-new-picker-btn {pendingNewTask ? 'disabled' : ''}"
				icon="lucide-chevron-down"
				aria-label="Choose file for new task in {columnTitle}"
				disabled={!!pendingNewTask}
				on:click={(e) => {
					if (!pendingNewTask) handleChooseTaskFileClick(e);
				}}
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
		<div class="new-task-input" bind:this={newTaskInputEl} on:focusout={handleNewTaskSave}>
			<textarea
				bind:this={newTaskTextAreaEl}
				on:keydown={handleNewTaskKeydown}
				placeholder="Task name..."
			></textarea>
			{#if canEditNewTaskDates}
				<div class="new-task-date-fields">
					<DateInputFields
						values={newTaskDateValues}
						onDateChange={handleNewTaskDateChange}
					/>
				</div>
			{/if}
		</div>
	{/if}
	<div class="tasks">
		{#each tasks as task (task.id)}
			<div
				class="task-slot"
				class:drop-before={isManualReorderDrag && reorderOverId === task.id && reorderPlaceBefore}
				class:drop-after={isManualReorderDrag && reorderOverId === task.id && !reorderPlaceBefore}
				role="presentation"
				on:dragover={(e) => handleReorderDragOver(e, task.id)}
				on:drop={(e) => handleReorderDrop(e, task.id)}
				on:dragleave={handleReorderDragLeave}
			>
				<TaskComponent
					{app}
						{task}
						{taskActions}
						{columnTagTableStore}
						{showFilepath}
						{propertyDisplay}
						{propertySchemaOption}
						{consolidateTags}
						{excludedTags}
						{treatNestedTasksAsSubtasks}
						displayColumn={column}
						displaySecondaryId={cell.secondaryId}
						isSelectionMode={isSelectMode}
					isSelected={isTaskSelected(task.id, $taskSelectionStore)}
					onToggleSelection={() => toggleTaskSelection(task.id)}
					selectedTaskIds={selectedIds}
					{taskSecondaryIds}
					{doneColumnName}
					{accentColor}
					{isManualOrder}
					isPinned={pinnedIds.has(task.id)}
					showDragHandle={reorderEnabled}
					onUnpin={() => taskActions.unpinTask(cell.secondaryId, column, task.id)}
				/>
			</div>
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
				order: 1;
				flex-direction: row;
				flex-wrap: nowrap;
				align-items: flex-start;
				min-width: max-content;

				:global(.task) {
					width: var(--column-width, 300px);
					flex-shrink: 0;
				}
			}

			.task-slot {
				flex: 0 0 var(--column-width, 300px);
			}

			.new-task-input {
				order: 4;
				width: var(--column-width, 300px);
				box-sizing: border-box;
			}

			.add-new-controls {
				order: 2;
			}

			.file-indicator {
				order: 3;
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
			gap: var(--size-4-2);
			padding-top: var(--size-4-2);
		}

		.task-slot {
			position: relative;

			&.drop-before::before,
			&.drop-after::before {
				content: "";
				position: absolute;
				left: 8px;
				right: 8px;
				height: 2px;
				background: var(--column-color, var(--interactive-accent));
				pointer-events: none;
			}

			&.drop-before::after,
			&.drop-after::after {
				content: "";
				position: absolute;
				left: 4px;
				width: 10px;
				height: 10px;
				border-radius: 999px;
				background: var(--column-color, var(--interactive-accent));
				pointer-events: none;
			}

			&.drop-before::before {
				top: calc(-1 * var(--size-4-1) - 1px);
			}

			&.drop-before::after {
				top: calc(-1 * var(--size-4-1) - 5px);
			}

			&.drop-after::before {
				bottom: calc(-1 * var(--size-4-1) - 1px);
			}

			&.drop-after::after {
				bottom: calc(-1 * var(--size-4-1) - 5px);
			}
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

		.new-task-date-fields {
			margin-top: var(--size-2-3);
		}

		.add-new-btn {
			display: inline-flex;
			align-items: center;
			gap: var(--size-2-1);
			align-self: flex-start;
			cursor: pointer;
			border: 0;
			border-radius: var(--radius-s);
			box-shadow: none;
			margin: 0;
			min-height: 26px;
			padding: 0;
			background: transparent;
			background-color: transparent;
			color: var(--text-accent);
			font-size: var(--font-ui-small);
			font-weight: var(--font-medium);
			line-height: 1.2;

			span {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				font-size: var(--font-ui-medium);
				line-height: 1;
			}

			&.disabled {
				cursor: not-allowed;
				opacity: 0.5;
				color: var(--text-muted);
				pointer-events: none;
			}
		}

		.add-new-controls {
			display: inline-flex;
			align-items: center;
			gap: var(--size-2-1);
			align-self: flex-start;
			border: 0;
			background: transparent;
			box-shadow: none;
		}

		:global(.add-new-picker-btn) {
			flex-shrink: 0;
			width: 22px;
			height: 26px;
			border: 0;
			border-radius: var(--radius-s);
			box-shadow: none;
			margin: 0;
			background-color: transparent;
			color: var(--text-accent);

			&.disabled {
				cursor: not-allowed;
				opacity: 0.5;
				color: var(--text-muted);
				pointer-events: none;
			}
		}

		.add-new-btn,
		:global(.add-new-picker-btn) {
			background-color: transparent;
		}

		.add-new-btn:hover:not(.disabled),
		:global(.add-new-picker-btn:hover:not(.disabled)) {
			background-color: transparent;
			color: var(--text-accent-hover);
		}

		.add-new-btn:active:not(.disabled),
		:global(.add-new-picker-btn:active:not(.disabled)) {
			background-color: transparent;
			color: var(--text-accent-hover);
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
