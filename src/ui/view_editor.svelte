<script lang="ts">
	import CompactTagSelect from "./components/select/compact_tag_select.svelte";
	import Icon from "./components/icon.svelte";
	import { FlowDirection, isFlowDirection } from "./settings/settings_store";
	import {
		savedViewPropertyLabels,
		type SavedViewListEntry,
		type SavedViewProperties,
	} from "./views/saved_views";
	import {
		SORT_FILE_VALUE,
		SORT_MANUAL_VALUE,
		SORT_TASK_NAME_VALUE,
		propertyOptionValue,
	} from "./views/view_editor_options";
	import type { SortDirection } from "../parsing/properties/comparators";
	import type { GroupSource } from "./tasks/task_grouping";

	type SortKey = { key: string; label: string };
	type TagGroupInputMode = "prefix" | "include";

	export let sortSelectValue: string;
	export let availableSortKeys: SortKey[] = [];
	export let isDirectionalSort = false;
	export let sortDirection: SortDirection = "asc";
	export let onSortChange: (value: string) => void;
	export let onToggleSortDirection: () => void;

	export let groupSelectValue: string;
	export let availableGroupKeys: SortKey[] = [];
	export let isDirectionalGroup = false;
	export let groupDirection: SortDirection = "asc";
	export let onGroupChange: (value: string) => void;
	export let onToggleGroupDirection: () => void;
	export let showCollapsePastDatesToggle = false;
	export let collapsePastDates = false;
	export let onSetCollapsePastDates: (collapse: boolean) => void;

	export let isTagPrefixGrouping = false;
	export let tagGroupInputMode: TagGroupInputMode = "prefix";
	export let availableTags: string[] = [];
	export let tagGroupPrefix = "";
	export let tagGroupIncludeTags: string[] = [];
	export let onSetTagGroupInputMode: (mode: TagGroupInputMode) => void;
	export let onUpdateTagGroupPrefix: (prefix: string) => void;
	export let onUpdateTagGroupIncludeTags: (includeTags: string[]) => void;

	export let flowDirection: FlowDirection = FlowDirection.LeftToRight;
	export let columnWidth = 300;
	export let onSetFlowDirection: (flowDirection: FlowDirection) => void;
	export let onSetColumnWidth: (columnWidth: number) => void;
	export let savedViews: SavedViewListEntry[] = [];
	export let savedViewListExpanded = false;

	export let canSaveView = false;
	export let currentViewProperties: SavedViewProperties = {};

	$: currentViewPropertyLabels = savedViewPropertyLabels(currentViewProperties);

	export let onSaveCurrentView: (name: string | undefined) => void;
	export let onApplySavedView: (view: SavedViewListEntry) => void;
	export let onDeleteSavedView: (view: SavedViewListEntry) => void;
	export let onToggleSavedViewList: (expanded: boolean) => void;

	const flowDirectionOptions: Array<{ value: FlowDirection; label: string }> = [
		{ value: FlowDirection.LeftToRight, label: "LTR" },
		{ value: FlowDirection.RightToLeft, label: "RTL" },
		{ value: FlowDirection.TopToBottom, label: "TTB" },
		{ value: FlowDirection.BottomToTop, label: "BTT" },
	];

	function handleFlowDirectionChange(value: string) {
		if (isFlowDirection(value)) {
			onSetFlowDirection(value);
		}
	}

	function handleColumnWidthChange(value: string) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			onSetColumnWidth(parsed);
		}
	}

	let saveViewName = "";

	function saveView() {
		if (!canSaveView) {
			return;
		}
		const name = saveViewName.trim();
		onSaveCurrentView(name === "" ? undefined : name);
		saveViewName = "";
	}

	function onSaveViewNameKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && canSaveView) {
			saveView();
		}
	}
</script>

