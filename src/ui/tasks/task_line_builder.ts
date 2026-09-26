import {
	type ColumnDefinition,
	type ColumnTag,
	type DefaultColumns,
} from "../columns/columns";
import {
	getColumnPriority,
	getColumnPrioritySchema,
	getColumnStatus,
} from "../columns/definitions";
import {
	getPropertyWriteAdapter,
	type EditableDatePropertyKey,
	type PropertySchemaOption,
} from "../../parsing/properties";
import { createSwimlanePropertyTransform } from "./swimlane_property";
import { createTaskLine } from "./task_creation";

export type NewTaskColumn = ColumnTag | DefaultColumns;

/** A swimlane property value a new task inherits from the lane it was added in. */
export interface GroupProperty {
	key: string;
	value: string | number | Date;
}

export interface NewTaskLineOptions {
	content: string;
	column: NewTaskColumn;
	columnDefinitions: ColumnDefinition[];
	getPlacementTagsForColumn: (column: ColumnTag) => string[];
	propertySchemaOption: PropertySchemaOption;
	additionalTags?: string[];
	dateProperties?: Partial<Record<EditableDatePropertyKey, string>>;
	groupProperty?: GroupProperty | null;
}

export function buildNewTaskLine({
	content,
	column,
	columnDefinitions,
	getPlacementTagsForColumn,
	propertySchemaOption,
	additionalTags = [],
	dateProperties = {},
	groupProperty = null,
}: NewTaskLineOptions): string {
	const columnDefinition =
		column === "uncategorised" || column === "done"
			? undefined
			: columnDefinitions.find((definition) => definition.id === column);
	const adapter = getPropertyWriteAdapter(propertySchemaOption);
	const priorityAdapter = getPropertyWriteAdapter(
		getColumnPrioritySchema(columnDefinition) ?? propertySchemaOption,
	);
	let taskLine = createTaskLine(
		content,
		column === "uncategorised" || column === "done"
			? []
			: getPlacementTagsForColumn(column),
		additionalTags,
		column === "done" ? "x" : getColumnStatus(columnDefinition) ?? " ",
	);

	const priority = getColumnPriority(columnDefinition);
	if (priority && priorityAdapter) {
		taskLine = priorityAdapter.upsertPriority(taskLine, priority);
	}

	if (adapter && groupProperty) {
		// Applied before the entered dates so a date typed in the new-task form wins.
		const transform = createSwimlanePropertyTransform(adapter, groupProperty.key, groupProperty.value);
		if (transform) {
			taskLine = transform(taskLine);
		}
	}

	if (adapter) {
		for (const key of ["due", "scheduled", "start"] as const) {
			const date = dateProperties[key];
			if (date) {
				taskLine = adapter.upsertDate(taskLine, key, date);
			}
		}
	}

	return taskLine;
}
