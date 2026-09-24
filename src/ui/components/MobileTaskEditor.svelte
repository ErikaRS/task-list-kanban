<script lang="ts">
	import MobileEditorSheet from "./MobileEditorSheet.svelte";
	import { EDITABLE_DATE_PROPERTY_KEYS, formatLocalDate, getPropertyByKey, getPropertyWriteAdapter, PropertySchemaOption, type EditableDatePropertyKey } from "../../parsing/properties";
	import type { TaskActions } from "../tasks/actions";
	import type { Task } from "../tasks/task";
	import { type DateFieldValues } from "./DateInputFields.svelte";

	export let task: Task;
	export let taskActions: TaskActions;
	export let propertySchemaOption: PropertySchemaOption = PropertySchemaOption.None;
	/** Source-row editing supplies its own raw text and does not expose dates. */
	export let sourceRowIndex: number | undefined = undefined;
	export let initialContent: string | undefined = undefined;
	export let onClose: () => void = () => {};

	let draftContent = initialContent ?? task.content.replaceAll("<br />", "\n");
	let draftDates: DateFieldValues = { due: getDateValue("due"), scheduled: getDateValue("scheduled"), start: getDateValue("start") };
	let saving = false;
	$: canEditDates = sourceRowIndex === undefined && getPropertyWriteAdapter(propertySchemaOption) !== null;

	function getDateValue(key: EditableDatePropertyKey): string {
		const property = getPropertyByKey(task.properties, key);
		return property?.value instanceof Date ? formatLocalDate(property.value) : "";
	}

	async function save() {
		if (saving) return;
		saving = true;
		try {
			const content = draftContent.trim();
			if (content) {
				if (sourceRowIndex !== undefined) {
					if (draftContent !== initialContent) {
						await taskActions.updateSourceBlockRow(task.id, sourceRowIndex, draftContent);
					}
				} else {
					const updatedContent = content.replaceAll("\n", "<br />");
					if (updatedContent !== task.content) await taskActions.updateContent(task.id, updatedContent);
				}
			}
			if (canEditDates) {
				const edits = EDITABLE_DATE_PROPERTY_KEYS.map((key) => ({ key, value: draftDates[key] ?? "" })).filter(({ key, value }) => value !== getDateValue(key));
				if (edits.length > 0) await taskActions.applyDateEdits(task.id, edits);
			}
		} finally {
			saving = false;
		}
	}

</script>
<MobileEditorSheet title={sourceRowIndex === undefined ? "Edit task" : "Edit subtask"}
 context={task.path} bind:content={draftContent} bind:dates={draftDates} showDates={canEditDates}
 onSave={save} {onClose} />