<section class="view-editor" aria-label="View settings">
	<div class="view-editor-row">
		<div class="view-editor-label">
			<span>Sort</span>
		</div>
		<div class="view-editor-controls">
			<select
				class="dropdown view-editor-select"
				value={sortSelectValue}
				aria-label="Sort tasks"
				on:change={(e) => onSortChange(e.currentTarget.value)}
			>
				<option value={SORT_FILE_VALUE}>File order</option>
				<option value={SORT_TASK_NAME_VALUE}>Task name</option>
				<option value={SORT_MANUAL_VALUE}>Manual</option>
				{#if availableSortKeys.length > 0}
					<optgroup label="Properties">
						{#each availableSortKeys as sortKey (sortKey.key)}
							<option value={propertyOptionValue(sortKey.key)}>{sortKey.label}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
			{#if isDirectionalSort}
				<button
					type="button"
					class="view-editor-icon-button"
					on:click={onToggleSortDirection}
					aria-label="Toggle sort direction"
					title={sortDirection === "asc" ? "Ascending" : "Descending"}
				>
					<Icon
						name={sortDirection === "asc"
							? "arrow-up-narrow-wide"
							: "arrow-down-wide-narrow"}
						size={16}
					/>
				</button>
			{/if}
		</div>
	</div>

	<div class="view-editor-row">
		<div class="view-editor-label">
			<span>Group</span>
		</div>
		<div class="view-editor-controls view-editor-controls-stack">
			<div class="view-editor-inline-controls">
				<select
					class="dropdown view-editor-select"
					value={groupSelectValue}
					aria-label="Group tasks"
					on:change={(e) => onGroupChange(e.currentTarget.value)}
				>
					<option value="none">None</option>
					<option value="file">File</option>
					<option value="tag-prefix">Tag</option>
					{#if availableGroupKeys.length > 0}
						<optgroup label="Properties">
							{#each availableGroupKeys as groupKey (groupKey.key)}
								<option value={propertyOptionValue(groupKey.key)}>{groupKey.label}</option>
							{/each}
						</optgroup>
					{/if}
				</select>
				{#if isDirectionalGroup}
					<button
						type="button"
						class="view-editor-icon-button"
						on:click={onToggleGroupDirection}
						aria-label="Toggle group direction"
						title={groupDirection === "asc" ? "Group ascending" : "Group descending"}
					>
						<Icon
							name={groupDirection === "asc"
								? "arrow-up-narrow-wide"
								: "arrow-down-wide-narrow"}
							size={16}
						/>
					</button>
				{/if}
			</div>
			{#if showCollapsePastDatesToggle}
				<label class="view-editor-toggle-row">
					<input
						type="checkbox"
						checked={collapsePastDates}
						on:change={(e) => onSetCollapsePastDates(e.currentTarget.checked)}
					/>
					<span>Combine past dates</span>
				</label>
			{/if}
		</div>
	</div>

	{#if isTagPrefixGrouping}
		<div class="view-editor-row view-editor-subrow">
			<div class="view-editor-label">
				<span>Tags</span>
			</div>
			<div class="view-editor-controls view-editor-controls-stack">
				<div class="tag-group-input-row">
					<div class="tag-group-mode-toggle">
						<button
							type="button"
							class:active={tagGroupInputMode === "prefix"}
							aria-pressed={tagGroupInputMode === "prefix"}
							on:click={() => onSetTagGroupInputMode("prefix")}
						>
							Prefix
						</button>
						<button
							type="button"
							class:active={tagGroupInputMode === "include"}
							aria-pressed={tagGroupInputMode === "include"}
							on:click={() => onSetTagGroupInputMode("include")}
						>
							Include
						</button>
					</div>
					<div class="tag-group-input">
						{#if tagGroupInputMode === "prefix"}
							<input
								type="text"
								class="grouping-prefix-input"
								placeholder="Prefix"
								value={tagGroupPrefix}
								aria-label="Tag group prefix"
								on:input={(e) => onUpdateTagGroupPrefix(e.currentTarget.value)}
							/>
						{:else}
							<CompactTagSelect
								items={availableTags}
								value={tagGroupIncludeTags}
								maxSelected={0}
								placeholder="Choose tags"
								ariaLabel="Included tag swimlanes"
								on:change={(e) => onUpdateTagGroupIncludeTags(e.detail)}
							/>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="view-editor-row">
		<div class="view-editor-label">
			<span>Flow</span>
		</div>
		<div class="view-editor-controls">
			<select
				class="dropdown view-editor-select"
				value={flowDirection}
				aria-label="Flow direction"
				on:change={(e) => handleFlowDirectionChange(e.currentTarget.value)}
			>
				{#each flowDirectionOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="view-editor-row">
		<div class="view-editor-label">
			<span>Card width</span>
		</div>
		<div class="view-editor-controls">
			<div class="card-width-control">
				<input
					type="range"
					min="200"
					max="600"
					step="10"
					value={columnWidth}
					aria-label="Card width"
					on:input={(e) => handleColumnWidthChange(e.currentTarget.value)}
				/>
				<output>{columnWidth}px</output>
			</div>
		</div>
	</div>

	<div class="view-editor-row">
		<div class="view-editor-label">
			<span>Save as</span>
		</div>
		<div class="view-editor-controls view-editor-controls-stack">
			<div class="save-view-row">
				<input
					type="text"
					class="view-editor-text-input"
					bind:value={saveViewName}
					on:keydown={onSaveViewNameKeydown}
					placeholder="Name (optional)"
					aria-label="Saved view name"
					spellcheck="false"
				/>
				<button
					type="button"
					class="save-view-button"
					disabled={!canSaveView}
					on:click={saveView}
				>
					Save
				</button>
			</div>
			<p class="view-editor-hint">
				{#if canSaveView}
					Saves: {currentViewPropertyLabels.join(" · ")}
				{:else}
					Nothing set to save — change a filter, sort, group, flow, or width first.
				{/if}
			</p>
		</div>
	</div>

	<div class="view-editor-row saved-views-section">
		<button
			type="button"
			class="saved-views-toggle"
			aria-expanded={savedViewListExpanded}
			on:click={() => onToggleSavedViewList(!savedViewListExpanded)}
		>
			<Icon name={savedViewListExpanded ? "chevron-down" : "chevron-right"} size={14} />
			<span>Saved views</span>
		</button>
		{#if savedViewListExpanded}
			<div class="view-editor-controls view-editor-controls-stack">
				{#if savedViews.length > 0}
					<ul class="saved-view-list" role="list">
						{#each savedViews as view (`${view.isGlobal ? "global" : "local"}:${view.id}`)}
							<li>
								{#if view.isGlobal}
									<span class="saved-view-source" title="Global saved view">Global</span>
								{:else}
									<button
										type="button"
										class="saved-view-delete"
										on:click={() => onDeleteSavedView(view)}
										aria-label="Delete saved view: {view.name}"
									>
										×
									</button>
								{/if}
								<button
									type="button"
									class="saved-view-name"
									on:click={() => onApplySavedView(view)}
								>
									<span class="saved-view-title">{view.name}</span>
									<span class="saved-view-badges">
										{#each savedViewPropertyLabels(view) as label}
											<span>{label}</span>
										{/each}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="view-editor-hint">No saved views yet.</p>
				{/if}
			</div>
		{/if}
	</div>
</section>

<style lang="scss">
	.view-editor {
		--view-editor-control-height: 34px;
		position: relative;
		z-index: 40;
		width: 100%;
		max-width: none;
		margin: 0;
		padding: var(--size-4-3) var(--size-4-4);
		background: var(--background-primary);
		border: var(--input-border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-s);
		display: grid;
		gap: var(--size-4-2);
	}

	.view-editor-row {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr);
		gap: var(--size-4-2);
		align-items: start;
		min-height: var(--view-editor-control-height);
	}

	.view-editor-subrow {
		padding-top: var(--size-2-3);
		border-top: 1px solid var(--background-modifier-border);
	}

	.view-editor-label {
		display: flex;
		align-items: center;
		min-height: var(--view-editor-control-height);
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		font-weight: 400;
		line-height: 1.2;
	}

	.view-editor-controls,
	.view-editor-inline-controls {
		display: flex;
		align-items: center;
		gap: var(--size-2-2);
		min-height: var(--view-editor-control-height);
		min-width: 0;
	}

	.view-editor-controls-stack {
		align-items: flex-start;
		flex-direction: column;
	}

	.view-editor-select {
		flex: 1 1 auto;
		min-width: 280px;
		max-width: 360px;
		height: var(--view-editor-control-height);
		min-height: 0;
		box-sizing: border-box;
		background-color: transparent;
		border: none;
		border-bottom: 1px solid var(--background-modifier-border);
		border-radius: 0;
		box-shadow: none;
		padding: 0 var(--size-4-4) 0 0;
		font-size: var(--font-ui-small);
		line-height: var(--view-editor-control-height);

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

	.view-editor-text-input {
		flex: 1 1 auto;
		min-width: 0;
		height: var(--view-editor-control-height);
		min-height: 0;
		box-sizing: border-box;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--background-modifier-border);
		border-radius: 0;
		box-shadow: none;
		padding: 0;
		font-size: var(--font-ui-small);
		line-height: var(--view-editor-control-height);

		&:focus,
		&:focus-visible {
			border-bottom-color: var(--interactive-accent);
			box-shadow: none;
			outline: none;
		}
	}

	.view-editor-icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 999px;
		background: transparent;
		box-shadow: none;
		color: var(--text-muted);
		cursor: pointer;
		width: var(--view-editor-control-height);
		height: var(--view-editor-control-height);
		box-sizing: border-box;
		padding: 0;

		&:hover {
			color: var(--text-normal);
			background: var(--background-modifier-hover);
		}

		&:disabled {
			cursor: default;
			opacity: 0.5;
		}
	}

	.view-editor-toggle-row {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		padding-top: var(--size-2-1);
		font-size: var(--font-ui-small);
		line-height: 1;
		color: var(--text-muted);
		cursor: pointer;

		input[type="checkbox"] {
			margin: 0;
			--checkbox-size: 12px;
		}

		&:hover {
			color: var(--text-normal);
		}
	}

	.tag-group-input-row {
		--tag-group-control-height: 30px;
		display: grid;
		grid-template-columns: auto minmax(180px, 1fr);
		align-items: center;
		gap: var(--size-2-3);
		width: min(100%, 440px);
		min-width: 0;
	}

	.tag-group-mode-toggle {
		display: inline-flex;
		align-items: stretch;
		border: var(--input-border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--input-radius);
		overflow: hidden;
		background: var(--background-modifier-form-field, var(--background-primary));
		height: var(--tag-group-control-height);

		button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			min-height: 0;
			margin: 0;
			border: 0;
			border-radius: 0;
			box-shadow: none;
			background: transparent;
			color: var(--text-muted);
			font-size: var(--font-ui-smaller);
			line-height: 1;
			padding: var(--size-2-1) var(--size-2-3);
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

	.tag-group-input {
		min-width: 0;
		--compact-tag-select-height: var(--tag-group-control-height);
		--compact-tag-select-font-size: var(--font-ui-small);
	}

	.grouping-prefix-input {
		width: 100%;
		height: var(--tag-group-control-height);
		font-size: var(--font-ui-small);
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

	.card-width-control {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) 48px;
		align-items: center;
		gap: var(--size-2-2);
		width: min(100%, 360px);
		min-height: var(--view-editor-control-height);
		color: var(--text-muted);
		font-size: var(--font-ui-small);

		input[type="range"] {
			width: 100%;
			margin: 0;
		}

		output {
			color: var(--text-normal);
			font-variant-numeric: tabular-nums;
			text-align: right;
		}
	}

	.save-view-row {
		display: flex;
		align-items: center;
		gap: var(--size-2-3);
		width: min(100%, 440px);
		min-width: 0;
	}

	.save-view-button {
		flex: 0 0 auto;
		padding: var(--size-2-2) var(--size-4-3);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--background-modifier-border);
		border-radius: 999px;
		box-shadow: none;
		cursor: pointer;
		font-size: var(--font-ui-small);

		&:hover:not(:disabled) {
			color: var(--text-normal);
			background: var(--background-modifier-hover);
		}

		&:disabled {
			opacity: 0.5;
			cursor: default;
			color: var(--text-muted);
		}
	}

	.view-editor-hint {
		margin: 0;
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
		line-height: 1.2;
	}

	.saved-views-section {
		padding-top: var(--size-2-3);
		border-top: 1px solid var(--background-modifier-border);
	}

	.saved-views-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		min-height: var(--view-editor-control-height);
		width: fit-content;
		margin: 0;
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		font-weight: 500;
		cursor: pointer;

		&:hover {
			color: var(--text-normal);
			background: transparent;
			box-shadow: none;
		}
	}

	.saved-view-list {
		display: flex;
		flex-direction: column;
		gap: var(--size-2-1);
		width: min(100%, 520px);
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			align-items: center;
			gap: var(--size-2-1);
			min-height: 30px;
		}
	}

	.saved-view-source,
	.saved-view-delete,
	.saved-view-name {
		display: inline-flex;
		align-items: center;
		margin: 0;
		border: none;
		border-radius: var(--radius-s);
		background: transparent;
		box-shadow: none;
		cursor: pointer;
	}

	.saved-view-delete {
		justify-content: center;
		flex: 0 0 auto;
		padding: var(--size-2-1);
		color: var(--text-muted);
		font-size: 18px;
		line-height: 1;

		&:hover {
			color: var(--color-red);
			background: transparent;
		}
	}

	.saved-view-source {
		justify-content: center;
		flex: 0 0 auto;
		padding: var(--size-2-1);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		line-height: 1;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
	}

	.saved-view-name {
		justify-content: flex-start;
		gap: var(--size-2-2);
		flex: 1 1 auto;
		min-width: 0;
		padding: var(--size-2-1) var(--size-2-2);
		color: var(--text-normal);
		font-size: var(--font-ui-small);
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

		&:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}
	}

	.saved-view-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.saved-view-badges {
		display: inline-flex;
		flex: 0 0 auto;
		gap: var(--size-2-1);
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);

		span {
			border: 1px solid var(--background-modifier-border);
			border-radius: var(--radius-s);
			padding: 1px var(--size-2-1);
			line-height: 1.2;
		}
	}

	@media (max-width: 680px) {
		.view-editor {
			max-width: 100%;
			padding: var(--size-4-2);
		}

		.view-editor-row {
			grid-template-columns: 1fr;
			gap: var(--size-2-2);
		}

		.view-editor-controls,
		.view-editor-inline-controls {
			align-items: stretch;
			flex-direction: column;
		}

		.view-editor-select,
		.view-editor-text-input,
		.tag-group-input-row,
		.card-width-control,
		.save-view-row,
		.saved-view-list {
			width: 100%;
			max-width: none;
		}

		.tag-group-input-row,
		.card-width-control {
			grid-template-columns: 1fr;
		}

		.saved-view-list li {
			flex-wrap: wrap;
		}

		.view-editor-icon-button {
			width: 100%;
		}
	}
</style>
