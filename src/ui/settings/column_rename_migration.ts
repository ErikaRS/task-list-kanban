import type { TFile, Vault } from "obsidian";
import { createColumnData, type ColumnDefinition } from "../columns/columns";
import { columnRuleSignature, matchesColumnDefinition } from "../columns/definitions";
import type { SettingValues } from "./settings_store";
import { getTagsFromContent } from "src/parsing/tags/tags";
import { shouldIncludeFilePath } from "../tasks/scope";
import {
	Task,
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	isTrackedTaskString,
} from "../tasks/task";

export interface ChangedColumnMatchRule {
	id: string;
	oldColumn: ColumnDefinition;
	newColumn: ColumnDefinition;
}

export function getChangedColumnMatchRules(
	oldSettings: SettingValues,
	newSettings: SettingValues,
): ChangedColumnMatchRule[] {
	const oldColumnsById = new Map(oldSettings.columns.map((column) => [column.id, column]));

	return newSettings.columns.flatMap((newColumn) => {
		const oldColumn = oldColumnsById.get(newColumn.id);
		if (!oldColumn) return [];
		if (columnRuleSignature(oldColumn) === columnRuleSignature(newColumn)) return [];

		return [{ id: newColumn.id, oldColumn, newColumn }];
	});
}

export async function applyChangedColumnTagUpdates({
	vault,
	oldSettings,
	newSettings,
	boardFolderPath,
	updateChoices,
}: {
	vault: Vault;
	oldSettings: SettingValues;
	newSettings: SettingValues;
	boardFolderPath: string | null;
	updateChoices: Record<string, boolean>;
}): Promise<void> {
	const changedColumns = getChangedColumnMatchRules(oldSettings, newSettings).filter(
		({ id }) => updateChoices[id] !== false,
	);

	if (changedColumns.length === 0) {
		return;
	}

	const newColumnData = createColumnData(newSettings.columns);
	const oldSettingsScope = resolveScopeSettings(oldSettings, boardFolderPath);
	const targetColumnIds = new Set(changedColumns.map(({ id }) => id));
	const files = vault
		.getMarkdownFiles()
		.filter((file) =>
			shouldIncludeFilePath(
				file.path,
				oldSettingsScope.filenameFilter,
				oldSettingsScope.excludeFilter,
				boardFolderPath,
			),
		);

	for (const file of files) {
		await updateFileForChangedColumns(
			vault,
			file,
			targetColumnIds,
			oldSettings.columns,
			newColumnData.columnPlacementTagTable,
			oldSettings,
		);
	}
}

async function updateFileForChangedColumns(
	vault: Vault,
	file: TFile,
	targetColumnIds: Set<string>,
	oldColumnDefinitions: ColumnDefinition[],
	newPlacementTagTable: ReturnType<typeof createColumnData>["columnPlacementTagTable"],
	settings: SettingValues,
) {
	const contents = await vault.read(file);
	const rows = contents.split("\n");
	let changed = false;

	for (let i = 0; i < rows.length; i += 1) {
		const row = rows[i];
		if (!row || !isTrackedTaskString(row, settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS)) {
			continue;
		}

		const matchedColumn = oldColumnDefinitions.find((column) =>
			matchesColumnDefinition(column, getTagsFromContent(row)),
		);
		const task = new Task(
			row,
			file,
			i,
			oldColumnDefinitions,
			newPlacementTagTable,
			settings.consolidateTags ?? false,
			settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
			settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
			settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
		);
		const targetColumnId = task.column ?? matchedColumn?.id;

		if (!targetColumnId || targetColumnId === "archived" || !targetColumnIds.has(targetColumnId)) {
			continue;
		}

		const nextRow = task.serialise();
		if (nextRow !== row) {
			rows[i] = nextRow;
			changed = true;
		}
	}

	if (changed) {
		await vault.modify(file, rows.join("\n"));
	}
}

function resolveScopeSettings(
	settings: SettingValues,
	boardFolderPath: string | null,
): {
	filenameFilter: string[] | null;
	excludeFilter: string[] | null;
} {
	let filenameFilter: string[] | null = null;

	switch (settings.scope) {
		case "everywhere":
			filenameFilter = null;
			break;
		case "folder":
			filenameFilter = boardFolderPath ? [boardFolderPath] : null;
			break;
		case "selectedFolders": {
			const selected = settings.scopeFolders ?? [];
			filenameFilter = boardFolderPath
				? [boardFolderPath, ...selected.filter((folder) => folder !== boardFolderPath)]
				: selected;
			break;
		}
	}

	const excludePaths = settings.excludePaths ?? [];
	return {
		filenameFilter,
		excludeFilter: excludePaths.length > 0 ? excludePaths : null,
	};
}
