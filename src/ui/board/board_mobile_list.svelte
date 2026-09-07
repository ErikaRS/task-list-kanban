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
	export let taskCountLabel = "";
	export let isVerticalFlow = false;

	$: tasksByPrimary = Object.fromEntries(
		matrix.primaryAxis.map((bucket) => [
			bucket.id,
			Object.values(matrix.cells[bucket.id] || {}).flatMap((cell) => cell.tasks),
		]),
	);

	$: showGroupLabels =
		matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0]?.meta?.isDefault);
	$: groupDominant = isVerticalFlow && showGroupLabels;
	$: tasksBySecondary = Object.fromEntries(
		matrix.secondaryAxis.map((bucket) => [
			bucket.id,
			matrix.primaryAxis.flatMap(
				(primary) => getBoardCell(matrix, primary.id, bucket.id).tasks,
			),
		]),
	);

	function formatTaskCount(count: number) {
		return count === 1 ? "1 task" : `${count} tasks`;
	}

	function setStickyOffset(node: HTMLElement) {
		const section = node.closest<HTMLElement>(".mobile-outer-section");
		const update = () =>
			section?.style.setProperty("--mobile-outer-header-height", `${node.offsetHeight}px`);
		update();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
</script>

<div class="mobile-board-list">
	{#if taskCountLabel}
		<span class="mobile-task-count" aria-live="polite">{taskCountLabel}</span>
	{/if}
	{#if !groupDominant}
		{#each matrix.primaryAxis as pBucket (pBucket.id)}
			<section class="mobile-outer-section mobile-column" style:--column-color={pBucket.meta?.color}>
				<header class="mobile-outer-header mobile-column-header" use:setStickyOffset>
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
					headingId={`mobile-column-${pBucket.id}`}
					keepCollapsedHorizontal={true}
				/>
			</header>

			{#if !pBucket.collapsed}
				{#each matrix.secondaryAxis as sBucket (sBucket.id)}
					<div class="mobile-cell" class:compact-empty={getBoardCell(matrix, pBucket.id, sBucket.id).isEmpty}>
						{#if showGroupLabels}
							<h3 class="mobile-inner-header mobile-group-label">
								{sBucket.label} <span class="mobile-cell-count">{formatTaskCount(getBoardCell(matrix, pBucket.id, sBucket.id).tasks.length)}</span>
							</h3>
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
							isCompactEmpty={true}
						/>
					</div>
				{/each}
			{/if}
			</section>
		{/each}
	{:else}
		{#each matrix.secondaryAxis as sBucket (sBucket.id)}
			<section class="mobile-outer-section mobile-group">
				<header class="mobile-outer-header mobile-group-header" use:setStickyOffset>
					<h2>{sBucket.label} <span class="mobile-cell-count">{formatTaskCount(tasksBySecondary[sBucket.id]?.length ?? 0)}</span></h2>
				</header>
				{#each matrix.primaryAxis as pBucket (pBucket.id)}
					<div class="mobile-cell mobile-group-cell" class:compact-empty={getBoardCell(matrix, pBucket.id, sBucket.id).isEmpty} style:--column-color={pBucket.meta?.color}>
						<header class="mobile-inner-header mobile-cell-column-header">
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
								taskCountOverride={getBoardCell(matrix, pBucket.id, sBucket.id).tasks.length}
								showTaskCount={true}
								headingId={`mobile-cell-${sBucket.id}-${pBucket.id}`}
								headingLevel={3}
								keepCollapsedHorizontal={true}
							/>
						</header>
						{#if !pBucket.collapsed}
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
								isCompactEmpty={true}
							/>
						{/if}
					</div>
				{/each}
			</section>
		{/each}
	{/if}
</div>

<style lang="scss">
	.mobile-board-list {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3);
		width: 100%;
		padding-bottom: var(--size-4-4);
	}

	.mobile-outer-section {
		min-width: 0;
		border: var(--border-width) solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		background: var(--background-primary);
		box-shadow: var(--shadow-s);
	}

	.mobile-task-count {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		padding: 0 var(--size-4-2);
	}

	.mobile-outer-header {
		// ColumnHeader's accent strip intentionally bleeds into its wrapper.
		// Keep that bleed equal to the mobile wrapper padding so the visible
		// strip reaches the scroll edge exactly when sticky positioning starts.
		--column-header-x-padding-override: var(--size-4-3);
		--column-header-y-padding-override: var(--size-4-2);
		position: sticky;
		top: 0;
		z-index: 4;
		padding: var(--size-4-2) var(--size-4-3);
		background: color-mix(in srgb, var(--background-secondary) 72%, var(--background-primary));
		border-bottom: var(--border-width) solid var(--background-modifier-border);
	}

	.mobile-group-header {
		display: flex;
		flex-direction: column;
		gap: var(--size-2-3);

		// Match the outer column header's visual rhythm. Columns get their
		// own colored strip from ColumnHeader; groups deliberately stay neutral.
		&::before {
			content: "";
			display: block;
			width: calc(100% + calc(2 * var(--size-4-3)));
			height: 12px;
			margin: calc(-1 * var(--size-4-2)) calc(-1 * var(--size-4-3)) 0;
			border-radius: 2px;
			background: var(--background-modifier-border-hover);
			box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-normal) 10%, transparent);
		}

		h2 {
			margin: 0;
			font-size: var(--font-ui-medium);
			font-weight: var(--font-bold);
			line-height: 1.2;
		}
	}

	.mobile-cell {
		min-width: 0;
		padding: var(--size-4-3);
		background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary));

		& + & {
			border-top: var(--border-width) solid var(--background-modifier-border);
		}
	}

	.mobile-inner-header {
		position: sticky;
		top: var(--mobile-outer-header-height, 0px);
		z-index: 3;
		background: var(--background-primary);
	}

	.mobile-group-label {
		padding: var(--size-2-3) var(--size-4-2);
		border-left: 3px solid var(--background-modifier-border-hover);
		border-radius: var(--radius-s);
		background: color-mix(in srgb, var(--background-secondary) 60%, var(--background-primary));
		font-weight: var(--font-medium);
	}

	.mobile-cell-count {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		font-weight: normal;
	}

	.mobile-cell-column-header {
		--column-header-x-padding-override: var(--size-4-3);
		--column-header-y-padding-override: var(--size-4-2);
		margin: calc(-1 * var(--size-4-3));
		padding: var(--size-4-2) var(--size-4-3);
		border-bottom: var(--border-width) solid var(--background-modifier-border);

		:global(.column-header) {
			gap: var(--size-2-2);
		}

		:global(.column-header::before) {
			height: 6px;
		}

		:global(.column-title-group h3) {
			font-size: var(--font-ui-small);
			font-weight: var(--font-medium);
		}

		:global(.task-count) {
			font-size: var(--font-ui-smaller);
		}
	}

	.mobile-cell > .mobile-group-label {
		margin: calc(-1 * var(--size-4-3));
		margin-bottom: var(--size-4-2);
		border-bottom: var(--border-width) solid var(--background-modifier-border);
		color: var(--text-muted);
		font-size: var(--font-ui-small);

		&.mobile-inner-header {
			z-index: 3;
		}
	}

	.mobile-cell.compact-empty {
		padding-bottom: var(--size-4-2);

		:global(.tasks-wrapper.compact-empty) {
			gap: 0;
		}

		:global(.file-indicator) {
			display: none;
		}
	}
</style>
