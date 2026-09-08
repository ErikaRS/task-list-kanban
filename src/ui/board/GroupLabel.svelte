<script lang="ts">
	import type { AxisBucket } from "./board_matrix";
	import TaskStatusMarker from "../components/TaskStatusMarker.svelte";
	import { getGroupStatusMarker } from "./group_label";

	export let bucket: AxisBucket;
	export let className = "";

	$: statusMarker = getGroupStatusMarker(bucket);
</script>

<span class={className} title={bucket.label} aria-label={statusMarker === undefined ? undefined : `Status: ${bucket.label}`}>
	{#if statusMarker !== undefined}
		<TaskStatusMarker status={statusMarker} size={16} />
	{:else}
		{bucket.label}
	{/if}
</span>
