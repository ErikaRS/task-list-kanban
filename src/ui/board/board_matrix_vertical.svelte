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

	$: showSwimlaneHeaders =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0]?.meta?.isDefault);

	$: ungroupedSecondaryBucket = matrix.secondaryAxis[0];
	$: summaryRowCount = taskCountLabel ? 1 : 0;
	$: ungroupedGridTemplateRows = [
		...(taskCountLabel ? ["max-content"] : []),
		"max-content",
		...matrix.primaryAxis.map(() => "max-content"),
	].join(" ");
	$: groupedGridTemplateColumns = matrix.secondaryAxis
		.map(() => "max-content")
		.join(" ");
	$: groupedGridTemplateRows = [
		...(taskCountLabel ? ["max-content"] : []),
		"max-content",
		...matrix.primaryAxis.flatMap(() => ["max-content", "max-content"]),
	].join(" ");

	function headerGridRow(): number {
		return summaryRowCount + 1;
	}

	function contentGridRow(index: number): number {
		return summaryRowCount + index + 2;
	}

	function groupedAxisHeaderGridRow(): number {
		return summaryRowCount + 1;
	}

	function groupedPrimaryHeaderGridRow(index: number): number {
		return summaryRowCount + 2 + index * 2;
	}

	function groupedPrimaryCellGridRow(index: number): number {
		return groupedPrimaryHeaderGridRow(index) + 1;
	}

	let groupedAxisHeaderHeight = 64;
</script>

{#if !showSwimlaneHeaders && ungroupedSecondaryBucket}
	<div class="matrix-vertical ungrouped-grid" style:grid-template-rows={ungroupedGridTemplateRows}>
		{#if taskCountLabel}
			<div class="matrix-summary" style:grid-column="1 / -1" style:grid-row="1">
				<span class="matrix-task-count" aria-live="polite">{taskCountLabel}</span>
			</div>
		{/if}

		<div class="matrix-corner" style:grid-column="1" style:grid-row={headerGridRow()}></div>

		<div
			class="group-header-cell"
			aria-hidden="true"
			style:grid-column="2"
			style:grid-row={headerGridRow()}
		></div>

		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="row-header-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column="1"
				style:grid-row={contentGridRow(pIndex)}
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
				style:grid-row={contentGridRow(pIndex)}
				style:--column-color={pBucket.meta?.color}
			>
				<BoardCell
					{app}
					cell={getBoardCell(matrix, pBucket.id, ungroupedSecondaryBucket.id)}
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
					{treatNestedTasksAsSubtasks}
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
		class="matrix-vertical grouped-grid"
		style:grid-template-columns={groupedGridTemplateColumns}
		style:grid-template-rows={groupedGridTemplateRows}
		style:--grouped-axis-header-height="{groupedAxisHeaderHeight}px"
	>
		{#if taskCountLabel}
			<div class="matrix-summary" style:grid-column="1 / -1" style:grid-row="1">
				<span class="matrix-task-count" aria-live="polite">{taskCountLabel}</span>
			</div>
		{/if}

		<div
			class="grouped-header-height-probe"
			style:grid-column="1 / -1"
			style:grid-row={groupedAxisHeaderGridRow()}
			bind:clientHeight={groupedAxisHeaderHeight}
		></div>
		{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
			<div
				class="group-header-cell"
				style:grid-column={sIndex + 1}
				style:grid-row={groupedAxisHeaderGridRow()}
			>
				<GroupLabel bucket={sBucket} className="group-label" />
			</div>
		{/each}

		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="grouped-row-header"
				class:collapsed={pBucket.collapsed}
				style:grid-column="1 / -1"
				style:grid-row={groupedPrimaryHeaderGridRow(pIndex)}
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
					showTaskCount={true}
					keepCollapsedHorizontal={true}
					compact={true}
				/>
			</div>

			{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
				<div
					class="cell-wrapper grouped-cell"
					class:collapsed={pBucket.collapsed}
					style:grid-column={sIndex + 1}
					style:grid-row={groupedPrimaryCellGridRow(pIndex)}
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
		position: relative;
		padding-bottom: var(--size-4-4);

		&.ungrouped-grid {
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

		&.grouped-grid {
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

			.matrix-corner,
			.group-header-cell {
				min-height: 0;
				padding-top: var(--size-2-1);
				padding-bottom: var(--size-2-1);
			}
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
		display: flex;
		align-items: center;
		min-width: 0;
		padding: var(--size-2-2) var(--size-4-3);
		overflow: hidden;
	}

	.matrix-summary {
		z-index: 2;
		display: flex;
		align-items: center;
		min-height: 32px;
		padding: var(--size-2-1) var(--size-4-3);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}

	.matrix-task-count {
		display: block;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-weight: 500;
		line-height: 1.2;
	}

	.grouped-header-height-probe {
		visibility: hidden;
		min-height: 32px;
		pointer-events: none;
	}

	.group-header-cell {
		display: flex;
		align-items: center;
		min-width: var(--column-width, 300px);
		padding: var(--size-4-3) var(--size-4-4);
		overflow: visible;

		:global(.group-label) {
			position: sticky;
			left: calc(var(--vertical-row-header-width) + var(--size-4-4));
			display: inline-block;
			max-width: min(28ch, 24vw);
			overflow: hidden;
			color: var(--text-normal);
			font-size: var(--font-ui-medium);
			font-weight: var(--font-medium);
			line-height: 1.2;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
	}

	.grouped-grid .group-header-cell :global(.group-label) {
		position: sticky;
		left: var(--size-4-3);
		max-width: calc(100% - calc(2 * var(--size-4-3)));
	}

	.grouped-grid .group-header-cell {
		min-height: 32px;
		padding: var(--size-2-1) var(--size-4-3);
	}

	.grouped-row-header {
		position: sticky;
		top: var(--grouped-axis-header-height);
		z-index: 4;
		display: flex;
		align-items: stretch;
		min-height: 0;
		padding: var(--size-2-1) var(--size-4-3);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-top: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		--column-header-x-padding-override: var(--size-4-3);
		--column-header-y-padding-override: var(--size-2-1);

		&.collapsed {
			padding: var(--size-2-1) var(--size-4-3);
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
