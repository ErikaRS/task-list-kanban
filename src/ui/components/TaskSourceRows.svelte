<script lang="ts">
	import type { TaskActions } from "../tasks/actions";
	import type { SourceBlockNode } from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import TaskSourceRow from "./TaskSourceRow.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let nodes: SourceBlockNode[] = [];
	export let isSelectionMode = false;
	export let depth = 0;
</script>

{#each nodes as node (node.rowIndex)}
	<TaskSourceRow
		{task}
		{taskActions}
		{node}
		{isSelectionMode}
		{depth}
	>
		{#if node.sourceChildren.length > 0}
			<svelte:self
				{task}
				{taskActions}
				nodes={node.sourceChildren}
				{isSelectionMode}
				depth={depth + 1}
			/>
		{/if}
	</TaskSourceRow>
{/each}
