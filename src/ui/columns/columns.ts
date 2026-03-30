import { derived, get, type Readable, type Writable } from "svelte/store";
import type { SettingValues } from "../settings/settings_store";
import {
	type ColumnDefinition,
	type ColumnTag,
	RESERVED_COLUMN_KEYS,
	getColumnPlacementTag,
	parseColumnSpec,
} from "./definitions";

export type DefaultColumns = "uncategorised" | "done";
export type ColumnTagTable = Record<ColumnTag, string>;
export type ColumnColourTable = Record<ColumnTag, string>;
export type ColumnPlacementTagTable = Record<ColumnTag, string>;
export type ColumnPlacementLookupTable = Record<string, ColumnTag>;

export {
	type ColumnDefinition,
	type ColumnTag,
	RESERVED_COLUMN_KEYS,
	getColumnPlacementTag,
	parseColumnSpec,
} from "./definitions";

export const createColumnStores = (
	settingsStore: Writable<SettingValues>,
): {
	columnDefinitions: Readable<ColumnDefinition[]>;
	columnTagTable: Readable<ColumnTagTable>;
	columnColourTable: Readable<ColumnColourTable>;
	columnPlacementTagTable: Readable<ColumnPlacementTagTable>;
	columnPlacementLookupTable: Readable<ColumnPlacementLookupTable>;
} => {
	const columnDefinitions = derived([settingsStore], ([settings]) => settings.columns ?? []);

	const columnTagTable = derived([columnDefinitions], ([columns]) => {
		const output: ColumnTagTable = {};

		for (const column of columns) {
			if (RESERVED_COLUMN_KEYS.has(column.id)) continue;
			output[column.id] = column.label;
		}

		return output;
	});

	const columnColourTable = derived([columnDefinitions], ([columns]) => {
		const output: ColumnColourTable = {};

		for (const column of columns) {
			if (RESERVED_COLUMN_KEYS.has(column.id) || !column.color) continue;
			output[column.id] = column.color;
		}

		return output;
	});

	const columnPlacementTagTable = derived([columnDefinitions], ([columns]) => {
		const output: ColumnPlacementTagTable = {};

		for (const column of columns) {
			if (RESERVED_COLUMN_KEYS.has(column.id)) continue;
			output[column.id] = getColumnPlacementTag(column);
		}

		return output;
	});

	const columnPlacementLookupTable = derived([columnPlacementTagTable], ([placementTable]) => {
		const output: ColumnPlacementLookupTable = {};

		for (const [columnId, placementTag] of Object.entries(placementTable)) {
			output[placementTag] = columnId as ColumnTag;
		}

		return output;
	});

	return {
		columnDefinitions,
		columnTagTable,
		columnColourTable,
		columnPlacementTagTable,
		columnPlacementLookupTable,
	};
};

export const createColumnTagTableStore = (
	settingsStore: Writable<SettingValues>,
): Readable<ColumnTagTable> => {
	return createColumnStores(settingsStore).columnTagTable;
};

export function isColumnTag(
	input: ColumnTag | DefaultColumns,
	columnTagTableStore: Readable<ColumnTagTable>,
): input is ColumnTag {
	return input in get(columnTagTableStore);
}

const DEFAULT_UNCATEGORIZED_LABEL = "Uncategorized";
const DEFAULT_DONE_LABEL = "Done";

export function resolveDefaultColumnName(
	column: DefaultColumns,
	uncategorizedColumnName: string | undefined,
	doneColumnName: string | undefined,
): string {
	switch (column) {
		case "uncategorised":
			return uncategorizedColumnName || DEFAULT_UNCATEGORIZED_LABEL;
		case "done":
			return doneColumnName || DEFAULT_DONE_LABEL;
	}
}

export const createCollapsedColumnsStore = (
	settingsStore: Writable<SettingValues>,
): Readable<Set<string>> => {
	return derived([settingsStore], ([settings]) => {
		return new Set<string>(settings.collapsedColumns ?? []);
	});
};
