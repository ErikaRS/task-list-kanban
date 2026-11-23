<script lang="ts">
	import type { App } from "obsidian";
	import type { TaskActions } from "../tasks/actions";
	import type { SourceBlockNode } from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import TaskSourceRow from "./TaskSourceRow.svelte";

	export let app: App;
	export let task: Task;
	/** Omitted, rows render read-only (embedded boards, SPEC 0057). */
	export let taskActions: TaskActions | undefined = undefined;
	export let nodes: SourceBlockNode[] = [];
	export let isSelectionMode = false;
	export let depth = 0;
</script>

{#each nodes as node (node.rowIndex)}
	<TaskSourceRow
		{app}
		{task}
		{taskActions}
		{node}
		{isSelectionMode}
		{depth}
	>
		{#if node.sourceChildren.length > 0}
			<svelte:self
				{app}
				{task}
				{taskActions}
				nodes={node.sourceChildren}
				{isSelectionMode}
				depth={depth + 1}
			/>
		{/if}
	</TaskSourceRow>
{/each}
