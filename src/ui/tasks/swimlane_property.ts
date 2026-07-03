import {
	getTasksPriorityOption,
	getTasksPriorityValueFromWeight,
	getWritablePropertyTarget,
	parseDateOnly,
	PropertySchemaOption,
	type PropertyWriteAdapter,
} from "../../parsing/properties";

/**
 * Whether tasks dropped into a swimlane grouped by `key` can have that
 * property written back. Lanes for other property groups (status, created,
 * arbitrary Dataview keys, …) are rejected as drop targets because there is
 * no writer for them.
 */
export function isWritableSwimlanePropertyKey(key: string): boolean {
	return getWritablePropertyTarget(key) !== null;
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
	const target = getWritablePropertyTarget(key);
	if (!target) {
		return null;
	}

	if (target.kind === "date") {
		if (value === null) {
			return (row) => adapter.removeDate(row, target.key);
		}
		const date = formatSwimlaneDateValue(value);
		return date === null ? null : (row) => adapter.upsertDate(row, target.key, date);
	}

	if (value === null) {
		return (row) => adapter.removePriority(row);
	}
	const priority = formatSwimlanePriorityValue(adapter, value);
	return priority === null ? null : (row) => adapter.upsertPriority(row, priority);
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
