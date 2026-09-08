<script lang="ts">
	import type { App, TFile } from "obsidian";
	import type { Readable } from "svelte/store";
	import { getBoardCell, type BoardMatrix, type PrimaryBucketId } from "./board_matrix";
	import type {
		ColumnTagTable,
		ColumnColourTable,
		ColumnMatchTagTable,
		ColumnSubtitleTable,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import ColumnHeader from "../components/ColumnHeader.svelte";
	import BoardCell from "./BoardCell.svelte";
	import { PropertyDisplayMode } from "../settings/settings_store";
	import { PropertySchemaOption } from "../../parsing/properties/property_schema";
	import type { ManualOrderStore } from "../tasks/manual_order";
	import GroupLabel from "./GroupLabel.svelte";

	export let app: App;
	export let matrix: BoardMatrix;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let showFilepath: boolean;
	export let propertyDisplay: PropertyDisplayMode = PropertyDisplayMode.None;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let consolidateTags: boolean;
	export let excludedTags: string[] = [];
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let onToggleCollapse: (columnId: PrimaryBucketId) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;
	export let columnWidth: string = "300px";
	export let isManualOrder: boolean = false;
	export let manualOrder: ManualOrderStore = {};
	export let reorderEnabled: boolean = false;
	export let treatNestedTasksAsSubtasks: boolean = false;
	export let taskCountLabel: string = "";

	$: tasksByPrimary = Object.fromEntries(
		matrix.primaryAxis.map((bucket) => [
			bucket.id,
			Object.values(matrix.cells[bucket.id] || {}).flatMap((cell) => cell.tasks),
		]),
	);

	$: showSwimlaneLabels =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0]?.meta?.isDefault);

	$: gridTemplateColumns = matrix.primaryAxis
		.map((b) => (b.collapsed ? "48px" : columnWidth))
		.join(" ");
	$: summaryRowCount = taskCountLabel ? 1 : 0;

	$: gridTemplateRows = (() => {
		// The summary and column headers each own a row. Grouped boards add a
		// full-width group header before each swimlane instead of spending a
		// permanent sidebar column on its label.
		const rows = [
			...(taskCountLabel ? ["max-content"] : []),
			"max-content",
		];
		for (let i = 0; i < matrix.secondaryAxis.length; i++) {
			if (showSwimlaneLabels) rows.push("max-content");
			rows.push(i === matrix.secondaryAxis.length - 1 ? "minmax(188px, 1fr)" : "minmax(188px, max-content)");
		}
		return rows.join(" ");
	})();

	function groupHeaderGridRow(index: number): number {
		return summaryRowCount + 2 + index * 2;
	}

	function cellGridRow(index: number): number {
		return showSwimlaneLabels
			? groupHeaderGridRow(index) + 1
			: summaryRowCount + index + 2;
	}

	let headerHeight = 64;
</script>

