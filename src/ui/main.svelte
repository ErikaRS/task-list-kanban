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
	import ViewEditor from "./view_editor.svelte";
	import {
		createGroupAssigner,
		deriveGroupBuckets,
		normalizeTagIncludeList,
		type GroupSource,
	} from "./tasks/task_grouping";
	import IconButton from "./components/icon_button.svelte";
	import Icon from "./components/icon.svelte";
	import { readable, type Writable, type Readable } from "svelte/store";
	import type { TaskActions } from "./tasks/actions";
	import { type BoardSettingsStore, type SavedView, type SettingValues, VisibilityOption, FlowDirection, PropertyDisplayMode } from "./settings/settings_store";
	import { getSchemaImpl } from "../parsing/properties/index";
	import { PropertySchemaOption } from "../parsing/properties/property_schema";
	import { ColumnOrderMode } from "../parsing/properties/comparators";
	import { onMount, onDestroy, tick } from "svelte";
	import type { App } from "obsidian";
	import { getBoardTaskCount } from "./board_counts";
	import { collectPresentManualOrderKeys } from "./tasks/manual_order";
	import {
		readBoardFilterState,
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
	import {
		applySavedViewProperties,
		captureSavedViewProperties,
		mergeLocalAndGlobalSavedViews,
		savedViewHasProperties,
		savedViewIsQueryOnly,
		savedViewPropertyLabels,
		type SavedViewListEntry,
		type SavedViewProperties,
	} from "./views/saved_views";

	type TagGroupInputMode = "prefix" | "include";

	export let app: App;
	export let tasksStore: Writable<Task[]>;
	export let taskActions: TaskActions;
	export let openSettings: () => Promise<void>;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let settingsStore: BoardSettingsStore;
	export let globalViewsStore: Readable<SavedView[]> = readable([]);
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

	$: availableTags = [...tags].sort((a, b) => a.localeCompare(b));

	let tagGroupInputMode: TagGroupInputMode = "prefix";

	function tagGroupInputModeForSource(source: GroupSource | undefined): TagGroupInputMode {
		return source?.kind === "tag-prefix" && (source.includeTags?.length ?? 0) > 0
			? "include"
			: "prefix";
	}

	function updateTagGroupPrefix(prefix: string) {
		const src = $settingsStore.groupSource;
		if (!src || src.kind !== "tag-prefix") return;
		$settingsStore.groupSource = {
			kind: "tag-prefix",
			prefix,
		};
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
		requestSave();
	}

	function setTagGroupInputMode(mode: TagGroupInputMode) {
		const src = $settingsStore.groupSource;
		if (!src || src.kind !== "tag-prefix" || tagGroupInputMode === mode) return;

		tagGroupInputMode = mode;
		$settingsStore.groupSource = mode === "prefix"
			? { kind: "tag-prefix", prefix: src.prefix ?? "" }
			: { kind: "tag-prefix", prefix: "", includeTags: src.includeTags ?? [] };
		requestSave();
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
	$: savedViews = $settingsStore.savedViews ?? [];
	$: globalSavedViews = $globalViewsStore ?? [];
	$: mergedSavedViews = mergeLocalAndGlobalSavedViews(savedViews, globalSavedViews);
	$: currentSavedViewProperties = captureSavedViewProperties(
		$settingsStore,
		settingsStore.getOverrides(),
	);
	$: canSaveCurrentView = savedViewHasProperties(currentSavedViewProperties);

	// --- Expanded structured editor (two synced views of one query) ---
	let filterEditorExpanded = false;
	let viewEditorExpanded = false;
	let filterBarContainer: HTMLDivElement | undefined;
	let viewControlContainer: HTMLDivElement | undefined;
	let boardContentEl: HTMLDivElement | undefined;
	let viewEditorPopover: HTMLDivElement | undefined;
	let viewEditorPopoverStyle = "";

	const VIEW_EDITOR_POPOVER_GAP = 8;
	const VIEW_EDITOR_POPOVER_MARGIN = 12;

	$: {
		viewEditorExpanded;
		isTagPrefixGrouping;
		savedViewListExpanded;
		sortSelectValue;
		groupSelectValue;
		if (viewEditorExpanded) {
			void tick().then(updateViewEditorPopoverPosition);
		}
	}

	function toggleViewEditor() {
		viewEditorExpanded = !viewEditorExpanded;
	}

	function updateViewEditorPopoverPosition() {
		if (!viewEditorExpanded || !boardContentEl || !viewControlContainer || !viewEditorPopover) {
			return;
		}
		const boardRect = boardContentEl.getBoundingClientRect();
		const triggerRect = viewControlContainer.getBoundingClientRect();
		const popoverRect = viewEditorPopover.getBoundingClientRect();
		const margin = VIEW_EDITOR_POPOVER_MARGIN;
		const gap = VIEW_EDITOR_POPOVER_GAP;
		const maxWidth = Math.max(240, boardRect.width - margin * 2);
		const popoverWidth = Math.min(popoverRect.width || maxWidth, maxWidth);
		const minLeft = boardRect.left + margin;
		const maxLeft = boardRect.right - margin - popoverWidth;
		const left = Math.max(minLeft, Math.min(triggerRect.left, maxLeft));
		const availableBelow = boardRect.bottom - triggerRect.bottom - gap - margin;
		const maxHeight = Math.max(160, availableBelow);

		viewEditorPopoverStyle = [
			`left: ${Math.round(left - triggerRect.left)}px`,
			`max-width: ${Math.round(maxWidth)}px`,
			`max-height: ${Math.round(maxHeight)}px`,
		].join("; ");
	}

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

	// --- Saved views (SPEC 0030 Phase 3) ---
	// Query-only saved views are also exposed to the filter editor so the
	// existing "Saved" filter affordance keeps working after migration.
	$: savedFilterEntries = mergedSavedViews
		.filter((view) => savedViewIsQueryOnly(view) && view.query !== undefined)
		.map(
			(view): SavedFilterEntry => ({
				id: `${view.isGlobal ? "global" : "local"}:${view.id}`,
				name: view.name === view.query ? undefined : view.name,
				query: view.query!,
				isGlobal: view.isGlobal,
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
		$settingsStore.savedViews = [
			...savedViews,
			{ id: crypto.randomUUID(), name: name ?? query, query },
		];
		requestSave();
	}

	let savedFilterPendingDelete: SavedFilterEntry | undefined;
	let savedViewPendingDelete: SavedViewListEntry | undefined;
	// The editor unmounts when the panel collapses; holding the saved-list
	// zippy state here makes it stick across reopenings. Collapsed by
	// default.
	let savedFilterListExpanded = false;
	let savedViewListExpanded = false;

	function confirmDeleteSavedFilter() {
		const pending = savedFilterPendingDelete;
		savedFilterPendingDelete = undefined;
		if (!pending || pending.isGlobal) {
			return;
		}
		const localId = pending.id.startsWith("local:")
			? pending.id.slice("local:".length)
			: pending.id;
		$settingsStore.savedViews = savedViews.filter((view) => view.id !== localId);
		requestSave();
	}

	function defaultSavedViewName(properties: SavedViewProperties): string {
		const labels = savedViewPropertyLabels(properties);
		return labels.length > 0 ? labels.join(" + ") : "View";
	}



	function saveCurrentView(name: string | undefined) {
		const properties = currentSavedViewProperties;
		if (!savedViewHasProperties(properties)) {
			return;
		}
		$settingsStore.savedViews = [
			...savedViews,
			{
				id: crypto.randomUUID(),
				name: name?.trim() || defaultSavedViewName(properties),
				...properties,
			},
		];
		requestSave();
	}

	function applySavedView(view: SavedView) {
		if (view.query !== undefined) {
			filterQueryText = view.query;
			appliedQueryText = view.query;
			lastPersistedQuery = view.query;
		}
		settingsStore.update((settings) => {
			const next = applySavedViewProperties(settings, view);
			return view.query !== undefined
				? writeBoardFilterState(next, view.query)
				: next;
		});
		if (view.group?.source.kind === "tag-prefix") {
			tagGroupInputMode = tagGroupInputModeForSource(view.group.source);
		}
		hideBarSuggestions();
		requestSave();
	}

	function confirmDeleteSavedView() {
		const pending = savedViewPendingDelete;
		savedViewPendingDelete = undefined;
		if (!pending || pending.isGlobal) {
			return;
		}
		$settingsStore.savedViews = savedViews.filter((view) => view.id !== pending.id);
		requestSave();
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		// While the delete confirmation is open it owns Esc.
		if (savedFilterPendingDelete || savedViewPendingDelete) {
			return;
		}
		if (e.key === "Escape" && filterEditorExpanded) {
			filterEditorExpanded = false;
			return;
		}
		if (e.key === "Escape" && viewEditorExpanded) {
			viewEditorExpanded = false;
		}
	}

	function handleWindowMousedown(e: MouseEvent) {
		if (savedFilterPendingDelete || savedViewPendingDelete) {
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
		if (
			viewEditorExpanded &&
			viewControlContainer &&
			e.target instanceof Node &&
			!viewControlContainer.contains(e.target)
		) {
			viewEditorExpanded = false;
		}
	}

	function handleWindowViewportChange() {
		updateViewEditorPopoverPosition();
	}

	$: filteredTasks = isFiltered
		? $tasksStore.filter((task) =>
				taskMatchesFilterQuery(task, appliedQuery, $todayStore),
			)
		: $tasksStore;

	$: tasksByColumn = groupByColumnTag(filteredTasks);

	$: totalTaskCount = getBoardTaskCount($tasksStore);
	$: filteredTaskCount = getBoardTaskCount(filteredTasks);
	$: boardTaskCountLabel = isFiltered
		? `${filteredTaskCount} of ${totalTaskCount} tasks`
		: `Total: ${totalTaskCount} tasks`;

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
	$: isTagPrefixGrouping = $settingsStore.groupSource?.kind === "tag-prefix";
	$: tagGroupPrefix = $settingsStore.groupSource?.kind === "tag-prefix"
		? $settingsStore.groupSource.prefix ?? ""
		: "";
	$: tagGroupIncludeTags = $settingsStore.groupSource?.kind === "tag-prefix"
		? $settingsStore.groupSource.includeTags ?? []
		: [];

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

	function onGroupChange(value: string) {
		if (value === "file") {
			$settingsStore.groupSource = { kind: "file" };
		} else if (value === "tag-prefix") {
			const nextGroupSource: GroupSource = $settingsStore.groupSource?.kind === "tag-prefix"
				? {
					kind: "tag-prefix",
					prefix: $settingsStore.groupSource.prefix,
					includeTags: $settingsStore.groupSource.includeTags,
				}
				: { kind: "tag-prefix", prefix: "" };
			$settingsStore.groupSource = nextGroupSource;
			tagGroupInputMode = tagGroupInputModeForSource(nextGroupSource);
		} else if (value.startsWith("prop:")) {
			$settingsStore.groupSource = {
				kind: "property",
				key: value.slice("prop:".length),
				collapsePastDates: $settingsStore.groupSource?.kind === "property"
					? $settingsStore.groupSource.collapsePastDates
					: undefined,
			};
		} else {
			$settingsStore.groupSource = { kind: "none" };
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

	function setFlowDirection(value: FlowDirection) {
		$settingsStore.flowDirection = value;
		requestSave();
	}

	function setColumnWidth(value: number) {
		const clamped = Math.min(600, Math.max(200, Math.round(value / 10) * 10));
		$settingsStore.columnWidth = clamped;
		requestSave();
	}

	async function handleOpenSettings() {
		openSettings();
	}
</script>

<svelte:window
	on:keydown={handleWindowKeydown}
	on:mousedown={handleWindowMousedown}
	on:resize={handleWindowViewportChange}
	on:scroll={handleWindowViewportChange}
/>

<div class="main">
	<div class="board-content" bind:this={boardContentEl}>
		<div class="board-toolbar">
			<div class="view-control" bind:this={viewControlContainer}>
				<button
					type="button"
					class="view-editor-toggle"
					class:active={viewEditorExpanded}
					aria-expanded={viewEditorExpanded}
					aria-label={viewEditorExpanded ? "Hide view settings" : "Show view settings"}
					on:click={toggleViewEditor}
				>
					<Icon name="sliders-horizontal" size={16} />
					<span>View</span>
					<span class="view-editor-chevron">
						<Icon name={viewEditorExpanded ? "chevron-up" : "chevron-down"} size={15} />
					</span>
				</button>
				{#if viewEditorExpanded}
					<div
						class="view-editor-popover"
						bind:this={viewEditorPopover}
						style={viewEditorPopoverStyle}
					>
						<ViewEditor
							{sortSelectValue}
							{availableSortKeys}
							{isDirectionalSort}
							sortDirection={$settingsStore.sortDirection ?? "asc"}
							onSortChange={onSortChange}
							onToggleSortDirection={toggleSortDirection}
							{groupSelectValue}
							{availableGroupKeys}
							{isDirectionalGroup}
							groupDirection={$settingsStore.groupDirection ?? "asc"}
							onGroupChange={onGroupChange}
							onToggleGroupDirection={toggleGroupDirection}
							{showCollapsePastDatesToggle}
							collapsePastDates={propertyGroupSource?.collapsePastDates ?? false}
							onSetCollapsePastDates={setCollapsePastDates}
							{isTagPrefixGrouping}
							{tagGroupInputMode}
							{availableTags}
							{tagGroupPrefix}
							{tagGroupIncludeTags}
							onSetTagGroupInputMode={setTagGroupInputMode}
							onUpdateTagGroupPrefix={updateTagGroupPrefix}
							onUpdateTagGroupIncludeTags={updateTagGroupIncludeTags}
							{flowDirection}
							{columnWidth}
							onSetFlowDirection={setFlowDirection}
							onSetColumnWidth={setColumnWidth}
							savedViews={mergedSavedViews}
							{savedViewListExpanded}
							canSaveView={canSaveCurrentView}
							currentViewProperties={currentSavedViewProperties}
							onSaveCurrentView={saveCurrentView}
							onApplySavedView={applySavedView}
							onDeleteSavedView={(view) => (savedViewPendingDelete = view)}
							onToggleSavedViewList={(expanded) => (savedViewListExpanded = expanded)}
						/>
					</div>
				{/if}
			</div>
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
						savedListExpanded={savedFilterListExpanded}
						onChange={applyEditorQuery}
						onSearch={searchFromEditor}
						onClear={clearFilter}
						onApplySavedFilter={applySavedFilter}
						onDeleteSavedFilter={(entry) => (savedFilterPendingDelete = entry)}
						onSaveFilter={saveCurrentFilter}
						onToggleSavedList={(expanded) => (savedFilterListExpanded = expanded)}
					/>
				{/if}
			</div>
			<div class="settings-control">
				<IconButton icon="lucide-settings" on:click={handleOpenSettings} />
			</div>
		</div>
		{#if savedFilterPendingDelete}
			<DeleteFilterModal
				filterText={savedFilterPendingDelete.name ?? savedFilterPendingDelete.query}
				onConfirm={confirmDeleteSavedFilter}
				onCancel={() => (savedFilterPendingDelete = undefined)}
			/>
		{/if}
		{#if savedViewPendingDelete}
			<DeleteFilterModal
				title="Delete saved view?"
				filterText={savedViewPendingDelete.name}
				onConfirm={confirmDeleteSavedView}
				onCancel={() => (savedViewPendingDelete = undefined)}
			/>
		{/if}
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
						taskCountLabel={boardTaskCountLabel}
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
						taskCountLabel={boardTaskCountLabel}
					/>
				{/if}
			</div>
	</div>
</div>


<style lang="scss">
	.main {
		--view-toolbar-control-height: 42px;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-size: var(--font-text-size);

		.board-toolbar {
			position: relative;
			z-index: 120;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: var(--size-2-2);
			width: 100%;
			max-width: min(1120px, calc(100% - var(--size-4-8)));
			margin: 0 auto var(--size-4-2) auto;
			line-height: 1;
		}

		// Positioning context for the expanded editor, which overlays the
		// board content instead of pushing it down. Constrained and centered
		// like a Google search bar rather than spanning the full board.
		.filter-bar-container {
			position: relative;
			z-index: 100;
			flex: 1 1 auto;
			min-width: 0;
			width: auto;
			max-width: none;
			margin: 0;
		}

		.view-control,
		.settings-control {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			flex: 0 0 auto;
			height: var(--view-toolbar-control-height);
			box-sizing: border-box;
		}

		.settings-control :global(.clickable-icon) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: var(--view-toolbar-control-height);
			height: var(--view-toolbar-control-height);
			box-sizing: border-box;
			margin: 0;
			border-radius: 999px;
		}

		.view-editor-toggle {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: var(--size-2-2);
			height: var(--view-toolbar-control-height);
			min-height: 0;
			box-sizing: border-box;
			margin: 0;
			padding: 0 var(--size-4-3);
			border: var(--input-border-width, 1px) solid var(--background-modifier-border);
			border-radius: 999px;
			background: var(--background-primary);
			box-shadow: var(--shadow-s);
			color: var(--text-normal);
			font-size: var(--font-ui-small);
			font-weight: 600;
			line-height: 1;
			cursor: pointer;

			&:hover {
				background: var(--background-modifier-hover);
			}

			&.active {
				background: var(--background-primary);
				border-color: color-mix(in srgb, var(--interactive-accent) 24%, transparent);
				box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
			}

			.view-editor-chevron {
				display: inline-flex;
				align-items: center;
				color: var(--text-muted);
			}
		}

		.view-editor-popover {
			position: absolute;
			top: calc(100% + var(--view-editor-popover-gap));
			left: 0;
			z-index: 130;
			width: max-content;
			max-width: calc(100vw - var(--size-4-8));
			max-height: min(680px, calc(100vh - 120px));
			overflow: auto;
		}

		.filter-bar {
			display: flex;
			align-items: center;
			gap: var(--size-2-3);
			height: var(--view-toolbar-control-height);
			min-height: 0;
			box-sizing: border-box;
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
				height: 100%;
				background: transparent;
				border: none;
				box-shadow: none;
				margin: 0;
				padding: 0;
				font-size: var(--font-ui-medium);
				line-height: 1;

				&:focus,
				&:focus-visible {
					border: none;
					box-shadow: none;
					outline: none;
				}
			}

			.filter-bar-clear,
			.filter-bar-expand {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				flex: 0 0 auto;
				width: 30px;
				height: 30px;
				margin: 0;
				padding: 0;
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
				border-radius: 999px;

				&:hover {
					background: var(--background-modifier-hover);
				}
			}
		}

		.board-content {
			--view-editor-popover-gap: 8px;
			display: flex;
			flex-direction: column;
			height: 100%;
			overflow: visible;
			padding: var(--size-4-2) var(--size-4-4) 0 var(--size-4-4);
			background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
		}

		@media (max-width: 760px) {
			.board-toolbar {
				flex-wrap: wrap;
				justify-content: flex-start;
			}

			.filter-bar-container {
				flex-basis: 100%;
				width: 100%;
				max-width: 100%;
			}

			.settings-control {
				margin-left: auto;
			}

			.view-editor-popover {
				width: calc(100vw - var(--size-4-8));
			}
		}

		.columns {
			flex: 1 1 0;
			width: 100%;
			min-width: 0;
			min-height: 0;
			max-width: 100%;
			box-sizing: border-box;
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
