<script lang="ts">
	import { onMount } from "svelte";
	import { validateMarkdownBody } from "../tasks/markdown_source";

	export let initialContent: string;
	export let onSave: (content: string) => Promise<void>;
	export let onClose: () => void;
	let content = initialContent;
	let textarea: HTMLTextAreaElement;
	let saving = false;
	let error = "";
	function resize() {
		textarea.style.height = "0px";
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
	onMount(() => { resize(); textarea.focus(); });
	async function save() {
		if (saving) return;
		saving = true;
		error = "";
		try {
			validateMarkdownBody(content);
			await onSave(content);
			onClose();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : "Could not save. Please try again.";
			textarea.focus();
		} finally { saving = false; }
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === "Enter" && !event.shiftKey || event.key === "Escape") {
			event.preventDefault();
			if (!saving) textarea.blur();
		}
	}
</script>

<textarea aria-label="Markdown task content" bind:this={textarea} bind:value={content}
	readonly={saving} on:input={resize} on:keydown={keydown} on:blur={save}></textarea>
{#if error}
	<div role="alert">{error}</div>
	<button type="button" on:mousedown|preventDefault on:click={save}>Retry save</button>
	<button type="button" on:mousedown|preventDefault on:click={onClose}>Cancel</button>
{/if}

<style>
	textarea { width: 100%; min-height: 1.6rem; resize: none; cursor: text; background-color: var(--color-base-25); }
</style>
