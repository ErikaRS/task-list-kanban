<!--
	Card display shared by the full board (task.svelte) and the read-only
	embedded board (SPEC 0057). Card display changes belong here, not in
	task.svelte, or embeds silently stop matching the board. Interactive
	pieces enter through slots: `marker` (defaults to a static status
	marker), `editor` (shown in place of the preview while editing),
	`actions`, `after-source-rows`, and `date-fields`. See the embed parity
	matrix in README.architecture.md.
-->
<script lang="ts">
	import type { App, Component } from "obsidian";
	import { onDestroy } from "svelte";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import { getVisibleSourceTaskDescendants } from "../tasks/source_block";
	import TaskLineRow from "./TaskLineRow.svelte";
	import TaskSourceRows from "./TaskSourceRows.svelte";
	import TaskStatusMarker from "./TaskStatusMarker.svelte";
	import Icon from "./icon.svelte";
	import { PropertyDisplayMode } from "../settings/settings_store";
	import { PropertySchemaOption } from "../../parsing/properties/property_schema";
	import { EDITABLE_DATE_PROPERTY_KEYS, getPropertyWriteAdapter } from "../../parsing/properties/write";
	import { toDisplayProperties, stripDisplayedPropertiesFromContent } from "../../parsing/properties/display";
	import { renderTaskMarkdownSource } from "./task_markdown";
	import { PRIMARY_CHECKBOX_SELECTOR, renderCardMarkdown } from "./card_markdown";

	export let app: App;
	export let task: Task;
	export let showFilepath: boolean;
	export let propertyDisplay: PropertyDisplayMode = PropertyDisplayMode.None;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let consolidateTags: boolean;
	export let excludedTags: string[] = [];
	export let treatNestedTasksAsSubtasks: boolean = false;
	/** Dense list card (SPEC 0055). */
	export let dense = false;
	/** Board cards edit, drag, and select; embedded cards only display. */
	export let interactive = true;
	/** Write access for source rows; omitted, they render read-only. */
	export let taskActions: TaskActions | undefined = undefined;
	export let isSelectionMode = false;

	// Card chrome state owned by the wrapper.
	export let isDragging = false;
	export let isSelected = false;
	export let denseToolbarVisible = false;
	export let draggable = false;
	export let accentColor: string | undefined = undefined;
	export let onDragStart: ((e: DragEvent) => void) | undefined = undefined;
	export let onDragEnd: ((e: DragEvent) => void) | undefined = undefined;

	/** The parent-text editor is open: the `editor` slot replaces the preview. */
	export let isEditing = false;
	/** The date editor is open: date chips give way to the `date-fields` slot. */
	export let isEditingDates = false;
	/** Called on mouseup, Enter, or Space in the preview (interactive only). */
	export let onPreviewActivate: ((e: Event) => void) | undefined = undefined;
	/** Called when the rendered primary checkbox is clicked; omitted, it is inert. */
	export let onPrimaryCheckboxClick: (() => void) | undefined = undefined;
	/** Called from the file-path footer; omitted, the path is plain text. */
	export let onOpenFile: ((e: MouseEvent | KeyboardEvent) => void) | undefined = undefined;
	/** The rendered preview element, for the wrapper's hit-testing. */
	export let previewContainerEl: HTMLDivElement | undefined = undefined;

	let markdownComponent: Component | undefined;
	let isSubtasksCollapsed = false;
	function toggleSubtasksCollapse() {
		isSubtasksCollapsed = !isSubtasksCollapsed;
	}

	const editableDatePropertyKeys = new Set<string>(EDITABLE_DATE_PROPERTY_KEYS);

	function handlePreviewKeypress(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			onPreviewActivate?.(e);
		}
	}

	function renderTaskMarkdown() {
		let body = task.content;

		if (task.properties) {
			if (propertyDisplay === PropertyDisplayMode.Pretty) {
				// In Pretty mode, displayed properties are moved to the chip strip, so
				// hide their raw text from the body (mirrors the consolidated-tag footer).
				body = stripDisplayedPropertiesFromContent(body, task.properties);
			} else if (dateEditingEnabled) {
				body = stripDisplayedPropertiesFromContent(body, dateProperties);
			}
		}

		const trailingSpaces = task.originalLine.match(/ {2,}$/)?.[0];
		if (trailingSpaces) body = body.replace(/[ \t]*$/, trailingSpaces);
		return renderTaskMarkdownSource({
			content: body + (task.previewContinuation ? "\n" + task.previewContinuation : ""),
			displayStatus: task.displayStatus,
			blockLink: task.blockLink,
			excludedTags,
			referenceDefinitions: task.source?.referenceDefinitions,
		});
	}

	// Render with full task markdown to preserve Obsidian status DOM/styling.
	async function renderMarkdown(checkboxEnabled: boolean) {
		if (!previewContainerEl) return;
		await renderCardMarkdown({
			app,
			container: previewContainerEl,
			markdown: renderTaskMarkdown(),
			sourcePath: task.path,
			previous: markdownComponent,
			onComponent: (component) => (markdownComponent = component),
			postProcess: (container) => postProcessCheckboxes(container, checkboxEnabled),
		});
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}

	function postProcessCheckboxes(container: HTMLElement, checkboxEnabled: boolean) {
		function handlePrimaryCheckboxClick(e: Event) {
			e.preventDefault();
			e.stopPropagation();
			onPrimaryCheckboxClick?.();
		}

		const checkboxes = Array.from(
			container.querySelectorAll('input[type="checkbox"]')
		) as HTMLInputElement[];
		const primaryCheckbox = container.querySelector<HTMLInputElement>(PRIMARY_CHECKBOX_SELECTOR);
		const nestedCheckboxes = checkboxes.filter(checkbox => checkbox !== primaryCheckbox);

		if (primaryCheckbox) {
			primaryCheckbox.classList.add("task-primary-checkbox");
			primaryCheckbox.addEventListener('mousedown', stopPropagation);
			primaryCheckbox.addEventListener('mouseup', stopPropagation);
			primaryCheckbox.addEventListener('keypress', stopPropagation);

			if (!checkboxEnabled) {
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
					"Advance status"
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
	}

	// Re-render when task content, status, or the property-display mode changes
	let lastRenderedMarkdownKey = "";
	$: if (isEditing) {
		lastRenderedMarkdownKey = "";
	}
	$: primaryCheckboxEnabled = onPrimaryCheckboxClick !== undefined;
	$: if (task && task.content && task.displayStatus && propertyDisplay && !isEditing && previewContainerEl) {
		const markdownKey = JSON.stringify({
			source: renderTaskMarkdown(),
			path: task.path,
			primaryCheckboxEnabled,
		});
		if (markdownKey !== lastRenderedMarkdownKey) {
			lastRenderedMarkdownKey = markdownKey;
			void renderMarkdown(primaryCheckboxEnabled);
		}
	}

	onDestroy(() => {
		if (markdownComponent) {
			markdownComponent.unload();
		}
	});

	$: excludedTagNames = excludedTags.map((tag) => tag.trim().replace(/^#/, "").toLowerCase());
	$: visibleTags = Array.from(task.tags).filter(t => !excludedTagNames.includes(t.toLowerCase()));
	$: shouldconsolidateTags = consolidateTags && visibleTags.length > 0;
	$: dateEditingEnabled = getPropertyWriteAdapter(propertySchemaOption) !== null;
	$: displayProperties = task.properties ? toDisplayProperties(task.properties) : [];
	$: dateDisplayProperties = dateEditingEnabled
		? displayProperties
			.filter((prop) => editableDatePropertyKeys.has(prop.key))
			.map((prop) => propertySchemaOption === PropertySchemaOption.Dataview
				? { ...prop, icon: undefined, label: `${prop.key}::` }
				: prop)
		: [];
	$: nonDateDisplayProperties = displayProperties.filter((prop) => !editableDatePropertyKeys.has(prop.key));
	$: dateProperties = new Map(
		Array.from(task.properties?.entries() ?? []).filter(([key]) => editableDatePropertyKeys.has(key)),
	);
	$: hasDateFields = !!$$slots["date-fields"];
	// Without a date editor there is nothing to show in an empty date row.
	$: showDateRow = dateEditingEnabled && (hasDateFields || dateDisplayProperties.length > 0);

	$: visibleSubtasks = getVisibleSourceTaskDescendants(task.sourceChildren);
	$: totalSubtasksCount = visibleSubtasks.length;
	$: completedSubtasksCount = visibleSubtasks.filter(node => task.isSourceTaskStatusDone(node.status)).length;
	$: completionPercentage = totalSubtasksCount > 0 ? Math.round((completedSubtasksCount / totalSubtasksCount) * 100) : 0;
</script>

<div
	class="task"
	class:is-dragging={isDragging}
	class:is-selected={isSelectionMode && isSelected}
	class:is-selection-mode={isSelectionMode}
	class:is-static={!interactive}
	class:dense
	class:dense-toolbar-visible={denseToolbarVisible}
	role="group"
	{draggable}
	style:--task-accent-color={accentColor}
	on:dragstart={(e) => onDragStart?.(e)}
	on:dragend={(e) => onDragEnd?.(e)}
>
	<TaskLineRow variant="card" hasActions={!!$$slots.actions}>
		<svelte:fragment slot="marker">
			<slot name="marker">
				<span
					class="static-status-marker"
					class:is-done={task.done}
					class:usesStatusMarker={task.displayStatus !== " "}
				>
					<TaskStatusMarker status={task.displayStatus} isDone={task.done} size={16} />
				</span>
			</slot>
		</svelte:fragment>
		<div class="task-row-content">
			{#if isEditing}
				<slot name="editor" />
			{:else if interactive}
				<div
					role="button"
					class="content-preview markdown-rendered"
					bind:this={previewContainerEl}
					on:mouseup={(e) => onPreviewActivate?.(e)}
					on:keypress={handlePreviewKeypress}
					tabindex="0"
				></div>
			{:else}
				<div class="content-preview markdown-rendered" bind:this={previewContainerEl}></div>
			{/if}
			{#if treatNestedTasksAsSubtasks && totalSubtasksCount > 0}
				<div class="task-progress-wrapper" class:is-complete={completionPercentage === 100}>
					{#if interactive}
						<span
							class="subtask-collapse-btn"
							class:collapsed={isSubtasksCollapsed}
							role="button"
							tabindex="0"
							on:click|stopPropagation={toggleSubtasksCollapse}
							on:keydown|stopPropagation={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									toggleSubtasksCollapse();
								}
							}}
							aria-label={isSubtasksCollapsed ? "Expand subtasks" : "Collapse subtasks"}
						>{isSubtasksCollapsed ? "▶" : "▼"}</span>
					{/if}
					<div class="task-progress-bar-container">
						<div class="task-progress-bar" style="width: {completionPercentage}%"></div>
					</div>
					<span class="task-progress-text">{completedSubtasksCount}/{totalSubtasksCount} ({completionPercentage}%)</span>
				</div>
			{/if}
		</div>
		<svelte:fragment slot="actions">
			<slot name="actions" />
		</svelte:fragment>
	</TaskLineRow>

	{#if !isSubtasksCollapsed}
		{#if task.sourceChildren.length > 0}
			<TaskSourceRows
				{app}
				{task}
				{taskActions}
				nodes={task.sourceChildren}
				{isSelectionMode}
				depth={1}
			/>
		{/if}

		<slot name="after-source-rows" />
	{/if}

	{#if shouldconsolidateTags}
		<div class="task-tags">
			{#each visibleTags as tag}
				<span>
					<!-- prettier-ignore -->
					<span class="cm-formatting cm-formatting-hashtag cm-hashtag cm-hashtag-begin cm-list-1">#</span><span
						class="cm-hashtag cm-hashtag-end cm-list-1">{tag}</span
					>
				</span>
			{/each}
		</div>
	{/if}
	{#if propertyDisplay === PropertyDisplayMode.Debug && task.properties && task.properties.size > 0}
		<div class="task-properties-debug">
			<pre><code>{JSON.stringify(Array.from(task.properties.entries()), null, 2)}</code></pre>
		</div>
	{:else if propertyDisplay === PropertyDisplayMode.Pretty && task.properties}
		{#if nonDateDisplayProperties.length > 0}
			<div class="task-properties">
				{#each nonDateDisplayProperties as prop (prop.key)}
					<span class="task-property">
						{#if prop.icon}
							<span class="task-property-icon" title={prop.label} aria-label={prop.label}>{prop.icon}</span>
						{:else}
							<span class="task-property-label">{prop.label}</span>
						{/if}
						<span class="task-property-value">{prop.value}</span>
					</span>
				{/each}
			</div>
		{/if}
	{/if}
	{#if showDateRow}
		<div
			class="task-properties task-date-properties"
			class:dense-empty={dense && !isEditingDates && dateDisplayProperties.length === 0}
		>
			<slot name="date-fields" />
			{#if !isEditingDates}
				{#each dateDisplayProperties as prop (prop.key)}
					<span class="task-property" class:dataview-property={propertySchemaOption === PropertySchemaOption.Dataview}>
						{#if prop.icon}
							<span class="task-property-icon" title={prop.label} aria-label={prop.label}>{prop.icon}</span>
						{:else}
							<span class="task-property-label">{prop.label}</span>
						{/if}
						<span class="task-property-value">{prop.value}</span>
					</span>
				{/each}
			{/if}
		</div>
	{/if}
	{#if showFilepath && !dense}
		<div class="task-footer">
			{#if onOpenFile}
				<button
					class="go-to-file-button"
					aria-label="Go to file"
					title="Go to file"
					on:click={(e) => onOpenFile?.(e)}
					on:keydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onOpenFile?.(e);
						}
					}}
					tabindex="0"
				>
					<Icon name="lucide-arrow-up-right" size={18} opacity={0.5} />
					<span class="file-path">{task.path}</span>
				</button>
			{:else}
				<span class="go-to-file-button">
					<span class="file-path">{task.path}</span>
				</span>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.task {
		--task-accent: var(--task-accent-color, var(--background-modifier-border-hover));
		--task-content-line-height: 1.5rem;
		--task-footer-line-height: 1.15;
		--task-footer-block-padding: 2px;
		position: relative;
		overflow: hidden;
		background: var(--background-primary);
		border-radius: var(--radius-s);
		border: var(--border-width) solid var(--background-modifier-border);
		cursor: grab;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
		transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;

		&::before {
			content: "";
			position: absolute;
			inset: 0 auto 0 0;
			width: 8px;
			background: var(--task-accent);
		}

		&:hover {
			border-color: color-mix(in srgb, var(--text-muted) 45%, var(--background-modifier-border));
			box-shadow: 0 8px 22px rgba(0, 0, 0, 0.08);
			transform: translateY(-1px);
		}

		&.is-static {
			cursor: pointer;
		}

		&.is-dragging {
			opacity: 0.15;
		}

		&.is-selected {
			border-color: var(--interactive-accent);
			background: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-primary));
		}

		.task-row-content {
			min-width: 0; // Allow text to wrap properly

			.content-preview {
				min-height: var(--task-content-line-height);

				&:focus {
					box-shadow: 0 0 0 3px
						var(--background-modifier-border-focus);
				}
			}
		}

		.static-status-marker {
			display: flex;
			justify-content: center;
			align-items: center;
			width: 20px;
			height: 20px;

			&.usesStatusMarker {
				color: var(--text-normal);
			}
		}

		.task-footer {
			border-top: var(--border-width) solid
				var(--background-modifier-border);
			padding: var(--task-footer-block-padding) var(--size-4-2) var(--task-footer-block-padding) calc(var(--size-4-2) + 8px);
			font-size: var(--font-ui-smaller);
			line-height: var(--task-footer-line-height);
			display: flex;
			align-items: center;
			min-height: 0;

			.go-to-file-button {
				display: inline-flex;
				align-items: center;
				justify-content: flex-start;
				gap: var(--size-2-1);
				width: auto;
				max-width: 100%;
				padding: 0;
				min-height: 0;
				height: auto;
				border: none;
				background: transparent;
				cursor: pointer;
				text-align: left;
				box-shadow: none;
				transition: opacity 0.2s ease;
				border-radius: var(--radius-s);
				font: inherit;
				line-height: inherit;

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
					color: var(--text-muted);
					transition: color 0.2s ease;
					overflow-wrap: anywhere;
					white-space: normal;
					min-width: 0;
					line-height: inherit;
				}
			}

			span.go-to-file-button {
				cursor: inherit;

				&:hover .file-path {
					color: var(--text-muted);
				}
			}

			.go-to-file-button :global(svg) {
				width: 1em;
				height: 1em;
			}
		}

		.task-tags {
			display: flex;
			flex-wrap: wrap;
			gap: var(--size-2-1);
			padding: 0 var(--size-4-2) var(--size-4-2) calc(var(--size-4-2) + 8px);
			margin-top: calc(-1 * var(--size-2-2));

			span {
				background-color: var(--background-secondary);
				color: var(--text-muted);
				border: 1px solid var(--background-modifier-border);
				border-radius: var(--radius-s);
				padding: 1px 5px;
				font-size: var(--font-ui-smaller);
				line-height: 1.1;
				display: inline-flex;
				align-items: center;
				transition: color 0.15s ease, border-color 0.15s ease;

				&:hover {
					color: var(--text-normal);
					border-color: var(--text-muted);
				}

				:global(.cm-formatting-hashtag) {
					color: var(--text-accent) !important;
					font-weight: var(--font-medium);
					margin-right: 1px;
				}
				:global(.cm-hashtag-end) {
					color: inherit !important;
				}
			}
		}

		.task-properties-debug {
			padding: var(--size-2-3) var(--size-4-2) var(--size-2-3) calc(var(--size-4-2) + 8px);
			border-top: var(--border-width) solid var(--background-modifier-border);
			background-color: var(--background-secondary-alt);
			font-size: var(--font-ui-smaller);
			overflow-x: auto;

			pre {
				margin: 0;
			}
		}

		.task-properties {
			display: flex;
			flex-wrap: wrap;
			gap: var(--size-2-2);
			padding: var(--task-footer-block-padding) var(--size-4-2) var(--task-footer-block-padding) calc(var(--size-4-2) + 8px);
			border-top: var(--border-width) solid var(--background-modifier-border);
			font-size: var(--font-ui-smaller);
			line-height: var(--task-footer-line-height);
		}

		.task-date-properties {
			align-items: center;
		}

		.task-date-properties :global(.edit-mode) {
			flex-basis: 100%;
		}

		.task-property {
			display: inline-flex;
			align-items: baseline;
			gap: var(--size-2-1);
			padding: 0 var(--size-2-2);
			border-radius: var(--radius-s);
			background-color: var(--background-secondary-alt);
			line-height: inherit;
		}

		.task-property-label {
			color: var(--text-muted);
			text-transform: uppercase;
			font-size: var(--font-smallest);
			letter-spacing: 0.02em;
		}

		.task-property.dataview-property .task-property-label {
			text-transform: none;
			letter-spacing: 0;
		}

		.task-property-icon {
			font-size: inherit;
			line-height: 1;
		}

		.task-property-value {
			color: var(--text-normal);
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
		padding-left: 0 !important;
		margin: 0 !important;
		list-style: none !important;
	}

	:global(.task-row-content .content-preview .task-list-item) {
		min-width: 0;
		word-break: break-word;
		padding-left: 0 !important;
		list-style-type: none !important;
	}

	:global(.task-row-content input.task-nested-checkbox) {
		pointer-events: none;
	}

	:global(.task-row-content .content-preview .task-list-item > input[type="checkbox"].task-primary-checkbox),
	:global(.task-row-content .content-preview .task-list-item > p > input[type="checkbox"].task-primary-checkbox) {
		display: none !important;
	}

	:global(.task-row-content .content-preview .task-list-item > *:not(input[type="checkbox"])) {
		min-width: 0;
	}

	.task-progress-wrapper {
		display: flex;
		align-items: center;
		gap: var(--size-4-2);
		margin-top: var(--size-2-2);
		margin-bottom: var(--size-2-1);

		&.is-complete {
			.task-progress-bar {
				background-color: hsl(140, 75%, 45%);
				background-image: linear-gradient(90deg, hsl(140, 75%, 40%) 0%, hsl(140, 75%, 50%) 100%);
				box-shadow: 0 0 6px hsl(140, 75%, 45%, 0.3);
			}
			.task-progress-text {
				color: hsl(140, 75%, 45%);
				font-weight: var(--font-bold);
			}
		}
	}

	.task-progress-bar-container {
		flex: 1;
		height: 6px;
		background-color: var(--background-modifier-border);
		border-radius: 3px;
		overflow: hidden;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.task-progress-bar {
		height: 100%;
		background-color: var(--interactive-accent);
		background-image: linear-gradient(
			90deg,
			hsla(var(--accent-h, 210), var(--accent-s, 75%), calc(var(--accent-l, 50%) - 5%), 0.95) 0%,
			var(--interactive-accent) 100%
		);
		border-radius: 3px;
		transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, background-image 0.3s ease;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.task-progress-text {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		font-weight: var(--font-medium);
		white-space: nowrap;
		transition: color 0.3s ease;
	}

	.subtask-collapse-btn {
		background: transparent;
		border: none;
		box-shadow: none;
		padding: 0;
		color: var(--text-muted);
		font-size: 10px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--task-line-marker-size, 20px);
		height: 14px;
		line-height: 1;
		flex-shrink: 0;
		transition: color 0.15s ease;

		/* Shift to the left under the checkbox */
		margin-left: calc(-1 * (var(--task-line-marker-size, 20px) + var(--task-line-column-gap, var(--size-2-3))));
		margin-right: var(--task-line-column-gap, var(--size-2-3));

		&:hover {
			color: var(--text-normal);
			background: transparent;
		}
	}

	// Dense list cards (SPEC 0055): one divider per card, no interior lines.
	.task.dense {
		.task-properties,
		.task-properties-debug {
			border-top: none;
		}

		.task-date-properties.dense-empty {
			display: none;
		}
	}
</style>