<div class="matrix-horizontal" style:grid-template-columns={gridTemplateColumns} style:grid-template-rows={gridTemplateRows} style:--column-header-height="{headerHeight}px">
	{#if taskCountLabel}
		<div class="matrix-summary" style:grid-column="1 / -1" style:grid-row="1">
			<span class="matrix-task-count" aria-live="polite">{taskCountLabel}</span>
		</div>
	{/if}

	<!-- 1. Render Column Headers beneath the optional board summary. -->
	<div
		class="header-height-probe"
		style:grid-column="1 / -1"
		style:grid-row={summaryRowCount + 1}
		bind:clientHeight={headerHeight}
	></div>
	{#each matrix.primaryAxis as pBucket, index (pBucket.id)}
		<div
			class="header-wrapper"
			class:collapsed={pBucket.collapsed}
			style:grid-column={index + 1}
			style:grid-row={pBucket.collapsed
				? `${summaryRowCount + 1} / -1`
				: summaryRowCount + 1}
			style:--column-color={pBucket.meta?.color}
		>
			<ColumnHeader
				column={pBucket.id}
				tasks={tasksByPrimary[pBucket.id] ?? []}
				{taskActions}
				{columnTagTableStore}
				{columnColourTableStore}
				{columnMatchTagTableStore}
				{columnSubtitleTableStore}
				isVerticalFlow={false}
				isCollapsed={pBucket.collapsed}
				onToggleCollapse={() => onToggleCollapse(pBucket.id)}
				{uncategorizedColumnName}
				{doneColumnName}
			/>
		</div>
	{/each}

	<!-- 2. Render each group header above its row of board cells. -->
	{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
		{#if showSwimlaneLabels}
			<div
				class="swimlane-header"
				style:grid-column="1 / -1"
				style:grid-row={groupHeaderGridRow(sIndex)}
			>
				<h2 class="swimlane-heading">
					<GroupLabel bucket={sBucket} />
				</h2>
			</div>
		{/if}
		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="cell-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column={pIndex + 1}
				style:grid-row={cellGridRow(sIndex)}
				style:--column-color={pBucket.meta?.color}
			>
					<BoardCell
						{app}
						cell={getBoardCell(matrix, pBucket.id, sBucket.id)}
						primaryTasks={tasksByPrimary[pBucket.id] ?? []}
						secondaryAxisBucket={sBucket}
						primaryAxisLabel={pBucket.label}
						{taskActions}
						{columnTagTableStore}
					{showFilepath}
					{propertyDisplay}
					{propertySchemaOption}
					{consolidateTags}
					{excludedTags}
					{treatNestedTasksAsSubtasks}
					isVerticalFlow={false}
					{targetTaskFile}
					{targetFileIsDefault}
					{doneColumnName}
					isCollapsed={pBucket.collapsed}
					accentColor={pBucket.meta?.color}
					{isManualOrder}
					manualOrderEntries={manualOrder[sBucket.id]?.[pBucket.id]}
					{reorderEnabled}
				/>
			</div>
		{/each}
	{/each}
</div>

<style lang="scss">
	.matrix-horizontal {
		display: grid;
		position: relative;
		column-gap: 0;
		row-gap: 0;
		align-items: stretch;
		min-width: max-content;
		padding-bottom: var(--size-4-4);
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		box-shadow: var(--shadow-s);
		overflow: visible;
	}

	.matrix-summary,
	.header-wrapper {
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		border-right: var(--border-width) solid var(--background-modifier-border);
	}

	.matrix-summary {
		z-index: 2;
		display: flex;
		align-items: center;
		min-height: 32px;
		padding: var(--size-2-1) var(--size-4-3);
	}

	.matrix-task-count {
		display: block;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-weight: 500;
		line-height: 1.15;
	}

	.header-height-probe {
		visibility: hidden;
		min-height: 64px;
		pointer-events: none;
	}

	.header-wrapper {
		position: sticky;
		top: 0;
		z-index: 5;
		min-height: 64px;
		padding: var(--size-4-2) var(--size-4-3);
		--column-header-x-padding-override: var(--size-4-3);
		--column-header-y-padding-override: var(--size-4-2);
		display: flex;
		align-items: stretch;

		&.collapsed {
			position: sticky;
			top: 0;
			display: flex;
			flex-direction: column;
			align-self: start;
			height: 100%;
			min-height: 100%;
			padding: 0 var(--size-2-3) var(--size-4-3);
			--column-header-x-padding-override: var(--size-2-3);
			--column-header-y-padding-override: 0px;
			cursor: pointer;
			z-index: 6;
		}
	}

	.swimlane-header {
		position: sticky;
		top: var(--column-header-height);
		z-index: 4;
		display: flex;
		align-items: center;
		min-width: 0;
		padding: var(--size-2-2) var(--size-4-3);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		border-top: var(--border-width) solid var(--background-modifier-border);
	}

	.swimlane-heading {
		position: sticky;
		left: var(--size-4-3);
		min-width: 0;
		margin: 0;
		color: var(--text-normal);
		font-size: var(--font-ui-medium);
		font-weight: var(--font-medium);
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell-wrapper {
		z-index: 1;
		min-height: 188px;
		padding: var(--size-4-2) var(--size-4-4);
		display: flex;
		flex-direction: column;
		align-self: stretch;
		background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);

		&.collapsed {
			display: none;
		}
	}

	@media (max-width: 760px) {
		.header-wrapper {
			scroll-snap-align: start;
			scroll-snap-stop: normal;
		}

		.cell-wrapper {
			padding-right: var(--size-4-2);
			padding-left: var(--size-4-2);
		}
	}
</style>
