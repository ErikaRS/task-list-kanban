<script lang="ts">
	import type { TaskActions } from "../tasks/actions";
	import {
		getSourceNodeText,
		getRawListItemText,
		type SourceBlockNode,
	} from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import TaskLineRow from "./TaskLineRow.svelte";
	import TaskSourceStatusButton from "./TaskSourceStatusButton.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let node: SourceBlockNode;
	export let isSelectionMode = false;
	export let depth = 0;

	let isEditing = false;

	$: rawListItemText = node.kind === "raw" ? getRawListItemText(node) : null;
	$: editText = (rawListItemText ?? getSourceNodeText(node)).replaceAll("<br />", "\n");
	$: previewText = (rawListItemText ?? editText).replaceAll("<br />", "\n");

	function startEditing() {
		isEditing = true;
	}

	function finishEditing(e: FocusEvent & { currentTarget: HTMLTextAreaElement }) {
		const next = e.currentTarget.value;
		isEditing = false;
		if (next !== editText) {
			void taskActions.updateSourceBlockRow(task.id, node.rowIndex, next);
		}
	}

	function handleTextareaKeydown(e: KeyboardEvent) {
		if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
			e.preventDefault();
			(e.currentTarget as HTMLTextAreaElement | null)?.blur();
			if (e.key === "Escape") {
				isEditing = false;
			}
		}
	}

	function handlePreviewKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			startEditing();
		}
	}

	function focusAndAutosize(node: HTMLTextAreaElement) {
		function resize() {
			node.style.height = "0px";
			node.style.height = `${node.scrollHeight}px`;
		}

		const focusTimer = setTimeout(() => node.focus(), 0);
		node.addEventListener("input", resize);
		resize();

		return {
			destroy() {
				clearTimeout(focusTimer);
				node.removeEventListener("input", resize);
			},
		};
	}
</script>

<div
	class="source-row"
	class:is-ignored-task={node.kind === "task" && node.taskVisibility === "ignored"}
	class:is-raw-list-item={rawListItemText !== null}
>
	<TaskLineRow {depth}>
		<svelte:fragment slot="marker">
			{#if node.kind === "task"}
				<TaskSourceStatusButton
					{task}
					{taskActions}
					{node}
					{isSelectionMode}
				/>
			{:else if rawListItemText !== null}
				<span class="source-row-bullet" aria-hidden="true"></span>
			{/if}
		</svelte:fragment>
		{#if isEditing}
			<textarea
				use:focusAndAutosize
				on:keydown={handleTextareaKeydown}
				on:blur={finishEditing}
				value={editText}
			></textarea>
		{:else}
			<button
				type="button"
				class="source-row-preview"
				on:click|stopPropagation={startEditing}
				on:keydown|stopPropagation={handlePreviewKeydown}
			>
				{previewText}
			</button>
		{/if}
	</TaskLineRow>
	<slot />
</div>

<style lang="scss">
	.source-row {
		--source-row-line-height: 1.3;
	}

	.source-row-preview {
		display: block;
		width: 100%;
		min-height: var(--task-line-row-height, 1.5rem);
		padding: 0;
		border: none;
		background: transparent;
		box-shadow: none;
		color: var(--text-normal);
		font: inherit;
		line-height: var(--source-row-line-height);
		text-align: left;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		cursor: text;

		&:hover,
		&:active {
			background: transparent;
			box-shadow: none;
		}

		&:focus-visible {
			outline: 2px solid var(--background-modifier-border-focus);
			outline-offset: 2px;
		}
	}

	textarea {
		cursor: text;
		background-color: var(--color-base-25);
		width: 100%;
		min-height: 1.6rem;
		resize: none;
	}

	.source-row-bullet {
		display: block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
	}

	.is-ignored-task .source-row-preview {
		color: var(--text-normal);
	}
</style>
