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

	$: tasksByPrimary = Object.fromEntries(
		matrix.primaryAxis.map((bucket) => [
			bucket.id,
			Object.values(matrix.cells[bucket.id] || {}).flatMap((cell) => cell.tasks),
		]),
	);

	$: showSwimlaneHeaders =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0].meta?.isDefault);

	$: gridTemplateRows = (() => {
		if (!showSwimlaneHeaders) return "max-content 1fr";

		const rows = ["max-content"];
		for (let i = 0; i < matrix.secondaryAxis.length; i++) {
			rows.push("max-content"); // swimlane header
			if (i === matrix.secondaryAxis.length - 1) {
				rows.push("1fr"); // last cell row stretches
			} else {
				rows.push("max-content"); // other cells
			}
		}
		return rows.join(" ");
	})();
</script>

<div class="matrix-horizontal" style:grid-template-columns={gridTemplateColumns} style:grid-template-rows={gridTemplateRows}>
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
		<div
			class="header-wrapper"
			class:collapsed={pBucket.collapsed}
			style:grid-column={index + 1}
			style:grid-row={pBucket.collapsed ? "1 / -1" : "1"}
		>
			<ColumnHeader
				column={pBucket.id}
				tasks={tasksByPrimary[pBucket.id] ?? []}
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
		{#if showSwimlaneHeaders}
			<div
				class="swimlane-header-row"
				style:grid-column="1 / -1"
				style:grid-row={sIndex * 2 + 2}
			>
				<span class="swimlane-label">{sBucket.label}</span>
			</div>
		{/if}
		{#each matrix.primaryAxis as pBucket, pIndex (pBucket.id)}
			<div
				class="cell-wrapper"
				class:collapsed={pBucket.collapsed}
				style:grid-column={pIndex + 1}
				style:grid-row={showSwimlaneHeaders ? sIndex * 2 + 3 : sIndex + 2}
				style:--column-color={pBucket.meta?.color}
			>
				<div class="divide"></div>
					<BoardCell
						{app}
						cell={matrix.cells[pBucket.id][sBucket.id]}
						secondaryAxisBucket={sBucket}
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
		/* rows and columns defined dynamically */
		column-gap: var(--size-4-3);
		row-gap: 0;
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

		&.collapsed {
			height: 100%;
			padding-bottom: var(--size-4-3);
		}
	}

	.swimlane-header-row {
		z-index: 1;
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
		color: var(--text-muted);
		margin-top: var(--size-4-3);
		padding: var(--size-2-1) var(--size-4-3);
		border-bottom: 1px solid var(--background-modifier-border);
		text-transform: uppercase;
		letter-spacing: 0.05em;

		.swimlane-label {
			position: sticky;
			left: var(--size-4-3);
		}
	}

	.cell-wrapper {
		z-index: 1;
		padding: 0 var(--size-4-3) var(--size-4-3) var(--size-4-3);
		display: flex;
		flex-direction: column;

		&.collapsed {
			display: none;
		}

		.divide {
			width: calc(100% + calc(2 * var(--size-4-3)));
			border-bottom: var(--border-width) solid
				var(--column-color, var(--background-modifier-border));
			margin: var(--size-4-1) calc(-1 * var(--size-4-3)) var(--size-4-2) calc(-1 * var(--size-4-3));
		}
	}
</style>
