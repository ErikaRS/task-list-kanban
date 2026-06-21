<script lang="ts">
	import type { TaskActions } from "../tasks/actions";
	import {
		getSourceNodeText,
		getRawListItemText,
		type SourceBlockNode,
	} from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import TaskSourceStatusButton from "./TaskSourceStatusButton.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let node: SourceBlockNode;
	export let isSelectionMode = false;
	export let depth = 0;

	let isEditing = false;

	$: editText = getSourceNodeText(node).replaceAll("<br />", "\n");
	$: rawListItemText = node.kind === "raw" ? getRawListItemText(node) : null;
	$: previewText = (rawListItemText ?? editText).replaceAll("<br />", "\n");

	function depthClass(value: number): string {
		return `source-row-depth-${Math.min(value, 12)}`;
	}

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
	class={`source-row ${depthClass(depth)}`}
	class:is-ignored-task={node.kind === "task" && node.taskVisibility === "ignored"}
	class:is-raw-list-item={rawListItemText !== null}
>
	<div class="source-row-main">
		<div class="source-row-left">
			{#if node.kind === "task"}
				<TaskSourceStatusButton
					{task}
					{taskActions}
					{node}
					{isSelectionMode}
				/>
			{:else if rawListItemText !== null}
				<span class="source-row-bullet" aria-hidden="true"></span>
			{:else}
				<span class="source-row-spacer" aria-hidden="true"></span>
			{/if}
		</div>
		<div class="source-row-content">
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
		</div>
	</div>
	<slot />
</div>

<style lang="scss">
	.source-row {
		--source-row-base-padding-left: calc(var(--size-4-2) + 8px);
		--source-row-indent-step: 1.65rem;
	}

	.source-row-main {
		display: flex;
		align-items: flex-start;
		gap: var(--size-2-2);
		padding: 0 var(--size-4-2) var(--size-2-1) var(--source-row-base-padding-left);
	}

	@for $depth from 1 through 12 {
		.source-row-depth-#{$depth} > .source-row-main {
			padding-left: calc(
				var(--source-row-base-padding-left) + (#{$depth} * var(--source-row-indent-step))
			);
		}
	}

	.source-row-left {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		margin-top: 1px;
	}

	.source-row-content {
		flex: 1;
		min-width: 0;
	}

	.source-row-preview {
		display: block;
		width: 100%;
		min-height: 1.35rem;
		padding: 0;
		border: none;
		background: transparent;
		box-shadow: none;
		color: var(--text-normal);
		font: inherit;
		line-height: 1.3;
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

	.source-row-spacer {
		display: inline-block;
		width: 22px;
		height: 22px;
	}

	.source-row-bullet {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-muted);
	}

	.is-raw-list-item .source-row-main {
		gap: var(--size-2-3);
	}

	.is-ignored-task .source-row-preview {
		color: var(--text-normal);
	}
</style>
