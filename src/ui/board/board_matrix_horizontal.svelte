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
	export let columnWidth: string = "300px";
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

	$: gridTemplateColumns = [
		...(showSwimlaneHeaders ? ["56px"] : []),
		...matrix.primaryAxis.map((b) => (b.collapsed ? "48px" : columnWidth)),
	].join(" ");

	$: primaryGridColumnOffset = showSwimlaneHeaders ? 2 : 1;

	$: gridTemplateRows = (() => {
		const rows = ["max-content"];
		for (let i = 0; i < matrix.secondaryAxis.length; i++) {
			rows.push(i === matrix.secondaryAxis.length - 1 ? "minmax(188px, 1fr)" : "minmax(188px, max-content)");
		}
		return rows.join(" ");
	})();
</script>

<div class="matrix-horizontal" style:grid-template-columns={gridTemplateColumns} style:grid-template-rows={gridTemplateRows}>
	{#if showSwimlaneHeaders}
		<div class="matrix-corner" style:grid-column="1" style:grid-row="1"></div>
	{/if}

	<!-- 1. Render Column Headers across the top row -->
	{#each matrix.primaryAxis as pBucket, index (pBucket.id)}
		<div
			class="header-wrapper"
			class:collapsed={pBucket.collapsed}
			style:grid-column={index + primaryGridColumnOffset}
			style:grid-row={pBucket.collapsed ? "1 / -1" : "1"}
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

	<!-- 2. Render Board Cells across subsequent rows -->
	{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
		{#if showSwimlaneHeaders}
			<div
				class="swimlane-header-cell"
				style:grid-column="1"
				style:grid-row={sIndex + 2}
			>
				<span class="swimlane-label" title={sBucket.label}>{sBucket.label}</span>
			</div>
		{/if}
		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="cell-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column={pIndex + primaryGridColumnOffset}
				style:grid-row={sIndex + 2}
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

	.matrix-corner,
	.header-wrapper {
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		border-right: var(--border-width) solid var(--background-modifier-border);
		min-height: 64px;
	}

	.matrix-corner {
		position: sticky;
		left: 0;
		top: 0;
		z-index: 7;
	}

	.header-wrapper {
		position: sticky;
		top: 0;
		z-index: 5;
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

	.swimlane-header-cell {
		position: sticky;
		left: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 188px;
		padding: var(--size-4-3) var(--size-2-2);
		background: color-mix(in srgb, var(--background-primary) 82%, var(--background-secondary));
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);

		.swimlane-label {
			color: var(--text-normal);
			font-size: var(--font-ui-medium);
			font-weight: var(--font-medium);
			line-height: 1.2;
			writing-mode: vertical-rl;
			text-orientation: mixed;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			max-height: 100%;
		}
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
</style>
