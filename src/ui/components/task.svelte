<script lang="ts">
	import type { ColumnTag, ColumnTagTable, DefaultColumns } from "../columns/columns";
	import { isDraggingStore } from "../dnd/store";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import MarkdownBodyEditor from "./MarkdownBodyEditor.svelte";
	import type { MarkdownSource } from "../tasks/markdown_source";
	import TaskCardBody from "./TaskCardBody.svelte";
	import TaskStatusMarker from "./TaskStatusMarker.svelte";
	import TaskMenu from "./task_menu.svelte";
	import TaskDateFields from "./TaskDateFields.svelte";
	import Icon from "./icon.svelte";
	import { Platform, type App } from "obsidian";
	import type { Readable } from "svelte/store";
	import { PropertyDisplayMode } from "../settings/settings_store";
	import { PropertySchemaOption } from "../../parsing/properties/property_schema";
	import { getPropertyWriteAdapter } from "../../parsing/properties/write";
	import MobileTaskEditor from "./MobileTaskEditor.svelte";
	import { canStartTaskDrag } from "./task_drag";
	import {
		advanceCard,
		nextAdvanceDestination,
		type CardActionMode,
	} from "../selection/card_action_mode";

	export let app: App;
	export let task: Task;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let showFilepath: boolean;
	export let propertyDisplay: PropertyDisplayMode = PropertyDisplayMode.None;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let consolidateTags: boolean;
	export let excludedTags: string[] = [];
	export let displayColumn: ColumnTag | DefaultColumns;
	export let displaySecondaryId: string;
	export let isSelectionMode: boolean = false;
	export let cardActionMode: CardActionMode = "done";
	export let workflowColumns: ColumnTag[] = [];
	export let isSelected: boolean = false;
	export let onToggleSelection: () => void = () => {};
	export let selectedTaskIds: string[] = [];
	export let taskSecondaryIds: Record<string, string> = {};
	export let doneColumnName: string | undefined = undefined;
	export let accentColor: string | undefined = undefined;
	// Manual ordering (SPEC 0020 Phase 4).
	export let isManualOrder: boolean = false;
	export let isPinned: boolean = false;
	export let showDragHandle: boolean = false;
	export let onUnpin: () => void = () => {};
	export let treatNestedTasksAsSubtasks: boolean = false;
	/**
	 * Dense list card (SPEC 0055): one line with "+ Date", go to file and the
	 * menu as a toolbar, revealed on hover/focus on desktop and always on mobile.
	 */
	export let dense = false;
	const toolbarAlwaysVisible = Platform.isMobile;
	let dateFields: TaskDateFields | undefined;

	let editTarget: { id: string; source?: MarkdownSource; content: string };

	let isEditing = false;
	let isMobileEditing = false;
	let isDragging = false;
	$: displayStatusIsCustom = task.displayStatus !== " ";
	$: advanceDestination = nextAdvanceDestination(displayColumn, workflowColumns);
	$: advanceActionLabel = advanceDestination === "archive"
		? "Archive task"
		: advanceDestination === "done"
			? `Advance to ${doneColumnName || "Done"}`
			: advanceDestination === "uncategorised"
				? "Advance to Uncategorized"
				: advanceDestination
					? `Advance to ${$columnTagTableStore[advanceDestination] ?? advanceDestination}`
					: "Next column unavailable";

	function activateCardMarker() {
		if (cardActionMode === "advance") {
			void advanceCard(task.id, displayColumn, workflowColumns, taskActions);
		} else {
			void taskActions.toggleDone(task.id);
		}
	}

	function handleDragStart(e: DragEvent) {
		// Selected text in an editor can emit a native drag event which bubbles
		// to this card. Do not interpret it as a task move.
		if (!canStartTaskDrag({ isEditing, isMobileEditing })) return;

		isDragging = true;

		// In selection mode with this task selected, drag all selected tasks
		const taskIds =
			isSelectionMode && isSelected && selectedTaskIds.length > 0
				? selectedTaskIds
				: [task.id];

		isDraggingStore.set({
			fromColumn: displayColumn,
			fromSecondaryId: displaySecondaryId,
			draggedTaskIds: taskIds,
			taskSecondaryIds,
		});

		if (e.dataTransfer) {
			e.dataTransfer.setData("text/plain", task.id);
			e.dataTransfer.dropEffect = "move";
		}

		// Create a custom drag image for multi-task drag
		if (taskIds.length > 1 && e.dataTransfer) {
			const ghost = document.body.createDiv();
			ghost.textContent = `Moving ${taskIds.length} tasks`;
			ghost.setCssStyles({
				position: "fixed",
				top: "-9999px",
				left: "-9999px",
				padding: "6px 12px",
				background: "var(--background-secondary-alt)",
				border: "1px solid var(--background-modifier-border)",
				borderRadius: "var(--radius-m)",
				fontSize: "var(--font-ui-small)",
				color: "var(--text-normal)",
				boxShadow: "var(--shadow-s)",
				whiteSpace: "nowrap",
			});
			e.dataTransfer.setDragImage(ghost, 0, 0);
			window.setTimeout(() => ghost.remove(), 0);
		}
	}

	function handleDragEnd() {
		isDragging = false;
		isDraggingStore.set(null);
	}

	let previewContainerEl: HTMLDivElement | undefined;
	let isEditingDates = false;

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
		// Fallback: If clicked within the primary checkbox area (first 28px from the left),
		// treat it as an interactive target to prevent entering edit mode.
		if (e instanceof MouseEvent && previewContainerEl) {
			const rect = previewContainerEl.getBoundingClientRect();
			const relativeX = e.clientX - rect.left;
			if (relativeX >= 0 && relativeX < 28) {
				return true;
			}
		}

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

		startEditing();
	}

	function startEditing() {
		if (isEditing || isMobileEditing) return;
		if (Platform.isMobile) {
			isMobileEditing = true;
			return;
		}

		editTarget = { id: task.id, source: task.editableSource, content: task.editableContent };
		isEditing = true;
	}

	$: dateEditingEnabled = getPropertyWriteAdapter(propertySchemaOption) !== null;
