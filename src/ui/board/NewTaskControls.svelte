<script lang="ts">
	import { Platform, type TFile } from "obsidian";
	import { onDestroy, tick } from "svelte";
	import type { Readable } from "svelte/store";
	import { type ColumnTagTable, isColumnTag } from "../columns/columns";
	import type { PrimaryBucketId } from "./board_matrix";
	import type { TaskActions } from "../tasks/actions";
	import DateInputFields, { type DateFieldValues } from "../components/DateInputFields.svelte";
	import IconButton from "../components/icon_button.svelte";
	import {
		getPropertyWriteAdapter,
		PropertySchemaOption,
		type EditableDatePropertyKey,
	} from "../../parsing/properties";

	export let taskActions: TaskActions;
	export let column: PrimaryBucketId;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let columnTitle: string;
	export let additionalTags: string[] = [];
	/** The file a file-group lane creates tasks in; skips the picker menu. */
	export let fileGroupTargetFile: TFile | null = null;
	/** The file shown in the "→ file" indicator. */
	export let targetTaskFile: TFile | null = null;
	export let targetFileIsDefault: boolean = false;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let isVerticalFlow: boolean = false;

	let pendingNewTask: TFile | null = null;
	let newTaskTextAreaEl: HTMLTextAreaElement | undefined;
	let newTaskInputEl: HTMLDivElement | undefined;
	let stopWatchingViewport: (() => void) | undefined;
	let mobileEditorStyle = "";

	function mobilePortal(node: HTMLElement) {
		if (!Platform.isMobile) {
			return {};
		}
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			},
		};
	}
	const emptyDateValues: DateFieldValues = { due: "", scheduled: "", start: "" };
	let newTaskDateValues: DateFieldValues = { ...emptyDateValues };
	$: canEditNewTaskDates = getPropertyWriteAdapter(propertySchemaOption) !== null;
	$: isColTag = isColumnTag(column, columnTagTableStore);

	async function handleNewTaskSave(event?: FocusEvent) {
		const nextTarget = event?.relatedTarget;
		if (nextTarget instanceof Node && newTaskInputEl?.contains(nextTarget)) {
			return;
		}

		const content = newTaskTextAreaEl?.value?.trim();
		const file = pendingNewTask;
		const targetColumn = column;
		stopViewportWatcher();
		pendingNewTask = null;

		if (!content || !file || !isColumnTag(targetColumn, columnTagTableStore)) {
			newTaskDateValues = { ...emptyDateValues };
			return;
		}

		await taskActions.createTask(
			file,
			content,
			targetColumn,
			additionalTags,
			newTaskDateValues,
		);
		newTaskDateValues = { ...emptyDateValues };
	}

	function positionNewTaskEditor() {
		requestAnimationFrame(() => {
			if (!newTaskInputEl || !Platform.isMobile) {
				mobileEditorStyle = "";
				return;
			}
			const viewport = window.visualViewport;
			const viewportWidth = viewport?.width ?? window.innerWidth;
			const viewportHeight = viewport?.height ?? window.innerHeight;
			const viewportLeft = viewport?.offsetLeft ?? 0;
			const viewportTop = viewport?.offsetTop ?? 0;
			const margin = 16;
			const editorWidth = Math.min(520, Math.max(200, viewportWidth - margin * 2));
			const editorMaxHeight = Math.max(120, viewportHeight - margin * 2);
			const editorHeight = Math.min(
				newTaskInputEl.scrollHeight,
				editorMaxHeight,
			);
			const top = viewportTop + Math.max(margin, (viewportHeight - editorHeight) / 2);
			mobileEditorStyle = [
				`left: ${Math.round(viewportLeft + (viewportWidth - editorWidth) / 2)}px`,
				`top: ${Math.round(top)}px`,
				`width: ${Math.round(editorWidth)}px`,
				`max-height: ${Math.round(editorMaxHeight)}px`,
			].join("; ");
		});
	}

	function stopViewportWatcher() {
		stopWatchingViewport?.();
		stopWatchingViewport = undefined;
	}

	function cancelNewTask() {
		stopViewportWatcher();
		pendingNewTask = null;
		newTaskDateValues = { ...emptyDateValues };
	}

	function watchViewportWhileEditing() {
		if (!Platform.isMobile) return;
		stopViewportWatcher();
		const viewport = window.visualViewport;
		if (viewport) {
			viewport.addEventListener("resize", positionNewTaskEditor);
			viewport.addEventListener("scroll", positionNewTaskEditor);
			stopWatchingViewport = () => {
				viewport.removeEventListener("resize", positionNewTaskEditor);
				viewport.removeEventListener("scroll", positionNewTaskEditor);
			};
		}
		positionNewTaskEditor();
	}

	function trapMobileEditorFocus(event: KeyboardEvent) {
		if (event.key !== "Tab" || !Platform.isMobile || !newTaskInputEl) return;

		const focusable = Array.from(
			newTaskInputEl.querySelectorAll<HTMLElement>(
				"button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
			),
		);
		const first = focusable[0];
		const last = focusable.at(-1);
		const activeElement = newTaskInputEl.ownerDocument.activeElement;
		if (!first || !last) return;

		if (event.shiftKey && activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleNewTaskKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			cancelNewTask();
		} else if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleNewTaskSave();
		}
	}

	$: if (pendingNewTask && newTaskTextAreaEl) {
		void tick().then(() => {
			newTaskTextAreaEl?.focus();
			if (Platform.isMobile) watchViewportWhileEditing();
		});
	}

	onDestroy(stopViewportWatcher);

	function handleAddNewClick(e: MouseEvent | KeyboardEvent) {
		const targetColumn = column;
		if (!isColumnTag(targetColumn, columnTagTableStore)) {
			return;
		}

		newTaskDateValues = { ...emptyDateValues };
		if (fileGroupTargetFile) {
			pendingNewTask = fileGroupTargetFile;
			return;
		}

		taskActions.pickFileForNewTask(targetColumn, e, (file) => {
			newTaskDateValues = { ...emptyDateValues };
			pendingNewTask = file;
		});
	}

	function handleChooseTaskFileClick(e: MouseEvent | KeyboardEvent) {
		const targetColumn = column;
		if (!isColumnTag(targetColumn, columnTagTableStore)) {
			return;
		}

		taskActions.pickFileForNewTask(
			targetColumn,
			e,
			(file) => {
				newTaskDateValues = { ...emptyDateValues };
				pendingNewTask = file;
			},
			true,
		);
	}

	function handleNewTaskDateChange(
		key: EditableDatePropertyKey,
		value: string,
	) {
		newTaskDateValues = {
			...newTaskDateValues,
			[key]: value,
		};
	}

