import { derived, get, type Readable, type Writable } from "svelte/store";
import type { SettingValues } from "../settings/settings_store";
import {
	type ColumnDefinition,
	type ColumnTag,
	getColumnHeaderTags,
	getColumnWriteTags,
	RESERVED_COLUMN_KEYS,
	parseColumnSpec,
} from "./definitions";

export type DefaultColumns = "uncategorised" | "done";
export type ColumnTagTable = Record<ColumnTag, string>;
export type ColumnColourTable = Record<ColumnTag, string>;
export type ColumnPlacementTagTable = Record<ColumnTag, string[]>;
export type ColumnMatchTagTable = Record<ColumnTag, string[]>;

export {
	type ColumnDefinition,
	type ColumnTag,
	getColumnWriteTags,
	RESERVED_COLUMN_KEYS,
	parseColumnSpec,
} from "./definitions";

export const createColumnStores = (
	settingsStore: Writable<SettingValues>,
): {
	columnDefinitions: Readable<ColumnDefinition[]>;
	columnTagTable: Readable<ColumnTagTable>;
	columnColourTable: Readable<ColumnColourTable>;
	columnPlacementTagTable: Readable<ColumnPlacementTagTable>;
	columnMatchTagTable: Readable<ColumnMatchTagTable>;
} => {
	const columnDefinitions = derived([settingsStore], ([settings]) => settings.columns ?? []);
	const columnData = derived([columnDefinitions], ([columns]) => createColumnData(columns));
	const columnTagTable = derived([columnData], ([data]) => data.columnTagTable);
	const columnColourTable = derived([columnData], ([data]) => data.columnColourTable);
	const columnPlacementTagTable = derived([columnData], ([data]) => data.columnPlacementTagTable);
	const columnMatchTagTable = derived([columnData], ([data]) => data.columnMatchTagTable);

	return {
		columnDefinitions,
		columnTagTable,
		columnColourTable,
		columnPlacementTagTable,
		columnMatchTagTable,
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

export function createColumnData(columns: ColumnDefinition[]): {
	columnTagTable: ColumnTagTable;
	columnColourTable: ColumnColourTable;
	columnPlacementTagTable: ColumnPlacementTagTable;
	columnMatchTagTable: ColumnMatchTagTable;
} {
	const columnTagTable: ColumnTagTable = {};
	const columnColourTable: ColumnColourTable = {};
	const columnPlacementTagTable: ColumnPlacementTagTable = {};
	const columnMatchTagTable: ColumnMatchTagTable = {};

	for (const column of columns) {
		if (RESERVED_COLUMN_KEYS.has(column.id)) continue;
		columnTagTable[column.id] = column.label;
		if (column.color) {
			columnColourTable[column.id] = column.color;
		}
		columnPlacementTagTable[column.id] = getColumnWriteTags(column);
		columnMatchTagTable[column.id] = getColumnHeaderTags(column);
	}

	return {
		columnTagTable,
		columnColourTable,
		columnPlacementTagTable,
		columnMatchTagTable,
	};
}
