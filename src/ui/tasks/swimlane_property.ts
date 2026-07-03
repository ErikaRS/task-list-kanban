import {
	getTasksPriorityOption,
	getTasksPriorityValueFromWeight,
	parseDateOnly,
	PropertySchemaOption,
	type PropertyWriteAdapter,
	type WritableDatePropertyKey,
} from "../../parsing/properties";

const WRITABLE_SWIMLANE_DATE_KEYS = new Set<string>(["due", "scheduled", "start"]);

/**
 * Property keys whose swimlane value can be written back to a task line.
 * Cross-lane drops on other property groups (status, created, arbitrary
 * Dataview keys, …) are rejected because there is no writer for them.
 */
export function isWritableSwimlanePropertyKey(key: string): boolean {
	return WRITABLE_SWIMLANE_DATE_KEYS.has(key) || key === "priority";
}

/**
 * Builds the row transform that rewrites only the grouped property when a
 * task is dropped into a property swimlane. A `null` value (the Unassigned
 * lane) removes the property. Returns `null` when the key or value cannot be
 * written with the given adapter.
 */
export function createSwimlanePropertyTransform(
	adapter: PropertyWriteAdapter,
	key: string,
	value: string | number | Date | null,
): ((row: string) => string) | null {
	if (WRITABLE_SWIMLANE_DATE_KEYS.has(key)) {
		const dateKey = key as Exclude<WritableDatePropertyKey, "completion">;
		if (value === null) {
			return (row) => adapter.removeDate(row, dateKey);
		}
		const date = formatSwimlaneDateValue(value);
		return date === null ? null : (row) => adapter.upsertDate(row, dateKey, date);
	}

	if (key === "priority") {
		if (value === null) {
			return (row) => adapter.removePriority(row);
		}
		const priority = formatSwimlanePriorityValue(adapter, value);
		return priority === null ? null : (row) => adapter.upsertPriority(row, priority);
	}

	return null;
}

function formatSwimlaneDateValue(value: string | number | Date): string | null {
	if (value instanceof Date) {
		// Date-only property values are parsed at UTC midnight, so format in UTC
		// to match the lane label instead of shifting a day in negative-offset
		// timezones.
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === "string" && parseDateOnly(value)) {
		return value;
	}
	return null;
}

function formatSwimlanePriorityValue(
	adapter: PropertyWriteAdapter,
	value: string | number | Date,
): string | null {
	if (adapter.schema === PropertySchemaOption.TasksPlugin) {
		// Tasks-plugin priority buckets carry the numeric weight; the writer
		// expects the named value ("high", "low", …).
		if (typeof value === "number") {
			return getTasksPriorityValueFromWeight(value) ?? null;
		}
		return typeof value === "string"
			? getTasksPriorityOption(value)?.value ?? null
			: null;
	}

	return value instanceof Date ? null : String(value);
}