</script>

{#if isColTag}
	<div class="add-new-controls" class:vertical-flow={isVerticalFlow}>
		<div
			class="add-new-btn"
			class:disabled={!!pendingNewTask}
			role="button"
			tabindex={pendingNewTask ? -1 : 0}
			aria-label="Add new task to {columnTitle}"
			aria-disabled={!!pendingNewTask}
			on:click={!pendingNewTask ? handleAddNewClick : undefined}
			on:keydown={(e) => {
				if (!pendingNewTask && (e.key === 'Enter' || e.key === ' ')) {
					e.preventDefault();
					handleAddNewClick(e);
				}
			}}
		>
			<span aria-hidden="true">+</span>
			Task
		</div>
		<IconButton
			class="add-new-picker-btn {pendingNewTask ? 'disabled' : ''}"
			icon="lucide-chevron-down"
			aria-label="Choose file for new task in {columnTitle}"
			disabled={!!pendingNewTask}
			on:click={(e) => {
				if (!pendingNewTask) handleChooseTaskFileClick(e);
			}}
		/>
	</div>
	{#if targetTaskFile}
		<div class="file-indicator" class:vertical-flow={isVerticalFlow}>
			<span class="file-indicator-arrow">→</span>
			<span class="file-indicator-name" title={targetTaskFile.path}>{targetTaskFile.name}</span>
			{#if targetFileIsDefault}
				<span class="file-indicator-label">(default)</span>
			{/if}
		</div>
	{/if}
{/if}
{#if pendingNewTask}
	<div class="mobile-editor-modal" class:mobile-app={Platform.isMobile} use:mobilePortal>
		{#if Platform.isMobile}
			<div class="mobile-editor-backdrop" aria-hidden="true"></div>
		{/if}
		<div
			class="new-task-input"
			class:vertical-flow={isVerticalFlow}
			class:mobile-app={Platform.isMobile}
			bind:this={newTaskInputEl}
			style={mobileEditorStyle}
			role={Platform.isMobile ? "dialog" : undefined}
			aria-modal={Platform.isMobile ? "true" : undefined}
			aria-label={Platform.isMobile ? `New task in ${columnTitle}` : undefined}
			on:keydown={trapMobileEditorFocus}
			on:focusout={!Platform.isMobile ? handleNewTaskSave : undefined}
		>
			{#if Platform.isMobile}
				<div class="mobile-editor-heading">
					<div>
						<h2>New task</h2>
						<p>{columnTitle} · {pendingNewTask.name}</p>
					</div>
					<button type="button" class="mobile-editor-close" aria-label="Cancel new task" on:click={cancelNewTask}>×</button>
				</div>
			{/if}
			<textarea
				bind:this={newTaskTextAreaEl}
				on:keydown={handleNewTaskKeydown}
				on:focus={watchViewportWhileEditing}
				placeholder="Task name..."
			></textarea>
			{#if canEditNewTaskDates}
				<div class="new-task-date-fields">
					<DateInputFields
						values={newTaskDateValues}
						onDateChange={handleNewTaskDateChange}
					/>
				</div>
			{/if}
			{#if Platform.isMobile}
				<div class="mobile-editor-actions">
					<button type="button" on:click={cancelNewTask}>Cancel</button>
					<button type="button" class="mod-cta" on:click={() => void handleNewTaskSave()}>Create task</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	@mixin mobile-editor-surface {
		position: absolute;
		z-index: 1;
		box-sizing: border-box;
		margin: 0;
		padding: var(--size-4-3);
		overflow: auto;
		background: color-mix(in srgb, var(--background-primary) 94%, transparent);
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
		border-radius: var(--radius-l, 12px);
		box-shadow:
			0 18px 48px rgba(0, 0, 0, 0.24),
			0 2px 10px rgba(0, 0, 0, 0.12);
		backdrop-filter: blur(14px) saturate(1.15);
		-webkit-backdrop-filter: blur(14px) saturate(1.15);

		&:focus-within {
			border-color: color-mix(in srgb, var(--interactive-accent) 68%, var(--background-modifier-border));
			box-shadow:
				0 18px 48px rgba(0, 0, 0, 0.24),
				0 0 0 3px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
		}

		textarea {
			min-height: 104px;
			box-sizing: border-box;
			padding: var(--size-4-3);
			background: color-mix(in srgb, var(--background-secondary) 82%, transparent);
			color: var(--text-normal);
			border: 1px solid var(--background-modifier-border);
			border-radius: var(--radius-m);
			box-shadow: none;
			font-size: 16px;
			line-height: 1.45;
			resize: none;

			&:focus,
			&:focus-visible {
				border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
				box-shadow: none;
				outline: none;
			}
		}
	}

	.mobile-editor-modal {
		display: contents;

		&.mobile-app {
			position: fixed;
			z-index: var(--layer-modal, 1000);
			inset: 0;
			display: block;
		}
	}

	.mobile-editor-backdrop {
		position: absolute;
		inset: 0;
		background: var(--background-modifier-cover);
	}

	/*
	 * These elements are direct flex children of BoardCell's .tasks-wrapper
	 * (Svelte components do not add a wrapper element). In vertical flow the
	 * wrapper reorders its children; the order values here must stay in sync
	 * with .tasks (order 1) in BoardCell.
	 */
	.add-new-controls.vertical-flow {
		order: 2;
	}

	.file-indicator.vertical-flow {
		order: 3;
	}

	.new-task-input.vertical-flow {
		order: 4;
		width: var(--column-width, 300px);
		box-sizing: border-box;
	}

	.new-task-input {
		margin-top: var(--size-4-3);
		background-color: var(--background-primary);
		border-radius: var(--radius-s);
		border: var(--border-width) solid var(--background-modifier-border);
		padding: var(--size-4-2);

		textarea {
			cursor: text;
			background-color: var(--color-base-25);
			width: 100%;
		}
	}

	.new-task-input.mobile-app {
		@include mobile-editor-surface;
	}

	.mobile-editor-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--size-4-3);
		margin-bottom: var(--size-4-3);

		h2, p {
			margin: 0;
		}

		h2 {
			font-size: var(--font-ui-medium);
		}

		p {
			margin-top: var(--size-2-1);
			color: var(--text-muted);
			font-size: var(--font-ui-small);
		}
	}

	.mobile-editor-close {
		min-width: 32px;
		min-height: 32px;
		padding: 0;
		font-size: 24px;
		line-height: 1;
	}

	.mobile-editor-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--size-4-2);
		margin-top: var(--size-4-3);
	}

	.new-task-date-fields {
		margin-top: var(--size-2-3);
	}

	.add-new-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		align-self: flex-start;
		cursor: pointer;
		border: 0;
		border-radius: var(--radius-s);
		box-shadow: none;
		margin: 0;
		min-height: 26px;
		padding: 0;
		background: transparent;
		background-color: transparent;
		color: var(--text-accent);
		font-size: var(--font-ui-small);
		font-weight: var(--font-medium);
		line-height: 1.2;

		span {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			font-size: var(--font-ui-medium);
			line-height: 1;
		}

		&.disabled {
			cursor: not-allowed;
			opacity: 0.5;
			color: var(--text-muted);
			pointer-events: none;
		}
	}

	.add-new-controls {
		display: inline-flex;
		align-items: center;
		gap: var(--size-2-1);
		align-self: flex-start;
		border: 0;
		background: transparent;
		box-shadow: none;
	}

	.add-new-controls :global(.add-new-picker-btn) {
		flex-shrink: 0;
		width: 22px;
		height: 26px;
		border: 0;
		border-radius: var(--radius-s);
		box-shadow: none;
		margin: 0;
		background-color: transparent;
		color: var(--text-accent);

		&.disabled {
			cursor: not-allowed;
			opacity: 0.5;
			color: var(--text-muted);
			pointer-events: none;
		}
	}

	.add-new-btn,
	.add-new-controls :global(.add-new-picker-btn) {
		background-color: transparent;
	}

	.add-new-btn:hover:not(.disabled),
	.add-new-controls :global(.add-new-picker-btn:hover:not(.disabled)) {
		background-color: transparent;
		color: var(--text-accent-hover);
	}

	.add-new-btn:active:not(.disabled),
	.add-new-controls :global(.add-new-picker-btn:active:not(.disabled)) {
		background-color: transparent;
		color: var(--text-accent-hover);
	}

	.file-indicator {
		display: flex;
		align-items: center;
		gap: var(--size-2-1);
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		margin-top: var(--size-2-1);

		.file-indicator-arrow {
			flex-shrink: 0;
		}

		.file-indicator-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.file-indicator-label {
			white-space: nowrap;
		}
	}
</style>
