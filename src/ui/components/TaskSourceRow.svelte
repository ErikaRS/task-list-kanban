<script lang="ts">
	import { Modal, type App } from "obsidian";
	import type { TaskActions } from "../tasks/actions";
	import {
		getSourceNodeText,
		getRawListItemText,
		type SourceBlockNode,
	} from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import TaskLineRow from "./TaskLineRow.svelte";
	import TaskSourceStatusButton from "./TaskSourceStatusButton.svelte";
	import Icon from "./icon.svelte";
	import { subtaskDraggingStore } from "../dnd/store";

	export let app: App;
	export let task: Task;
	export let taskActions: TaskActions;
	export let node: SourceBlockNode;
	export let isSelectionMode = false;
	export let depth = 0;

	let isEditing = false;
	let isDragging = false;
	let isDraggedOver = false;
	let dropBefore = false;
	let dropAfter = false;
	let dragIndicatorDepth = depth;

	$: rawListItemText = node.kind === "raw" ? getRawListItemText(node) : null;
	$: editText = (rawListItemText ?? getSourceNodeText(node)).replaceAll("<br />", "\n");
	$: previewText = (rawListItemText ?? editText).replaceAll("<br />", "\n");

	$: if (!$subtaskDraggingStore) {
		isDraggedOver = false;
		dropBefore = false;
		dropAfter = false;
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

	class ConfirmDeleteSubtaskModal extends Modal {
		constructor(
			app: App,
			private readonly subtaskText: string,
			private readonly onConfirm: () => void,
		) {
			super(app);
		}

		onOpen() {
			this.contentEl.addClass("task-list-kanban-confirm-modal");
			this.contentEl.createEl("h2", { text: "Delete subtask?" });
			this.contentEl.createEl("p", {
				text: `Are you sure you want to delete "${this.subtaskText}" and all its nested items? This action cannot be undone.`,
			});

			const actions = this.contentEl.createDiv({ cls: "confirm-modal-actions" });
			const cancelButton = actions.createEl("button", { text: "Cancel" });
			cancelButton.addEventListener("click", () => this.close());

			const deleteButton = actions.createEl("button", { text: "Delete", cls: "mod-warning" });
			deleteButton.addEventListener("click", () => {
				this.onConfirm();
				this.close();
			});
			window.requestAnimationFrame(() => cancelButton.focus());
		}

		onClose() {
			this.contentEl.empty();
		}
	}

	function handleDeleteClick() {
		const text = node.kind === "task" ? node.content : node.rawLine.trim();
		new ConfirmDeleteSubtaskModal(app, text, () => {
			void taskActions.deleteSourceBlockRow(task.id, node.rowIndex);
		}).open();
	}

	function handleDragStart(e: DragEvent) {
		e.stopPropagation();
		isDragging = true;
		subtaskDraggingStore.set({
			taskId: task.id,
			draggedRowIndex: node.rowIndex,
			draggedIndentation: node.indentation,
		});
		if (e.dataTransfer) {
			e.dataTransfer.setData("text/plain", `${task.id}:${node.rowIndex}`);
			e.dataTransfer.dropEffect = "move";
		}
	}

	function handleDragEnd(e: DragEvent) {
		e.stopPropagation();
		isDragging = false;
		subtaskDraggingStore.set(null);
	}

	function handleDragOver(e: DragEvent) {
		if (!$subtaskDraggingStore || $subtaskDraggingStore.taskId !== task.id) return;
		if ($subtaskDraggingStore.draggedRowIndex === node.rowIndex) return;

		e.preventDefault();
		e.stopPropagation();
		isDraggedOver = true;

		const rect = e.currentTarget.getBoundingClientRect();
		const relativeY = e.clientY - rect.top;
		dropBefore = relativeY < rect.height / 2;
		dropAfter = !dropBefore;

		const mouseX = e.clientX - rect.left;
		const hoveredRowDepth = depth;
		const maxDepth = dropBefore ? hoveredRowDepth : hoveredRowDepth + 1;
		// Base padding (20px) + indentation steps (26px each)
		dragIndicatorDepth = Math.min(maxDepth, Math.max(1, Math.floor((mouseX - 20) / 26)));
	}

	function handleDragLeave(e: DragEvent) {
		e.stopPropagation();
		isDraggedOver = false;
		dropBefore = false;
		dropAfter = false;
	}

	function handleDrop(e: DragEvent) {
		if (!$subtaskDraggingStore || $subtaskDraggingStore.taskId !== task.id) return;
		e.preventDefault();
		e.stopPropagation();
		isDraggedOver = false;

		const draggedRowIndex = $subtaskDraggingStore.draggedRowIndex;
		subtaskDraggingStore.set(null);

		const position = dropBefore ? "before" : "after";
		void taskActions.moveSourceBlockRow(
			task.id,
			draggedRowIndex,
			node.rowIndex,
			position,
			dragIndicatorDepth,
		);
		dropBefore = false;
		dropAfter = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="source-row"
	class:is-ignored-task={node.kind === "task" && node.taskVisibility === "ignored"}
	class:is-raw-list-item={rawListItemText !== null}
	class:is-dragging={isDragging}
	class:is-dragged-over={isDraggedOver}
	class:drop-before={isDraggedOver && dropBefore}
	class:drop-after={isDraggedOver && dropAfter}
	style:--drag-indicator-depth={dragIndicatorDepth}
	draggable={!isEditing}
	on:dragstart={handleDragStart}
	on:dragend={handleDragEnd}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
>
	<TaskLineRow {depth} hasActions={true}>
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
		<svelte:fragment slot="actions">
			{#if !isSelectionMode}
				<button
					type="button"
					class="delete-subtask-btn"
					aria-label="Delete subtask"
					title="Delete subtask"
					on:click|stopPropagation={handleDeleteClick}
				>
					<Icon name="lucide-x" size={14} opacity={0.6} />
				</button>
			{/if}
		</svelte:fragment>
	</TaskLineRow>
	<slot />
</div>

<style lang="scss">
	.source-row {
		--source-row-line-height: 1.3;
		position: relative;

		&.is-dragging {
			opacity: 0.4;
		}

		&.drop-before::before,
		&.drop-after::before {
			content: "";
			position: absolute;
			left: calc(var(--task-line-base-padding-left, 20px) + (var(--drag-indicator-depth, 0) * var(--task-line-indent-step, 26px)));
			right: 8px;
			height: 2px;
			background: var(--interactive-accent);
			pointer-events: none;
		}

		&.drop-before::after,
		&.drop-after::after {
			content: "";
			position: absolute;
			left: calc(var(--task-line-base-padding-left, 20px) + (var(--drag-indicator-depth, 0) * var(--task-line-indent-step, 26px)) - 8px);
			width: 10px;
			height: 10px;
			border-radius: 999px;
			background: var(--interactive-accent);
			pointer-events: none;
		}

		&.drop-before::before {
			top: -1px;
		}

		&.drop-before::after {
			top: -5px;
		}

		&.drop-after::before {
			bottom: -1px;
		}

		&.drop-after::after {
			bottom: -5px;
		}
	}

	.delete-subtask-btn {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		opacity: 0;
		transition: opacity 0.15s ease, color 0.15s ease;
		box-shadow: none;

		&:hover {
			color: var(--text-error, var(--text-accent));
			background: transparent;
			box-shadow: none;
		}
	}

	.source-row:hover .delete-subtask-btn {
		opacity: 0.8;
	}

	.delete-subtask-btn:hover {
		opacity: 1 !important;
	}

	.source-row-preview {
		display: block;
		width: 100%;
		height: auto;
		min-height: var(--task-line-row-height, 1.5rem);
		appearance: none;
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
