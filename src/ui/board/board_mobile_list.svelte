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
	export let targetFileIsDefault = false;
	export let onToggleCollapse: (columnId: PrimaryBucketId) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;
	export let isManualOrder = false;
	export let manualOrder: ManualOrderStore = {};
	export let reorderEnabled = false;
	export let treatNestedTasksAsSubtasks = false;

	$: tasksByPrimary = Object.fromEntries(
		matrix.primaryAxis.map((bucket) => [
			bucket.id,
			Object.values(matrix.cells[bucket.id] || {}).flatMap((cell) => cell.tasks),
		]),
	);

	$: showGroupLabels =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0]?.meta?.isDefault);
</script>

<div class="mobile-board-list">
	{#each matrix.primaryAxis as pBucket (pBucket.id)}
		<section class="mobile-column" style:--column-color={pBucket.meta?.color}>
			<header class="mobile-column-header">
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
			</header>

			{#if !pBucket.collapsed}
				{#each matrix.secondaryAxis as sBucket (sBucket.id)}
					<div class="mobile-cell">
						{#if showGroupLabels}
							<h3 class="mobile-group-label">{sBucket.label}</h3>
						{/if}
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
							accentColor={pBucket.meta?.color}
							{isManualOrder}
							manualOrderEntries={manualOrder[sBucket.id]?.[pBucket.id]}
							{reorderEnabled}
						/>
					</div>
				{/each}
			{/if}
		</section>
	{/each}
</div>

<style lang="scss">
	.mobile-board-list {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
		width: 100%;
		padding-bottom: var(--size-4-4);
	}

	.mobile-column {
		min-width: 0;
		overflow: hidden;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		box-shadow: var(--shadow-s);
	}

	.mobile-column-header {
		position: sticky;
		top: 0;
		z-index: 4;
		padding: var(--size-4-2) var(--size-4-3);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}

	.mobile-cell {
		min-width: 0;
		padding: var(--size-4-3);
		background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));

		& + & {
			border-top: var(--border-width) solid var(--background-modifier-border);
		}
	}

	.mobile-group-label {
		margin: 0 0 var(--size-4-2);
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}
</style>

