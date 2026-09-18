<script lang="ts">
	import type { AxisBucket } from "./board_matrix";
	export let visualColumns: AxisBucket[];
	export let visualRows: AxisBucket[];
	export let showColumnHeaders = true;
	export let showRowHeaders = true;
	export let columnWidth = "300px";
	export let viewportWidth = 0;
	export let taskCountLabel = "";
	$: tracks = visualColumns.map(bucket => bucket.collapsed ? "var(--axis-folded-width)" : columnWidth).join(" ");
	let headerHeight = 0;
	let summaryHeight = 0;
</script>

<!-- Geometry depends only on visual roles. Each row owns its sticky band so
	 the entire opaque surface leaves with the row, including folded gutters. -->
<div class="matrix-desktop" style:grid-template-columns={tracks}
	style:--axis-header-height="{showColumnHeaders ? headerHeight : 0}px"
	style:--summary-height="{taskCountLabel ? summaryHeight : 0}px"
	style:--viewport-width={viewportWidth > 0 ? `${viewportWidth}px` : "100%"}
	style:--cell-card-width={`calc(${columnWidth} - 34px)`}>
	{#if taskCountLabel}
		<div class="matrix-summary" bind:clientHeight={summaryHeight}>
			<span aria-live="polite">{taskCountLabel}</span>
		</div>
	{/if}
	{#if showColumnHeaders}
		<div class="axis-column-band" bind:clientHeight={headerHeight}>
			{#each visualColumns as bucket (bucket.id)}
				<div class="axis-column-header">
					<div class="axis-column-decoration" aria-hidden="true">
						<slot name="column-decoration" {bucket} />
					</div>
					<div class="axis-column-content">
						<slot name="header" {bucket} role={"column" as const} />
					</div>
				</div>
			{/each}
		</div>
	{/if}
	{#each visualRows as bucket (bucket.id)}
		<section class="axis-row" class:collapsed={bucket.collapsed}>
			{#if showRowHeaders}
				<div class="axis-row-band">
					<div class="axis-row-content">
						<slot name="header" {bucket} role={"row" as const} />
					</div>
				</div>
			{/if}
			{#if !bucket.collapsed}
				{#each visualColumns as visualColumn (visualColumn.id)}
					<div class="cell-wrapper" class:collapsed={visualColumn.collapsed}>
						{#if !visualColumn.collapsed}
							<slot name="cell" {visualColumn} visualRow={bucket} />
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	{/each}
</div>

<style>
	.matrix-desktop {
		--axis-folded-width: 28px;
		display: grid;
		width: max-content;
		min-width: 100%;
		position: relative;
		isolation: isolate;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
	}
	.matrix-summary, .axis-column-band, .axis-row, .axis-row-band { grid-column: 1 / -1; }
	.matrix-summary {
		position: sticky;
		top: 0;
		z-index: 4;
		background: var(--background-primary);
		padding: 6px 12px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}
	.matrix-summary span {
		position: sticky;
		left: 12px;
		display: block;
		width: fit-content;
		max-width: var(--viewport-width);
	}
	.axis-column-band, .axis-row { display: grid; grid-template-columns: subgrid; }
	.axis-column-band {
		position: sticky;
		top: var(--summary-height);
		z-index: 3;
		background: var(--background-secondary);
	}
	.axis-column-header {
		position: relative;
		min-width: 0;
		padding: 0;
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}
	.axis-column-decoration {
		position: absolute;
		inset: 0 0 auto;
		pointer-events: none;
	}
	.axis-column-content {
		--axis-label-size: var(--font-ui-small);
		--axis-label-weight: 650;
		--axis-label-spacing: normal;
		--axis-label-transform: none;
		--axis-label-padding: 8px 12px;
		position: sticky;
		left: 0;
		width: fit-content;
		max-width: min(100%, var(--viewport-width));
		min-height: 32px;
	}
	.axis-row { position: relative; grid-template-rows: auto 1fr; }
	.axis-row.collapsed { grid-template-rows: auto; }
	.axis-row-band {
		position: sticky;
		top: calc(var(--summary-height) + var(--axis-header-height));
		align-self: start;
		z-index: 2;
		background: var(--background-secondary);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}
	.axis-row-content {
		--axis-label-size: max(11px, calc(var(--font-ui-small) - 3px));
		--axis-label-weight: 600;
		--axis-label-spacing: 0.065em;
		--axis-label-transform: uppercase;
		--axis-label-padding: 4px 12px;
		position: sticky;
		left: 0;
		width: min(100%, var(--viewport-width));
		min-height: 30px;
		background: var(--background-secondary);
	}
	.cell-wrapper {
		position: relative;
		z-index: 0;
		--column-width: var(--cell-card-width);
		min-width: 0;
		min-height: 188px;
		padding: 8px 16px;
		border-right: var(--border-width) solid var(--background-modifier-border);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		background: var(--background-primary);
	}
	.cell-wrapper.collapsed { padding: 0; }
</style>