</script>

<!-- Interactive wrapper around TaskCardBody: editing, drag, selection, menu,
     the dense toolbar, and date editing. Card display belongs in
     TaskCardBody so the embedded board (SPEC 0057) shows it too. -->
<TaskCardBody
	{app}
	{task}
	{taskActions}
	{showFilepath}
	{propertyDisplay}
	{propertySchemaOption}
	{consolidateTags}
	{excludedTags}
	{treatNestedTasksAsSubtasks}
	{dense}
	{isSelectionMode}
	{isSelected}
	{isDragging}
	{accentColor}
	{isEditing}
	{isEditingDates}
	denseToolbarVisible={dense && (toolbarAlwaysVisible || isEditingDates)}
	draggable={canStartTaskDrag({ isEditing, isMobileEditing })}
	onDragStart={handleDragStart}
	onDragEnd={handleDragEnd}
	onPreviewActivate={handleFocus}
	onPrimaryCheckboxClick={cardActionMode === "done" ? () => void taskActions.toggleDone(task.id) : undefined}
	onOpenFile={(e) => taskActions.viewFile(task.id, e)}
	bind:previewContainerEl
>
	<svelte:fragment slot="marker">
		{#if isSelectionMode}
			<!-- Selection checkbox (square icons) -->
			<button
				class="icon-button select-task"
				class:is-selected={isSelected}
				role="checkbox"
				aria-label={isSelected ? "Deselect for bulk actions" : "Select for bulk actions"}
				aria-checked={isSelected}
				on:click={onToggleSelection}
				tabindex="0"
			>
				<Icon
					name={isSelected ? "lucide-check-circle" : "lucide-circle"}
					size={18}
					opacity={isSelected ? 1 : 0.5}
				/>
			</button>
		{:else}
			<!-- Done checkbox (circle icons) -->
			<button
				class="icon-button toggle-done-task"
				class:is-done={task.done}
				class:usesStatusMarker={displayStatusIsCustom}
				role={cardActionMode === "done" ? "checkbox" : undefined}
				aria-label={cardActionMode === "advance" ? advanceActionLabel : "Advance status"}
				aria-checked={cardActionMode === "done" ? task.done : undefined}
				disabled={cardActionMode === "advance" && advanceDestination === null}
				on:click={activateCardMarker}
				tabindex="0"
			>
				{#if cardActionMode === "advance"}
					<Icon name="lucide-arrow-right" size={18} />
				{:else}
					<TaskStatusMarker status={task.displayStatus} isDone={task.done} size={16} />
				{/if}
			</button>
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="editor">
		<MarkdownBodyEditor initialContent={editTarget.content}
			onSave={(content) => taskActions.updateContent(editTarget.id, content, [], editTarget.source)}
			onClose={() => isEditing = false} />
	</svelte:fragment>
	<svelte:fragment slot="actions">
		{#if isManualOrder && isPinned}
			<button
				class="icon-button pin-marker"
				aria-label="Unpin task (return to file order)"
				title="Pinned — click to unpin"
				on:click|stopPropagation={onUnpin}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						e.stopPropagation();
						onUnpin();
					}
				}}
				tabindex="0"
			>
				<Icon name="lucide-pin" size={16} opacity={0.9} />
			</button>
		{/if}
		{#if isManualOrder && showDragHandle}
			<span class="drag-handle" title="Drag to reorder" aria-hidden="true">
				<Icon name="lucide-grip-vertical" size={16} opacity={0.5} />
			</span>
		{/if}
		{#if dense}
			<div class="dense-toolbar">
				{#if dateEditingEnabled}
					<button
						type="button"
						class="dense-action add-date-action"
						aria-label="Edit task dates"
						title="Edit task dates"
						on:click|stopPropagation={() => dateFields?.openEditor()}
					>
						<Icon name="lucide-calendar-plus" size={16} />
					</button>
				{/if}
				{#if showFilepath}
					<button
						type="button"
						class="dense-action go-to-file-action"
						aria-label={`Go to file ${task.path}`}
						title={task.path}
						on:click|stopPropagation={(e) => taskActions.viewFile(task.id, e)}
					>
						<Icon name="lucide-arrow-up-right" size={16} />
					</button>
				{/if}
				<TaskMenu {task} {taskActions} {columnTagTableStore} {doneColumnName} />
			</div>
		{:else}
			<TaskMenu {task} {taskActions} {columnTagTableStore} {doneColumnName} />
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="after-source-rows">
		{#if treatNestedTasksAsSubtasks}
			<div class="add-subtask-container">
				<div
					class="add-subtask-btn"
					role="button"
					tabindex="0"
					on:click|stopPropagation={() => void taskActions.addSourceBlockRow(task.id, task.rowIndex, "child", "task")}
					on:keydown|stopPropagation={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							void taskActions.addSourceBlockRow(task.id, task.rowIndex, "child", "task");
						}
					}}
				>
					<span aria-hidden="true">+</span>
					Subtask
				</div>
			</div>
		{/if}
	</svelte:fragment>
	<svelte:fragment slot="date-fields">
		{#if dateEditingEnabled}
			<!-- A single persistent instance: swapping instances across if/else
			     branches destroys the editor's internal state the moment it
			     opens, snapping the UI back to read mode. -->
			<TaskDateFields
				bind:this={dateFields}
				showAddButton={!dense}
				{task}
				{taskActions}
				{propertySchemaOption}
				isTaskEditing={isEditing}
				onEditingDatesChange={(editing) => (isEditingDates = editing)}
			/>
		{/if}
	</svelte:fragment>
</TaskCardBody>

{#if isMobileEditing}
	<MobileTaskEditor
		{task}
		{taskActions}
		{propertySchemaOption}
		onClose={() => (isMobileEditing = false)}
	/>
{/if}

<style lang="scss">
	// Styles for the interactive controls this wrapper puts into
	// TaskCardBody's slots. `:global(.task)` keeps the specificity these had
	// when the card markup lived here. Card display styles are in
	// TaskCardBody.svelte.
	:global(.task) {
		// Icon button styling
		.icon-button {
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
			transition: opacity 0.2s ease;
			box-shadow: none;
			overflow: visible;

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

			&.pin-marker :global(svg) {
				color: var(--interactive-accent);
			}

			&.pin-marker:hover :global(svg) {
				opacity: 1 !important;
			}

			&.usesStatusMarker {
				color: var(--text-normal);
			}

		}

		.drag-handle {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			cursor: grab;
		}
	}

	.add-subtask-container {
		padding: var(--size-2-2) var(--size-4-2) var(--size-2-2) calc(var(--size-4-2) + 8px);
	}

	.add-subtask-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		align-self: flex-start;
		cursor: pointer;
		border: 0;
		border-radius: var(--radius-s);
		box-shadow: none;
		margin: 0;
		min-height: 22px;
		padding: 0;
		background: transparent;
		background-color: transparent;
		color: var(--text-accent);
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-medium);
		line-height: 1.2;

		span {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			font-size: var(--font-ui-small);
			line-height: 1;
		}

		&:hover {
			color: var(--text-accent-hover);
			background: transparent;
			background-color: transparent;
		}

		&:active {
			color: var(--text-accent-hover);
			background: transparent;
			background-color: transparent;
		}
	}

	// Dense list cards (SPEC 0055): the toolbar on the task line.
	.dense-toolbar {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		transition: opacity 0.12s ease;
	}

	.dense-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		min-height: 0;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		box-shadow: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;

		&:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}

		&:focus-visible {
			outline: 2px solid var(--background-modifier-border-focus);
			outline-offset: 1px;
		}
	}

	// Desktop reveals the toolbar on hover or keyboard focus. Opacity, not
	// visibility, so the controls stay in the tab order.
	:global(.task.dense:not(.dense-toolbar-visible):not(:hover):not(:focus-within)) .dense-toolbar {
		opacity: 0;
	}
</style>
