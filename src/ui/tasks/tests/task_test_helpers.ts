import { expect } from "vitest";
import { kebab } from "src/parsing/kebab/kebab";
import { createColumnData, type ColumnDefinition, type ColumnPlacementTagTable, type ColumnTag } from "src/ui/columns/columns";
import {
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	isTrackedTaskString,
	Task,
} from "../task";

export function createNameModeColumns(labels: string[]): ColumnDefinition[] {
	return labels.map((label) => ({
		id: kebab<ColumnTag>(label),
		label,
		matchMode: "name",
		matchTags: [],
	}));
}

export function createTagModeColumns(
	definitions: Array<{ id: string; label: string; matchTags: string[] }>,
): ColumnDefinition[] {
	return definitions.map(({ id, label, matchTags }) => ({
		id: id as ColumnTag,
		label,
		matchMode: "tags",
		matchTags,
	}));
}

export interface TaskParseOptions {
	columns?: ColumnDefinition[];
	placementTags?: ColumnPlacementTagTable;
	consolidateTags?: boolean;
	doneStatusMarkers?: string;
	cancelledStatusMarkers?: string;
	ignoredStatusMarkers?: string;
	rowIndex?: number;
}

const defaultColumns = createNameModeColumns(["column"]);
const defaultPlacementTags = createColumnData(defaultColumns).columnPlacementTagTable;

export function parseTask(taskString: string, options: TaskParseOptions = {}): Task {
	const columns = options.columns ?? defaultColumns;
	const placementTags = options.placementTags ?? createColumnData(columns).columnPlacementTagTable;

	expect(isTrackedTaskString(taskString, options.ignoredStatusMarkers)).toBe(true);

	return new Task(
		taskString as ConstructorParameters<typeof Task>[0],
		{ path: "/" },
		options.rowIndex ?? 0,
		columns,
		placementTags,
		options.consolidateTags ?? false,
		options.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
		options.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
		options.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
	);
}

export function parseTaskWithColumns(taskString: string, columns: ColumnDefinition[], options: Omit<TaskParseOptions, "columns"> = {}): Task {
	return parseTask(taskString, {
		...options,
		columns,
		placementTags: options.placementTags ?? createColumnData(columns).columnPlacementTagTable,
	});
}

export { defaultColumns, defaultPlacementTags };
