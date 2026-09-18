<script lang="ts">
	import { TFile, type App } from "obsidian";
	import type { AxisBucket, PrimaryBucketId, SecondaryBucketId } from "./board_matrix";
	import type { Task } from "../tasks/task";
	import type { TaskActions } from "../tasks/actions";
	import type { Readable } from "svelte/store";
	import type { ColumnTagTable, ColumnColourTable, ColumnMatchTagTable, ColumnSubtitleTable } from "../columns/columns";
	import ColumnHeader from "../components/ColumnHeader.svelte";
	import GroupLabel from "./GroupLabel.svelte";
	import { isDraggingStore } from "../dnd/store";
	import { deriveCollapsedGroupDropPlan, executeDropPlan } from "./drop_plan";
	import { getPropertyWriteAdapter, PropertySchemaOption } from "../../parsing/properties";
	import { clearColumnSelections } from "../selection/task_selection_store";
	export let bucket: AxisBucket;
	export let role: "column" | "row";
	export let app: App;
	export let tasks: Task[];
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let onToggleCollapse: (id: PrimaryBucketId) => void;
	export let onToggleGroupCollapse: (id: SecondaryBucketId) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;
	export let excludedTags: string[] = [];
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;

	$: isCollapsibleGroup = bucket.kind === "group" && bucket.meta?.source !== undefined &&
		bucket.meta.source.kind !== "none";
	$: groupTaskCountLabel = tasks.length === 1 ? "1 task" : `${tasks.length} tasks`;
	$: groupName = bucket.label;
	$: fileGroupTargetFile = (() => {
		if (bucket.meta?.source?.kind !== "file" || typeof bucket.meta.value !== "string") return null;
		const file = app.vault.getAbstractFileByPath(bucket.meta.value);
		return file instanceof TFile ? file : null;
	})();
	$: draggingData = $isDraggingStore;
	$: groupDropPlan = bucket.kind === "group" && bucket.collapsed && draggingData
		? deriveCollapsedGroupDropPlan({
			dragging: draggingData,
			secondaryId: bucket.id,
			bucketMeta: bucket.meta,
			fileGroupTargetFilePath: fileGroupTargetFile?.path ?? null,
			canWriteProperties: getPropertyWriteAdapter(propertySchemaOption) !== null,
		})
		: null;

	function toggleGroup(e: MouseEvent) {
		e.stopPropagation();
		if (isCollapsibleGroup) onToggleGroupCollapse(bucket.id as SecondaryBucketId);
	}

	function handleDragOver(e: DragEvent) {
		if (!bucket.collapsed) return;
		e.preventDefault();
		if (!groupDropPlan) {
			if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
			return;
		}
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}

	async function handleDrop(e: DragEvent) {
		if (!bucket.collapsed) return;
		e.preventDefault();
		const plan = groupDropPlan;
		if (!plan || !draggingData) return;
		const taskIds = draggingData.draggedTaskIds.length > 0
			? draggingData.draggedTaskIds
			: (() => {
				const id = e.dataTransfer?.getData("text/plain");
				return id ? [id] : [];
			})();
		if (taskIds.length === 0) return;
		await executeDropPlan({
			plan,
			taskActions,
			taskIds,
			taskSecondaryIds: draggingData.taskSecondaryIds,
			targetFile: fileGroupTargetFile,
			column: (draggingData.fromColumn ?? "uncategorised") as PrimaryBucketId,
			excludedTags,
		});
		clearColumnSelections(taskIds);
	}
</script>

{#if bucket.kind === "column"}
	<ColumnHeader column={bucket.id as PrimaryBucketId} {tasks} {taskActions}
		{columnTagTableStore} {columnColourTableStore} {columnMatchTagTableStore} {columnSubtitleTableStore}
		{uncategorizedColumnName} {doneColumnName}
		isCollapsed={bucket.collapsed} desktopAxis={role}
		onToggleCollapse={() => onToggleCollapse(bucket.id as PrimaryBucketId)} />
{:else}
	<!-- Only a folded group header accepts a group-only drop. Expanded cells
		retain their existing drop behaviour, including the legacy Overdue lane. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="group-header" class:collapsed={bucket.collapsed}
		class:folded={bucket.collapsed && role === "column"}
		class:drop-target={bucket.collapsed && groupDropPlan !== null}
		on:dragover={handleDragOver} on:drop={handleDrop}>
		{#if isCollapsibleGroup}
			<button type="button" class="group-collapse" on:click={toggleGroup}
				aria-expanded={!bucket.collapsed}
				aria-label={`${bucket.collapsed ? "Expand" : "Collapse"} ${groupName} swimlane`}
				title={`${bucket.collapsed ? "Expand" : "Collapse"} ${groupName} swimlane`}>
				{bucket.collapsed ? "▶" : "▼"}
			</button>
		{/if}
		<h2 title={groupName}><GroupLabel {bucket} /></h2>
		{#if isCollapsibleGroup}
			<span class="group-task-count" aria-live="polite" aria-label={groupTaskCountLabel}>
				{bucket.collapsed ? tasks.length : groupTaskCountLabel}
			</span>
		{/if}
	</div>
{/if}

<style>
	.group-header {
		display: flex;
		align-items: center;
		min-width: 0;
		padding: var(--axis-label-padding);
		gap: 6px;
	}
	.group-header.drop-target {
		outline: 2px dashed var(--interactive-accent);
		outline-offset: -2px;
	}
	.group-collapse {
		border: 0;
		padding: 0;
		width: 18px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 11px;
	}
	.group-collapse:focus-visible { outline: 2px solid var(--interactive-accent); }
	.group-header.folded {
		width: var(--axis-folded-width);
		padding: 0;
		flex-direction: column;
		gap: 0;
	}
	.group-header.folded h2 { display: none; }
	.group-header.folded .group-collapse { height: 24px; }
	.group-header.folded .group-task-count { line-height: 18px; font-size: var(--font-ui-smaller); }
	h2 {
		margin: 0;
		font-size: var(--axis-label-size);
		font-weight: var(--axis-label-weight);
		letter-spacing: var(--axis-label-spacing);
		text-transform: var(--axis-label-transform);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
	.group-task-count { color: var(--text-muted); font-size: var(--font-ui-smaller); white-space: nowrap; }
</style>
