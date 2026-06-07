<script lang="ts">
	import type { App, TFile } from "obsidian";
	import type { Readable } from "svelte/store";
	import type { BoardMatrix } from "./board_matrix";
	import type {
		ColumnTagTable,
		ColumnColourTable,
		ColumnMatchTagTable,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import ColumnHeader from "../components/ColumnHeader.svelte";
	import BoardCell from "./BoardCell.svelte";
	import { PropertyDisplayMode } from "../settings/settings_store";

	export let app: App;
	export let matrix: BoardMatrix;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let showFilepath: boolean;
	export let propertyDisplay: PropertyDisplayMode = PropertyDisplayMode.None;
	export let consolidateTags: boolean;
	export let excludedTags: string[] = [];
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let onToggleCollapse: (columnId: string) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;

	$: tasksByPrimary = Object.fromEntries(
		matrix.primaryAxis.map((bucket) => [
			bucket.id,
			Object.values(matrix.cells[bucket.id] || {}).flatMap((cell) => cell.tasks),
		]),
	);

	$: showSwimlaneHeaders =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0].meta?.isDefault);
</script>

<div class="matrix-vertical">
	{#each matrix.primaryAxis as pBucket (pBucket.id)}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div
			class="column-vertical"
			class:collapsed={pBucket.collapsed}
			style:--column-color={pBucket.meta?.color}
			style={pBucket.meta?.color ? `background-color: ${pBucket.meta.color};` : ""}
			on:click={() => { if (pBucket.collapsed) onToggleCollapse(pBucket.id); }}
		>
			<div class="header-wrapper">
				<ColumnHeader
					column={pBucket.id}
					tasks={tasksByPrimary[pBucket.id] ?? []}
					{taskActions}
					{columnTagTableStore}
					{columnColourTableStore}
					{columnMatchTagTableStore}
					isVerticalFlow={true}
					isCollapsed={pBucket.collapsed}
					onToggleCollapse={() => onToggleCollapse(pBucket.id)}
					{uncategorizedColumnName}
					{doneColumnName}
				/>
			</div>

			{#if !pBucket.collapsed}
				<div class="cells-container">
					{#each matrix.secondaryAxis as sBucket (sBucket.id)}
						{#if showSwimlaneHeaders}
							<div class="swimlane-header">
								{sBucket.label}
							</div>
						{/if}
						<div class="cell-wrapper">
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
								{consolidateTags}
								{excludedTags}
								isVerticalFlow={true}
								{targetTaskFile}
								{targetFileIsDefault}
								{doneColumnName}
								isCollapsed={pBucket.collapsed}
								accentColor={pBucket.meta?.color}
							/>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style lang="scss">
	.matrix-vertical {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-4);
		width: 100%;
		padding-bottom: var(--size-4-4);
	}

	.column-vertical {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: var(--size-4-4);
		border-radius: var(--radius-m);
		border: var(--border-width) solid var(--background-modifier-border);
		background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));
		transition: padding-bottom 250ms ease;
		overflow: hidden;
		box-shadow: var(--shadow-s);

		&.collapsed {
			cursor: pointer;
			padding-bottom: var(--size-4-4);
		}
	}

	.header-wrapper {
		width: 100%;
		z-index: 1;
	}

	.cells-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin-top: var(--size-4-4);
		gap: 0;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		overflow: clip;
	}

	.swimlane-header {
		font-size: var(--font-ui-medium);
		font-weight: var(--font-medium);
		color: var(--text-normal);
		padding: var(--size-4-3) var(--size-4-4);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
	}

	.cell-wrapper {
		width: 100%;
		padding: var(--size-4-2) var(--size-4-4);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}
</style>
