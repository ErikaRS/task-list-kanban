<script lang="ts">
	import type { TFile } from "obsidian";
	import type { Readable } from "svelte/store";
	import { type ColumnTagTable, isColumnTag } from "../columns/columns";
	import type { PrimaryBucketId } from "./board_matrix";
	import type { NewTaskColumn, TaskActions } from "../tasks/actions";
	import DateInputFields, { type DateFieldValues } from "../components/DateInputFields.svelte";
	import IconButton from "../components/icon_button.svelte";
	import {
		getPropertyWriteAdapter,
		PropertySchemaOption,
		type EditableDatePropertyKey,
	} from "../../parsing/properties";

	export let taskActions: TaskActions;
	export let column: PrimaryBucketId;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnTitle: string;
	export let additionalTags: string[] = [];
	/** The file a file-group lane creates tasks in; skips the picker menu. */
	export let fileGroupTargetFile: TFile | null = null;
	/** The file shown in the "→ file" indicator. */
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let isVerticalFlow: boolean = false;

	let pendingNewTask: TFile | null = null;
	let pendingCancelled = false;
	let newTaskTextAreaEl: HTMLTextAreaElement | undefined;
	let newTaskInputEl: HTMLDivElement | undefined;
	let addNewButtonEl: HTMLDivElement | undefined;
	const emptyDateValues: DateFieldValues = { due: "", scheduled: "", start: "" };
	let newTaskDateValues: DateFieldValues = { ...emptyDateValues };
	$: canEditNewTaskDates = getPropertyWriteAdapter(propertySchemaOption) !== null;
	$: canCreateInColumn = isNewTaskColumn(column);

	function isNewTaskColumn(value: PrimaryBucketId): value is NewTaskColumn {
		return value === "uncategorised" || value === "done" || isColumnTag(value, columnTagTableStore);
	}

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

		if (!content || !file || !isNewTaskColumn(targetColumn)) {
			newTaskDateValues = { ...emptyDateValues };
			return;
		}

		await taskActions.createTask(
			file,
			content,
			targetColumn,
			additionalTags,
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
		if (!isNewTaskColumn(targetColumn)) {
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
		if (!isNewTaskColumn(targetColumn)) {
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

	export function startNewTaskFromCommand() {
		if (pendingNewTask || !addNewButtonEl) {
			return false;
		}
		handleAddNewClick({
			target: addNewButtonEl,
		} as unknown as MouseEvent);
		return true;
	}
</script>

{#if canCreateInColumn}
	<div class="add-new-controls" class:vertical-flow={isVerticalFlow}>
		<div
			bind:this={addNewButtonEl}
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
	{#if targetTaskFile}
		<div class="file-indicator" class:vertical-flow={isVerticalFlow}>
			<span class="file-indicator-arrow">→</span>
			<span class="file-indicator-name" title={targetTaskFile.path}>{targetTaskFile.name}</span>
			{#if targetFileIsDefault}
				<span class="file-indicator-label">(default)</span>
			{/if}
		</div>
	{/if}
{/if}
{#if pendingNewTask}
	<div
		class="new-task-input"
		class:vertical-flow={isVerticalFlow}
		bind:this={newTaskInputEl}
		on:focusout={handleNewTaskSave}
	>
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

<style lang="scss">
	/*
	 * These elements are direct flex children of BoardCell's .tasks-wrapper
	 * (Svelte components do not add a wrapper element). In vertical flow the
	 * wrapper reorders its children; the order values here must stay in sync
	 * with .tasks (order 1) in BoardCell.
	 */
	.add-new-controls.vertical-flow {
		order: 2;
	}

	.file-indicator.vertical-flow {
		order: 3;
	}

	.new-task-input.vertical-flow {
		order: 4;
		width: var(--column-width, 300px);
		box-sizing: border-box;
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

	.add-new-controls :global(.add-new-picker-btn) {
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
	.add-new-controls :global(.add-new-picker-btn) {
		background-color: transparent;
	}

	.add-new-btn:hover:not(.disabled),
	.add-new-controls :global(.add-new-picker-btn:hover:not(.disabled)) {
		background-color: transparent;
		color: var(--text-accent-hover);
	}

	.add-new-btn:active:not(.disabled),
	.add-new-controls :global(.add-new-picker-btn:active:not(.disabled)) {
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
</style>
