<script lang="ts">
	import {
		type ColumnTag,
		type ColumnMatchTagTable,
		type ColumnSubtitleTable,
		type ColumnTagTable,
		type ColumnColourTable,
		type DefaultColumns,
		createCollapsedColumnsStore,
	} from "./columns/columns";
	import type { Task } from "./tasks/task";
	import BoardMatrixVertical from "./board/board_matrix_vertical.svelte";
	import BoardMatrixHorizontal from "./board/board_matrix_horizontal.svelte";
	import { deriveBoardMatrix } from "./board/board_matrix";
	import {
		createGroupAssigner,
		deriveGroupBuckets,
		normalizeTagIncludeList,
		normalizeTagPrefix,
		type GroupSource,
	} from "./tasks/task_grouping";
	import CompactTagSelect from "./components/select/compact_tag_select.svelte";
	import IconButton from "./components/icon_button.svelte";
	import Icon from "./components/icon.svelte";
	import type { Writable, Readable } from "svelte/store";
	import type { TaskActions } from "./tasks/actions";
	import { type SavedGrouping, type SettingValues, VisibilityOption, FlowDirection, PropertyDisplayMode } from "./settings/settings_store";
	import { getSchemaImpl } from "../parsing/properties/index";
	import { PropertySchemaOption } from "../parsing/properties/property_schema";
	import { ColumnOrderMode } from "../parsing/properties/comparators";
	import { onMount, onDestroy, tick } from "svelte";
	import type { App } from "obsidian";
	import { getBoardTaskCount } from "./board_counts";
	import { collectPresentManualOrderKeys } from "./tasks/manual_order";
	import {
		readBoardFilterState,
		savedFilterToQuery,
		shouldApplyIncomingBoardFilterState,
		writeBoardFilterState,
		type SavedFilterEntry,
	} from "./filters/filter_state";
	import DeleteFilterModal from "./components/delete_filter_modal.svelte";
	import {
		isEmptyFilterQuery,
		parseFilterQuery,
		serializeFilterQuery,
		taskMatchesFilterQuery,
		type FilterQuery,
	} from "./filters/filter_query";
	import FilterEditor from "./filters/filter_editor.svelte";
	import FilterSuggestionList from "./filters/filter_suggestion_list.svelte";
	import {
		applyFilterSuggestion,
		getFilterSuggestions,
		stepSuggestionIndex,
		type FilterSuggestion,
	} from "./filters/filter_suggestions";
	import { createTodayStore } from "./filters/today_store";

	type TagPrefixGroupSource = Extract<GroupSource, { kind: "tag-prefix" }>;
	type SavedTagGrouping = SavedGrouping & { source: TagPrefixGroupSource };
	type TagGroupInputMode = "prefix" | "include";

	export let app: App;
	export let tasksStore: Writable<Task[]>;
	export let taskActions: TaskActions;
	export let openSettings: () => Promise<void>;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let settingsStore: Writable<SettingValues>;
	export let requestSave: () => void;

	const collapsedColumnsStore = createCollapsedColumnsStore(settingsStore);
	// Ticks at local midnight so $TODAY filters re-evaluate without a reload.
	const todayStore = createTodayStore();

	function toggleColumnCollapse(col: ColumnTag | DefaultColumns) {
		const isCurrentlyCollapsed = $collapsedColumnsStore.has(col as string);
		settingsStore.update(s => {
			const collapsed = s.collapsedColumns ?? [];
			const tag = col as string;
			return {
				...s,
				collapsedColumns: isCurrentlyCollapsed
					? collapsed.filter(c => c !== tag)
					: [...collapsed, tag],
			};
		});
		requestSave();
	}

	$: tags = $tasksStore.reduce((acc, curr) => {
		for (const tag of curr.tags) {
			acc.add(tag);
		}
		return acc;
	}, new Set<string>());

	$: savedGroupings = $settingsStore.savedGroupings ?? [];
	$: savedTagGroupings = savedGroupings.filter(
		(g): g is SavedTagGrouping => g.source.kind === "tag-prefix",
	);
	$: availableTags = [...tags].sort((a, b) => a.localeCompare(b));

	let activeSavedGroupingId: string | undefined;
	let rememberedSavedTagGroupingId: string | undefined;
	let tagGroupInputMode: TagGroupInputMode = "prefix";

	$: {
		const src = $settingsStore.groupSource;
		const matching = src?.kind === "tag-prefix" ? savedTagGroupings.find(g =>
			tagGroupSourcesMatch(g.source, src)
		) : undefined;
		activeSavedGroupingId = matching?.id;
	}

	function normalizedTagGroupSource(source: TagPrefixGroupSource) {
		const prefix = normalizeTagPrefix(source.prefix);
		const includeTags = normalizeTagIncludeList(source.includeTags, prefix);
		return { kind: "tag-prefix" as const, prefix, includeTags };
	}

	function tagGroupSourcesMatch(
		a: TagPrefixGroupSource,
		b: TagPrefixGroupSource,
	): boolean {
		const left = normalizedTagGroupSource(a);
		const right = normalizedTagGroupSource(b);
		if (left.prefix !== right.prefix) return false;
		if (left.includeTags.length !== right.includeTags.length) return false;
		return left.includeTags.every((tag, index) =>
			tag.toLowerCase() === right.includeTags[index]?.toLowerCase()
		);
	}

	function tagGroupInputModeForSource(source: GroupSource | undefined): TagGroupInputMode {
		return source?.kind === "tag-prefix" && (source.includeTags?.length ?? 0) > 0
			? "include"
			: "prefix";
	}

	function getRememberedSavedTagGrouping() {
		return rememberedSavedTagGroupingId
			? savedTagGroupings.find(g => g.id === rememberedSavedTagGroupingId)
			: undefined;
	}

	function rememberCurrentTagGroupingIfSaved() {
		if ($settingsStore.groupSource?.kind !== "tag-prefix") return;
		rememberedSavedTagGroupingId = activeSavedGroupingId;
	}

	function createTagGroupSourceFromMemory() {
		const remembered = getRememberedSavedTagGrouping();
		return remembered
			? { ...remembered.source }
			: { kind: "tag-prefix" as const, prefix: "" };
	}

	$: if (rememberedSavedTagGroupingId && !savedTagGroupings.some(g => g.id === rememberedSavedTagGroupingId)) {
		rememberedSavedTagGroupingId = undefined;
	}

	$: if (activeSavedGroupingId) {
		const activeSavedTagGrouping = savedTagGroupings.find(
			g => g.id === activeSavedGroupingId
		);
		if (activeSavedTagGrouping) {
			rememberedSavedTagGroupingId = activeSavedTagGrouping.id;
		}
	}

	function saveCurrentGrouping() {
		const src = $settingsStore.groupSource;
		if (!src || src.kind !== "tag-prefix") return;

		// Don't create a duplicate entry for a grouping that is already saved.
		if (activeSavedGroupingId) return;

		const normalizedSource = normalizedTagGroupSource(src);
		const name = normalizedSource.prefix ? normalizedSource.prefix :
			(normalizedSource.includeTags.length > 0 ? normalizedSource.includeTags.join(", ") : "Tags");

		const newGrouping = {
			id: crypto.randomUUID(),
			name,
			source: normalizedSource,
		};
		$settingsStore.savedGroupings = [...savedGroupings, newGrouping];
		rememberedSavedTagGroupingId = newGrouping.id;
		requestSave();
	}

	function updateTagGroupPrefix(prefix: string) {
		const src = $settingsStore.groupSource;
		if (!src || src.kind !== "tag-prefix") return;
		$settingsStore.groupSource = {
			kind: "tag-prefix",
			prefix,
		};
		activeSavedGroupingId = undefined;
		requestSave();
	}

	function updateTagGroupIncludeTags(includeTags: string[]) {
		const src = $settingsStore.groupSource;
		if (!src || src.kind !== "tag-prefix") return;
		$settingsStore.groupSource = {
			kind: "tag-prefix",
			prefix: "",
			includeTags: normalizeTagIncludeList(includeTags),
		};
		activeSavedGroupingId = undefined;
		requestSave();
	}

	function setTagGroupInputMode(mode: TagGroupInputMode) {
		const src = $settingsStore.groupSource;
		if (!src || src.kind !== "tag-prefix" || tagGroupInputMode === mode) return;

		tagGroupInputMode = mode;
		$settingsStore.groupSource = mode === "prefix"
			? { kind: "tag-prefix", prefix: src.prefix ?? "" }
			: { kind: "tag-prefix", prefix: "", includeTags: src.includeTags ?? [] };
		activeSavedGroupingId = undefined;
		requestSave();
	}

	function loadSavedGrouping(id: string) {
		const grouping = savedGroupings.find(g => g.id === id);
		if (grouping) {
			$settingsStore.groupSource = { ...grouping.source };
			tagGroupInputMode = tagGroupInputModeForSource(grouping.source);
			requestSave();
		}
	}
	
	function deleteSavedGrouping(id: string) {
		$settingsStore.savedGroupings = savedGroupings.filter(g => g.id !== id);
		if (rememberedSavedTagGroupingId === id) {
			rememberedSavedTagGroupingId = undefined;
		}
		requestSave();
	}

	// Activate a role="button" element on both Enter and Space, matching native
	// button semantics (and preventing Space from scrolling the page).
	function onActivateKey(e: KeyboardEvent, action: () => void) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			action();
		}
	}

	$: dateFilterKeys = activeSchema.knownKeys().filter((key) => key.type === "date");

	function groupByColumnTag(
		tasks: Task[],
	): Record<ColumnTag | DefaultColumns, Task[]> {
		const output: Record<ColumnTag | DefaultColumns, Task[]> = {
			uncategorised: [],
			done: [],
		};
		for (const task of tasks) {
			if (task.done || task.column === "done") {
				output["done"] = output["done"].concat(task);
			} else if (task.column === "archived") {
				// ignored
			} else if (task.column) {
				output[task.column] = (output[task.column] ?? []).concat(task);
			} else {
				output["uncategorised"] = output["uncategorised"].concat(task);
			}
		}
		return output;
	}

	let columns: ("uncategorised" | ColumnTag)[];
	$: columns = $settingsStore.columns.map((column) => column.id);

	// The board's filter is one query string (SPEC 0029). The bar holds an
	// uncommitted draft as typed; the applied query — set on commit (Enter
	// in the bar, the editor's Search, or clear) — is what filters the
	// board and persists. Filtering never changes mid-keystroke.
	let filterQueryText = "";
	let appliedQueryText = "";
	let hydrated = false;
	let lastPersistedQuery = "";

	onMount(() => {
		tagGroupInputMode = tagGroupInputModeForSource($settingsStore.groupSource);

		const unsubscribe = settingsStore.subscribe(settings => {
			const incomingQuery = readBoardFilterState(settings);
			// The draft is the sync guard: an external change never clobbers
			// text the user is still composing.
			if (shouldApplyIncomingBoardFilterState(
				filterQueryText,
				incomingQuery,
				lastPersistedQuery,
				hydrated,
			)) {
				filterQueryText = incomingQuery;
				appliedQueryText = incomingQuery;
				lastPersistedQuery = incomingQuery;
				hydrated = true;
			}
		});

		return unsubscribe;
	});

	function saveFilterState() {
		if (!hydrated || appliedQueryText === lastPersistedQuery) {
			return;
		}

		lastPersistedQuery = appliedQueryText;
		settingsStore.update(settings => writeBoardFilterState(settings, appliedQueryText));
		requestSave();
	}

	$: if (hydrated) {
		appliedQueryText;
		saveFilterState();
	}

	$: dateFilterKeyNames = dateFilterKeys.map((key) => key.key);
	// Draft: mirrored by the expanded editor. Applied: filters the board.
	$: draftQuery = parseFilterQuery(filterQueryText, dateFilterKeyNames);
	$: appliedQuery = parseFilterQuery(appliedQueryText, dateFilterKeyNames);
	$: isFiltered = !isEmptyFilterQuery(appliedQuery);

	// --- Expanded structured editor (two synced views of one query) ---
	let filterEditorExpanded = false;
	let filterBarContainer: HTMLDivElement | undefined;

	// Committing canonicalizes the draft (quoting, $TODAY casing, token
	// order), so the bar always shows exactly what was understood.
	function applyFilter() {
		const canonical = serializeFilterQuery(
			parseFilterQuery(filterQueryText, dateFilterKeyNames),
		);
		filterQueryText = canonical;
		appliedQueryText = canonical;
		hideBarSuggestions();
	}

	function clearFilter() {
		filterQueryText = "";
		appliedQueryText = "";
		hideBarSuggestions();
	}

	// --- Typed text suggestions (SPEC 0029 Phase 3) ---
	let filterInputEl: HTMLInputElement | undefined;
	let barSuggestions: FilterSuggestion[] = [];
	// -1 = list open but nothing highlighted, so Enter still applies the
	// query; ArrowDown opts into the list.
	let barSuggestionIndex = -1;
	let barSuggestionsVisible = false;

	$: taskFilePaths = [...new Set($tasksStore.map((task) => task.path))].sort(
		(a, b) => a.localeCompare(b),
	);
	$: suggestionContext = {
		tags: availableTags,
		filePaths: taskFilePaths,
		dateKeys: dateFilterKeys,
		// Only named saves are suggestible — an unnamed entry has no text
		// to complete (its query still applies from the editor's list).
		savedFilterNames: savedFilterEntries
			.map((entry) => entry.name)
			.filter((name): name is string => !!name),
	};

	function refreshBarSuggestions() {
		const caret = filterInputEl?.selectionStart ?? filterQueryText.length;
		barSuggestions = getFilterSuggestions(
			filterQueryText,
			caret,
			suggestionContext,
		);
		barSuggestionIndex = -1;
		barSuggestionsVisible = barSuggestions.length > 0;
	}

	function hideBarSuggestions() {
		barSuggestionsVisible = false;
		barSuggestionIndex = -1;
	}

	async function acceptBarSuggestion(suggestion: FilterSuggestion) {
		// A saved-filter suggestion applies that filter: the whole query is
		// replaced (never merged) and committed, matching the editor's list.
		if (suggestion.kind === "saved") {
			const entry = savedFilterEntries.find(
				(candidate) => candidate.name === suggestion.label,
			);
			if (entry) {
				applySavedFilter(entry);
				await tick();
				filterInputEl?.focus();
				filterInputEl?.setSelectionRange(
					filterQueryText.length,
					filterQueryText.length,
				);
				return;
			}
		}
		const applied = applyFilterSuggestion(filterQueryText, suggestion);
		filterQueryText = applied.text;
		await tick();
		filterInputEl?.focus();
		filterInputEl?.setSelectionRange(applied.caret, applied.caret);
		// Accepting a prefix (`tag:` …) flows straight into value
		// suggestions; accepting a value completes the token.
		if (suggestion.kind === "prefix") {
			refreshBarSuggestions();
		} else {
			hideBarSuggestions();
		}
	}

	function handleFilterInputKeydown(e: KeyboardEvent) {
		if (barSuggestionsVisible && barSuggestions.length > 0) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				barSuggestionIndex = stepSuggestionIndex(
					barSuggestions.length,
					barSuggestionIndex,
					e.key === "ArrowDown" ? 1 : -1,
				);
				return;
			}
			if (e.key === "Tab") {
				e.preventDefault();
				acceptBarSuggestion(barSuggestions[Math.max(barSuggestionIndex, 0)]!);
				return;
			}
			if (e.key === "Enter" && barSuggestionIndex >= 0) {
				e.preventDefault();
				acceptBarSuggestion(barSuggestions[barSuggestionIndex]!);
				return;
			}
			if (e.key === "Escape") {
				// Dismiss only the suggestions; a second Esc (reaching the
				// window handler) collapses the expanded editor.
				e.stopPropagation();
				hideBarSuggestions();
				return;
			}
		}
		if (e.key === "Enter") {
			hideBarSuggestions();
			applyFilter();
		}
	}

	function handleFilterInputClick() {
		// A click moves the caret; retarget an already-open list rather than
		// popping it open on mere focus.
		if (barSuggestionsVisible) {
			refreshBarSuggestions();
		}
	}

	function applyEditorQuery(next: FilterQuery) {
		filterQueryText = serializeFilterQuery(next);
	}

	function searchFromEditor() {
		applyFilter();
		filterEditorExpanded = false;
	}

	// --- Unified saved filters (SPEC 0029 Phase 4) ---
	// One flat list covering any query. Legacy slot-based entries resolve
	// through savedFilterToQuery at read time and are never rewritten.
	$: savedFilterEntries = ($settingsStore.savedFilters ?? []).map(
		(filter): SavedFilterEntry => ({
			id: filter.id,
			name: filter.name,
			query: savedFilterToQuery(filter),
		}),
	);

	// Applying replaces the whole query (never merges) and commits it.
	function applySavedFilter(entry: SavedFilterEntry) {
		filterQueryText = entry.query;
		applyFilter();
	}

	// A save captures the canonical draft (what the editor shows), so a
	// half-typed bar edit saves exactly as it will filter. Emptiness and
	// duplicates are guarded editor-side; the empty check here is a
	// backstop.
	function saveCurrentFilter(name: string | undefined) {
		const query = serializeFilterQuery(draftQuery);
		if (query === "") {
			return;
		}
		$settingsStore.savedFilters = [
			...($settingsStore.savedFilters ?? []),
			{ id: crypto.randomUUID(), name, query },
		];
		requestSave();
	}

	let savedFilterPendingDelete: SavedFilterEntry | undefined;

	function confirmDeleteSavedFilter() {
		const pending = savedFilterPendingDelete;
		savedFilterPendingDelete = undefined;
		if (!pending) {
			return;
		}
		$settingsStore.savedFilters = ($settingsStore.savedFilters ?? []).filter(
			(filter) => filter.id !== pending.id,
		);
		requestSave();
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		// While the delete confirmation is open it owns Esc.
		if (savedFilterPendingDelete) {
			return;
		}
		if (e.key === "Escape" && filterEditorExpanded) {
			filterEditorExpanded = false;
		}
	}

	function handleWindowMousedown(e: MouseEvent) {
		if (savedFilterPendingDelete) {
			return;
		}
		if (
			filterEditorExpanded &&
			filterBarContainer &&
			e.target instanceof Node &&
			!filterBarContainer.contains(e.target)
		) {
			filterEditorExpanded = false;
		}
	}

	$: filteredTasks = isFiltered
		? $tasksStore.filter((task) =>
				taskMatchesFilterQuery(task, appliedQuery, $todayStore),
			)
		: $tasksStore;

	$: tasksByColumn = groupByColumnTag(filteredTasks);

	$: totalTaskCount = getBoardTaskCount($tasksStore);
	$: filteredTaskCount = getBoardTaskCount(filteredTasks);

	$: ({
		showFilepath = true,
		consolidateTags = false,
		uncategorizedVisibility = VisibilityOption.Auto,
		doneVisibility = VisibilityOption.AlwaysShow,
		columnWidth = 300,
		flowDirection = FlowDirection.LeftToRight,
		uncategorizedColumnName,
		doneColumnName,
		propertyDisplay = PropertyDisplayMode.None,
		treatNestedTasksAsSubtasks = false,
	} = $settingsStore);

	// Re-evaluate target file whenever settings change (defaultTaskFile or lastUsedTaskFile)
	$: void $settingsStore, targetTaskFile = taskActions.getTargetFile();
	let targetTaskFile: import("obsidian").TFile | null = null;
	// Target is from an explicit default when the default file is valid and matches the resolved target
	$: targetFileIsDefault = !!targetTaskFile && !!$settingsStore.defaultTaskFile && targetTaskFile.path === $settingsStore.defaultTaskFile;

	$: showUncategorizedColumn =
		uncategorizedVisibility === VisibilityOption.AlwaysShow ||
		(uncategorizedVisibility === VisibilityOption.Auto && tasksByColumn["uncategorised"]?.length > 0);

	$: showDoneColumn =
		doneVisibility === VisibilityOption.AlwaysShow ||
		(doneVisibility === VisibilityOption.Auto && tasksByColumn["done"]?.length > 0);

	// Build ordered list of all visible columns, reversed for RTL and BTT
	$: orderedColumns = (() => {
		const allColumns: string[] = [];
		if (showUncategorizedColumn) allColumns.push("uncategorised");
		allColumns.push(...columns);
		if (showDoneColumn) allColumns.push("done");
		const shouldReverse =
			flowDirection === FlowDirection.RightToLeft ||
			flowDirection === FlowDirection.BottomToTop;
		return shouldReverse ? allColumns.reverse() : allColumns;
	})();

	$: isVerticalFlow =
		flowDirection === FlowDirection.TopToBottom ||
		flowDirection === FlowDirection.BottomToTop;

	$: activeMatrix = deriveBoardMatrix(
		filteredTasks,
		$settingsStore.columns,
		{
			...$settingsStore,
			collapsedColumns: Array.from($collapsedColumnsStore)
		},
		$todayStore,
	);

	// --- Sort control (board header) ---
	// Available sort keys are the active schema's known keys, plus — for Dataview
	// only — inline keys discovered on currently parsed tasks.
	$: activeSchema = getSchemaImpl($settingsStore.propertySchema ?? PropertySchemaOption.None);
	$: propertySchemaOption = $settingsStore.propertySchema ?? PropertySchemaOption.None;
	$: availableSortKeys = (() => {
		const known = activeSchema.knownKeys().map((k) => ({ key: k.key, label: k.label }));
		if ($settingsStore.propertySchema !== PropertySchemaOption.Dataview) {
			return known;
		}
		const seen = new Set(known.map((k) => k.key));
		const discovered: { key: string; label: string }[] = [];
		for (const task of $tasksStore) {
			for (const key of task.properties.keys()) {
				if (!seen.has(key)) {
					seen.add(key);
					discovered.push({ key, label: key });
				}
			}
		}
		return [...known, ...discovered];
	})();
	$: availableGroupKeys = availableSortKeys;

	const SORT_FILE_VALUE = "__file__";
	const SORT_TASK_NAME_VALUE = "__task_name__";
	const SORT_MANUAL_VALUE = "__manual__";
	$: orderMode = $settingsStore.columnOrderMode ?? ColumnOrderMode.FileOrder;
	$: isTaskNameSort = orderMode === ColumnOrderMode.TaskName;
	$: isPropertySort = orderMode === ColumnOrderMode.Property;
	$: isDirectionalSort = isTaskNameSort || isPropertySort;
	$: isManualOrder = orderMode === ColumnOrderMode.Manual;
	$: sortSelectValue = isManualOrder
		? SORT_MANUAL_VALUE
		: isTaskNameSort
			? SORT_TASK_NAME_VALUE
			: isPropertySort && $settingsStore.sortProperty
			? `prop:${$settingsStore.sortProperty}`
			: SORT_FILE_VALUE;
	$: groupSelectValue = $settingsStore.groupSource?.kind === "property"
		? `prop:${$settingsStore.groupSource.key}`
		: $settingsStore.groupSource?.kind ?? "none";
	$: isDirectionalGroup = ($settingsStore.groupSource?.kind ?? "none") !== "none";

	function onSortChange(value: string) {
		if (value.startsWith("prop:")) {
			$settingsStore.columnOrderMode = ColumnOrderMode.Property;
			$settingsStore.sortProperty = value.slice("prop:".length);
		} else if (value === SORT_TASK_NAME_VALUE) {
			$settingsStore.columnOrderMode = ColumnOrderMode.TaskName;
		} else if (value === SORT_MANUAL_VALUE) {
			$settingsStore.columnOrderMode = ColumnOrderMode.Manual;
		} else {
			$settingsStore.columnOrderMode = ColumnOrderMode.FileOrder;
		}
		requestSave();
	}

	$: manualOrder = $settingsStore.manualOrder ?? {};
	$: reorderEnabled = isManualOrder;

	// Prune stale manual-order entries when the full task set changes (tasks
	// deleted or moved out of a column). Display already ignores stale entries, so
	// this is purely persistence cleanup — never load-bearing for rendering.
	//
	// It MUST be debounced. A reorder writes block links to files and then sets the
	// new order synchronously, but the task store only reflects those block links
	// asynchronously (file-watch + a 50ms debounce in store.ts). Pruning eagerly in
	// that window would read the new entries against stale tasks, see the freshly
	// assigned block links as "absent", and delete the entries we just wrote. We
	// wait comfortably past the store's settle time so fresh pins always survive;
	// genuine deletions are still cleaned up, just a moment later.
	let pruneTimer: ReturnType<typeof setTimeout> | undefined;

	function schedulePrune() {
		if (pruneTimer) {
			clearTimeout(pruneTimer);
		}
		pruneTimer = setTimeout(() => {
			pruneTimer = undefined;
			const groupSource = $settingsStore.groupSource ?? { kind: "none" };
			const groupBuckets = deriveGroupBuckets(
				$tasksStore,
				groupSource,
				$settingsStore.excludedTags ?? [],
				$settingsStore.statusMarkerOrder ?? "",
				$settingsStore.doneStatusMarkers ?? "",
				$settingsStore.groupDirection ?? "asc",
				$todayStore,
			);
			const assignGroupId = createGroupAssigner(groupBuckets, groupSource, $settingsStore.excludedTags ?? [], $todayStore);
			taskActions.pruneManualOrder(collectPresentManualOrderKeys($tasksStore, assignGroupId));
		}, 500);
	}

	$: if (isManualOrder && $tasksStore) {
		schedulePrune();
	}

	onDestroy(() => {
		if (pruneTimer) {
			clearTimeout(pruneTimer);
		}
	});

	function toggleSortDirection() {
		$settingsStore.sortDirection =
			($settingsStore.sortDirection ?? "asc") === "asc" ? "desc" : "asc";
		requestSave();
	}

	function toggleGroupDirection() {
		$settingsStore.groupDirection =
			($settingsStore.groupDirection ?? "asc") === "asc" ? "desc" : "asc";
		requestSave();
	}

	// Overdue smooshing only makes sense for date-typed group keys; for other
	// keys the flag is preserved but the toggle is hidden.
	$: propertyGroupSource =
		$settingsStore.groupSource?.kind === "property" ? $settingsStore.groupSource : null;
	$: showCollapsePastDatesToggle =
		propertyGroupSource !== null &&
		dateFilterKeys.some((key) => key.key === propertyGroupSource.key);

	function setCollapsePastDates(collapse: boolean) {
		const src = $settingsStore.groupSource;
		if (src?.kind !== "property") return;
		$settingsStore.groupSource = { ...src, collapsePastDates: collapse || undefined };
		requestSave();
	}

	async function handleOpenSettings() {
		openSettings();
	}
