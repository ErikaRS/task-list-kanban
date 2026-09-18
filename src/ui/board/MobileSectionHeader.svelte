<script lang="ts">
	import { formatMobileTaskCount } from "./mobile_layout";
	import type { AxisBucket, PrimaryBucketId } from "./board_matrix";
	import GroupLabel from "./GroupLabel.svelte";
	import { TFile, type App } from "obsidian";
	import type { TaskActions } from "../tasks/actions";
	import { isDraggingStore } from "../dnd/store";
	import { deriveCollapsedGroupDropPlan, executeDropPlan } from "./drop_plan";
	import { getPropertyWriteAdapter, PropertySchemaOption } from "../../parsing/properties";
	import { clearColumnSelections } from "../selection/task_selection_store";

	export let bucket: AxisBucket;
	export let count: number;
	export let headingLevel: 2 | 3 = 2;
	export let className = "";
	export let collapsible = false;
	export let isCollapsed = false;
	export let onToggleCollapse: (() => void) | undefined = undefined;
	export let app: App | undefined = undefined;
	export let taskActions: TaskActions | undefined = undefined;
	export let excludedTags: string[] = [];
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;

	$: fileGroupTargetFile = (() => {
		if (!app || bucket.meta?.source?.kind !== "file" || typeof bucket.meta.value !== "string") return null;
		const file = app.vault.getAbstractFileByPath(bucket.meta.value);
		return file instanceof TFile ? file : null;
	})();
	$: draggingData = $isDraggingStore;
	$: groupDropPlan = collapsible && isCollapsed && draggingData
		? deriveCollapsedGroupDropPlan({
			dragging: draggingData,
			secondaryId: bucket.id,
			bucketMeta: bucket.meta,
			fileGroupTargetFilePath: fileGroupTargetFile?.path ?? null,
			canWriteProperties: getPropertyWriteAdapter(propertySchemaOption) !== null,
		})
		: null;

	function handleDragOver(e: DragEvent) {
		if (!isCollapsed) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = groupDropPlan ? "move" : "none";
	}

	async function handleDrop(e: DragEvent) {
		if (!isCollapsed) return;
		e.preventDefault();
		if (!groupDropPlan || !draggingData || !taskActions) return;
		const taskIds = draggingData.draggedTaskIds.length > 0
			? draggingData.draggedTaskIds
			: (() => {
				const id = e.dataTransfer?.getData("text/plain");
				return id ? [id] : [];
			})();
		if (taskIds.length === 0) return;
		await executeDropPlan({
			plan: groupDropPlan,
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element
	this={`h${headingLevel}`}
	class={`mobile-section-heading ${className}`}
	class:drop-target={groupDropPlan !== null}
	on:dragover={handleDragOver}
	on:drop={handleDrop}
>
	{#if collapsible}
		<button type="button" class="mobile-group-toggle" on:click={onToggleCollapse}
			aria-expanded={!isCollapsed}
			aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${bucket.label} swimlane`}>
			{isCollapsed ? "▶" : "▼"}
		</button>
	{/if}
	<GroupLabel {bucket} /> <span class="mobile-section-count">{isCollapsed ? count : formatMobileTaskCount(count)}</span>
</svelte:element>

<style>
	.mobile-group-toggle {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.mobile-group-toggle:focus-visible { outline: 2px solid var(--interactive-accent); }
	.drop-target { outline: 2px dashed var(--interactive-accent); outline-offset: -2px; }
</style>
