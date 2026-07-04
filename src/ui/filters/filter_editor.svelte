<script lang="ts">
	import { tick } from "svelte";
	import type {
		DateFilterCondition,
		DateFilterOperator,
	} from "../settings/settings_store";
	import { DATE_FILTER_OPERATORS, TODAY_FILTER_VALUE } from "./date_filter";
	import { parseDateOnly } from "../../parsing/properties/value_parsers";
	import {
		parseContentTerms,
		serializeContentTerms,
		serializeFilterQuery,
		type FilterQuery,
	} from "./filter_query";
	import {
		applyFilterSuggestion,
		getListSuggestions,
		stepSuggestionIndex,
		type FilterSuggestion,
	} from "./filter_suggestions";
	import FilterSuggestionList from "./filter_suggestion_list.svelte";

	export let query: FilterQuery;
	export let dateKeys: { key: string; label: string }[] = [];
	export let tagSuggestionItems: string[] = [];
	export let fileSuggestionItems: string[] = [];
	export let onChange: (query: FilterQuery) => void;
	export let onSearch: () => void;
	export let onClear: () => void;

	// A date row may be incomplete (empty property/operator) while being
	// composed; only complete rows are emitted into the query.
	type DraftDateCondition = {
		property: string;
		operator: DateFilterOperator | "";
		value: string;
	};

	function emptyDateRow(): DraftDateCondition {
		return { property: "", operator: "", value: TODAY_FILTER_VALUE };
	}

	// Local row state mirrors the query but may hold work-in-progress rows
	// that are not emitted. Rows rebuild from the incoming query only when
	// it differs from what this editor last emitted, so typing here never
	// loses focus to a rebuild, while bar edits still flow in. Every
	// section starts expanded (Gmail-style) with an empty row.
	let contentRow = "";
	let tagRows: string[] = [""];
	let fileRow = "";
	let dateRows: DraftDateCondition[] = [emptyDateRow()];
	let lastEmittedKey: string | undefined;

	$: syncFromQuery(query);

	function syncFromQuery(incoming: FilterQuery) {
		if (serializeFilterQuery(incoming) === lastEmittedKey) {
			return;
		}
		lastEmittedKey = serializeFilterQuery(incoming);
		contentRow = serializeContentTerms(incoming.contentTerms);
		tagRows = incoming.tagGroups.map((group) => group.join(","));
		if (tagRows.length === 0) {
			tagRows = [""];
		}
		fileRow = incoming.filePaths.join(",");
		dateRows = incoming.dateConditions.map((condition) => ({ ...condition }));
		if (dateRows.length === 0) {
			dateRows = [emptyDateRow()];
		}
	}

	function isCompleteDateCondition(
		row: DraftDateCondition,
	): row is DraftDateCondition & { operator: DateFilterOperator } {
		return (
			row.property !== "" &&
			row.operator !== "" &&
			(row.value === TODAY_FILTER_VALUE || parseDateOnly(row.value) !== null)
		);
	}

	// `"` is the query syntax's quoting character. In the Content field it
	// is meaningful (phrase quoting); in tag/file fields it is not
	// expressible and is stripped as typed.
	function stripQuotes(value: string): string {
		return value.replace(/"/g, "");
	}

	function rowsToQuery(): FilterQuery {
		return {
			contentTerms: parseContentTerms(contentRow),
			tagGroups: tagRows
				.map((row) =>
					stripQuotes(row)
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag !== ""),
				)
				.filter((group) => group.length > 0),
			filePaths: stripQuotes(fileRow)
				.split(",")
				.map((path) => path.trim())
				.filter((path) => path !== ""),
			dateConditions: dateRows
				.filter(isCompleteDateCondition)
				.map((row): DateFilterCondition => ({
					property: row.property,
					operator: row.operator,
					value: row.value,
				})),
		};
	}

	function emit() {
		const next = rowsToQuery();
		lastEmittedKey = serializeFilterQuery(next);
		onChange(next);
	}

	// Enter in any editor field commits the search, like Gmail's options
	// panel.
	function onRowKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			onSearch();
		}
	}

	// --- Typed suggestions on the tag/file inputs (SPEC 0029 Phase 3) ---
	// One list at a time, owned by whichever input the user is typing in.
	// Tag rows and the file row are comma-separated "any of" lists, so the
	// same segment-scoped completion as the bar applies, minus the quoting
	// (these inputs strip `"`).
	type SuggestField = { kind: "tag"; index: number } | { kind: "file" };

	let activeSuggestField: SuggestField | null = null;
	let fieldSuggestions: FilterSuggestion[] = [];
	let fieldSuggestionIndex = -1;
	let tagInputEls: HTMLInputElement[] = [];
	let fileInputEl: HTMLInputElement | undefined;

	function fieldEl(field: SuggestField): HTMLInputElement | undefined {
		return field.kind === "tag" ? tagInputEls[field.index] : fileInputEl;
	}

	function fieldValue(field: SuggestField): string {
		return field.kind === "tag" ? tagRows[field.index] ?? "" : fileRow;
	}

	function refreshFieldSuggestions(field: SuggestField) {
		const value = fieldValue(field);
		const caret = fieldEl(field)?.selectionStart ?? value.length;
		fieldSuggestions = getListSuggestions(
			value,
			caret,
			field.kind === "tag" ? tagSuggestionItems : fileSuggestionItems,
			field.kind,
		);
		fieldSuggestionIndex = -1;
		activeSuggestField = fieldSuggestions.length > 0 ? field : null;
	}

	function hideFieldSuggestions() {
		activeSuggestField = null;
		fieldSuggestions = [];
		fieldSuggestionIndex = -1;
	}

	async function acceptFieldSuggestion(suggestion: FilterSuggestion) {
		const field = activeSuggestField;
		if (!field) {
			return;
		}
		const applied = applyFilterSuggestion(fieldValue(field), suggestion);
		if (field.kind === "tag") {
			tagRows[field.index] = applied.text;
		} else {
			fileRow = applied.text;
		}
		emit();
		hideFieldSuggestions();
		await tick();
		const el = fieldEl(field);
		el?.focus();
		el?.setSelectionRange(applied.caret, applied.caret);
	}

	function onSuggestingKeydown(e: KeyboardEvent) {
		if (activeSuggestField && fieldSuggestions.length > 0) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				fieldSuggestionIndex = stepSuggestionIndex(
					fieldSuggestions.length,
					fieldSuggestionIndex,
					e.key === "ArrowDown" ? 1 : -1,
				);
				return;
			}
			if (e.key === "Tab") {
				e.preventDefault();
				acceptFieldSuggestion(
					fieldSuggestions[Math.max(fieldSuggestionIndex, 0)]!,
				);
				return;
			}
			if (e.key === "Enter" && fieldSuggestionIndex >= 0) {
				e.preventDefault();
				acceptFieldSuggestion(fieldSuggestions[fieldSuggestionIndex]!);
				return;
			}
			if (e.key === "Escape") {
				// Dismiss only the suggestions; a second Esc (reaching the
				// window handler) collapses the whole editor.
				e.stopPropagation();
				hideFieldSuggestions();
				return;
			}
		}
		onRowKeydown(e);
	}

	function retargetFieldSuggestions(field: SuggestField) {
		// A click moves the caret; retarget an already-open list rather than
		// popping it open on mere focus.
		if (activeSuggestField) {
			refreshFieldSuggestions(field);
		}
	}

	function updateDateRow(index: number, patch: Partial<DraftDateCondition>) {
		dateRows = dateRows.map((condition, i) =>
			i === index ? { ...condition, ...patch } : condition,
		);
		emit();
	}

	function removeDateRow(index: number) {
		dateRows = dateRows.filter((_, i) => i !== index);
		if (dateRows.length === 0) {
			dateRows = [emptyDateRow()];
		}
		emit();
	}

	// A date-shaped content term means the user typed a date token the
	// current schema can't interpret; surface the schema hint for it.
	$: hasDateShapedTerm = query.contentTerms.some((term) =>
		/^[^\s:"]+:(<=|>=|<|>|=)/.test(term),
	);
</script>

<div class="filter-editor">
	<div class="editor-section">
		<span class="section-label">Content</span>
		<div class="section-rows">
			<input
				class="text-input"
				type="text"
				bind:value={contentRow}
				on:input={emit}
				on:keydown={onRowKeydown}
				placeholder={'words match anywhere, "quotes match the phrase"'}
				aria-label="Content search"
				spellcheck="false"
			/>
		</div>
	</div>

	<div class="editor-section">
		<span class="section-label">Tags</span>
		<div class="section-rows">
			{#each tagRows as _, index}
				<div class="editor-row">
					<div class="suggestion-anchor">
						<input
							class="text-input"
							type="text"
							bind:this={tagInputEls[index]}
							bind:value={tagRows[index]}
							on:input={() => {
								tagRows[index] = stripQuotes(tagRows[index] ?? "");
								emit();
								refreshFieldSuggestions({ kind: "tag", index });
							}}
							on:keydown={onSuggestingKeydown}
							on:click={() => retargetFieldSuggestions({ kind: "tag", index })}
							on:blur={hideFieldSuggestions}
							placeholder="tag, tag (any of)"
							aria-label="Tag group (comma-separated, any of)"
							spellcheck="false"
						/>
						{#if activeSuggestField?.kind === "tag" && activeSuggestField.index === index}
							<FilterSuggestionList
								suggestions={fieldSuggestions}
								selectedIndex={fieldSuggestionIndex}
								onAccept={acceptFieldSuggestion}
							/>
						{/if}
					</div>
					{#if tagRows.length > 1}
						<button
							class="row-remove"
							aria-label="Remove tag group"
							on:click={() => {
								tagRows = tagRows.filter((_, i) => i !== index);
								if (tagRows.length === 0) {
									tagRows = [""];
								}
								emit();
							}}
						>
							×
						</button>
					{/if}
				</div>
			{/each}
			<button class="add-row-btn" on:click={() => (tagRows = [...tagRows, ""])}>
				+ Add tag group
			</button>
		</div>
	</div>

	<div class="editor-section">
		<span class="section-label">Files</span>
		<div class="section-rows">
			<div class="suggestion-anchor">
				<input
					class="text-input"
					type="text"
					bind:this={fileInputEl}
					bind:value={fileRow}
					on:input={() => {
						fileRow = stripQuotes(fileRow);
						emit();
						refreshFieldSuggestions({ kind: "file" });
					}}
					on:keydown={onSuggestingKeydown}
					on:click={() => retargetFieldSuggestions({ kind: "file" })}
					on:blur={hideFieldSuggestions}
					placeholder="path, path (any of)"
					aria-label="File paths (comma-separated, any of)"
					spellcheck="false"
				/>
				{#if activeSuggestField?.kind === "file"}
					<FilterSuggestionList
						suggestions={fieldSuggestions}
						selectedIndex={fieldSuggestionIndex}
						onAccept={acceptFieldSuggestion}
					/>
				{/if}
			</div>
		</div>
	</div>

	<div class="editor-section">
		<span class="section-label">Date</span>
		<div class="section-rows">
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
						<select
							class="dropdown"
							value={condition.property}
							aria-label="Date property"
							on:change={(e) =>
								updateDateRow(index, { property: e.currentTarget.value })}
						>
							<option value=""></option>
							{#if condition.property !== "" && !dateKeys.some((key) => key.key === condition.property)}
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
									operator: e.currentTarget.value as DraftDateCondition["operator"],
								})}
						>
							<option value=""></option>
							{#each DATE_FILTER_OPERATORS as operator}
								<option value={operator.value}>{operator.label}</option>
							{/each}
						</select>
						<div class="date-value-toggle">
							<button
								type="button"
								class:active={condition.value === TODAY_FILTER_VALUE}
								aria-pressed={condition.value === TODAY_FILTER_VALUE}
								on:click={() =>
									updateDateRow(index, { value: TODAY_FILTER_VALUE })}
							>
								Today
							</button>
							<button
								type="button"
								class:active={condition.value !== TODAY_FILTER_VALUE}
								aria-pressed={condition.value !== TODAY_FILTER_VALUE}
								on:click={() => {
									if (condition.value === TODAY_FILTER_VALUE) {
										updateDateRow(index, { value: "" });
									}
								}}
							>
								Date
							</button>
						</div>
						{#if condition.value !== TODAY_FILTER_VALUE}
							<input
								type="date"
								value={condition.value}
								aria-label="Comparison date"
								on:change={(e) =>
									updateDateRow(index, { value: e.currentTarget.value })}
							/>
						{/if}
						{#if dateRows.length > 1}
							<button
								class="row-remove"
								aria-label="Remove date condition"
								on:click={() => removeDateRow(index)}
							>
								×
							</button>
						{/if}
					</div>
				{/each}
				<button
					class="add-row-btn"
					on:click={() => (dateRows = [...dateRows, emptyDateRow()])}
				>
					+ Add condition
				</button>
			{/if}
		</div>
	</div>

	<div class="editor-actions">
		<button class="editor-clear-btn" on:click={onClear}>Clear</button>
		<button class="editor-search-btn" on:click={onSearch}>Search</button>
	</div>
</div>

<style lang="scss">
	.filter-editor {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 200;
		margin-top: var(--size-2-1);
		padding: var(--size-4-4);
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-s);
		max-height: 70vh;
		overflow-y: auto;

		// Gmail-style label column: section name on the left, rows on the
		// right.
		.editor-section {
			display: grid;
			grid-template-columns: 72px 1fr;
			gap: var(--size-2-3);
			align-items: start;

			.section-label {
				font-size: var(--font-ui-small);
				color: var(--text-muted);
				padding-top: var(--size-2-2);
			}

			.section-rows {
				display: flex;
				flex-direction: column;
				gap: var(--size-2-2);
				min-width: 0;
			}
		}

		.editor-row {
			display: flex;
			align-items: center;
			gap: var(--size-2-2);
		}

		// Positioning context for a suggestion list anchored under its input.
		.suggestion-anchor {
			position: relative;
			display: flex;
			flex: 1 1 auto;
			min-width: 0;
		}

		// Gmail-style underlined inputs.
		input.text-input {
			flex: 1 1 auto;
			width: 100%;
			min-width: 0;
			background: transparent;
			border: none;
			border-bottom: 1px solid var(--background-modifier-border);
			border-radius: 0;
			box-shadow: none;
			padding: var(--size-2-2) 0;

			&:focus,
			&:focus-visible {
				border-bottom-color: var(--interactive-accent);
				box-shadow: none;
				outline: none;
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
			padding: var(--size-2-1) 0;
			background: transparent;
			color: var(--text-muted);
			border: none;
			box-shadow: none;
			cursor: pointer;
			font-size: var(--font-ui-small);

			&:hover {
				color: var(--text-normal);
			}
		}

		.section-hint {
			margin: 0;
			padding-top: var(--size-2-2);
			color: var(--text-muted);
			font-size: var(--font-ui-small);
		}

		.date-condition-row {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--size-4-2);
			font-size: var(--font-ui-small);

			// Flat, underlined selects matching the Gmail-style text inputs:
			// no box or shadow, just a bottom border. Obsidian's .dropdown
			// chevron (a background-image) is kept; its reserved right
			// padding stays so text never overlaps it.
			select.dropdown {
				flex: 0 1 auto;
				min-width: 0;
				background-color: transparent;
				border: none;
				border-bottom: 1px solid var(--background-modifier-border);
				border-radius: 0;
				box-shadow: none;
				padding-left: 0;

				&:hover {
					background-color: transparent;
					box-shadow: none;
				}

				&:focus,
				&:focus-visible {
					border-bottom-color: var(--interactive-accent);
					box-shadow: none;
					outline: none;
				}
			}

			// Segmented Today/Date selector, matching the tag-grouping
			// Prefix/Include toggle in the board header.
			.date-value-toggle {
				display: inline-flex;
				align-items: stretch;
				border: var(--input-border-width, 1px) solid var(--background-modifier-border);
				border-radius: var(--input-radius);
				overflow: hidden;
				background: var(--background-modifier-form-field, var(--background-primary));

				button {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					margin: 0;
					border: none;
					border-radius: 0;
					box-shadow: none;
					background: transparent;
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					line-height: 1;
					padding: var(--size-2-2) var(--size-2-3);
					cursor: pointer;

					&:hover {
						color: var(--text-normal);
						background: var(--background-modifier-hover);
					}

					&.active {
						background: var(--interactive-accent);
						color: var(--text-on-accent);
					}

					&:focus-visible {
						outline: 2px solid var(--background-modifier-border-focus);
						outline-offset: -2px;
					}

					+ button {
						border-left: var(--input-border-width, 1px) solid var(--background-modifier-border);
					}
				}
			}

			input[type="date"] {
				background: transparent;
				border: none;
				border-bottom: 1px solid var(--background-modifier-border);
				border-radius: 0;
				box-shadow: none;

				&:focus,
				&:focus-visible {
					border-bottom-color: var(--interactive-accent);
					box-shadow: none;
					outline: none;
				}
			}
		}

		.editor-actions {
			display: flex;
			justify-content: flex-end;
			gap: var(--size-2-3);
			padding-top: var(--size-2-3);
			border-top: 1px solid var(--background-modifier-border);

			.editor-clear-btn {
				padding: var(--size-2-2) var(--size-4-3);
				background: transparent;
				color: var(--text-muted);
				border: none;
				box-shadow: none;
				cursor: pointer;

				&:hover {
					color: var(--text-normal);
				}
			}

			.editor-search-btn {
				padding: var(--size-2-2) var(--size-4-5);
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border: none;
				border-radius: 999px;
				cursor: pointer;

				&:hover {
					background: var(--interactive-accent-hover);
				}
			}
		}
	}
</style>