</script>

<svelte:window on:keydown={handleWindowKeydown} on:mousedown={handleWindowMousedown} />

<div class="main">
	<div class="board-content">
		<div class="filter-bar-container" bind:this={filterBarContainer}>
			<div class="filter-bar">
				<Icon name="search" size={16} opacity={0.7} />
				<input
					type="text"
					class="filter-bar-input"
					bind:this={filterInputEl}
					bind:value={filterQueryText}
					on:input={refreshBarSuggestions}
					on:keydown={handleFilterInputKeydown}
					on:click={handleFilterInputClick}
					on:blur={hideBarSuggestions}
					placeholder={'Filter tasks — e.g. "big rocks" tag:home file:projects due:<$TODAY'}
					aria-label="Filter tasks (press Enter to apply)"
					spellcheck="false"
				/>
				{#if filterQueryText !== "" || appliedQueryText !== ""}
					<button
						class="filter-bar-clear"
						aria-label="Clear filter"
						on:click={clearFilter}
					>
						×
					</button>
				{/if}
				<button
					class="filter-bar-expand"
					aria-label={filterEditorExpanded
						? "Hide search options"
						: "Show search options"}
					aria-expanded={filterEditorExpanded}
					on:click={() => (filterEditorExpanded = !filterEditorExpanded)}
				>
					<Icon name="sliders-horizontal" size={18} />
				</button>
			</div>
			{#if barSuggestionsVisible}
				<FilterSuggestionList
					suggestions={barSuggestions}
					selectedIndex={barSuggestionIndex}
					onAccept={acceptBarSuggestion}
				/>
			{/if}
			{#if filterEditorExpanded}
				<FilterEditor
					query={draftQuery}
					dateKeys={dateFilterKeys}
					tagSuggestionItems={availableTags}
					fileSuggestionItems={taskFilePaths}
					savedFilters={savedFilterEntries}
					onChange={applyEditorQuery}
					onSearch={searchFromEditor}
					onClear={clearFilter}
					onApplySavedFilter={applySavedFilter}
					onDeleteSavedFilter={(entry) => (savedFilterPendingDelete = entry)}
					onSaveFilter={saveCurrentFilter}
				/>
			{/if}
		</div>
		{#if savedFilterPendingDelete}
			<DeleteFilterModal
				filterText={savedFilterPendingDelete.name ?? savedFilterPendingDelete.query}
				onConfirm={confirmDeleteSavedFilter}
				onCancel={() => (savedFilterPendingDelete = undefined)}
			/>
		{/if}
			<div class="board-header">
				<div class="board-header-controls">
					{#if $settingsStore.groupSource?.kind === "tag-prefix"}
						<div class="grouping-controls">
							<div class="tag-group-input-row">
								<div class="tag-group-mode-toggle">
									<button
										type="button"
										class:active={tagGroupInputMode === "prefix"}
										aria-pressed={tagGroupInputMode === "prefix"}
										on:click={() => setTagGroupInputMode("prefix")}
									>
										Prefix
									</button>
									<button
										type="button"
										class:active={tagGroupInputMode === "include"}
										aria-pressed={tagGroupInputMode === "include"}
										on:click={() => setTagGroupInputMode("include")}
									>
										Include
									</button>
								</div>
								<div class="tag-group-input">
									{#if tagGroupInputMode === "prefix"}
										<input
											type="text"
											class="grouping-prefix-input"
											placeholder="Prefix (e.g. Sprint-)"
											value={$settingsStore.groupSource.prefix ?? ""}
											aria-label="Tag group prefix"
											on:input={(e) => updateTagGroupPrefix(e.currentTarget.value)}
										/>
									{:else}
										<CompactTagSelect
											items={availableTags}
											value={$settingsStore.groupSource.includeTags ?? []}
											maxSelected={0}
											placeholder="Choose tags"
											ariaLabel="Included tag swimlanes"
											on:change={(e) => updateTagGroupIncludeTags(e.detail)}
										/>
									{/if}
								</div>
								<button
									class="filter-action-btn save-btn grouping-save-btn"
									on:click={saveCurrentGrouping}
									disabled={!!activeSavedGroupingId}
								>
									Save
								</button>
							</div>
							{#if savedTagGroupings.length > 0}
								<div class="saved-filters saved-groups">
									<details>
										<summary>Saved groups</summary>
										<ul role="list">
											{#each savedTagGroupings as group}
												<li>
													<span role="button" tabindex="0" class="delete-btn" on:click={() => deleteSavedGrouping(group.id)} on:keydown={(e) => onActivateKey(e, () => deleteSavedGrouping(group.id))} aria-label="Delete saved grouping">×</span>
													<span role="button" tabindex="0" class="filter-text" class:active={group.id === activeSavedGroupingId} on:click={() => loadSavedGrouping(group.id)} on:keydown={(e) => onActivateKey(e, () => loadSavedGrouping(group.id))}>{group.name}</span>
												</li>
											{/each}
										</ul>
									</details>
								</div>
							{/if}
						</div>
					{/if}
					<div class="group-by-stack">
					<select
						class="dropdown group-by-select"
						value={groupSelectValue}
						on:change={(e) => {
							const val = e.currentTarget.value;
							rememberCurrentTagGroupingIfSaved();
							if (val === "file") {
								$settingsStore.groupSource = { kind: "file" };
							} else if (val === "tag-prefix") {
								const nextGroupSource: GroupSource = $settingsStore.groupSource?.kind === "tag-prefix"
									? {
										kind: "tag-prefix",
										prefix: $settingsStore.groupSource.prefix,
										includeTags: $settingsStore.groupSource.includeTags,
									}
									: createTagGroupSourceFromMemory();
								$settingsStore.groupSource = nextGroupSource;
								tagGroupInputMode = tagGroupInputModeForSource(nextGroupSource);
							} else if (val.startsWith("prop:")) {
								$settingsStore.groupSource = {
									kind: "property",
									key: val.slice("prop:".length),
									collapsePastDates: $settingsStore.groupSource?.kind === "property"
										? $settingsStore.groupSource.collapsePastDates
										: undefined,
								};
							} else {
								$settingsStore.groupSource = { kind: "none" };
							}
							requestSave();
						}}
					>
						<option value="none">Group by: (none)</option>
						<option value="file">Group by: File</option>
						<option value="tag-prefix">Group by: Tag</option>
						{#if availableGroupKeys.length > 0}
							<optgroup label="Properties">
								{#each availableGroupKeys as groupKey (groupKey.key)}
									<option value={`prop:${groupKey.key}`}>Group by: {groupKey.label}</option>
								{/each}
							</optgroup>
						{/if}
					</select>
					{#if showCollapsePastDatesToggle && propertyGroupSource}
						<label class="collapse-overdue-toggle">
							<input
								type="checkbox"
								checked={propertyGroupSource.collapsePastDates ?? false}
								on:change={(e) => setCollapsePastDates(e.currentTarget.checked)}
							/>
							Combine past dates
						</label>
					{/if}
					</div>
					{#if isDirectionalGroup}
						<button
							class="sort-direction-btn"
							on:click={toggleGroupDirection}
							aria-label="Toggle group direction"
							title={($settingsStore.groupDirection ?? "asc") === "asc" ? "Group ascending" : "Group descending"}
						>
							<Icon
								name={($settingsStore.groupDirection ?? "asc") === "asc"
									? "arrow-up-narrow-wide"
									: "arrow-down-wide-narrow"}
								size={16}
							/>
						</button>
					{/if}
					<select
						class="dropdown sort-by-select"
						value={sortSelectValue}
						on:change={(e) => onSortChange(e.currentTarget.value)}
					>
						<option value={SORT_FILE_VALUE}>Sort: File order</option>
						<option value={SORT_TASK_NAME_VALUE}>Sort: Task name</option>
						<option value={SORT_MANUAL_VALUE}>Sort: Manual</option>
						<optgroup label="Properties">
							{#each availableSortKeys as sortKey (sortKey.key)}
								<option value={`prop:${sortKey.key}`}>Sort: {sortKey.label}</option>
							{/each}
						</optgroup>
					</select>
					{#if isDirectionalSort}
						<button
							class="sort-direction-btn"
							on:click={toggleSortDirection}
							aria-label="Toggle sort direction"
							title={($settingsStore.sortDirection ?? "asc") === "asc" ? "Ascending" : "Descending"}
						>
							<Icon
								name={($settingsStore.sortDirection ?? "asc") === "asc"
									? "arrow-up-narrow-wide"
									: "arrow-down-wide-narrow"}
								size={16}
							/>
						</button>
					{/if}
					<span class="board-task-count" aria-live="polite">
						{#if isFiltered}
							{filteredTaskCount} of {totalTaskCount} tasks
						{:else}
							Total: {totalTaskCount} tasks
						{/if}
					</span>
					<IconButton icon="lucide-settings" on:click={handleOpenSettings} />
				</div>
			</div>

			<div class="columns" class:vertical-flow={isVerticalFlow} style="--column-width: {columnWidth}px;">
				{#if !isVerticalFlow}
					<BoardMatrixHorizontal
						{app}
						matrix={activeMatrix}
						{taskActions}
						{columnTagTableStore}
						{columnColourTableStore}
						{columnMatchTagTableStore}
						{columnSubtitleTableStore}
						{showFilepath}
						{consolidateTags}
						excludedTags={$settingsStore.excludedTags ?? []}
						{targetTaskFile}
						{targetFileIsDefault}
						onToggleCollapse={toggleColumnCollapse}
						{uncategorizedColumnName}
						{doneColumnName}
						columnWidth="{columnWidth}px"
						{propertyDisplay}
						{propertySchemaOption}
						{isManualOrder}
						{manualOrder}
						{reorderEnabled}
						{treatNestedTasksAsSubtasks}
					/>
				{:else}
					<BoardMatrixVertical
						{app}
						matrix={activeMatrix}
						{taskActions}
						{columnTagTableStore}
						{columnColourTableStore}
						{columnMatchTagTableStore}
						{columnSubtitleTableStore}
						{showFilepath}
						{consolidateTags}
						excludedTags={$settingsStore.excludedTags ?? []}
						{targetTaskFile}
						{targetFileIsDefault}
						onToggleCollapse={toggleColumnCollapse}
						{uncategorizedColumnName}
						{doneColumnName}
						{propertyDisplay}
						{propertySchemaOption}
						{isManualOrder}
						{manualOrder}
						{reorderEnabled}
						{treatNestedTasksAsSubtasks}
					/>
				{/if}
			</div>
	</div>
</div>


<style lang="scss">
	.main {
		height: 100%;
		display: flex;
		flex-direction: column;
		font-size: var(--font-text-size);

		// Positioning context for the expanded editor, which overlays the
		// board content instead of pushing it down. Constrained and centered
		// like a Google search bar rather than spanning the full board.
		.filter-bar-container {
			position: relative;
			z-index: 100;
			width: 100%;
			max-width: 680px;
			margin: 0 auto var(--size-4-2) auto;
		}

		.filter-bar {
			display: flex;
			align-items: center;
			gap: var(--size-2-3);
			padding: 0 var(--size-2-3) 0 var(--size-4-3);
			background: var(--background-primary);
			border: var(--input-border-width, 1px) solid var(--background-modifier-border);
			border-radius: 999px;
			box-shadow: var(--shadow-s);

			&:focus-within {
				box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
			}

			input.filter-bar-input {
				flex: 1 1 auto;
				min-width: 0;
				background: transparent;
				border: none;
				box-shadow: none;
				padding: var(--size-2-3) 0;
				font-size: var(--font-ui-medium);

				&:focus,
				&:focus-visible {
					border: none;
					box-shadow: none;
					outline: none;
				}
			}

			.filter-bar-clear,
			.filter-bar-expand {
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
					color: var(--text-normal);
				}
			}

			.filter-bar-expand {
				display: inline-flex;
				align-items: center;
				border-radius: 999px;
				padding: var(--size-2-2);

				&:hover {
					background: var(--background-modifier-hover);
				}
			}
		}

		.board-content {
			display: flex;
			flex-direction: column;
			height: 100%;
			overflow: hidden;
			padding: var(--size-4-3) var(--size-4-4) 0 var(--size-4-4);
			background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
		}

		.board-header {
			position: relative;
			z-index: 50;
			display: flex;
			justify-content: flex-end;
			align-items: flex-start;
			padding: 0 0 var(--size-4-3) 0;
			gap: var(--size-4-3);

			.board-task-count {
				font-size: var(--font-ui-medium);
				color: var(--text-muted);
				margin-top: 4px; /* to align with input */
					margin-left: var(--size-4-2);
					margin-right: var(--size-4-2);
			}

			.board-header-controls {
				display: flex;
				align-items: flex-start;
				justify-content: flex-end;
				flex-wrap: wrap;
				gap: var(--size-4-2);
				min-height: 54px; /* prevent shifting when saved groups is toggled */

				.group-by-select,
				.sort-by-select {
					font-size: var(--font-ui-smaller);
					/* Only adjust vertical padding; leave horizontal padding to
					   Obsidian's .dropdown so its chevron keeps its reserved space. */
					padding-block: var(--size-2-1);
				}

				.sort-direction-btn {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					padding: var(--size-2-1) var(--size-2-2);
					border: var(--input-border-width, 1px) solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					background: var(--interactive-normal);
					color: var(--text-normal);
					cursor: pointer;

					&:hover {
						background: var(--interactive-hover);
					}
				}

				/* Tight column so the overdue toggle tucks directly under the
				   group select without pushing the header row taller than the
				   54px it already reserves. */
				.group-by-stack {
					display: flex;
					flex-direction: column;
					align-items: flex-start;
					gap: 0;
				}

				.collapse-overdue-toggle {
					display: inline-flex;
					align-items: center;
					gap: var(--size-2-1);
					margin-top: 1px;
					/* Nudge right to line up with the select's visible edge. */
					padding-left: 3px;
					font-size: var(--font-ui-smaller);
					line-height: 1;
					color: var(--text-muted);
					cursor: pointer;
					white-space: nowrap;

					input[type="checkbox"] {
						margin: 0;
						--checkbox-size: 12px;
					}

					&:hover {
						color: var(--text-normal);
					}
				}
			}

			.grouping-controls {
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				flex: 0 0 auto;
				gap: var(--size-2-2);
				min-width: max-content;
			}

			.tag-group-input-row {
				--tag-group-control-height: 34px;
				display: grid !important;
				grid-template-columns: auto 240px auto !important;
				align-items: start !important;
				gap: var(--size-4-2) !important;

				.tag-group-mode-toggle {
					display: inline-flex !important;
					align-items: stretch !important;
					border: var(--input-border-width, 1px) solid var(--background-modifier-border) !important;
					border-radius: var(--input-radius) !important;
					overflow: hidden !important;
					background: var(--background-modifier-form-field, var(--background-primary)) !important;
					flex: 0 0 auto !important;
					height: var(--tag-group-control-height) !important;

					button {
						display: inline-flex !important;
						align-items: center !important;
						justify-content: center !important;
						height: 100% !important;
						min-height: 0 !important;
						margin: 0 !important;
						border: 0 !important;
						border-radius: 0 !important;
						box-shadow: none !important;
						background: transparent !important;
						color: var(--text-muted) !important;
						font-size: var(--font-ui-smaller) !important;
						line-height: 1 !important;
						padding: var(--size-2-1) var(--size-2-3) !important;
						cursor: pointer !important;

						&:hover {
							color: var(--text-normal) !important;
							background: var(--background-modifier-hover) !important;
						}

						&.active {
							background: var(--interactive-accent) !important;
							color: var(--text-on-accent) !important;
						}

						&:focus,
						&:active {
							box-shadow: none !important;
						}

						&:focus-visible {
							outline: 2px solid var(--background-modifier-border-focus) !important;
							outline-offset: -2px !important;
						}

						+ button {
							border-left: var(--input-border-width, 1px) solid var(--background-modifier-border) !important;
						}
					}
				}

				.tag-group-input {
					width: 240px !important;
					flex: 0 0 auto !important;
					--compact-tag-select-height: var(--tag-group-control-height);
					--compact-tag-select-font-size: var(--font-ui-small);
				}

				.grouping-prefix-input {
					width: 100% !important;
					height: var(--tag-group-control-height) !important;
					font-size: var(--font-ui-small) !important;
				}

				.grouping-save-btn {
					align-self: flex-start !important;
					height: var(--tag-group-control-height) !important;
					padding: var(--size-2-1) var(--size-2-3) !important;
					font-size: var(--font-ui-smaller) !important;
				}
			}

			.saved-groups {
				margin-left: calc(var(--size-4-2) + 2px);
				margin-bottom: 0;

				details {
					position: relative;
				}

				ul {
					position: absolute;
					top: 100%;
					left: 0;
					z-index: 100;
					min-width: max-content;
					gap: var(--size-2-2);
				}
			}
		}
		
		.saved-filters {
			margin-top: 0;
			margin-bottom: var(--size-4-2);
			font-size: var(--font-ui-small);

			details {
				summary {
					cursor: pointer;
					color: var(--text-muted);
					padding: var(--size-2-1) 0;
					user-select: none;
					transition: color 0.15s ease;

					&:hover {
						color: var(--text-normal);
					}
				}

				ul {
					margin: 0;
					padding: var(--size-2-2) !important;
					list-style: none;
					background: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-m);
					box-shadow: var(--shadow-s);
					z-index: 100;

					li {
						margin: 0;
						display: flex;
						align-items: center;
						border-radius: var(--radius-s);
						background: var(--background-primary);
						border: 1px solid var(--background-modifier-border);
						box-shadow: 0 1px 2px rgba(0,0,0,0.05);
						transition: background 0.15s ease;
	
						&:hover {
							background: var(--background-modifier-hover);
						}
	
						span[role="button"] {
							text-align: left;
							padding: var(--size-2-1) var(--size-2-2);
							background: transparent;
							border: none;
							cursor: pointer;
							color: var(--text-normal);
							white-space: nowrap;
							transition: color 0.15s ease;
	
							&.active {
								font-weight: 700;
								color: var(--interactive-accent);
							}
	
							&.delete-btn {
								padding: var(--size-2-1) 0 var(--size-2-1) var(--size-2-2);
								display: flex;
								align-items: center;
								justify-content: center;
								font-size: 18px;
								line-height: 1;
								color: var(--text-muted);
	
								&:hover {
									color: var(--color-red);
								}
							}
							
							&.filter-text {
								padding-left: var(--size-2-1);
							}
						}
					}
				}
			}
		}

		.columns {
			flex: 1 1 0;
			min-height: 0;
			max-width: 100vw;
			overflow-x: scroll;
			overflow-y: auto;
			padding-bottom: var(--size-4-4);

			&.vertical-flow {
				overflow-x: auto;
				overflow-y: scroll;
			}
		}
	}
</style>
