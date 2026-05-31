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

	export let app: App;
	export let matrix: BoardMatrix;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let showFilepath: boolean;
	export let consolidateTags: boolean;
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let onToggleCollapse: (columnId: string) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;

	$: getTasksForColumn = (pId: string) => {
		const columnCells = matrix.cells[pId];
		if (!columnCells) return [];
		return Object.values(columnCells).flatMap((cell) => cell.tasks);
	};
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
					tasks={getTasksForColumn(pBucket.id)}
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
						{#if matrix.secondaryAxis.length > 1}
							<div class="swimlane-header">
								{sBucket.label}
							</div>
						{/if}
						<div class="cell-wrapper">
							<BoardCell
								{app}
								cell={matrix.cells[pBucket.id][sBucket.id]}
								primaryAxisLabel={pBucket.label}
								{taskActions}
								{columnTagTableStore}
								{showFilepath}
								{consolidateTags}
								isVerticalFlow={true}
								{targetTaskFile}
								{targetFileIsDefault}
								{doneColumnName}
								isCollapsed={pBucket.collapsed}
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
		gap: var(--size-4-3);
		width: 100%;
		padding-bottom: var(--size-4-3);
	}

	.column-vertical {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: var(--size-4-3);
		border-radius: var(--radius-m);
		border: var(--border-width) solid var(--background-modifier-border);
		background-color: var(--background-secondary);
		transition: padding-bottom 250ms ease;
		overflow: hidden;

		&.collapsed {
			cursor: pointer;
			padding-bottom: var(--size-4-3);
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
		margin-top: var(--size-4-2);
		gap: var(--size-4-2);
	}

	.swimlane-header {
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
		color: var(--text-muted);
		margin-top: var(--size-4-2);
		margin-bottom: var(--size-4-1);
		padding: var(--size-2-1) 0;
		border-bottom: 1px solid var(--background-modifier-border);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.cell-wrapper {
		width: 100%;
	}
</style>
