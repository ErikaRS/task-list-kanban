<script lang="ts">
	import {
		formatLocalDate,
		getPropertyByKey,
		getPropertyWriteAdapter,
		PropertySchemaOption,
		type EditableDatePropertyKey,
	} from "../../parsing/properties";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import DateInputFields from "./DateInputFields.svelte";

	type EditableDateKey = EditableDatePropertyKey;

	export let task: Task;
	export let taskActions: TaskActions;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let isTaskEditing = false;
	export let isEditingDates = false;

	const editableDateFields: Array<{
		key: EditableDateKey;
		label: string;
		shortLabel: string;
	}> = [
		{ key: "due", label: "Due", shortLabel: "Due" },
		{ key: "scheduled", label: "Scheduled", shortLabel: "Sched" },
		{ key: "start", label: "Start", shortLabel: "Start" },
	];

	let isDateEditing = false;
	let draftDateValues: Record<EditableDateKey, string> = { due: "", scheduled: "", start: "" };
	let wasShowingDateInputs = false;

	$: dateEditingEnabled = getPropertyWriteAdapter(propertySchemaOption) !== null;
	$: dateValues = Object.fromEntries(
		editableDateFields.map((field) => [field.key, getDateValue(field.key)]),
	) as Record<EditableDateKey, string>;
	$: showDateInputs = dateEditingEnabled && (isTaskEditing || isDateEditing);
	$: showReadChips = dateEditingEnabled && !showDateInputs;
	$: isEditingDates = showDateInputs;
	$: {
		if (showDateInputs && !wasShowingDateInputs) {
			draftDateValues = { ...dateValues };
		}
		wasShowingDateInputs = showDateInputs;
	}

	function getDateValue(key: EditableDateKey): string {
		const property = getPropertyByKey(task.properties, key);
		return property?.value instanceof Date ? formatLocalDate(property.value) : "";
	}

	function openDateEditor() {
		draftDateValues = { ...dateValues };
		isDateEditing = true;
	}

	// When the inputs are only visible because the task text is being edited,
	// clicking one blurs the textarea, which ends task editing and would
	// unmount the inputs mid-click. Pinning isDateEditing on first interaction
	// keeps the editor open until Done. Capture-phase, because the inputs stop
	// mousedown propagation; mousedown also fires before the textarea's blur.
	function pinDateEditing() {
		isDateEditing = true;
	}

	function handleDraftDateChange(key: EditableDateKey, value: string) {
		draftDateValues = {
			...draftDateValues,
			[key]: value,
		};
	}

	async function saveDraftDates() {
		const edits = editableDateFields
			.map(({ key }) => ({ key, value: draftDateValues[key] ?? "" }))
			.filter(({ key, value }) => value !== dateValues[key]);
		isDateEditing = false;
		if (edits.length > 0) {
			await taskActions.applyDateEdits(task.id, edits);
		}
	}
</script>

{#if showReadChips}
	<div
		class="task-date-fields read-mode"
		role="group"
		aria-label="Task dates"
		draggable="false"
	>
		<button
			class="add-date-button"
			type="button"
			title="Edit task dates"
			on:mousedown|stopPropagation
			on:mouseup|stopPropagation
			on:click={openDateEditor}
			on:keydown|stopPropagation
		>
			<span aria-hidden="true">+</span>
			Date
		</button>
	</div>
{:else if showDateInputs}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="task-date-fields edit-mode"
		role="group"
		aria-label="Edit task dates"
		on:mousedown|capture={pinDateEditing}
		on:focusin={pinDateEditing}
	>
		<DateInputFields
			values={draftDateValues}
			onDateChange={handleDraftDateChange}
			showDoneButton={true}
			onDone={saveDraftDates}
		/>
	</div>
{/if}

<style lang="scss">
	.task-date-fields {
		display: contents;
		font-size: var(--font-ui-smaller);
	}

	.add-date-button {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		height: auto;
		min-height: 0;
		padding: 0 var(--size-2-2);
		margin: 0;
		border: none;
		border-radius: var(--radius-s);
		background: transparent;
		color: var(--text-accent);
		box-shadow: none;
		font-size: inherit;
		font-weight: var(--font-medium);
		line-height: inherit;
	}

	.add-date-button span {
		font-size: inherit;
		line-height: 1;
	}

	.add-date-button:hover {
		background: transparent;
		color: var(--text-accent-hover);
		box-shadow: none;
	}

	.edit-mode {
		display: flex;
		width: 100%;
		padding-top: var(--size-2-1);
		border-top: var(--border-width) solid var(--background-modifier-border);
	}
</style>
