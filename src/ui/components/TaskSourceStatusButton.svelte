<script lang="ts">
	import type { TaskActions } from "../tasks/actions";
	import type { SourceTaskNode } from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import TaskStatusMarker from "./TaskStatusMarker.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let node: SourceTaskNode;
	export let isSelectionMode = false;

	$: isDone = task.isSourceTaskStatusDone(node.status);
	$: isIgnored = node.taskVisibility === "ignored";
	$: isChecked = isDone || isIgnored;
	$: displayStatusIsCustom = node.status !== " ";

	function toggleStatus() {
		void taskActions.toggleSourceTaskStatus(task.id, node.rowIndex);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggleStatus();
		}
	}
</script>

<button
	class="icon-button source-row-status"
	class:is-done={isDone}
	class:usesStatusMarker={displayStatusIsCustom}
	role="checkbox"
	aria-label="Advance subtask status"
	aria-checked={isChecked}
	disabled={isSelectionMode}
	tabindex={isSelectionMode ? -1 : 0}
	on:click|stopPropagation={toggleStatus}
	on:keydown|stopPropagation={handleKeydown}
>
	<TaskStatusMarker status={node.status} {isDone} size={16} />
</button>

<style lang="scss">
	.icon-button.source-row-status {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		border-radius: var(--radius-s);
		box-shadow: none;
		overflow: visible;

		&:hover,
		&:active {
			background: transparent;
			box-shadow: none;
		}

		&:disabled {
			cursor: default;
			opacity: 0.35;
		}

		&.usesStatusMarker {
			color: var(--text-normal);
		}

		&.is-done :global(svg) {
			color: var(--interactive-accent);
		}
	}
</style>
