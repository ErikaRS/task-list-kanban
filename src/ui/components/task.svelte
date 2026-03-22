<script lang="ts">
	import type { ColumnTag, ColumnTagTable, DefaultColumns } from "../columns/columns";
	import { isDraggingStore } from "../dnd/store";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import TaskMenu from "./task_menu.svelte";
	import Icon from "./icon.svelte";
	import { Component, Keymap, MarkdownRenderer, type App } from "obsidian";
	import type { Readable } from "svelte/store";
	import { onDestroy } from "svelte";

	export let app: App;
	export let task: Task;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let showFilepath: boolean;
	export let consolidateTags: boolean;
	export let displayColumn: ColumnTag | DefaultColumns;
	export let isSelectionMode: boolean = false;
	export let isSelected: boolean = false;
	export let onToggleSelection: () => void = () => {};
	export let selectedTaskIds: string[] = [];
	export let doneColumnName: string | undefined = undefined;

	function handleContentBlur() {
		isEditing = false;

		const content = textAreaEl?.value;
		if (!content) return;

		const updatedContent = content.replaceAll("\n", "<br />");

		taskActions.updateContent(task.id, updatedContent);
	}

	function handleKeypress(e: KeyboardEvent) {
		if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
			textAreaEl?.blur();
		}
	}

	function handleOpenKeypress(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			handleFocus(e);
		}
	}

	let isEditing = false;
	let isDragging = false;

	function handleDragStart(e: DragEvent) {
		handleContentBlur();
		isDragging = true;

		// In selection mode with this task selected, drag all selected tasks
		const taskIds =
			isSelectionMode && isSelected && selectedTaskIds.length > 0
				? selectedTaskIds
				: [task.id];

		isDraggingStore.set({ fromColumn: displayColumn, draggedTaskIds: taskIds });

		if (e.dataTransfer) {
			e.dataTransfer.setData("text/plain", task.id);
			e.dataTransfer.dropEffect = "move";
		}

		// Create a custom drag image for multi-task drag
		if (taskIds.length > 1 && e.dataTransfer) {
			const ghost = document.createElement("div");
			ghost.textContent = `Moving ${taskIds.length} tasks`;
			ghost.style.cssText = [
				"position:fixed",
				"top:-9999px",
				"left:-9999px",
				"padding:6px 12px",
				"background:var(--background-secondary-alt)",
				"border:1px solid var(--background-modifier-border)",
				"border-radius:var(--radius-m)",
				"font-size:var(--font-ui-small)",
				"color:var(--text-normal)",
				"box-shadow:var(--shadow-s)",
				"white-space:nowrap",
			].join(";");
			document.body.appendChild(ghost);
			e.dataTransfer.setDragImage(ghost, 0, 0);
			setTimeout(() => document.body.removeChild(ghost), 0);
		}
	}

	function handleDragEnd() {
		isDragging = false;
		isDraggingStore.set(null);
	}

	let textAreaEl: HTMLTextAreaElement | undefined;
	let previewContainerEl: HTMLDivElement | undefined;
	let markdownComponent: Component | undefined;

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

			// Allow activation from the preview container itself.
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

		isEditing = true;

		setTimeout(() => {
			textAreaEl?.focus();
		}, 100);
	}

	function renderTaskMarkdown() {
		const contentWithBlockLink = (task.content + (task.blockLink ? ` ^${task.blockLink}` : ""))
			.replaceAll("<br />", "\n");
		const indentedContinuationLines = contentWithBlockLink.replaceAll("\n", "\n  ");
		return `- [${task.displayStatus}] ${indentedContinuationLines}`;
	}

	// Render markdown content using Obsidian's MarkdownRenderer
	async function renderMarkdown(selectionMode: boolean) {
		if (!previewContainerEl) return;

		// Unload previous component before re-rendering
		if (markdownComponent) {
			markdownComponent.unload();
		}

		// Clear the container
		previewContainerEl.empty();

		// Create new component for this task
		markdownComponent = new Component();

		// Render with full task markdown to preserve Obsidian status DOM/styling.
		const contentToRender = renderTaskMarkdown();
		await MarkdownRenderer.render(
			app,
			contentToRender,
			previewContainerEl,
			task.path,
			markdownComponent
		);

		// Set up event handlers after rendering
		setupLinkHandlers();
		postProcessRenderedContent(selectionMode);
	}

	// Set up click and hover handlers for internal links
	function setupLinkHandlers() {
		if (!previewContainerEl) return;

		const internalLinks = previewContainerEl.querySelectorAll("a.internal-link");

		internalLinks.forEach((link) => {
			const anchorEl = link as HTMLAnchorElement;

			// Click handler — delegate to Obsidian's native modifier handling
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

			// Hover handler for preview
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

	// Post-process rendered content for safety and compatibility
	function postProcessRenderedContent(selectionMode: boolean) {
		if (!previewContainerEl) return;

		function stopPropagation(e: Event) {
			e.stopPropagation();
		}

		function handlePrimaryCheckboxClick(e: Event) {
			e.preventDefault();
			e.stopPropagation();
			void taskActions.toggleDone(task.id);
		}

		// External links: open in new tab with security attributes
		previewContainerEl.querySelectorAll('a:not(.internal-link)').forEach((a) => {
			const anchor = a as HTMLAnchorElement;
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
			// Prevent link activation from triggering edit mode
			anchor.addEventListener('click', stopPropagation);
			anchor.addEventListener('keypress', stopPropagation);
		});

		const checkboxes = Array.from(
			previewContainerEl.querySelectorAll('input[type="checkbox"]')
		) as HTMLInputElement[];
		const [primaryCheckbox, ...nestedCheckboxes] = checkboxes;

		if (primaryCheckbox) {
			primaryCheckbox.classList.add("task-primary-checkbox");
			primaryCheckbox.addEventListener('mousedown', stopPropagation);
			primaryCheckbox.addEventListener('mouseup', stopPropagation);
			primaryCheckbox.addEventListener('keypress', stopPropagation);

			if (selectionMode) {
				primaryCheckbox.disabled = true;
				primaryCheckbox.tabIndex = -1;
				primaryCheckbox.style.visibility = "hidden";
				primaryCheckbox.setAttribute("aria-hidden", "true");
				primaryCheckbox.addEventListener('click', stopPropagation);
			} else {
				primaryCheckbox.disabled = false;
				primaryCheckbox.style.removeProperty("visibility");
				primaryCheckbox.removeAttribute("aria-hidden");
				primaryCheckbox.setAttribute(
					"aria-label",
					task.done ? "Mark as incomplete" : "Mark as complete"
				);
				primaryCheckbox.addEventListener('click', handlePrimaryCheckboxClick);
			}
		}

		// Nested markdown checkboxes are always non-interactive.
		nestedCheckboxes.forEach((checkbox) => {
			checkbox.classList.add("task-nested-checkbox");
			checkbox.disabled = true;
			checkbox.tabIndex = -1;
			checkbox.addEventListener('click', stopPropagation);
			checkbox.addEventListener('keypress', stopPropagation);
		});

		// Remove heavy/interactive embeds that don't work well in small cards
		previewContainerEl.querySelectorAll('iframe, audio, video').forEach((el) => {
			el.remove();
		});
	}

	// Re-render when task content changes
	$: if (task && !isEditing && previewContainerEl) {
		void renderMarkdown(isSelectionMode);
	}

	// Cleanup on destroy
	onDestroy(() => {
		if (markdownComponent) {
			markdownComponent.unload();
		}
	});

	$: {
		if (textAreaEl) {
			textAreaEl.style.height = `0px`;
			textAreaEl.style.height = `${textAreaEl.scrollHeight}px`;
		}
	}

	function onInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
		e.currentTarget.style.height = `0px`;
		e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
	}

	$: shouldconsolidateTags = consolidateTags && task.tags.size > 0;
</script>

	<div
		class="task"
		class:is-dragging={isDragging}
		class:is-selected={isSelectionMode && isSelected}
		class:is-selection-mode={isSelectionMode}
		role="group"
		draggable={!isEditing}
		on:dragstart={handleDragStart}
		on:dragend={handleDragEnd}
>
	<!-- Task row -->
	<div class="task-row">
		<div class="task-row-left">
			{#if isSelectionMode}
				<!-- Selection checkbox (square icons) -->
					<button
						class="icon-button select-task"
						class:is-selected={isSelected}
						role="checkbox"
						aria-label={isSelected ? "Deselect for bulk actions" : "Select for bulk actions"}
						aria-checked={isSelected}
						title={isSelected ? "Deselect for bulk actions" : "Select for bulk actions"}
					on:click={onToggleSelection}
					on:keydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onToggleSelection();
						}
					}}
					tabindex="0"
				>
					<Icon
						name={isSelected ? "lucide-check-square" : "lucide-square"}
						size={18}
						opacity={isSelected ? 1 : 0.5}
					/>
				</button>
			{/if}
		</div>
		<div class="task-row-content">
			{#if isEditing}
				<textarea
					class:editing={isEditing}
					bind:this={textAreaEl}
					on:keypress={handleKeypress}
					on:blur={handleContentBlur}
					on:input={onInput}
					value={task.content.replaceAll("<br />", "\n")}
				></textarea>
			{:else}
				<div
					role="button"
					class="content-preview markdown-rendered"
					bind:this={previewContainerEl}
					on:mouseup={handleFocus}
					on:keypress={handleOpenKeypress}
					tabindex="0"
				></div>
			{/if}
		</div>
		<div class="task-row-right">
			<TaskMenu {task} {taskActions} {columnTagTableStore} {doneColumnName} />
		</div>
	</div>

	{#if showFilepath}
		<div class="task-footer">
			<button
				class="go-to-file-button"
				aria-label="Go to file"
				title="Go to file"
				on:click={(e) => taskActions.viewFile(task.id, e)}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						taskActions.viewFile(task.id, e);
					}
				}}
				tabindex="0"
			>
				<Icon name="lucide-arrow-up-right" size={18} opacity={0.5} />
				<span class="file-path">{task.path}</span>
			</button>
		</div>
	{/if}
	{#if shouldconsolidateTags}
		<div class="task-tags">
			{#each task.tags as tag}
				<span>
					<!-- prettier-ignore -->
					<span class="cm-formatting cm-formatting-hashtag cm-hashtag cm-hashtag-begin cm-list-1">#</span><span
						class="cm-hashtag cm-hashtag-end cm-list-1">{tag}</span
					>
				</span>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.task {
		background-color: var(--background-secondary-alt);
		border-radius: var(--radius-m);
		border: var(--border-width) solid var(--background-modifier-border);
		cursor: grab;

		&.is-dragging {
			opacity: 0.15;
		}

		&.is-selected {
			border-color: var(--interactive-accent);
			background-color: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-secondary-alt));
		}

		// Task row
			.task-row {
				padding: var(--size-4-2);
				padding-inline-start: calc(var(--size-4-2) + 8px);
				display: flex;
				gap: var(--size-4-1);
				align-items: flex-start;

				.task-row-left {
					display: flex;
					align-items: center;
					flex-shrink: 0;
				}

			.task-row-content {
				flex: 1;
				min-width: 0; // Allow text to wrap properly

				textarea {
					cursor: text;
					background-color: var(--color-base-25);
					width: 100%;
				}

				.content-preview {
					min-height: 1.5rem;

					&:focus-within {
						box-shadow: 0 0 0 3px
							var(--background-modifier-border-focus);
					}
				}
			}

				.task-row-right {
					display: flex;
					align-items: center;
					flex-shrink: 0;
				}
			}

			&.is-selection-mode {
				.task-row {
					.task-row-left {
						width: 0;
						flex: 0 0 0;
						overflow: visible;
						z-index: 1;
					}
				}

				.select-task {
					// Keep text position fixed while moving the icon into the native checkbox lane.
					transform: translateX(calc(var(--size-4-2) * -1));
				}
			}

		// Icon button styling
		.icon-button {
			display: flex;
			justify-content: center;
			align-items: center;
			width: 24px;
			height: 24px;
			padding: 0;
			border: none;
			background: transparent;
			cursor: pointer;
			border-radius: var(--radius-s);
			transition: opacity 0.2s ease;
			box-shadow: none;

			&:hover,
			&:active {
				background: transparent;
				box-shadow: none;
			}

			&:focus-visible {
				outline: 2px solid var(--background-modifier-border-focus);
				outline-offset: 2px;
			}

			&.select-task {
				&:hover :global(svg) {
					opacity: 0.8 !important;
					color: var(--interactive-accent);
				}

				&.is-selected :global(svg) {
					color: var(--interactive-accent);
				}
			}
		}

		.task-footer {
			border-top: var(--border-width) solid
				var(--background-modifier-border);
			padding: var(--size-4-2);
			padding-top: var(--size-4-1);

			.go-to-file-button {
				display: flex;
				align-items: center;
				justify-content: flex-start;
				gap: var(--size-2-1);
				width: 100%;
				padding: 0;
				border: none;
				background: transparent;
				cursor: pointer;
				text-align: left;
				box-shadow: none;
				transition: opacity 0.2s ease;
				border-radius: var(--radius-s);

				&:hover {
					background: transparent;
					box-shadow: none;

					:global(svg) {
						opacity: 1 !important;
						color: var(--interactive-accent);
					}

					.file-path {
						color: var(--interactive-accent);
					}
				}

				&:focus-visible {
					outline: 2px solid var(--background-modifier-border-focus);
					outline-offset: 2px;
				}

				.file-path {
					margin: 0;
					font-size: var(--font-ui-smaller);
					color: var(--text-muted);
					transition: color 0.2s ease;
					overflow-wrap: anywhere;
					white-space: normal;
					flex: 1;
					min-width: 0;
					line-height: 1.3;
				}
			}
		}

		.task-tags {
			display: flex;
			flex-wrap: wrap;
			gap: var(--size-4-1) var(--size-2-1);
			padding: var(--size-4-2) var(--size-2-2);
			padding-top: 0;
		}
	}

	:global(.task-row-content img) {
		max-width: 100%;
		max-height: 160px;
		object-fit: contain;
	}

	:global(.task-row-content code) {
		white-space: pre-wrap;
	}

	:global(.task-row-content .content-preview),
	:global(.task-row-content .content-preview > ul),
	:global(.task-row-content .content-preview > ul > li),
	:global(.task-row-content .content-preview > ul > li > p) {
		margin: 0;
	}

	:global(.task .task-row-content .content-preview > ul) {
		padding-left: var(--size-4-4, 16px);
	}

	:global(.task-row-content .content-preview .task-list-item) {
		min-width: 0;
		word-break: break-word;
	}

	:global(.task-row-content input.task-nested-checkbox) {
		pointer-events: none;
	}

	:global(.task-row-content .content-preview .task-list-item > input[type="checkbox"]) {
		margin-right: var(--size-2-2);
		transform: translateY(2px);
	}

	:global(.task-row-content .content-preview .task-list-item > *:not(input[type="checkbox"])) {
		min-width: 0;
	}
</style>
