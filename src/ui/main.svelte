<script lang="ts">
	import {
		type ColumnTag,
		type ColumnMatchTagTable,
		type ColumnTagTable,
		type ColumnColourTable,
		type DefaultColumns,
		createCollapsedColumnsStore,
	} from "./columns/columns";
	import type { Task } from "./tasks/task";
	import Column from "./components/column.svelte";
	import SelectTag from "./components/select/select_tag.svelte";
	import IconButton from "./components/icon_button.svelte";
	import DeleteFilterModal from "./components/delete_filter_modal.svelte";
	import type { Writable, Readable } from "svelte/store";
import { get } from "svelte/store";
	import type { TaskActions } from "./tasks/actions";
	import { type SettingValues, VisibilityOption, FlowDirection, ColumnOrderMode } from "./settings/settings_store";
	import { onMount } from "svelte";
	import type { App } from "obsidian";
	import type { ManualOrderStore } from "./tasks/manual_order";
import { stableTaskKey, initializeColumnOrder } from "./tasks/manual_order";

	export let app: App;
	export let tasksStore: Writable<Task[]>;
	export let taskActions: TaskActions;
	export let openSettings: () => Promise<void>;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let settingsStore: Writable<SettingValues>;
	export let manualOrderStore: Writable<ManualOrderStore>;
	export let requestSave: () => void;

	const collapsedColumnsStore = createCollapsedColumnsStore(settingsStore);

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

	function handleReorder(column: ColumnTag | DefaultColumns, newOrder: string[]) {
		manualOrderStore.update(store => ({ ...store, [column]: newOrder }));
		requestSave();
	}

	function handleCrossColumnReorder(
		sourceColumn: ColumnTag | DefaultColumns,
		sourceNewOrder: string[],
		destColumn: ColumnTag | DefaultColumns,
		destNewOrder: string[]
	) {
		manualOrderStore.update(store => ({
			...store,
			[sourceColumn]: sourceNewOrder,
			[destColumn]: destNewOrder,
		}));
		requestSave();
	}

	// Initialize manual order when columnOrderMode is set to Manual
	let previousColumnOrderMode = ColumnOrderMode.File;
	$: if ($settingsStore.columnOrderMode === ColumnOrderMode.Manual && previousColumnOrderMode === ColumnOrderMode.File) {
		const tasksStore$ = get(tasksStore);
		const settings$ = get(settingsStore);

		manualOrderStore.update(store => {
			const newStore = { ...store };
			for (const col of settings$.columns.map(c => c.id)) {
				const columnTasks = tasksStore$.filter(task => task.column === col);
				newStore[col] = initializeColumnOrder(columnTasks, newStore[col] ?? []);
			}
			return newStore;
		});
		requestSave();
	}
	previousColumnOrderMode = $settingsStore.columnOrderMode;

	$: tags = $tasksStore.reduce((acc, curr) => {
		for (const tag of curr.tags) {
			acc.add(tag);
		}
		return acc;
	}, new Set<string>());

	// Collect and sort available file paths for autocomplete
	// Note: The native <datalist> autocomplete performs substring matching on the full path,
	// so typing "a/b" will match "apple/banana" or "data/backup", not just paths with those exact segments.
	// This is browser behavior and may show multiple unrelated paths with matching substrings.
	$: availableFiles = [...new Set($tasksStore.map(task => task.path))].sort((a, b) => {
		const aParts = a.split('/');
		const bParts = b.split('/');
		const minLength = Math.min(aParts.length, bParts.length);
		
		for (let i = 0; i < minLength; i++) {
			// If one path ends here and the other continues, shorter (file) comes first
			const aIsLast = (i === aParts.length - 1);
			const bIsLast = (i === bParts.length - 1);
			
			if (aIsLast && !bIsLast) return -1;
			if (bIsLast && !aIsLast) return 1;
			
			const aPart = aParts[i];
			const bPart = bParts[i];
			if (aPart === undefined || bPart === undefined) continue;
			const comparison = aPart.localeCompare(bPart);
			if (comparison !== 0) return comparison;
		}
		
		return aParts.length - bParts.length;
	});

	let selectedTags: string[] = [];
	$: selectedTagsSet = new Set(selectedTags);

	function tagsMatch(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		const sortedA = [...a].sort();
		const sortedB = [...b].sort();
		return sortedA.every((tag, i) => tag === sortedB[i]);
	}

	let activeContentFilterId: string | undefined = undefined;
	let activeTagFilterId: string | undefined = undefined;
	let activeFileFilterId: string | undefined = undefined;

	let deleteModalOpen = false;
	let filterToDelete: { id: string; text: string; type: 'content' | 'tag' | 'file' } | null = null;

	$: savedFilters = $settingsStore.savedFilters ?? [];

	$: activeContentFilterId = filterText.trim()
		? savedFilters.find(f => f.content?.text === filterText.trim())?.id
		: undefined;

	$: {
		if (selectedTags.length > 0) {
			const matchingFilter = savedFilters.find(f =>
				f.tag ? tagsMatch(selectedTags, f.tag.tags) : false
			);
			activeTagFilterId = matchingFilter?.id;
		} else {
			activeTagFilterId = undefined;
		}
	}

	$: activeFileFilterId = fileFilter.trim()
		? savedFilters.find(f => f.file?.filepaths[0] === fileFilter.trim())?.id
		: undefined;

	$: contentFilters = savedFilters
		.filter((f) => f.content !== undefined)
		.sort((a, b) => {
			const textA = a.content?.text.toLowerCase() ?? "";
			const textB = b.content?.text.toLowerCase() ?? "";
			return textA.localeCompare(textB);
		});

	$: tagFilters = savedFilters
		.filter((f) => f.tag !== undefined)
		.sort((a, b) => {
			const tagsA = (a.tag?.tags ?? []).join(", ").toLowerCase();
			const tagsB = (b.tag?.tags ?? []).join(", ").toLowerCase();
			return tagsA.localeCompare(tagsB);
		});

	$: fileFilters = savedFilters
		.filter((f) => f.file !== undefined)
		.sort((a, b) => {
			const pathA = a.file?.filepaths[0] ?? "";
			const pathB = b.file?.filepaths[0] ?? "";
			return pathA.localeCompare(pathB);
		});

	$: contentFilterExists = contentFilters.some(
		(f) => f.content?.text === filterText.trim()
	);

	$: tagFilterExists = selectedTags.length > 0 &&
		savedFilters.some((f) => f.tag ? tagsMatch(selectedTags, f.tag.tags) : false);

	$: fileFilterExists = savedFilters.some(
		(f) => f.file?.filepaths[0] === fileFilter.trim()
	);

	function addContentFilter() {
		const normalized = filterText.trim();
		const existingFilterIndex = savedFilters.findIndex(
			(f) => f.content?.text === normalized
		);
		if (existingFilterIndex >= 0) {
			return;
		}
		const newFilter = {
			id: crypto.randomUUID(),
			content: { text: normalized },
		};
		$settingsStore.savedFilters = [...savedFilters, newFilter];
		requestSave();
	}

	function loadContentFilter(filterId: string, text: string) {
		if (activeContentFilterId === filterId) {
			clearContentFilter();
		} else {
			filterText = text;
			activeContentFilterId = filterId;
		}
	}

	function clearContentFilter() {
		filterText = "";
		activeContentFilterId = undefined;
	}

	function clearFileFilter() {
		fileFilter = "";
		activeFileFilterId = undefined;
	}

	function addFileFilter() {
		const normalized = fileFilter.trim();
		if (!normalized) return;
		
		const existingFilterIndex = savedFilters.findIndex(
			(f) => f.file?.filepaths[0] === normalized
		);
		if (existingFilterIndex >= 0) {
			return;
		}
		const newFilter = {
			id: crypto.randomUUID(),
			file: { filepaths: [normalized] },
		};
		$settingsStore.savedFilters = [...savedFilters, newFilter];
		requestSave();
	}

	function loadFileFilter(filterId: string, filepath: string) {
		if (activeFileFilterId === filterId) {
			clearFileFilter();
		} else {
			fileFilter = filepath;
			activeFileFilterId = filterId;
		}
	}

	function addTagFilter() {
		if (selectedTags.length === 0 || tagFilterExists) {
			return;
		}
		const newFilter = {
			id: crypto.randomUUID(),
			tag: { tags: [...selectedTags].sort() },
		};
		$settingsStore.savedFilters = [...savedFilters, newFilter];
		requestSave();
	}

	function clearTagFilter() {
		selectedTags = [];
		activeTagFilterId = undefined;
	}

	function openDeleteModal(filterId: string, filterText: string, type: 'content' | 'tag' | 'file') {
		filterToDelete = { id: filterId, text: filterText, type };
		deleteModalOpen = true;
	}

	function closeDeleteModal() {
		deleteModalOpen = false;
		filterToDelete = null;
	}

	function confirmDelete() {
		if (!filterToDelete) return;
		
		const filterId = filterToDelete.id;
		const filterType = filterToDelete.type;
		
		const wasActive = filterType === 'content' 
			? activeContentFilterId === filterId
			: filterType === 'tag'
			? activeTagFilterId === filterId
			: activeFileFilterId === filterId;
		
		$settingsStore.savedFilters = savedFilters.filter(f => f.id !== filterId);
		
		if (wasActive) {
			if (filterType === 'content') {
				activeContentFilterId = undefined;
			} else if (filterType === 'tag') {
				activeTagFilterId = undefined;
			} else {
				activeFileFilterId = undefined;
			}
		}
		
		requestSave();
		closeDeleteModal();
	}

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

	let filterText = "";
	let fileFilter = "";
	let hydrated = false;
	let subscriptionCount = 0;

	onMount(() => {
		const unsubscribe = settingsStore.subscribe(settings => {
			subscriptionCount++;
			// Skip the first call (immediate subscription with current value)
			if (subscriptionCount === 1) {
				return;
			}
			if (!hydrated) {
				filterText = settings.lastContentFilter ?? "";
				fileFilter = settings.lastFileFilter?.[0] ?? "";
				// Delay tag filter hydration until tags are loaded
				if (settings.lastTagFilter && settings.lastTagFilter.length > 0) {
					const checkTags = setInterval(() => {
						if (tags.size > 0) {
							selectedTags = settings.lastTagFilter ?? [];
							clearInterval(checkTags);
						}
					}, 100);
				}
				hydrated = true;
			}
		});

		return unsubscribe;
	});

	function saveFilterState() {
		if (hydrated) {
			settingsStore.update(settings => ({
				...settings,
				lastContentFilter: filterText,
				lastTagFilter: selectedTags,
				lastFileFilter: fileFilter ? [fileFilter] : [],
			}));
			requestSave();
		}
	}

	$: if (hydrated) {
		filterText;
		selectedTags;
		fileFilter;
		saveFilterState();
	}

	$: filteredByText = filterText
		? $tasksStore.filter((task) =>
				task.content.toLowerCase().includes(filterText.toLowerCase()),
			)
		: $tasksStore;

	$: filteredByTag = selectedTagsSet.size
		? filteredByText.filter((task) => {
				for (const tag of task.tags) {
					if (selectedTagsSet.has(tag)) {
						return true;
					}
				}

				return false;
			})
		: filteredByText;

	$: filteredByFile = fileFilter
		? filteredByTag.filter((task) =>
				task.path.toLowerCase().includes(fileFilter.toLowerCase()),
			)
		: filteredByTag;

	$: tasksByColumn = groupByColumnTag(filteredByFile);

	// Group all unfiltered tasks by column for sync block
	// (filtering must not modify the persistent manual order)
	$: allTasksByColumn = groupByColumnTag($tasksStore);

	// Sync manual order with actual task positions; exclude default columns
	$: if ($settingsStore.columnOrderMode === ColumnOrderMode.Manual) {
		const configuredColumnIds = columns; // only user-configured columns, not defaults

		// Compute current valid keys for configured columns only
		const currentKeysByColumn: Record<string, string[]> = {};
		for (const col of configuredColumnIds) {
			currentKeysByColumn[col] = (allTasksByColumn[col] ?? []).map(stableTaskKey);
		}

		const currentStore = get(manualOrderStore);
		let changed = false;
		const newStore: ManualOrderStore = {};

		// Copy over only configured column entries (drops uncategorised/done entries)
		for (const col of configuredColumnIds) {
			const validKeySet = new Set(currentKeysByColumn[col]);
			const currentOrder = currentStore[col] ?? [];

			// Remove stale keys (task no longer in this column)
			const pruned = currentOrder.filter(k => validKeySet.has(k));

			// Append missing keys (new or moved-in tasks)
			const orderedSet = new Set(pruned);
			const toAdd = (currentKeysByColumn[col] ?? []).filter(k => !orderedSet.has(k));

			const newOrder = [...pruned, ...toAdd];

			if (newOrder.length !== currentOrder.length ||
				newOrder.some((k, i) => k !== currentOrder[i])) {
				changed = true;
			}

			newStore[col] = newOrder;
		}

		// Detect if default column entries existed (need cleanup)
		if (currentStore['uncategorised'] || currentStore['done']) {
			changed = true;
		}

		if (changed) {
			manualOrderStore.set(newStore);
			requestSave();
		}
	}

	$: totalTaskCount = $tasksStore.filter(t => t.column !== "archived").length;
	$: filteredTaskCount = filteredByFile.filter(t => t.column !== "archived").length;
	$: isFiltered = filterText.trim() !== "" || selectedTags.length > 0 || fileFilter.trim() !== "";

	$: ({
		showFilepath = true,
		consolidateTags = false,
		uncategorizedVisibility = VisibilityOption.Auto,
		doneVisibility = VisibilityOption.AlwaysShow,
		filtersSidebarExpanded = true,
		filtersSidebarWidth = 280,
		columnWidth = 300,
		flowDirection = FlowDirection.LeftToRight,
		uncategorizedColumnName,
		doneColumnName,
	} = $settingsStore);

	// Re-evaluate target file whenever settings change (defaultTaskFile or lastUsedTaskFile)
	$: void $settingsStore, targetTaskFile = taskActions.getTargetFile();
	let targetTaskFile: import("obsidian").TFile | null = null;
	// Target is from an explicit default when the default file is valid and matches the resolved target
	$: targetFileIsDefault = !!targetTaskFile && !!$settingsStore.defaultTaskFile && targetTaskFile.path === $settingsStore.defaultTaskFile;

	$: showUncategorizedColumn =
		uncategorizedVisibility === VisibilityOption.AlwaysShow ||
		$collapsedColumnsStore.has("uncategorised") ||
		(uncategorizedVisibility === VisibilityOption.Auto && tasksByColumn["uncategorised"]?.length > 0);

	$: showDoneColumn =
		doneVisibility === VisibilityOption.AlwaysShow ||
		$collapsedColumnsStore.has("done") ||
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

	function toggleSidebar() {
		$settingsStore.filtersSidebarExpanded = !filtersSidebarExpanded;
		requestSave();
	}

	let isResizing = false;
	let resizeStartX = 0;
	let resizeStartWidth = 0;
	const MIN_SIDEBAR_WIDTH = 200;
	const MAX_SIDEBAR_WIDTH = 600;

	function startResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		resizeStartX = e.clientX;
		resizeStartWidth = filtersSidebarWidth;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;
		const delta = e.clientX - resizeStartX;
		const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, resizeStartWidth + delta));
		$settingsStore.filtersSidebarWidth = newWidth;
	}

	function stopResize() {
		if (isResizing) {
			isResizing = false;
			requestSave();
		}
	}
		
	async function handleOpenSettings() {
		openSettings();
	}
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={stopResize} />

