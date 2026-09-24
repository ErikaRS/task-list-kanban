<script lang="ts">
	import { saveMobileCreation, type MobileCreationStore } from "./mobile_creation";
	import MobileEditorSheet from "../components/MobileEditorSheet.svelte";
	import { getPropertyWriteAdapter } from "../../parsing/properties";
	import type { DateFieldValues } from "../components/DateInputFields.svelte";
	export let session: MobileCreationStore;
	let content = "";
	let dates: DateFieldValues = { due: "", scheduled: "", start: "" };
	let previousId: symbol | undefined;
	$: if ($session?.id !== previousId) {
		previousId = $session?.id;
		content = "";
		dates = { due: "", scheduled: "", start: "" };
	}
	async function save() {
		const current = $session;
		if (!current) return;
		await saveMobileCreation(current, content, dates);
	}
	function chooseFile(e: MouseEvent) {
		const current = $session;
		if (!current || current.fixedFile) return;
		current.taskActions.pickFileForNewTask(current.column, e, file => {
			session.update(active => active?.id === current.id ? { ...active, file } : active);
		}, true);
	}
</script>
{#if $session}
	{#key $session.id}
		<MobileEditorSheet
			title="New task"
			submitLabel="Create"
			context={$session.context}
			bind:content
			bind:dates
			showDates={getPropertyWriteAdapter($session.propertySchemaOption) !== null}
			canSubmit={!!$session.file && !!content.trim()}
			onSave={save}
			onClose={() => session.set(null)}
		>
			{#if $session.fixedFile}
				<div class="tlk-editor-context">{$session.file?.path}</div>
			{:else}
				<button type="button" class="tlk-editor-file" on:click={chooseFile}>
					{$session.file?.path ?? "Choose destination file…"}
				</button>
			{/if}
		</MobileEditorSheet>
	{/key}
{/if}
