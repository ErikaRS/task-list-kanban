<script lang="ts">
	import { onDestroy } from "svelte";
	import { Modal, Component, Keymap, MarkdownRenderer, Notice, Platform, type App } from "obsidian";
	import type { TaskActions } from "../tasks/actions";
	import {
		getSourceNodePreview,
		getRawListItemText,
		type SourceBlockNode,
	} from "../tasks/source_block";
	import type { Task } from "../tasks/task";
	import MarkdownBodyEditor from "./MarkdownBodyEditor.svelte";
	import MobileEditorSheet from "./MobileEditorSheet.svelte";
	import { editableMarkdownSource, type MarkdownSource } from "../tasks/markdown_source";
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
	let editTarget: {
		id: string;
		row: number;
		source?: MarkdownSource;
		initialContent: string;
	} | null = null;
	let draftContent = "";

	let isDragging = false;
	let isDraggedOver = false;
	let dropBefore = false;
	let dropAfter = false;
	let dragIndicatorDepth = depth;

	let previewContainerEl: HTMLDivElement | undefined;
	let markdownComponent: Component | undefined;

	$: isListItem = node.kind === "task" || (node.source ? !!node.source.listPrefix : getRawListItemText(node) !== null);
	$: previewText = getSourceNodePreview(node);

	$: if (!$subtaskDraggingStore) {
		isDraggedOver = false;
		dropBefore = false;
		dropAfter = false;
	}

	const interactiveTagNames = new Set([
		"a",
		"button",
		"input",
		"select",
		"textarea",
		"label",
		"summary",
		"details",
	]);

	function eventHasInteractiveTarget(e?: Event): boolean {
		const path = e?.composedPath() || [];
		const currentTarget = e?.currentTarget;
		for (const element of path) {
			if (!(element instanceof HTMLElement)) {
				continue;
			}

			if (currentTarget instanceof HTMLElement && element === currentTarget) {
				continue;
			}

			if (interactiveTagNames.has(element.tagName.toLowerCase())) {
				return true;
			}

			if (element.isContentEditable) {
				return true;
			}

			const role = element.getAttribute("role");
			if (role === "button" || role === "checkbox" || role === "link") {
				return true;
			}
		}

		return false;
	}

	function handleFocus(e?: Event) {
		if (eventHasInteractiveTarget(e)) {
			return;
		}

		startEditing();
	}

	function startEditing() {
		if (editTarget) return;
		draftContent = task.getSourceNodeEditContent(node);
		editTarget = {
			id: task.id,
			row: node.rowIndex,
			source: node.source ? editableMarkdownSource(node.source) : undefined,
			initialContent: draftContent,
		};
	}

	async function save(content: string) {
		if (!editTarget) return;
		await taskActions.updateSourceBlockRow(editTarget.id, editTarget.row, content, editTarget.source);
	}

	async function renderMarkdown() {
		if (!previewContainerEl) return;

		if (markdownComponent) {
			markdownComponent.unload();
		}

		previewContainerEl.empty();
		markdownComponent = new Component();

		await MarkdownRenderer.render(
			app,
			previewText,
			previewContainerEl,
			task.path,
			markdownComponent
		);

		setupLinkHandlers();
		postProcessRenderedContent();
	}

	function setupLinkHandlers() {
		if (!previewContainerEl) return;

		const internalLinks = previewContainerEl.querySelectorAll("a.internal-link");

		internalLinks.forEach((link) => {
			const anchorEl = link as HTMLAnchorElement;

			anchorEl.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				const linkTarget = anchorEl.getAttribute("data-href");
				if (linkTarget && app) {
					app.workspace.openLinkText(
						linkTarget,
						task.path,
						Keymap.isModEvent(e),
					);
				}
			});

			anchorEl.addEventListener("mouseover", (e) => {
				const linkTarget = anchorEl.getAttribute("data-href");
				if (linkTarget && app && previewContainerEl) {
					app.workspace.trigger("hover-link", {
						event: e,
						source: "kanban-view",
						hoverParent: previewContainerEl,
						targetEl: anchorEl,
						linktext: linkTarget,
						sourcePath: task.path,
					});
				}
			});
		});
	}

	function postProcessRenderedContent() {
		if (!previewContainerEl) return;

		function stopPropagation(e: Event) {
			e.stopPropagation();
		}

		previewContainerEl.querySelectorAll('a:not(.internal-link)').forEach((a) => {
			const anchor = a as HTMLAnchorElement;
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
			anchor.addEventListener('click', stopPropagation);
			anchor.addEventListener('keypress', stopPropagation);
		});

		previewContainerEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => {
			input.disabled = true;
			input.tabIndex = -1;
		});
		if (node.kind === "task") {
			previewContainerEl.querySelector(":scope > ul > li.task-list-item > input.task-list-item-checkbox, :scope > ul > li.task-list-item > p > input.task-list-item-checkbox")?.remove();
		}
		// The row owns its marker. Unwrap only this item's generated list container
		// so host list/LI indentation cannot add a second gap before its text.
		if (isListItem) {
			const list = previewContainerEl.querySelector(":scope > ul, :scope > ol");
			const item = list?.firstElementChild;
			if (list?.children.length === 1 && item?.tagName === "LI") {
				item.querySelectorAll(":scope > .list-bullet, :scope > p > .list-bullet").forEach(marker => marker.remove());
				list.replaceWith(...Array.from(item.childNodes));
			}
		}

		// Remove heavy/interactive embeds that don't work well in small cards
		previewContainerEl.querySelectorAll('iframe, audio, video').forEach((el) => {
			el.remove();
		});
	}

	let lastRenderedMarkdownKey = "";
	$: if (editTarget) lastRenderedMarkdownKey = "";
	$: if (previewText && previewContainerEl && !editTarget) {
		const markdownKey = JSON.stringify({
			source: previewText,
			path: task.path,
		});
		if (markdownKey !== lastRenderedMarkdownKey) {
			lastRenderedMarkdownKey = markdownKey;
			void renderMarkdown();
		}
	}

	onDestroy(() => {
		if (markdownComponent) {
			markdownComponent.unload();
		}
	});

	function handlePreviewKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			if (eventHasInteractiveTarget(e)) {
				return;
			}
			e.preventDefault();
			startEditing();
		}
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
		if (editTarget) {
			e.preventDefault();
			return;
		}
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

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
		taskActions.moveSourceBlockRow(
			task.id,
			draggedRowIndex,
			node.rowIndex,
			position,
			dragIndicatorDepth,
		).catch((error: unknown) => {
			new Notice(`Could not move subtask: ${error instanceof Error ? error.message : String(error)}`);
		});
		dropBefore = false;
		dropAfter = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="source-row"
	class:is-ignored-task={node.kind === "task" && node.taskVisibility === "ignored"}
	class:is-source-list-item={isListItem}
	class:is-dragging={isDragging}
	class:is-dragged-over={isDraggedOver}
	class:drop-before={isDraggedOver && dropBefore}
	class:drop-after={isDraggedOver && dropAfter}
	style:--drag-indicator-depth={dragIndicatorDepth}
	draggable={!editTarget}
	on:dragstart={handleDragStart}
	on:dragend={handleDragEnd}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