<div class="main">
	<button 
		class="sidebar-toggle-btn" 
		on:click={toggleSidebar} 
		aria-label={filtersSidebarExpanded ? "Hide filters" : "Show filters"}
	>
		<span class="toggle-icon">{filtersSidebarExpanded ? '◂' : '▸'}</span>
		<span class="toggle-label">Filters</span>
	</button>

	<div class="board-container" class:sidebar-expanded={filtersSidebarExpanded} style="--sidebar-width: {filtersSidebarWidth}px;">
		{#if filtersSidebarExpanded}
		<aside class="filters-sidebar">
			<button 
				class="resize-handle" 
				on:mousedown={startResize}
				aria-label="Resize sidebar"
			></button>
			<div class="controls">
		<div class="text-filter">
			<label for="filter">Filter by content:</label>
			<div class="saved-filters">
				<details>
					<summary>Saved filters</summary>
					<ul role="list">
						{#each contentFilters as filter}
							<li>
								<button 
									class="delete-btn"
									on:click={() => openDeleteModal(filter.id, filter.content?.text ?? "", 'content')}
									aria-label="Delete filter: {filter.content?.text}"
								>
									×
								</button>
								<button 
									class:active={filter.id === activeContentFilterId}
									on:click={() => loadContentFilter(filter.id, filter.content?.text ?? "")}
									aria-label="Load saved filter: {filter.content?.text}"
									aria-pressed={filter.id === activeContentFilterId}
								>
									{filter.content?.text}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</div>
			<div class="filter-input-container">
				<input
					id="filter"
					name="filter"
					type="search"
					bind:value={filterText}
					placeholder="Type to search..."
					list="content-filters"
					aria-describedby={contentFilters.length > 0 ? "content-filters" : undefined}
				/>
				{#if contentFilters.length > 0}
					<datalist id="content-filters">
						{#each contentFilters as filter}
							<option value={filter.content?.text}>{filter.content?.text}</option>
						{/each}
					</datalist>
				{/if}
			</div>
			<div class="filter-actions">
				<button 
					class="filter-action-btn save-btn" 
					disabled={filterText.trim() === "" || contentFilterExists}
					on:click={addContentFilter}
					aria-label="Save filter"
				>
					Save
				</button>
				<button 
					class="filter-action-btn clear-btn" 
					disabled={filterText.trim() === ""}
					on:click={clearContentFilter}
					aria-label="Clear filter"
				>
					Clear
				</button>
			</div>
		</div>
		<div class="tag-filter">
			<SelectTag 
				tags={[...tags]} 
				savedFilters={tagFilters} 
				bind:value={selectedTags}
				onLoadFilter={(filterId) => { 
					if (activeTagFilterId === filterId) {
						clearTagFilter();
					} else {
						activeTagFilterId = filterId;
					}
				}}
				addButtonDisabled={selectedTags.length === 0 || tagFilterExists}
				onAddClick={addTagFilter}
				clearButtonDisabled={selectedTags.length === 0}
				onClearClick={clearTagFilter}
				activeFilterId={activeTagFilterId}
				onDeleteClick={(filterId, filterText) => openDeleteModal(filterId, filterText, 'tag')}
			/>
		</div>
		<div class="file-filter">
			<label for="file-filter">Filter by file:</label>
			<div class="saved-filters">
				<details>
					<summary>Saved filters</summary>
					<ul role="list">
						{#each fileFilters as filter}
							<li>
								<button 
									class="delete-btn"
									on:click={() => openDeleteModal(filter.id, filter.file?.filepaths[0] ?? "", 'file')}
									aria-label="Delete filter: {filter.file?.filepaths[0]}"
								>
									×
								</button>
								<button 
									class:active={filter.id === activeFileFilterId}
									on:click={() => loadFileFilter(filter.id, filter.file?.filepaths[0] ?? "")}
									aria-label="Load saved filter: {filter.file?.filepaths[0]}"
									aria-pressed={filter.id === activeFileFilterId}
								>
									{filter.file?.filepaths[0]}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			</div>
			<div class="filter-input-container">
				<input
					id="file-filter"
					name="file-filter"
					type="search"
					bind:value={fileFilter}
					placeholder="Type to search files..."
					list="file-paths"
					aria-label="Filter by file path"
				/>
				{#if availableFiles.length > 0}
					<datalist id="file-paths">
						{#each availableFiles as filePath}
							<option value={filePath}>{filePath}</option>
						{/each}
					</datalist>
				{/if}
			</div>
			<div class="filter-actions">
				<button 
					class="filter-action-btn save-btn" 
					disabled={fileFilter.trim() === "" || fileFilterExists}
					on:click={addFileFilter}
					aria-label="Save filter"
				>
					Save
				</button>
				<button 
					class="filter-action-btn clear-btn" 
					disabled={fileFilter.trim() === ""}
					on:click={clearFileFilter}
					aria-label="Clear file filter"
				>
					Clear
				</button>
			</div>
		</div>
			</div>
		</aside>
		{/if}

		<div class="board-content">
			<div class="board-header">
				<span class="board-task-count" aria-live="polite">
					{#if isFiltered}
						{filteredTaskCount} of {totalTaskCount} tasks
					{:else}
						Total: {totalTaskCount} tasks
					{/if}
				</span>
				<IconButton icon="lucide-settings" on:click={handleOpenSettings} />
			</div>
			
			<div class="columns" class:vertical-flow={isVerticalFlow} style="--column-width: {columnWidth}px;">
				<div>
					{#each orderedColumns as column (column)}
						<Column
							{app}
							{column}
							hideOnEmpty={false}
							tasks={tasksByColumn[column] ?? []}
							allTasks={$tasksStore}
							{taskActions}
							{columnTagTableStore}
							{columnColourTableStore}
							{columnMatchTagTableStore}
							{showFilepath}
							{consolidateTags}
							{isVerticalFlow}
							{targetTaskFile}
							{targetFileIsDefault}
							isCollapsed={$collapsedColumnsStore.has(column)}
							onToggleCollapse={() => toggleColumnCollapse(column)}
							{uncategorizedColumnName}
							{doneColumnName}
							columnOrderMode={$settingsStore.columnOrderMode}
							manualOrder={$manualOrderStore[column as string] ?? []}
							allManualOrders={$manualOrderStore}
							onReorder={(newOrder) => handleReorder(column, newOrder)}
							onCrossColumnReorder={handleCrossColumnReorder}
						/>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

{#if deleteModalOpen && filterToDelete}
	<DeleteFilterModal
		filterText={filterToDelete.text}
		onConfirm={confirmDelete}
		onCancel={closeDeleteModal}
	/>
{/if}

<style lang="scss">
	.main {
		height: 100%;
		display: flex;
		flex-direction: column;
		font-size: var(--font-text-size);

		.sidebar-toggle-btn {
			position: fixed;
			top: 50px;
			left: 8px;
			padding: var(--size-2-1) var(--size-2-2);
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: var(--radius-s);
			cursor: pointer;
			color: var(--text-muted);
			font-size: var(--font-ui-small);
			display: flex;
			align-items: center;
			gap: var(--size-2-1);
			z-index: 100;
			transition: color 0.15s ease;

			&:hover {
				background: var(--background-modifier-hover);
				color: var(--text-normal);
			}

			.toggle-icon {
				font-size: 16px;
			}

			.toggle-label {
				font-weight: 500;
			}
		}

		.board-container {
			display: grid;
			grid-template-columns: 1fr;
			height: 100%;
			
			&.sidebar-expanded {
				grid-template-columns: var(--sidebar-width, 280px) 1fr;
			}
		}

		.filters-sidebar {
			background: var(--background-primary);
			border-right: 1px solid var(--background-modifier-border);
			overflow-y: auto;
			display: flex;
			flex-direction: column;
			position: relative;

			.resize-handle {
				position: absolute;
				top: 0;
				right: 0;
				width: 4px;
				height: 100%;
				cursor: col-resize;
				background: transparent;
				border: none;
				padding: 0;
				z-index: 10;

				&:hover {
					background: var(--interactive-accent);
					opacity: 0.5;
				}
			}


		}

		.board-content {
			display: flex;
			flex-direction: column;
			height: 100%;
			overflow: hidden;
			padding-left: var(--size-4-4);
		}

		.board-header {
			display: flex;
			justify-content: flex-end;
			align-items: center;
			padding: var(--size-4-2) var(--size-4-4) var(--size-4-2) 0;
			gap: var(--size-4-3);

			.board-task-count {
				font-size: var(--font-ui-medium);
				color: var(--text-muted);
			}
		}

		.controls {
			display: flex;
			flex-direction: column;
			gap: var(--size-4-5);
			padding: var(--size-4-4);
			padding-top: 50px;

			.saved-filters {
				margin-top: 0;
				margin-bottom: var(--size-4-2);
				font-size: var(--font-ui-small);
				align-self: flex-start;

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
						padding: 0;
						list-style: none;

						li {
							margin: 0;
							display: flex;
							align-items: center;
							gap: var(--size-4-2);

							button {
								text-align: left;
								padding: var(--size-2-1) var(--size-2-2);
								background: transparent;
								border: none;
								cursor: pointer;
								color: var(--text-normal);
								border-radius: var(--radius-s);
								white-space: nowrap;
								transition: background 0.15s ease, color 0.15s ease;

								&:hover {
									background: var(--background-modifier-hover);
								}

								&.active {
									font-weight: 700;
									color: var(--interactive-accent);
								}

								&.delete-btn {
									padding: 0;
									width: 20px;
									height: 20px;
									display: flex;
									align-items: center;
									justify-content: center;
									font-size: 18px;
									line-height: 1;
									color: var(--text-muted);

									&:hover {
										color: var(--color-red);
										background: var(--background-modifier-error-hover);
									}
								}
							}
						}
					}
				}
			}

			.text-filter,
			.file-filter {
				display: flex;
				flex-direction: column;

				label {
					display: inline-block;
					margin-bottom: var(--size-2-3);
					font-weight: 600;
				}

				.filter-input-container {
					input[type="search"] {
						display: block;
						width: 100%;
						background: var(--background-primary);
						padding: var(--size-4-2);
						box-sizing: border-box;
						transition: box-shadow 150ms ease;

						&:focus-visible {
							box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
						}

						&::-webkit-calendar-picker-indicator,
						&::-webkit-list-button {
							display: none !important;
							opacity: 0 !important;
							pointer-events: none !important;
						}
					}
				}

				.filter-actions {
					display: flex;
					gap: var(--size-4-2);
					margin-top: var(--size-4-2);
				}

				.filter-action-btn {
					padding: var(--size-2-2) var(--size-4-3);
					border-radius: var(--radius-s);
					cursor: pointer;
					font-size: var(--font-ui-small);
					transition: background 150ms ease, opacity 150ms ease;

					&.save-btn {
						background: var(--interactive-accent);
						color: var(--text-on-accent);
						border: none;

						&:hover:not(:disabled) {
							background: var(--interactive-accent-hover);
						}
					}

					&.clear-btn {
						background: transparent;
						color: var(--text-muted);
						border: 1px solid var(--background-modifier-border);

						&:hover:not(:disabled) {
							background: var(--background-modifier-hover);
						}
					}

					&:disabled {
						opacity: 0.5;
						cursor: not-allowed;
					}
				}
			}

			.tag-filter {
				display: flex;
				flex-direction: column;
			}
		}

		.columns {
			flex: 1 1 0;
			min-height: 0;
			max-width: 100vw;
			overflow-x: scroll;
			overflow-y: auto;
			padding-bottom: var(--size-4-3);

			> div {
				display: flex;
				gap: var(--size-4-3);
			}

			&.vertical-flow {
				overflow-x: hidden;
				overflow-y: scroll;

				> div {
					flex-direction: column;
				}
			}
		}
	}
</style>
