import type { TFile, Vault } from "obsidian";
import { createColumnData, type ColumnDefinition } from "../columns/columns";
import type { SettingValues } from "./settings_store";
import { shouldIncludeFilePath } from "../tasks/scope";
import {
	Task,
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	isTrackedTaskString,
} from "../tasks/task";

export interface RenamedNameModeColumn {
	id: string;
	oldColumn: ColumnDefinition;
	newColumn: ColumnDefinition;
}

export function getRenamedNameModeColumns(
	oldSettings: SettingValues,
	newSettings: SettingValues,
): RenamedNameModeColumn[] {
	const oldColumnsById = new Map(oldSettings.columns.map((column) => [column.id, column]));

	return newSettings.columns.flatMap((newColumn) => {
		const oldColumn = oldColumnsById.get(newColumn.id);
		if (!oldColumn) return [];
		if (oldColumn.matchMode !== "name" || newColumn.matchMode !== "name") return [];
		if (oldColumn.label === newColumn.label) return [];

		return [{ id: newColumn.id, oldColumn, newColumn }];
	});
}

export async function applyRenamedColumnTagUpdates({
	vault,
	oldSettings,
	newSettings,
	boardFolderPath,
	renameChoices,
}: {
	vault: Vault;
	oldSettings: SettingValues;
	newSettings: SettingValues;
	boardFolderPath: string | null;
	renameChoices: Record<string, boolean>;
}): Promise<void> {
	const renamedColumns = getRenamedNameModeColumns(oldSettings, newSettings).filter(
		({ id }) => renameChoices[id] !== false,
	);

	if (renamedColumns.length === 0) {
		return;
	}

	const oldColumnData = createColumnData(oldSettings.columns);
	const newColumnData = createColumnData(newSettings.columns);
	const oldSettingsScope = resolveScopeSettings(oldSettings, boardFolderPath);
	const targetColumnIds = new Set(renamedColumns.map(({ id }) => id));
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
		await updateFileForRenamedColumns(
			vault,
			file,
			targetColumnIds,
			oldColumnData.columnPlacementLookupTable,
			newColumnData.columnPlacementTagTable,
			oldSettings,
		);
	}
}

async function updateFileForRenamedColumns(
	vault: Vault,
	file: TFile,
	targetColumnIds: Set<string>,
	oldPlacementLookupTable: ReturnType<typeof createColumnData>["columnPlacementLookupTable"],
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

		const task = new Task(
			row,
			file,
			i,
			oldPlacementLookupTable,
			newPlacementTagTable,
			settings.consolidateTags ?? false,
			settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
			settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
			settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
		);

		if (!task.column || task.column === "archived" || task.done || !targetColumnIds.has(task.column)) {
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
