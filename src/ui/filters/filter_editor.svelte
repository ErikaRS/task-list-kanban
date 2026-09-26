<script lang="ts">
	import { tick } from "svelte";
	import type { DateFilterOperator } from "../settings/settings_store";
	import { DATE_FILTER_OPERATORS, TODAY_FILTER_VALUE } from "./date_filter";
	import { applyFilterSuggestion, getListSuggestions, stepSuggestionIndex, type FilterSuggestion } from "./filter_suggestions";
	import {
		filterQueryClauses,
		parseFilterQueryResult,
		serializeContentTerms,
		serializeFilterQuery,
		TEXT_BY_OPERATOR,
		type FilterAtom,
		type FilterQuery,
	} from "./filter_query";
	import type { SavedFilterEntry } from "./filter_state";
	import Icon from "../components/icon.svelte";
	import FilterSuggestionList from "./filter_suggestion_list.svelte";

	export let query: FilterQuery;
	export let draftText: string;
	export let dateKeys: { key: string; label: string }[] = [];
	export let tagSuggestionItems: string[] = [];
	export let fileSuggestionItems: string[] = [];
	export let savedFilters: SavedFilterEntry[] = [];
	export let savedListExpanded = false;
	export let onChange: (text: string) => void;
	export let onSearch: () => void;
	export let onInvalidSearch: (message: string) => void;
	export let onClear: () => void;
	export let onApplySavedFilter: (entry: SavedFilterEntry) => void;
	export let onDeleteSavedFilter: (entry: SavedFilterEntry) => void;
	export let onSaveFilter: (name: string | undefined) => void;
	export let onToggleSavedList: (expanded: boolean) => void;

	type AtomKind = "content" | "tag" | "file" | "date";
	type DraftAtom = {
		kind: AtomKind;
		value: string;
		negative: boolean;
		property: string;
		operator: DateFilterOperator | "";
	};

	function emptyAtom(kind: AtomKind = "content"): DraftAtom {
		return { kind, value: "", negative: false, property: dateKeys[0]?.key ?? "", operator: "" };
	}

	function toDraft(atom: FilterAtom): DraftAtom {
		return atom.kind === "date"
			? { kind: "date", value: atom.condition.value, negative: false, property: atom.condition.property, operator: atom.condition.operator }
			: { kind: atom.kind, value: atom.value, negative: atom.negative, property: dateKeys[0]?.key ?? "", operator: "" };
	}

	let rows: DraftAtom[][] = [[emptyAtom()]];
	let explicitRows: boolean[] = [false];
	let lastEmittedText: string | undefined;
	let lastSyncedKeys = "";
	let unparseable = false;
	let saveName = "";
	let suggestionInput: HTMLInputElement | undefined;
	let suggestionTarget = "";
	let suggestions: FilterSuggestion[] = [];
	let suggestionIndex = -1;
	$: dateKeyNames = dateKeys.map((key) => key.key);
	$: syncFromQuery(query, draftText, dateKeyNames);

	function syncFromQuery(incoming: FilterQuery, text: string, keys: string[]) {
		const keySignature = keys.join("\u0000");
		if (text === lastEmittedText && keySignature === lastSyncedKeys) return;
		const parsed = parseFilterQueryResult(text, keys);
		unparseable = !!parsed.error;
		if (unparseable) return;
		const clauses = filterQueryClauses(incoming);
		rows = clauses.length ? clauses.map((clause) => clause.atoms.map(toDraft)) : [[emptyAtom()]];
		explicitRows = clauses.length ? clauses.map((clause) => !!clause.explicit) : [false];
		lastEmittedText = text;
		lastSyncedKeys = keySignature;
	}

	function atomText(atom: DraftAtom): string {
		const value = atom.value.trim();
		if (atom.kind === "date") {
			if (!atom.property || !atom.operator || !value) return `${atom.property || "due"}:`;
			return `${atom.property}:${TEXT_BY_OPERATOR[atom.operator]}${value}`;
		}
		if (!value) return "";
		const text = atom.kind === "content"
			? serializeContentTerms([value])
			: `${atom.kind}:${atom.kind === "file" && /\s/.test(value) ? `"${value}"` : value}`;
		return atom.negative ? `-${text}` : text;
	}

	function rowsText(): string {
		return rows.map((clause, index) => {
			const parts = clause.map(atomText);
			if (parts.length === 1) return parts[0];
			if (!explicitRows[index] && clause.every((atom) => atom.kind === "tag" && !atom.negative && !!atom.value.trim())) {
				return `tag:${clause.map((atom) => atom.value.trim()).join(",")}`;
			}
			if (!explicitRows[index] && clause.every((atom) => atom.kind === "file" && !atom.negative && !!atom.value.trim())) {
				return `file:${clause.map((atom) => /\s/.test(atom.value.trim()) ? `"${atom.value.trim()}"` : atom.value.trim()).join(",")}`;
			}
			return `(${parts.join(" OR ")})`;
		}).filter(Boolean).join(" ");
	}

	function emit() {
		rows = rows.map((clause) => [...clause]);
		lastEmittedText = rowsText();
		onChange(lastEmittedText);
	}

	function updateAtom(clauseIndex: number, atomIndex: number, patch: Partial<DraftAtom>) {
		rows[clauseIndex]![atomIndex] = { ...rows[clauseIndex]![atomIndex]!, ...patch };
		emit();
	}

	function changeKind(clauseIndex: number, atomIndex: number, kind: AtomKind) {
		hideSuggestions();
		if (kind === "file" && fileKindUnavailable(clauseIndex)) return;
		rows[clauseIndex]![atomIndex] = emptyAtom(kind);
		if (rows[clauseIndex]!.length > 1) explicitRows[clauseIndex] = true;
		emit();
	}

	function fileKindUnavailable(clauseIndex: number): boolean {
		if (rows[clauseIndex]!.length !== 1) return false;
		return rows.some((clause, index) => index !== clauseIndex && (!explicitRows[index] || clause.length === 1)
			&& clause.every((atom) => atom.kind === "file" && !atom.negative));
	}

	function positiveFileToggleUnavailable(clauseIndex: number, atom: DraftAtom): boolean {
		return atom.kind === "file" && atom.negative && fileKindUnavailable(clauseIndex);
	}

	function removingAtomWouldMergeFiles(clauseIndex: number, atomIndex: number): boolean {
		const clause = rows[clauseIndex]!;
		if (clause.length !== 2) return false;
		const remaining = clause[1 - atomIndex]!;
		return remaining.kind === "file" && !remaining.negative && rows.some((other, index) =>
			index !== clauseIndex && (!explicitRows[index] || other.length === 1)
				&& other.every((atom) => atom.kind === "file" && !atom.negative),
		);
	}

	function addAlternative(clauseIndex: number) {
		rows[clauseIndex] = [...rows[clauseIndex]!, emptyAtom()];
		explicitRows[clauseIndex] = true;
		emit();
	}

	function removeAtom(clauseIndex: number, atomIndex: number) {
		hideSuggestions();
		if (removingAtomWouldMergeFiles(clauseIndex, atomIndex)) return;
		rows[clauseIndex] = rows[clauseIndex]!.filter((_, index) => index !== atomIndex);
		if (rows[clauseIndex]!.length === 0) {
			rows.splice(clauseIndex, 1);
			explicitRows.splice(clauseIndex, 1);
		}
		if (rows.length === 0) { rows = [[emptyAtom()]]; explicitRows = [false]; }
		emit();
	}

	function addClause() {
		rows = [...rows, [emptyAtom()]];
		explicitRows = [...explicitRows, false];
	}

	function removeClause(index: number) {
		hideSuggestions();
		rows = rows.filter((_, current) => current !== index);
		explicitRows = explicitRows.filter((_, current) => current !== index);
		if (rows.length === 0) { rows = [[emptyAtom()]]; explicitRows = [false]; }
		emit();
	}

	function submitSearch() {
		if (!unparseable && rows.some((clause) => clause.some((atom) => atom.kind === "date" && (!atom.property || !atom.operator || !atom.value)))) {
			onInvalidSearch("Complete the date comparison.");
			return;
		}
		onSearch();
	}

	function onRowKeydown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			submitSearch();
		}
	}

	function hideSuggestions() {
		suggestionTarget = "";
		suggestions = [];
		suggestionIndex = -1;
	}

	function refreshSuggestions(clauseIndex: number, atomIndex: number, input: HTMLInputElement) {
		const kind = rows[clauseIndex]?.[atomIndex]?.kind;
		if (kind !== "tag" && kind !== "file") return hideSuggestions();
		suggestionInput = input;
		suggestionTarget = `${clauseIndex}:${atomIndex}`;
		suggestions = getListSuggestions(input.value, input.selectionStart ?? input.value.length,
			kind === "tag" ? tagSuggestionItems : fileSuggestionItems, kind);
		suggestionIndex = -1;
	}

	async function acceptSuggestion(clauseIndex: number, atomIndex: number, suggestion: FilterSuggestion) {
		const input = suggestionInput;
		if (!input) return;
		const applied = applyFilterSuggestion(input.value, suggestion);
		updateAtom(clauseIndex, atomIndex, { value: applied.text });
		hideSuggestions();
		await tick();
		input.focus();
		input.setSelectionRange(applied.caret, applied.caret);
	}

	function onAtomKeydown(event: KeyboardEvent, clauseIndex: number, atomIndex: number) {
		if (suggestionTarget === `${clauseIndex}:${atomIndex}` && suggestions.length > 0) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				suggestionIndex = stepSuggestionIndex(suggestions.length, suggestionIndex, event.key === "ArrowDown" ? 1 : -1);
				return;
			}
			if (event.key === "Tab" || (event.key === "Enter" && suggestionIndex >= 0)) {
				event.preventDefault();
				acceptSuggestion(clauseIndex, atomIndex, suggestions[Math.max(suggestionIndex, 0)]!);
				return;
			}
			if (event.key === "Escape") {
				event.stopPropagation();
				hideSuggestions();
				return;
			}
		}
		onRowKeydown(event);
	}

	$: parsedDraft = parseFilterQueryResult(draftText, dateKeyNames);
	$: hasIncompleteDate = rows.some((clause) => clause.some((atom) => atom.kind === "date" && (!atom.property || !atom.operator || !atom.value)));
	$: draftKey = parsedDraft.error ? "" : serializeFilterQuery(parsedDraft.query);
	$: savedEntries = savedFilters.map((entry) => ({
		entry,
		key: serializeFilterQuery(parseFilterQueryResult(entry.query, dateKeyNames).query),
	}));
	$: activeSavedFilterId = draftKey === "" ? undefined : savedEntries.find(({ key }) => key === draftKey)?.entry.id;
	$: saveDisabled = hasIncompleteDate || draftKey === "" || savedEntries.some(({ key }) => key === draftKey);

	function saveFilter() {
		if (saveDisabled) return;
		onSaveFilter(saveName.trim() || undefined);
		saveName = "";
	}

	function onSaveNameKeydown(event: KeyboardEvent) {
		if (event.key === "Enter") {
			event.preventDefault();
			if (saveDisabled) submitSearch();
			else saveFilter();
		}
	}

	function toggleSavedFilter(entry: SavedFilterEntry) {
		if (entry.id === activeSavedFilterId) onClear();
		else onApplySavedFilter(entry);
	}
