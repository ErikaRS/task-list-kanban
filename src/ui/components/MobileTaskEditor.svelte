<script lang="ts">
	import { onDestroy, tick } from "svelte";
	import { EDITABLE_DATE_PROPERTY_KEYS, formatLocalDate, getPropertyByKey, getPropertyWriteAdapter, PropertySchemaOption, type EditableDatePropertyKey } from "../../parsing/properties";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import DateInputFields, { type DateFieldValues } from "./DateInputFields.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let onClose: () => void = () => {};

	let editorEl: HTMLDivElement | undefined;
	let textAreaEl: HTMLTextAreaElement | undefined;
	let draftContent = task.content.replaceAll("<br />", "\n");
	let draftDates: DateFieldValues = { due: getDateValue("due"), scheduled: getDateValue("scheduled"), start: getDateValue("start") };
	let editorStyle = "";
	let saving = false;
	let stopWatchingViewport: (() => void) | undefined;
	$: canEditDates = getPropertyWriteAdapter(propertySchemaOption) !== null;

	function getDateValue(key: EditableDatePropertyKey): string {
		const property = getPropertyByKey(task.properties, key);
		return property?.value instanceof Date ? formatLocalDate(property.value) : "";
	}

	function portalToBody(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function positionEditor() {
		requestAnimationFrame(() => {
			if (!editorEl) return;
			const viewport = window.visualViewport;
			const width = viewport?.width ?? window.innerWidth;
			const height = viewport?.height ?? window.innerHeight;
			const left = viewport?.offsetLeft ?? 0;
			const top = viewport?.offsetTop ?? 0;
			const margin = 16;
			const editorWidth = Math.max(200, Math.min(520, width - margin * 2));
			const maxHeight = Math.max(160, height - margin * 2);
			const editorHeight = Math.min(editorEl.scrollHeight, maxHeight);
			editorStyle = [
				`left: ${Math.round(left + (width - editorWidth) / 2)}px`,
				`top: ${Math.round(top + Math.max(margin, (height - editorHeight) / 2))}px`,
				`width: ${Math.round(editorWidth)}px`,
				`max-height: ${Math.round(maxHeight)}px`,
			].join("; ");
		});
	}

	function watchViewport() {
		const viewport = window.visualViewport;
		if (viewport) {
			viewport.addEventListener("resize", positionEditor);
			viewport.addEventListener("scroll", positionEditor);
			stopWatchingViewport = () => {
				viewport.removeEventListener("resize", positionEditor);
				viewport.removeEventListener("scroll", positionEditor);
			};
		}
		positionEditor();
	}

	function updateDate(key: EditableDatePropertyKey, value: string) {
		draftDates = { ...draftDates, [key]: value };
		positionEditor();
	}

	async function save() {
		if (saving) return;
		saving = true;
		try {
			const content = draftContent.trim();
			if (content) {
				const updatedContent = content.replaceAll("\n", "<br />");
				if (updatedContent !== task.content) await taskActions.updateContent(task.id, updatedContent);
			}
			if (canEditDates) {
				const edits = EDITABLE_DATE_PROPERTY_KEYS.map((key) => ({ key, value: draftDates[key] ?? "" })).filter(({ key, value }) => value !== getDateValue(key));
				if (edits.length > 0) await taskActions.applyDateEdits(task.id, edits);
			}
			onClose();
		} finally {
			saving = false;
		}
	}

	function cancel() { if (!saving) onClose(); }
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") { event.preventDefault(); cancel(); }
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save(); }
	}

	void tick().then(() => { textAreaEl?.focus(); watchViewport(); });
	onDestroy(() => stopWatchingViewport?.());
</script>

<!-- Outside the board flex layout so Android keyboard resize cannot reflow it. -->
<div class="mobile-task-editor-root" use:portalToBody>
	<button class="mobile-task-editor-backdrop" type="button" aria-label="Cancel task edit" on:click={cancel}></button>
	<div class="mobile-task-editor" bind:this={editorEl} style={editorStyle} role="dialog" aria-modal="true" aria-label="Edit task" tabindex="-1" on:keydown={handleKeydown}>
		<div class="mobile-task-editor-heading">Edit task</div>
		<textarea bind:this={textAreaEl} bind:value={draftContent} aria-label="Task content" on:input={positionEditor}></textarea>
		{#if canEditDates}<div class="mobile-task-editor-dates"><DateInputFields values={draftDates} onDateChange={updateDate} /></div>{/if}
		<div class="mobile-task-editor-actions"><button type="button" on:click={cancel} disabled={saving}>Cancel</button><button type="button" class="mod-cta" on:click={() => void save()} disabled={saving}>Save</button></div>
	</div>
</div>

<style lang="scss">
	.mobile-task-editor-root { position: fixed; inset: 0; z-index: 1000; }
	.mobile-task-editor-backdrop { position: fixed; inset: 0; width: 100%; height: 100%; margin: 0; border: 0; border-radius: 0; background: rgba(0, 0, 0, 0.28); cursor: default; }
	.mobile-task-editor { position: fixed; z-index: 1; box-sizing: border-box; padding: var(--size-4-3); overflow: auto; background: var(--background-primary); border: 1px solid var(--background-modifier-border-focus); border-radius: var(--radius-l, 12px); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28); }
	.mobile-task-editor-heading { margin-bottom: var(--size-2-2); color: var(--text-muted); font-size: var(--font-ui-small); font-weight: var(--font-medium); }
	.mobile-task-editor textarea { width: 100%; min-height: 112px; box-sizing: border-box; padding: var(--size-4-3); background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); font-size: 16px; line-height: 1.45; resize: vertical; }
	.mobile-task-editor-dates { margin-top: var(--size-4-2); }
	.mobile-task-editor-actions { display: flex; justify-content: flex-end; gap: var(--size-2-2); margin-top: var(--size-4-3); }
	.mobile-task-editor-actions button { min-height: 36px; }
</style>
