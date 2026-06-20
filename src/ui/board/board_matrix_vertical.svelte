<script lang="ts">
	import type { App, TFile } from "obsidian";
	import type { Readable } from "svelte/store";
	import type { BoardMatrix } from "./board_matrix";
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
	export let onToggleCollapse: (columnId: string) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;
	export let isManualOrder: boolean = false;
	export let manualOrder: ManualOrderStore = {};
	export let reorderEnabled: boolean = false;

	$: tasksByPrimary = Object.fromEntries(
		matrix.primaryAxis.map((bucket) => [
			bucket.id,
			Object.values(matrix.cells[bucket.id] || {}).flatMap((cell) => cell.tasks),
		]),
	);

	$: showSwimlaneHeaders =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0].meta?.isDefault);

	$: ungroupedSecondaryBucket = matrix.secondaryAxis[0];
	$: ungroupedGridTemplateRows = matrix.primaryAxis
		.map(() => "max-content")
		.join(" ");
	$: groupedGridTemplateColumns = [
		"var(--vertical-row-header-width)",
		...matrix.secondaryAxis.map(() => "max-content"),
	].join(" ");
	$: groupedGridTemplateRows = [
		"max-content",
		...matrix.primaryAxis.map(() => "max-content"),
	].join(" ");

	let headerHeight = 64;
</script>

{#if !showSwimlaneHeaders && ungroupedSecondaryBucket}
	<div class="matrix-vertical ungrouped-grid" style:grid-template-rows={ungroupedGridTemplateRows} style:--header-height="0px">
		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="row-header-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column="1"
				style:grid-row={pIndex + 1}
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
					isVerticalFlow={true}
					isCollapsed={pBucket.collapsed}
					onToggleCollapse={() => onToggleCollapse(pBucket.id)}
					{uncategorizedColumnName}
					{doneColumnName}
				/>
			</div>

			<div
				class="cell-wrapper row-cell"
				class:collapsed={pBucket.collapsed}
				style:grid-column="2"
				style:grid-row={pIndex + 1}
				style:--column-color={pBucket.meta?.color}
			>
				<BoardCell
					{app}
					cell={matrix.cells[pBucket.id][ungroupedSecondaryBucket.id]}
					primaryTasks={tasksByPrimary[pBucket.id] ?? []}
					secondaryAxisBucket={ungroupedSecondaryBucket}
					primaryAxisLabel={pBucket.label}
					{taskActions}
					{columnTagTableStore}
					{showFilepath}
					{propertyDisplay}
					{propertySchemaOption}
					{consolidateTags}
					{excludedTags}
					isVerticalFlow={true}
					{targetTaskFile}
					{targetFileIsDefault}
					{doneColumnName}
					isCollapsed={pBucket.collapsed}
					accentColor={pBucket.meta?.color}
					{isManualOrder}
					manualOrderEntries={manualOrder[ungroupedSecondaryBucket.id]?.[pBucket.id]}
					{reorderEnabled}
				/>
			</div>
		{/each}
	</div>
{:else}
	<div
		class="matrix-vertical transposed-grid"
		style:grid-template-columns={groupedGridTemplateColumns}
		style:grid-template-rows={groupedGridTemplateRows}
		style:--header-height="{headerHeight}px"
	>
		<div class="matrix-corner" style:grid-column="1" style:grid-row="1" bind:clientHeight={headerHeight}></div>

		{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
			<div
				class="group-header-cell"
				style:grid-column={sIndex + 2}
				style:grid-row="1"
			>
				<span class="group-label" title={sBucket.label}>{sBucket.label}</span>
			</div>
		{/each}

		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="row-header-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column="1"
				style:grid-row={pIndex + 2}
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
					isVerticalFlow={true}
					isCollapsed={pBucket.collapsed}
					onToggleCollapse={() => onToggleCollapse(pBucket.id)}
					{uncategorizedColumnName}
					{doneColumnName}
				/>
			</div>

			{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
				<div
					class="cell-wrapper grouped-cell"
					class:collapsed={pBucket.collapsed}
					style:grid-column={sIndex + 2}
					style:grid-row={pIndex + 2}
					style:--column-color={pBucket.meta?.color}
				>
					<BoardCell
						{app}
						cell={matrix.cells[pBucket.id][sBucket.id]}
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
						isVerticalFlow={true}
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
{/if}

<style lang="scss">
	.matrix-vertical {
		--vertical-row-header-width: clamp(220px, 24vw, 280px);
		padding-bottom: var(--size-4-4);

		&.ungrouped-grid,
		&.transposed-grid {
			display: grid;
			column-gap: 0;
			row-gap: 0;
			align-items: stretch;
			min-width: max-content;
			border: var(--border-width) solid var(--background-modifier-border);
			border-radius: var(--radius-m);
			background: var(--background-primary);
			box-shadow: var(--shadow-s);
			overflow: visible;
		}

		&.ungrouped-grid {
			grid-template-columns: var(--vertical-row-header-width) max-content;
		}
	}

	.matrix-corner,
	.group-header-cell {
		position: sticky;
		top: 0;
		z-index: 5;
		min-height: 64px;
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		box-shadow:
			inset 0 var(--border-width) 0 var(--background-modifier-border),
			inset var(--border-width) 0 0 var(--background-modifier-border);
	}

	.matrix-corner {
		left: 0;
		z-index: 8;
	}

	.group-header-cell {
		display: flex;
		align-items: center;
		min-width: var(--column-width, 300px);
		padding: var(--size-4-3) var(--size-4-4);
		overflow: clip;

		.group-label {
			position: sticky;
			left: calc(var(--vertical-row-header-width) + var(--size-4-4));
			display: inline-block;
			max-width: max-content;
			color: var(--text-normal);
			font-size: var(--font-ui-medium);
			font-weight: var(--font-medium);
			line-height: 1.2;
			white-space: nowrap;
		}
	}

	.row-header-wrapper,
	.row-cell {
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}

	.row-header-wrapper {
		position: sticky;
		left: 0;
		z-index: 4;
		display: flex;
		align-items: stretch;
		min-height: 96px;
		padding: var(--size-4-2) var(--size-4-3);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-right: var(--border-width) solid var(--background-modifier-border);
		--column-header-x-padding-override: var(--size-4-3);
		--column-header-y-padding-override: var(--size-4-2);

		&.collapsed {
			min-height: 64px;
			cursor: pointer;
		}
	}

	.row-cell {
		z-index: 1;
		display: flex;
		align-self: stretch;
		min-height: 96px;
		min-width: max-content;
		padding: var(--size-4-2) var(--size-4-4);
		background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));

		&.collapsed {
			display: none;
		}
	}

	.cell-wrapper {
		padding: var(--size-4-2) var(--size-4-4);
		border-bottom: var(--border-width) solid var(--background-modifier-border);

		&.grouped-cell {
			z-index: 1;
			display: flex;
			align-self: stretch;
			min-height: 96px;
			min-width: var(--column-width, 300px);
			background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));
			border-right: var(--border-width) solid var(--background-modifier-border);

			&.collapsed {
				display: none;
			}
		}
	}
</style>
