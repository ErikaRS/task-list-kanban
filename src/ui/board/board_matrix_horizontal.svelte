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
	export let columnWidth: string = "300px";

	$: gridTemplateColumns = matrix.primaryAxis
		.map((b) => (b.collapsed ? "48px" : columnWidth))
		.join(" ");
</script>

<div class="matrix-horizontal" style:grid-template-columns={gridTemplateColumns}>
	<!-- 1. Render column backgrounds so we get the visual column appearance -->
	{#each matrix.primaryAxis as pBucket, index (pBucket.id)}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div
			class="column-background"
			class:collapsed={pBucket.collapsed}
			style:grid-column={index + 1}
			style:grid-row="1 / -1"
			style:--column-color={pBucket.meta?.color}
			style={pBucket.meta?.color ? `background-color: ${pBucket.meta.color};` : ""}
			on:click={() => { if (pBucket.collapsed) onToggleCollapse(pBucket.id); }}
		></div>
	{/each}

	<!-- 2. Render Column Headers across the top row -->
	{#each matrix.primaryAxis as pBucket, index (pBucket.id)}
		<div class="header-wrapper" style:grid-column={index + 1} style:grid-row="1">
			<ColumnHeader
				column={pBucket.id}
				tasks={matrix.cells[pBucket.id]["__default__"].tasks}
				{taskActions}
				{columnTagTableStore}
				{columnColourTableStore}
				{columnMatchTagTableStore}
				isVerticalFlow={false}
				isCollapsed={pBucket.collapsed}
				onToggleCollapse={() => onToggleCollapse(pBucket.id)}
				{uncategorizedColumnName}
				{doneColumnName}
			/>
		</div>
	{/each}

	<!-- 3. Render Board Cells across subsequent rows -->
	{#each matrix.secondaryAxis as sBucket, sIndex (sBucket.id)}
		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div 
				class="cell-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column={pIndex + 1} 
				style:grid-row={sIndex + 2}
				style:--column-color={pBucket.meta?.color}
			>
				<div class="divide"></div>
				<BoardCell
					{app}
					cell={matrix.cells[pBucket.id][sBucket.id]}
					primaryAxisLabel={pBucket.label}
					{taskActions}
					{columnTagTableStore}
					{showFilepath}
					{consolidateTags}
					isVerticalFlow={false}
					{targetTaskFile}
					{targetFileIsDefault}
					{doneColumnName}
					isCollapsed={pBucket.collapsed}
				/>
			</div>
		{/each}
	{/each}
</div>

<style lang="scss">
	.matrix-horizontal {
		display: grid;
		grid-template-rows: max-content 1fr;
		/* columns defined dynamically */
		gap: var(--size-4-3);
		align-items: start;
		padding-bottom: var(--size-4-3);
	}

	.column-background {
		border-radius: var(--radius-m);
		border: var(--border-width) solid var(--background-modifier-border);
		background-color: var(--background-secondary);
		transition: width 250ms ease;
		z-index: 0;
		align-self: start;
		height: 100%;
		width: 100%;

		&.collapsed {
			cursor: pointer;
		}
	}

	.header-wrapper {
		z-index: 1;
		padding: var(--size-4-3);
		padding-bottom: 0; /* Let the divide handle spacing */
	}

	.cell-wrapper {
		z-index: 1;
		padding: 0 var(--size-4-3) var(--size-4-3) var(--size-4-3);
		display: flex;
		flex-direction: column;

		&.collapsed {
			.divide {
				display: none;
			}
		}

		.divide {
			width: calc(100% + calc(2 * var(--size-4-3)));
			border-bottom: var(--border-width) solid
				var(--column-color, var(--background-modifier-border));
			margin: var(--size-4-3) calc(-1 * var(--size-4-3));
		}
	}
</style>
