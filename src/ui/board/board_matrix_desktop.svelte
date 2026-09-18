<script lang="ts">
	import type { App, TFile } from "obsidian";
	import type { Readable } from "svelte/store";
	import type { BoardMatrix, PrimaryBucketId } from "./board_matrix";
	import type {
		ColumnTagTable,
		ColumnColourTable,
		ColumnMatchTagTable,
		ColumnSubtitleTable,
	} from "../columns/columns";
	import type { TaskActions } from "../tasks/actions";
	import DesktopMatrixGrid from "./DesktopMatrixGrid.svelte";
	import DesktopAxisHeader from "./DesktopAxisHeader.svelte";
	import BoardCell from "./BoardCell.svelte";
	import { PropertyDisplayMode } from "../settings/settings_store";
	import { PropertySchemaOption } from "../../parsing/properties/property_schema";
	import type { ManualOrderStore } from "../tasks/manual_order";

	import { deriveDesktopMatrixProjection } from "./desktop_matrix_projection";

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
	export let columnWidth = "300px";
	export let isManualOrder = false;
	export let manualOrder: ManualOrderStore = {};
	export let reorderEnabled = false;
	export let treatNestedTasksAsSubtasks = false;
	export let taskCountLabel = "";
	/** TTB/BTT: groups are visual columns and semantic columns are visual rows. */
	export let isVerticalFlow = false;

	export let viewportWidth = 0;
	$: projection = deriveDesktopMatrixProjection(matrix, isVerticalFlow);
	$: tasksByPrimary = Object.fromEntries(matrix.primaryAxis.map(bucket => [
		bucket.id, Object.values(matrix.cells[bucket.id] || {}).flatMap(cell => cell.tasks),
	]));
</script>

<DesktopMatrixGrid visualColumns={projection.visualColumns} visualRows={projection.visualRows}
	showColumnHeaders={projection.showColumnHeaders} showRowHeaders={projection.showRowHeaders}
	{columnWidth} {viewportWidth} {taskCountLabel}>
	<svelte:fragment slot="column-decoration" let:bucket>
		{#if bucket.kind === "column"}
			<div class="category-accent" style:--category-color={bucket.meta?.color}></div>
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="header" let:bucket let:role>
		<DesktopAxisHeader {bucket} {role} tasks={tasksByPrimary[bucket.id] ?? []}
			{taskActions}
			{columnTagTableStore}
			{columnColourTableStore}
			{columnMatchTagTableStore}
			{columnSubtitleTableStore}
			{onToggleCollapse}
			{uncategorizedColumnName}
			{doneColumnName} />
	</svelte:fragment>
	<svelte:fragment slot="cell" let:visualColumn let:visualRow>
		{@const { cell, primaryBucket, secondaryBucket } = projection.getCell(visualColumn, visualRow)}
		<BoardCell
			{app}
			{cell}
			primaryTasks={tasksByPrimary[primaryBucket.id] ?? []}
			secondaryAxisBucket={secondaryBucket}
			primaryAxisLabel={primaryBucket.label}
			{taskActions}
			{columnTagTableStore}
			{showFilepath}
			{propertyDisplay}
			{propertySchemaOption}
			{consolidateTags}
			{excludedTags}
			{treatNestedTasksAsSubtasks}
			isVerticalFlow={projection.cellVerticalFlow}
			{targetTaskFile}
			{targetFileIsDefault}
			{doneColumnName}
			isCollapsed={primaryBucket.collapsed}
			accentColor={primaryBucket.meta?.color}
			{isManualOrder}
			manualOrderEntries={manualOrder[secondaryBucket.id]?.[primaryBucket.id]}
			{reorderEnabled}
		/>
	</svelte:fragment>
</DesktopMatrixGrid>

<style>
	/* Semantic decoration fills the shared frame, independently of sticky content. */
	.category-accent {
		height: 6px;
		background: var(--category-color, var(--background-modifier-border-hover));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-normal) 10%, transparent);
	}
</style>
