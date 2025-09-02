<script lang="ts">
	import type { ColumnTagTable } from "../columns/columns";
	import { isDraggingStore } from "../dnd/store";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import TaskMenu from "./task_menu.svelte";
	import { Converter } from "showdown";
	import type { Readable } from "svelte/store";
	import { processWikilinksForHTML, isInternalLink, cleanLinkText } from "./wikilink-processor";

	export let task: Task;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let showFilepath: boolean;
	export let consolidateTags: boolean;

	const mdConverted = new Converter({
		simplifiedAutoLink: true,
		openLinksInNewWindow: true,
		emoji: true,
	});

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
			handleFocus();
		}
	}

	let isDragging = false;
	let isEditing = false;

	function handleDragStart(e: DragEvent) {
		handleContentBlur();
		isDragging = true;
		isDraggingStore.set({ fromColumn: task.column });
		if (e.dataTransfer) {
			e.dataTransfer.setData("text/plain", task.id);
			e.dataTransfer.dropEffect = "move";
		}
	}

	function handleDragEnd() {
		isDragging = false;
		isDraggingStore.set(null);
	}

	let textAreaEl: HTMLTextAreaElement | undefined;

	function handleFocus(e?: MouseEvent) {
		const target = (e?.target || e?.currentTarget) as
			| HTMLElement
			| undefined;
		if (target?.tagName.toLowerCase() === "a") {
			return;
		}

		isEditing = true;

		setTimeout(() => {
			textAreaEl?.focus();
		}, 100);
	}

	function handleLinkClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target?.tagName.toLowerCase() === "a") {
			e.preventDefault();
			e.stopPropagation();
			
			// Check if it's a wikilink first
			const wikilinkTarget = target.getAttribute("data-wikilink");
			if (wikilinkTarget) {
				// Handle Obsidian wikilink
				if (taskActions.app?.workspace) {
					taskActions.app.workspace.openLinkText(wikilinkTarget, "", 'tab');
				}
				return;
			}
			
			const href = target.getAttribute("href");
			if (!href) return;
			
			// Check if it's an internal markdown link (doesn't start with http/https/mailto/etc)
			if (isInternalLink(href)) {
				// Handle internal Obsidian link
				if (taskActions.app?.workspace) {
					// Clean up the link text - remove .md extension and decode URI
					const linkText = cleanLinkText(href);
					
					// Try to open as internal link with 'tab' option for new tab
					taskActions.app.workspace.openLinkText(linkText, "", 'tab');
				}
			} else {
				// Handle external link - open in browser
				window.open(href, "_blank");
			}
		}
	}

	function handleLinkHover(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target?.tagName.toLowerCase() === "a") {
			// Check if it's a wikilink first
			const wikilinkTarget = target.getAttribute("data-wikilink");
			if (wikilinkTarget) {
				// Handle Obsidian wikilink hover
				if (taskActions.app?.workspace?.trigger) {
					taskActions.app.workspace.trigger("hover-link", {
						event: e,
						source: "task-kanban",
						hoverParent: target.closest(".content-preview"),
						targetEl: target,
						linktext: wikilinkTarget,
						sourcePath: ""
					});
				}
				return;
			}
			
			const href = target.getAttribute("href");
			if (!href) return;
			
			// Only handle internal markdown links for hover preview
			if (isInternalLink(href)) {
				if (taskActions.app?.workspace?.trigger) {
					// Clean up the link text - remove .md extension and decode URI
					const linkText = cleanLinkText(href);
					
					// Trigger hover preview for internal links
					taskActions.app.workspace.trigger("hover-link", {
						event: e,
						source: "task-kanban",
						hoverParent: target.closest(".content-preview"),
						targetEl: target,
						linktext: linkText,
						sourcePath: ""
					});
				}
			}
		}
	}

	$: mdContent = mdConverted.makeHtml(
		processWikilinksForHTML(task.content) + (task.blockLink ? ` ^${task.blockLink}` : ""),
	);

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
	role="group"
	draggable={!isEditing}
	on:dragstart={handleDragStart}
	on:dragend={handleDragEnd}
>
	<div class="task-body">
		<div class="task-content">
			{#if isEditing}
				<textarea
					class:editing={isEditing}
					bind:this={textAreaEl}
					on:keypress={handleKeypress}
					on:blur={handleContentBlur}
					on:input={onInput}
					value={task.content.replaceAll("<br />", "\n")}
				/>
			{:else}
				<div
					role="button"
					class="content-preview"
					on:mouseup={handleFocus}
					on:keypress={handleOpenKeypress}
					on:click={handleLinkClick}
					on:mouseover={handleLinkHover}
					tabindex="0"
				>
					{@html mdContent}
				</div>
			{/if}
		</div>
		<TaskMenu {task} {taskActions} {columnTagTableStore} />
	</div>
	{#if showFilepath}
		<div class="task-footer">
			<p>{task.path}</p>
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

		.task-body {
			padding: var(--size-4-2);
			display: grid;
			gap: var(--size-4-2);
			grid-template-columns: 1fr auto;

			p {
				word-break: break-word;
				margin: 0;
			}

			.task-content {
				display: grid;

				textarea {
					cursor: text;
					background-color: var(--color-base-25);
					width: 100%;
				}

				.content-preview {
					&:focus-within {
						box-shadow: 0 0 0 3px
							var(--background-modifier-border-focus);
					}
				}
			}
		}

		.task-footer {
			border-top: var(--border-width) solid
				var(--background-modifier-border);
			padding: var(--size-4-2);
			padding-top: 0;

			p {
				margin: 0;
				font-size: var(--font-ui-smaller);
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

	:global(.task-content *) {
		word-break: break-word;
		margin: 0;
	}
</style>
