<script lang="ts">
	import { onMount } from "svelte";
	import { lockMobileBoardLayout } from "../mobile_editor_layout";
	import DateInputFields, { type DateFieldValues } from "./DateInputFields.svelte";
	export let title = "Edit task";
	export let context = "";
	export let submitLabel = "Save";
	export let content = "";
	export let dates: DateFieldValues = { due: "", scheduled: "", start: "" };
	export let showDates = false;
	export let canSubmit = true;
	export let onSave: () => Promise<void>;
	export let onClose: () => void;
	let sheet: HTMLDivElement;
	let textarea: HTMLTextAreaElement;
	let root: HTMLDivElement;
	let saving = false;
	let error = "";
	let frame = 0;
	let disposed = false;
	let ownerWindow: typeof window;

	// Apply initial geometry synchronously: a hidden textarea cannot receive focus.
	function positionNow() {
		const viewport = ownerWindow.visualViewport;
		const viewportWidth = viewport?.width ?? ownerWindow.innerWidth;
		const viewportHeight = viewport?.height ?? ownerWindow.innerHeight;
		const width = Math.min(520, viewportWidth);
		Object.assign(sheet.style, {
			left: `${(viewport?.offsetLeft ?? 0) + (viewportWidth - width) / 2}px`,
			top: `${(viewport?.offsetTop ?? 0) + viewportHeight}px`,
			width: `${width}px`,
			maxHeight: `${Math.max(0, viewportHeight - 8)}px`,
			visibility: "visible",
		});
	}

	function schedulePosition() {
		if (frame) return;
		frame = ownerWindow.requestAnimationFrame(() => {
			frame = 0;
			if (!disposed) positionNow();
		});
	}
	function cancel() {
		if (!saving) onClose();
	}

	async function save() {
		if (saving || !canSubmit) return;
		saving = true;
		error = "";
		try {
			await onSave();
			if (!disposed) onClose();
		} catch (e) {
			if (!disposed) error = e instanceof Error ? e.message : "Unable to save task. Please try again.";
		} finally {
			if (!disposed) saving = false;
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			cancel();
		}
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			void save();
		}
		if (event.key !== "Tab") return;
		const controls = Array.from(sheet.querySelectorAll<HTMLElement>(
			'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
		)).filter(element => !element.closest("[inert]") && element.getClientRects().length > 0);
		const first = controls[0];
		const last = controls[controls.length - 1];
		const focused = sheet.ownerDocument.activeElement;
		if (!first || !last) {
			event.preventDefault();
			sheet.focus();
		} else if (event.shiftKey && (focused === first || focused === sheet)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (focused === last || focused === sheet)) {
			event.preventDefault();
			first.focus();
		}
	}
	onMount(() => {
		const ownerDocument = root.ownerDocument;
		ownerWindow = ownerDocument.defaultView!;
		const previous = ownerDocument.activeElement as HTMLElement | null;
		const unlock = lockMobileBoardLayout(root.closest<HTMLElement>(".board-main") ?? root.closest(".board-body")?.querySelector(".board-main") ?? null);
		const board = root.closest<HTMLElement>(".board-content");
		const wasInert = board?.inert ?? false;
		ownerDocument.body.appendChild(root);
		if (board) board.inert = true;
		const viewport = ownerWindow.visualViewport;
		viewport?.addEventListener("resize", schedulePosition);
		viewport?.addEventListener("scroll", schedulePosition);
		ownerWindow.addEventListener("resize", schedulePosition);
		positionNow();
		textarea.focus({ preventScroll: true });
		return () => {
			disposed = true;
			ownerWindow.cancelAnimationFrame(frame);
			viewport?.removeEventListener("resize", schedulePosition);
			viewport?.removeEventListener("scroll", schedulePosition);
			ownerWindow.removeEventListener("resize", schedulePosition);
			unlock();
			root.remove();
			if (board) board.inert = wasInert;
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	});
</script>
<div class="tlk-mobile-editor-root" bind:this={root}>
	<button type="button" class="tlk-editor-backdrop" tabindex="-1" aria-label="Cancel task edit" on:click={cancel} disabled={saving}></button>
	<div class="tlk-mobile-editor-sheet" bind:this={sheet} style="visibility:hidden" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" on:keydown|capture={keydown}>
		<div class="tlk-editor-heading"><strong>{title}</strong><button type="button" on:click={cancel} disabled={saving}>Cancel</button></div>
		{#if context}<div class="tlk-editor-context">{context}</div>{/if}
		<fieldset class="tlk-editor-fields" disabled={saving}>
			<slot />
			<textarea bind:this={textarea} bind:value={content} aria-label="Task content" placeholder="What needs doing?" disabled={saving}></textarea>
			{#if showDates}<DateInputFields values={dates} onDateChange={(key, value) => { dates = { ...dates, [key]: value }; }} />{/if}
			{#if error}<p role="alert">{error}</p>{/if}
		</fieldset>
		<div class="tlk-editor-actions"><button type="button" class="mod-cta" disabled={saving || !canSubmit} on:click={() => void save()}>{saving ? "Saving…" : submitLabel}</button></div>
	</div>
</div>
