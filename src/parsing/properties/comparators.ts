import type { Task } from "../../ui/tasks/task";
import { PropertySchemaOption, UNIVERSAL_STATUS_PROPERTY_KEY } from "./property_schema";

export enum ColumnOrderMode {
	FileOrder = "file",
	TaskName = "task-name",
	Property = "property",
	Manual = "manual",
}

export type SortDirection = "asc" | "desc";

export interface PropertyCompareOptions {
	statusMarkerOrder?: string;
	doneStatusMarkers?: string;
	propertySchema?: PropertySchemaOption;
}

/**
 * Compares two parsed property values with typed ordering.
 *
 * - dates by chronological order
 * - numbers (including priority weights) by numeric order
 * - everything else by lexical order
 *
 * Callers are expected to handle missing values (null) before delegating here.
 */
export function compareValues(
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

export function getPriorityWeight(value: string | number | Date): number | null {
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "string") {
		const lower = value.toLowerCase().trim();
		switch (lower) {
			case "highest":
				return 5;
			case "high":
				return 4;
			case "medium":
				return 3;
			case "low":
				return 2;
			case "lowest":
				return 1;
		}
	}
	return null;
}

/**
 * Compares two tasks by a parsed property value.
 *
 * Missing values sort after present values when ascending and before present
 * values when descending. The direction also flips the ordering of present
 * values.
 */
export function compareByProperty(
	a: Task,
	b: Task,
	key: string,
	direction: SortDirection,
	options: PropertyCompareOptions = {},
): number {
	const aValue = a.properties.get(key)?.value ?? null;
	const bValue = b.properties.get(key)?.value ?? null;

	if (key === "priority") {
		return comparePriorityValues(aValue, bValue, direction, options.propertySchema);
	}

	if (aValue === null && bValue === null) return 0;
	if (aValue === null) return direction === "desc" ? -1 : 1;
	if (bValue === null) return direction === "desc" ? 1 : -1;

	if (key === UNIVERSAL_STATUS_PROPERTY_KEY) {
		return compareStatusMarkerValues(
			aValue,
			bValue,
			options.statusMarkerOrder ?? "",
			options.doneStatusMarkers ?? "",
			direction,
		);
	}

	const result = compareValues(aValue, bValue);
	return direction === "desc" ? -result : result;
}

function comparePriorityValues(
	a: string | number | Date | null,
	b: string | number | Date | null,
	direction: SortDirection,
	propertySchema: PropertySchemaOption | undefined,
): number {
	const schema = propertySchema ?? inferPrioritySchema(a, b);
	if (a === null && b === null) return 0;
	if (schema === PropertySchemaOption.Dataview) {
		if (a === null) return 1;
		if (b === null) return -1;
	} else {
		const aWeight = a === null ? 2.5 : getPriorityWeight(a) ?? 0;
		const bWeight = b === null ? 2.5 : getPriorityWeight(b) ?? 0;
		const result = aWeight - bWeight;
		return direction === "desc" ? -result : result;
	}

	const aWeight = getPriorityWeight(a) ?? 0;
	const bWeight = getPriorityWeight(b) ?? 0;
	const result = aWeight - bWeight;
	return direction === "desc" ? -result : result;
}

function inferPrioritySchema(
	a: string | number | Date | null,
	b: string | number | Date | null,
): PropertySchemaOption {
	return typeof a === "number" || typeof b === "number"
		? PropertySchemaOption.TasksPlugin
		: PropertySchemaOption.Dataview;
}

export function compareStatusMarkerValues(
	a: string | number | Date,
	b: string | number | Date,
	statusMarkerOrder: string,
	doneStatusMarkers = "",
	direction: SortDirection = "asc",
): number {
	const aMarker = String(a);
	const bMarker = String(b);
	const doneRankByMarker = createMarkerRankMap(doneStatusMarkers);
	const aDoneRank = doneRankByMarker.get(aMarker);
	const bDoneRank = doneRankByMarker.get(bMarker);

	if (aDoneRank !== undefined && bDoneRank !== undefined) {
		return aDoneRank - bDoneRank;
	}
	if (aDoneRank !== undefined) return 1;
	if (bDoneRank !== undefined) return -1;

	const rankByMarker = createStatusMarkerRankMap(statusMarkerOrder);
	const aRank = rankByMarker.get(aMarker);
	const bRank = rankByMarker.get(bMarker);
	let result: number;

	if (aRank !== undefined && bRank !== undefined) {
		result = aRank - bRank;
	} else if (aRank !== undefined) {
		result = -1;
	} else if (bRank !== undefined) {
		result = 1;
	} else {
		result = aMarker.localeCompare(bMarker);
	}

	return direction === "desc" ? -result : result;
}

function createStatusMarkerRankMap(statusMarkerOrder: string): Map<string, number> {
	return createMarkerRankMap(getOrderedStatusMarkers(statusMarkerOrder).join(""));
}

export function getOrderedStatusMarkers(statusMarkerOrder: string): string[] {
	const orderedMarkers = Array.from(statusMarkerOrder);
	if (!orderedMarkers.includes(" ")) {
		orderedMarkers.unshift(" ");
	}
	return orderedMarkers;
}

function createMarkerRankMap(markers: string): Map<string, number> {
	const rankByMarker = new Map<string, number>();
	for (const marker of Array.from(markers)) {
		if (!rankByMarker.has(marker)) {
			rankByMarker.set(marker, rankByMarker.size);
		}
	}

	return rankByMarker;
}