>
	<TaskLineRow {depth} hasActions={true}>
		<svelte:fragment slot="marker">
			{#if !editTarget && node.kind === "task"}
				<TaskSourceStatusButton
					{task}
					{taskActions}
					{node}
				/>
			{:else if !editTarget && isListItem}
				<span class="source-row-list-marker" aria-hidden="true">{node.source?.listPrefix.trim().match(/^\d/) ? node.source.listPrefix.trim() : "•"}</span>
			{/if}
		</svelte:fragment>
		{#if editTarget && !Platform.isMobile}
			<MarkdownBodyEditor
				initialContent={editTarget.initialContent}
				onSave={save}
				onClose={() => editTarget = null}
			/>
		{:else}
			<div
				role="button"
				tabindex="0"
				class="source-row-preview markdown-rendered"
				bind:this={previewContainerEl}
				on:mouseup={handleFocus}
				on:keydown={handlePreviewKeydown}
			></div>
		{/if}
		<svelte:fragment slot="actions">
			{#if !isSelectionMode && !editTarget}
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

{#if editTarget && Platform.isMobile}
	<MobileEditorSheet
		title={node.kind === "task" ? "Edit subtask" : "Edit note"}
		context={task.path}
		bind:content={draftContent}
		onSave={() => save(draftContent)}
		onClose={() => editTarget = null}
	/>
{/if}

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
		white-space: normal;
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

	.source-row-list-marker {
		display: inline-block;
		min-width: 20px;
		text-align: center;
		color: var(--text-muted);
	}

	.is-ignored-task .source-row-preview {
		color: var(--text-normal);
	}
</style>