</script>

<div class="filter-editor">
	<div class="editor-section">
		<span class="section-label">Conditions</span>
		<div class="section-rows">
			{#if unparseable}
				<input class="text-input" type="text" value={draftText} aria-label="Filter expression" on:input={(event) => onChange(event.currentTarget.value)} on:keydown={onRowKeydown} spellcheck="false" />
			{:else}
				{#each rows as clause, clauseIndex}
					<div class="clause-row">
						{#if clauseIndex > 0}<span class="clause-join">AND</span>{/if}
						{#each clause as atom, atomIndex}
							{#if atomIndex > 0}<span class="clause-join">OR</span>{/if}
							<div class="atom-row">
								<div class="atom-kind-control">
									<select class="atom-kind dropdown" value={atom.kind} aria-label="Filter type" on:change={(event) => changeKind(clauseIndex, atomIndex, event.currentTarget.value as AtomKind)}>
										<option value="content">Content</option><option value="tag">Tag</option><option value="file" disabled={fileKindUnavailable(clauseIndex) && atom.kind !== "file"}>File</option><option value="date" disabled={dateKeys.length === 0}>Date</option>
									</select>
									<span class="atom-kind-chevron" aria-hidden="true"><Icon name="chevron-down" size={14} /></span>
								</div>
								{#if atom.kind !== "date"}
									<button type="button" class="exclude-toggle" class:active={atom.negative} role="switch" aria-label="Exclude this condition" aria-checked={atom.negative} disabled={positiveFileToggleUnavailable(clauseIndex, atom)} title={positiveFileToggleUnavailable(clauseIndex, atom) ? "Positive file conditions outside a group merge into one OR clause" : "Exclude matches for this value"} on:click={() => updateAtom(clauseIndex, atomIndex, { negative: !atom.negative })}><span class="exclude-label">NOT</span><span class="exclude-track" aria-hidden="true"><span class="exclude-thumb"></span></span></button>
									<div class="atom-value-anchor">
										<input class="text-input atom-value" type="text" value={atom.value} aria-label={atom.kind === "content" ? "Content term" : atom.kind === "tag" ? "Tag" : "File path"} on:input={(event) => { updateAtom(clauseIndex, atomIndex, { value: event.currentTarget.value }); refreshSuggestions(clauseIndex, atomIndex, event.currentTarget); }} on:focus={(event) => refreshSuggestions(clauseIndex, atomIndex, event.currentTarget)} on:click={(event) => { if (suggestionTarget) refreshSuggestions(clauseIndex, atomIndex, event.currentTarget); }} on:blur={hideSuggestions} on:keydown={(event) => onAtomKeydown(event, clauseIndex, atomIndex)} spellcheck="false" />
										{#if suggestionTarget === `${clauseIndex}:${atomIndex}` && suggestions.length > 0}
											<FilterSuggestionList {suggestions} selectedIndex={suggestionIndex} onAccept={(suggestion) => acceptSuggestion(clauseIndex, atomIndex, suggestion)} />
										{/if}
									</div>
								{:else}
									<select class="dropdown" value={atom.property} aria-label="Date property" on:change={(event) => updateAtom(clauseIndex, atomIndex, { property: event.currentTarget.value })}>
										{#each dateKeys as key}<option value={key.key}>{key.label}</option>{/each}
									</select>
									<select class="dropdown" value={atom.operator} aria-label="Date comparison" on:change={(event) => updateAtom(clauseIndex, atomIndex, { operator: event.currentTarget.value as DateFilterOperator })}>
										<option value="">Compare…</option>{#each DATE_FILTER_OPERATORS as operator}<option value={operator.value}>{operator.label}</option>{/each}
									</select>
									<input class="text-input date-value" type="text" value={atom.value} placeholder={TODAY_FILTER_VALUE} aria-label="Comparison date or $TODAY" on:input={(event) => updateAtom(clauseIndex, atomIndex, { value: event.currentTarget.value })} on:keydown={onRowKeydown} spellcheck="false" />
								{/if}
								<button type="button" class="row-remove" aria-label="Remove condition" title={removingAtomWouldMergeFiles(clauseIndex, atomIndex) ? "Positive file conditions outside a group merge into one OR clause" : undefined} disabled={removingAtomWouldMergeFiles(clauseIndex, atomIndex)} on:click={() => removeAtom(clauseIndex, atomIndex)}>×</button>
							</div>
						{/each}
						<div class="clause-actions"><button type="button" class="add-row-btn" aria-label="Add OR" on:click={() => addAlternative(clauseIndex)}>+ OR</button><button type="button" class="row-remove" aria-label="Remove clause" on:click={() => removeClause(clauseIndex)}>×</button></div>
					</div>
				{/each}
				<button type="button" class="add-row-btn" aria-label="Add AND" on:click={addClause}>+ AND</button>
				{#if rows.some((clause) => clause.every((atom) => atom.kind === "file" && !atom.negative && !!atom.value.trim()))}<p class="section-hint">File choices share one OR group. Add another with + OR.</p>{/if}
			{/if}
		</div>
	</div>
	<div class="editor-section">
		<span class="section-label">Save as</span>
		<div class="section-rows"><div class="save-row"><input class="text-input" type="text" bind:value={saveName} on:keydown={onSaveNameKeydown} placeholder="Name (optional)" aria-label="Saved filter name" spellcheck="false" /><button type="button" class="save-filter-btn" disabled={saveDisabled} on:click={saveFilter}>Save</button></div></div>
	</div>
	<div class="editor-section saved-section">
		<button type="button" class="saved-toggle" aria-expanded={savedListExpanded} on:click={() => onToggleSavedList(!savedListExpanded)}><Icon name={savedListExpanded ? "chevron-down" : "chevron-right"} size={14} />Saved</button>
		{#if savedListExpanded}
			<div class="section-rows">
				{#if savedFilters.length > 0}
					<ul class="saved-filter-list" role="list">
						{#each savedFilters as entry (entry.id)}
							<li>
								{#if entry.isGlobal}<span class="global-saved-badge" title="Global saved view">Global</span>{:else}<button type="button" class="row-remove" aria-label="Delete saved filter: {entry.name ?? entry.query}" on:click={() => onDeleteSavedFilter(entry)}>×</button>{/if}
								<button type="button" class="saved-filter-name" class:active={entry.id === activeSavedFilterId} aria-pressed={entry.id === activeSavedFilterId} on:click={() => toggleSavedFilter(entry)}>{entry.name ?? entry.query}</button>
							</li>
						{/each}
					</ul>
				{:else}<p class="section-hint">No saved filters yet.</p>{/if}
			</div>
		{/if}
	</div>
	<div class="editor-actions"><button type="button" class="editor-clear-btn" on:click={onClear}>Clear</button><button type="button" class="editor-search-btn" on:click={submitSearch}>Search</button></div>
</div>

<style lang="scss">
	.filter-editor {
		position: absolute; top: 100%; left: 0; right: 0; z-index: 200;
		margin-top: var(--size-2-1); padding: var(--size-4-4);
		display: flex; flex-direction: column; gap: var(--size-4-3);
		background: var(--background-primary); border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m); box-shadow: var(--shadow-s);
		max-height: 70vh; overflow-y: auto;
	}
	.editor-section { display: grid; grid-template-columns: 72px 1fr; gap: var(--size-2-3); align-items: start; }
	.section-label, .clause-join, .section-hint { color: var(--text-muted); font-size: var(--font-ui-small); }
	.section-label { padding-top: var(--size-2-2); }
	.section-rows { display: flex; flex-direction: column; gap: var(--size-2-2); min-width: 0; }
	.section-hint { margin: 0; }
	.clause-row { display: flex; flex-direction: column; gap: var(--size-2-1); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); padding: var(--size-2-2); }
	.clause-join { font-weight: 600; padding-left: var(--size-2-2); }
	.atom-row { display: flex; flex-wrap: wrap; gap: var(--size-2-2); align-items: center; }
	.atom-kind-control { position: relative; display: flex; flex: 0 0 112px; align-items: center; width: 112px; height: 32px; box-sizing: border-box; background: var(--background-modifier-form-field, var(--background-primary)); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
	.atom-kind-control:focus-within { border-color: var(--interactive-accent); }
	.atom-kind { width: 100%; min-width: 0; height: 100%; appearance: none; padding: 0 28px 0 var(--size-2-3); cursor: pointer; }
	.atom-kind-chevron { position: absolute; right: var(--size-2-2); top: 50%; display: inline-flex; transform: translateY(-50%); pointer-events: none; color: var(--text-muted); }
	.atom-value-anchor { position: relative; display: flex; flex: 1 1 140px; min-width: 0; }
	.atom-value { width: 100%; }
	.date-value { flex: 1 1 130px; }
	input.text-input { min-width: 0; background: transparent; border: none; border-bottom: 1px solid var(--background-modifier-border); border-radius: 0; box-shadow: none; padding: var(--size-2-2) 0; }
	input.text-input:focus-visible { border-bottom-color: var(--interactive-accent); outline: none; }
	.clause-actions { display: flex; justify-content: space-between; }
	.exclude-toggle { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; box-sizing: border-box; height: 32px; margin: 0; padding: 0 var(--size-2-1); gap: var(--size-2-2); background: transparent; color: var(--text-muted); border: 0; box-shadow: none; font-size: var(--font-ui-smaller); font-weight: 600; line-height: 1; }
	.exclude-toggle.active { color: var(--text-normal); }
	.exclude-track { position: relative; display: block; flex: 0 0 38px; width: 38px; height: 20px; box-sizing: border-box; background: var(--background-modifier-border); border-radius: 999px; transition: background-color 120ms ease; }
	.exclude-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; box-sizing: border-box; background: var(--background-primary); border-radius: 50%; box-shadow: 0 1px 2px rgb(0 0 0 / 20%); transition: transform 120ms ease; }
	.exclude-toggle.active .exclude-track { background: var(--interactive-accent); }
	.exclude-toggle.active .exclude-thumb { transform: translateX(18px); }
	.exclude-toggle:disabled { opacity: 0.5; cursor: default; }
	.row-remove, .add-row-btn, .saved-toggle, .editor-clear-btn { background: transparent; color: var(--text-muted); border: none; box-shadow: none; cursor: pointer; }
	.row-remove { font-size: 18px; padding: var(--size-2-1); }
	.add-row-btn { align-self: flex-start; font-size: var(--font-ui-small); padding: var(--size-2-1); }
	.save-row { display: flex; gap: var(--size-2-2); align-items: center; }
	.save-row input { flex: 1 1 auto; }
	.save-filter-btn { border: 1px solid var(--background-modifier-border); border-radius: 999px; padding: var(--size-2-2) var(--size-4-3); }
	.saved-section { padding-top: var(--size-2-3); border-top: 1px solid var(--background-modifier-border); }
	.saved-toggle { display: inline-flex; align-items: center; gap: var(--size-2-1); text-align: left; }
	.saved-filter-list { margin: 0; padding: 0; list-style: none; }
	.saved-filter-list li { display: flex; align-items: center; gap: var(--size-2-1); }
	.saved-filter-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; background: transparent; border: none; box-shadow: none; padding: var(--size-2-1); }
	.saved-filter-name.active { background: var(--interactive-accent); color: var(--text-on-accent); }
	.global-saved-badge { color: var(--text-muted); font-size: var(--font-ui-smaller); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); padding: var(--size-2-1); }
	.editor-actions { display: flex; justify-content: flex-end; gap: var(--size-2-3); padding-top: var(--size-2-3); border-top: 1px solid var(--background-modifier-border); }
	.editor-search-btn { background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 999px; padding: var(--size-2-2) var(--size-4-5); }
	@media (max-width: 600px) { .editor-section { grid-template-columns: 1fr; } }
</style>
