import type { Task } from "../../ui/tasks/task";

export enum ColumnOrderMode {
	FileOrder = "file",
	Property = "property",
	Manual = "manual",
}

export type SortDirection = "asc" | "desc";

/**
 * Compares two parsed property values with typed ordering.
 *
 * - dates by chronological order
 * - numbers (including priority weights) by numeric order
 * - everything else by lexical order
 *
 * Callers are expected to handle missing values (null) before delegating here.
 */
function compareValues(
	a: string | number | Date,
	b: string | number | Date
): number {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() - b.getTime();
	}
	if (typeof a === "number" && typeof b === "number") {
		return a - b;
	}
	return String(a).localeCompare(String(b));
}

/**
 * Compares two tasks by a parsed property value.
 *
 * Missing values always sort last regardless of direction, matching the spec's
 * "missing values last" rule. The direction only flips the ordering of present
 * values.
 */
export function compareByProperty(
	a: Task,
	b: Task,
	key: string,
	direction: SortDirection
): number {
	const aValue = a.properties.get(key)?.value ?? null;
	const bValue = b.properties.get(key)?.value ?? null;

	if (aValue === null && bValue === null) return 0;
	if (aValue === null) return 1;
	if (bValue === null) return -1;

	const result = compareValues(aValue, bValue);
	return direction === "desc" ? -result : result;
}
