<script lang="ts">
	import type { AxisBucket, PrimaryBucketId } from "./board_matrix";
	import type { Task } from "../tasks/task";
	import type { TaskActions } from "../tasks/actions";
	import type { Readable } from "svelte/store";
	import type { ColumnTagTable, ColumnColourTable, ColumnMatchTagTable, ColumnSubtitleTable } from "../columns/columns";
	import ColumnHeader from "../components/ColumnHeader.svelte";
	import GroupLabel from "./GroupLabel.svelte";
	export let bucket: AxisBucket;
	export let role: "column" | "row";
	export let tasks: Task[];
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnColourTableStore: Readable<ColumnColourTable>;
	export let columnMatchTagTableStore: Readable<ColumnMatchTagTable>;
	export let columnSubtitleTableStore: Readable<ColumnSubtitleTable>;
	export let onToggleCollapse: (id: PrimaryBucketId) => void;
	export let uncategorizedColumnName: string | undefined = undefined;
	export let doneColumnName: string | undefined = undefined;
</script>

{#if bucket.kind === "column"}
	<ColumnHeader column={bucket.id as PrimaryBucketId} {tasks} {taskActions}
		{columnTagTableStore} {columnColourTableStore} {columnMatchTagTableStore} {columnSubtitleTableStore}
		{uncategorizedColumnName} {doneColumnName}
		isCollapsed={bucket.collapsed} desktopAxis={role}
		onToggleCollapse={() => onToggleCollapse(bucket.id as PrimaryBucketId)} />
{:else}
	<h2><GroupLabel {bucket} /></h2>
{/if}

<style>
	h2 {
		margin: 0;
		padding: var(--axis-label-padding);
		font-size: var(--axis-label-size);
		font-weight: var(--axis-label-weight);
		letter-spacing: var(--axis-label-spacing);
		text-transform: var(--axis-label-transform);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
