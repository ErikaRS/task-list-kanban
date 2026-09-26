<script lang="ts">
	import type { AxisBucket } from "./board_matrix";
	import Icon from "../components/icon.svelte";
	import { createPropertyOverdueGroupBucketId } from "../tasks/task_grouping";

	// Shown only on the combined Overdue swimlane header (SPEC 0046).
	export let bucket: AxisBucket;
	export let count: number;
	export let onReschedule: (() => void) | undefined;

	$: source = bucket.meta?.source;
	$: isOverdueLane = bucket.kind === "group" && source?.kind === "property" &&
		bucket.id === createPropertyOverdueGroupBucketId(source.key);
	$: dateKey = source?.kind === "property" ? source.key : "";
	$: label = `Reschedule ${count} overdue ${count === 1 ? "task" : "tasks"} to today (${dateKey})`;

	function handleClick(e: MouseEvent) {
		// The header also toggles collapse and accepts drops; keep this click
		// from reaching it.
		e.stopPropagation();
		onReschedule?.();
	}
</script>

{#if isOverdueLane && count > 0 && onReschedule}
	<button type="button" class="reschedule-overdue clickable-icon" on:click={handleClick}
		aria-label={label} title={label}>
		<Icon name="calendar-check" size={16} />
	</button>
{/if}

<style>
	.reschedule-overdue {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		margin: 0 0 0 auto;
		vertical-align: middle;
		border: 0;
		background: transparent;
		box-shadow: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.reschedule-overdue:hover {
		color: var(--text-normal);
		background-color: var(--background-modifier-hover);
	}
	.reschedule-overdue:focus-visible {
		outline: 2px solid var(--interactive-accent);
	}
</style>
