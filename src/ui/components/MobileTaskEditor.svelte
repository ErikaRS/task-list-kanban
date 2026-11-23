<script lang="ts">
	import { validateMarkdownBody } from "../tasks/markdown_source";
	import MobileEditorSheet from "./MobileEditorSheet.svelte";
	import { EDITABLE_DATE_PROPERTY_KEYS, formatLocalDate, getPropertyByKey, getPropertyWriteAdapter, PropertySchemaOption, type EditableDatePropertyKey } from "../../parsing/properties";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import { type DateFieldValues } from "./DateInputFields.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	export let onClose: () => void = () => {};

	let draftContent = task.editableContent;
	let draftDates: DateFieldValues = { due: getDateValue("due"), scheduled: getDateValue("scheduled"), start: getDateValue("start") };
	const taskId = task.id;
	const sourceSnapshot = task.editableSource;
	let saving = false;
	$: canEditDates = getPropertyWriteAdapter(propertySchemaOption) !== null;

	function getDateValue(key: EditableDatePropertyKey): string {
		const property = getPropertyByKey(task.properties, key);
		return property?.value instanceof Date ? formatLocalDate(property.value) : "";
	}

	async function save() {
		if (saving) return;
		saving = true;
		try {
			validateMarkdownBody(draftContent);
			const edits = canEditDates ? EDITABLE_DATE_PROPERTY_KEYS.map((key) => ({ key, value: draftDates[key] ?? "" })).filter(({ key, value }) => value !== getDateValue(key)) : [];
			await taskActions.updateContent(taskId, draftContent, edits, sourceSnapshot);
		} finally {
			saving = false;
		}
	}

</script>
<MobileEditorSheet title="Edit task"
 context={task.path} bind:content={draftContent} bind:dates={draftDates} showDates={canEditDates}
 onSave={save} {onClose} />
