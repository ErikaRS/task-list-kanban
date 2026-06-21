import type { Task } from "../../ui/tasks/task";
import { UNIVERSAL_STATUS_PROPERTY_KEY } from "./property_schema";

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
