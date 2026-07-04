<script lang="ts">
	import type { DateFilterCondition } from "../settings/settings_store";
	import { DATE_FILTER_OPERATORS, TODAY_FILTER_VALUE } from "./date_filter";
	import { parseDateOnly } from "../../parsing/properties/value_parsers";
	import {
		serializeFilterQuery,
		type FilterQuery,
	} from "./filter_query";

	export let query: FilterQuery;
	export let dateKeys: { key: string; label: string }[] = [];
	export let onChange: (query: FilterQuery) => void;

	// Local row state mirrors the query but may hold work-in-progress rows
	// (an empty term, a date row without a date yet) that are not emitted.
	// Rows rebuild from the incoming query only when it differs from what
	// this editor last emitted, so typing here never loses focus to a
	// rebuild, while bar edits still flow in.
	let contentRows: string[] = [];
	let tagRows: string[] = [];
	let fileRows: string[] = [];
	let dateRows: DateFilterCondition[] = [];
	let lastEmittedKey: string | undefined;

	$: syncFromQuery(query);

	function syncFromQuery(incoming: FilterQuery) {
		if (serializeFilterQuery(incoming) === lastEmittedKey) {
			return;
		}
		lastEmittedKey = serializeFilterQuery(incoming);
		contentRows = [...incoming.contentTerms];
		tagRows = incoming.tagGroups.map((group) => group.join(","));
		fileRows = [...incoming.filePaths];
		dateRows = incoming.dateConditions.map((condition) => ({ ...condition }));
	}

	function isCompleteDateCondition(condition: DateFilterCondition): boolean {
		return (
			condition.value === TODAY_FILTER_VALUE ||
			parseDateOnly(condition.value) !== null
		);
	}

	function rowsToQuery(): FilterQuery {
		return {
			contentTerms: contentRows
				.map((term) => term.trim())
				.filter((term) => term !== ""),
			tagGroups: tagRows
				.map((row) =>
					row
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag !== ""),
				)
				.filter((group) => group.length > 0),
			filePaths: fileRows
				.map((path) => path.trim())
				.filter((path) => path !== ""),
			dateConditions: dateRows
				.filter(isCompleteDateCondition)
				.map((condition) => ({ ...condition })),
		};
	}

	function emit() {
		const next = rowsToQuery();
		lastEmittedKey = serializeFilterQuery(next);
		onChange(next);
	}

	function updateDateRow(index: number, patch: Partial<DateFilterCondition>) {
		dateRows = dateRows.map((condition, i) =>
			i === index ? { ...condition, ...patch } : condition,
		);
		emit();
	}

	function addDateRow() {
		const property =
			dateKeys.find((key) => key.key === "scheduled")?.key ??
			dateKeys[0]?.key;
		if (!property) return;
		dateRows = [
			...dateRows,
			{ property, operator: "on-or-before", value: TODAY_FILTER_VALUE },
		];
		emit();
	}

	// A date-shaped content term means the user typed a date token the
	// current schema can't interpret; surface the schema hint for it.
	$: hasDateShapedTerm = query.contentTerms.some((term) =>
		/^[^\s:"]+:(<=|>=|<|>|=)/.test(term),
	);
</script>

<div class="filter-editor">
	<section>
		<span class="section-title">Content</span>
		{#each contentRows as _, index}
			<div class="editor-row">
				<input
					type="text"
					bind:value={contentRows[index]}
					on:input={emit}
					placeholder="Text to match"
					aria-label="Content term"
					spellcheck="false"
				/>
				<button
					class="row-remove"
					aria-label="Remove content term"
					on:click={() => {
						contentRows = contentRows.filter((_, i) => i !== index);
						emit();
					}}
				>
					×
				</button>
			</div>
		{/each}
		<button
			class="add-row-btn"
			on:click={() => (contentRows = [...contentRows, ""])}
		>
			+ Add term
		</button>
	</section>

	<section>
		<span class="section-title">Tags</span>
		{#each tagRows as _, index}
			<div class="editor-row">
				<input
					type="text"
					bind:value={tagRows[index]}
					on:input={emit}
					placeholder="tag, tag (any of)"
					aria-label="Tag group (comma-separated, any of)"
					spellcheck="false"
				/>
				<button
					class="row-remove"
					aria-label="Remove tag group"
					on:click={() => {
						tagRows = tagRows.filter((_, i) => i !== index);
						emit();
					}}
				>
					×
				</button>
			</div>
		{/each}
		<button class="add-row-btn" on:click={() => (tagRows = [...tagRows, ""])}>
			+ Add tag group
		</button>
		{#if tagRows.length > 0}
			<p class="section-hint">
				Commas within a group mean "any of"; groups must all match.
			</p>
		{/if}
	</section>

	<section>
		<span class="section-title">Files</span>
		{#each fileRows as _, index}
			<div class="editor-row">
				<input
					type="text"
					bind:value={fileRows[index]}
					on:input={emit}
					placeholder="Path to match"
					aria-label="File path"
					spellcheck="false"
				/>
				<button
					class="row-remove"
					aria-label="Remove file path"
					on:click={() => {
						fileRows = fileRows.filter((_, i) => i !== index);
						emit();
					}}
				>
					×
				</button>
			</div>
		{/each}
		<button class="add-row-btn" on:click={() => (fileRows = [...fileRows, ""])}>
			+ Add file
		</button>
	</section>

	<section>
		<span class="section-title">Date</span>
		{#if dateKeys.length === 0}
			{#if hasDateShapedTerm}
				<p class="section-hint">
					Enable a property schema in the board settings to filter by
					date; date-shaped tokens currently match as text.
				</p>
			{:else}
				<p class="section-hint">
					Enable a property schema in the board settings to filter by date.
				</p>
			{/if}
		{:else}
			{#each dateRows as condition, index}
				<div class="date-condition-row">
					<div class="date-condition-selectors">
						<select
							class="dropdown"
							value={condition.property}
							aria-label="Date property"
							on:change={(e) =>
								updateDateRow(index, { property: e.currentTarget.value })}
						>
							{#if !dateKeys.some((key) => key.key === condition.property)}
								<option value={condition.property}>{condition.property}</option>
							{/if}
							{#each dateKeys as key}
								<option value={key.key}>{key.label}</option>
							{/each}
						</select>
						<select
							class="dropdown"
							value={condition.operator}
							aria-label="Date comparison"
							on:change={(e) =>
								updateDateRow(index, {
									operator: e.currentTarget.value as DateFilterCondition["operator"],
								})}
						>
							{#each DATE_FILTER_OPERATORS as operator}
								<option value={operator.value}>{operator.label}</option>
							{/each}
						</select>
						<button
							class="row-remove"
							aria-label="Remove date condition"
							on:click={() => {
								dateRows = dateRows.filter((_, i) => i !== index);
								emit();
							}}
						>
							×
						</button>
					</div>
					<div class="date-condition-value">
						<label class="date-value-choice">
							<input
								type="radio"
								name={"filter-editor-date-value-" + index}
								checked={condition.value === TODAY_FILTER_VALUE}
								on:change={() =>
									updateDateRow(index, { value: TODAY_FILTER_VALUE })}
							/>
							Today
						</label>
						<label class="date-value-choice">
							<input
								type="radio"
								name={"filter-editor-date-value-" + index}
								checked={condition.value !== TODAY_FILTER_VALUE}
								on:change={() => updateDateRow(index, { value: "" })}
							/>
							Date
						</label>
						{#if condition.value !== TODAY_FILTER_VALUE}
							<input
								type="date"
								value={condition.value}
								aria-label="Comparison date"
								on:change={(e) =>
									updateDateRow(index, { value: e.currentTarget.value })}
							/>
						{/if}
					</div>
				</div>
			{/each}
			<button class="add-row-btn" on:click={addDateRow}>
				+ Add condition
			</button>
		{/if}
	</section>
</div>

<style lang="scss">
	.filter-editor {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 200;
		margin-top: var(--size-2-1);
		padding: var(--size-4-3);
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-s);
		max-height: 70vh;
		overflow-y: auto;

		section {
			display: flex;
			flex-direction: column;
			gap: var(--size-2-2);

			.section-title {
				font-weight: 600;
				font-size: var(--font-ui-small);
			}
		}

		.editor-row {
			display: flex;
			align-items: center;
			gap: var(--size-2-2);

			input[type="text"] {
				flex: 1 1 auto;
				min-width: 0;
				background: var(--background-primary);
			}
		}

		.row-remove {
			flex: 0 0 auto;
			padding: var(--size-2-1);
			background: transparent;
			border: none;
			box-shadow: none;
			cursor: pointer;
			color: var(--text-muted);
			font-size: 18px;
			line-height: 1;

			&:hover {
				color: var(--color-red);
			}
		}

		.add-row-btn {
			align-self: flex-start;
			padding: var(--size-2-1) var(--size-2-3);
			background: transparent;
			color: var(--text-muted);
			border: 1px solid var(--background-modifier-border);
			border-radius: var(--radius-s);
			cursor: pointer;
			font-size: var(--font-ui-small);

			&:hover {
				background: var(--background-modifier-hover);
			}
		}

		.section-hint {
			margin: 0;
			color: var(--text-muted);
			font-size: var(--font-ui-small);
		}

		// An inner card per condition, so a condition's controls stay
		// visually grouped (markup carried over from the SPEC_0028 sidebar).
		.date-condition-row {
			display: flex;
			flex-direction: column;
			gap: var(--size-2-2);
			padding: var(--size-2-2) var(--size-2-3);
			border: 1px solid var(--background-modifier-border);
			border-radius: var(--radius-s);
			background: var(--background-secondary);

			.date-condition-selectors {
				display: flex;
				align-items: center;
				gap: var(--size-2-2);

				select.dropdown {
					flex: 0 1 auto;
					min-width: 0;
				}
			}

			.date-condition-value {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--size-2-2);
				font-size: var(--font-ui-small);

				.date-value-choice {
					display: flex;
					align-items: center;
					gap: var(--size-2-1);
					cursor: pointer;
				}

				input[type="date"] {
					background: var(--background-primary);
				}
			}
		}
	}
</style>
