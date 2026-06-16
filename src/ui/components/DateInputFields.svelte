<script lang="ts">
	import type { WritableDatePropertyKey } from "../../parsing/properties";

	type EditableDateKey = Exclude<WritableDatePropertyKey, "completion">;

	export type DateFieldValues = Record<EditableDateKey, string>;

	export let values: DateFieldValues;
	export let onDateChange: (key: EditableDateKey, value: string) => void | Promise<void>;
	export let showDoneButton = false;
	export let onDone: () => void = () => {};

	const editableDateFields: Array<{
		key: EditableDateKey;
		label: string;
	}> = [
		{ key: "due", label: "Due" },
		{ key: "scheduled", label: "Scheduled" },
		{ key: "start", label: "Start" },
	];
</script>

<div class="date-input-fields" role="group" aria-label="Edit task dates" draggable="false">
	{#each editableDateFields as field (field.key)}
		<label class="date-input-field">
			<span>{field.label}</span>
			<input
				type="date"
				value={values[field.key]}
				on:mousedown|stopPropagation
				on:mouseup|stopPropagation
				on:click|stopPropagation
				on:change={(event) => onDateChange(field.key, event.currentTarget.value)}
				on:keydown|stopPropagation
			/>
		</label>
	{/each}
	{#if showDoneButton}
		<button
			class="done-date-editing"
			type="button"
			on:mousedown|stopPropagation
			on:mouseup|stopPropagation
			on:click={onDone}
			on:keydown|stopPropagation
		>
			Done
		</button>
	{/if}
</div>

<style lang="scss">
	.date-input-fields {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--size-2-2);
		width: 100%;
	}

	.date-input-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 116px;
		flex: 1 1 116px;
		color: var(--text-muted);
		font-size: var(--font-smallest);
		text-transform: uppercase;
	}

	.date-input-field input {
		width: 100%;
		min-height: 28px;
		font-size: var(--font-ui-smaller);
		text-transform: none;
	}

	.done-date-editing {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		min-height: 28px;
		padding: 1px var(--size-2-2);
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		background: var(--background-secondary-alt);
		color: var(--text-muted);
		box-shadow: none;
		line-height: var(--line-height-tight);
	}

	.done-date-editing:hover {
		border-color: var(--text-muted);
		color: var(--text-normal);
		background: var(--background-secondary);
		box-shadow: none;
	}
</style>
