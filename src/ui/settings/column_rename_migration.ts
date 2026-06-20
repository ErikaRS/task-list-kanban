import type { TFile, Vault } from "obsidian";
import { createColumnData, type ColumnDefinition, type ColumnTag } from "../columns/columns";
import type { SettingValues } from "./settings_store";
import { getTagsFromContent } from "src/parsing/tags/tags";
import { shouldIncludeFilePath } from "../tasks/scope";
import {
	columnRuleSignature,
	getColumnPrioritySchema,
	resolveMatchedColumnDefinition,
	usesPriorityMatching,
} from "../columns/definitions";
import {
	Task,
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	isTrackedTaskString,
} from "../tasks/task";
import { getSchemaImpl } from "../../parsing/properties";
import { PropertySchemaOption, type TaskPropertyMap } from "../../parsing/properties/property_schema";
import { getTasksPriorityValueFromWeight } from "../../parsing/properties/tasks_schema";

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
	const changedColumnsById = new Map(changedColumns.map((column) => [column.id, column]));
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
			changedColumnsById,
			oldSettings.columns,
			newSettings.columns,
			newColumnData.columnPlacementTagTable,
			oldSettings,
		);
	}
}

async function updateFileForChangedColumns(
	vault: Vault,
	file: TFile,
	changedColumnsById: Map<string, ChangedColumnMatchRule>,
	oldColumnDefinitions: ColumnDefinition[],
	newColumnDefinitions: ColumnDefinition[],
	newPlacementTagTable: ReturnType<typeof createColumnData>["columnPlacementTagTable"],
	settings: SettingValues,
) {
	const contents = await vault.read(file);
	const rows = contents.split("\n");
	const oldPropertySchemaOption = settings.propertySchema ?? PropertySchemaOption.None;
	const oldPropertySchema = getSchemaImpl(oldPropertySchemaOption);
	let changed = false;

	for (let i = 0; i < rows.length; i += 1) {
		const row = rows[i];
		if (!row || !isTrackedTaskString(row, settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS)) {
			continue;
		}

		const status = row.match(/^\s*[-*+]\s\[([^\[\]]*)\]\s/)?.[1] || " ";
		const oldProperties = oldPropertySchema.parseProperties(row);
		const matchedColumn = resolveMatchedColumnDefinition(oldColumnDefinitions, {
			tags: getTagsFromContent(row),
			status,
			priority: getPriorityMatchValue(oldPropertySchemaOption, oldProperties),
			prioritySchema: getPriorityColumnContextSchema(oldPropertySchemaOption),
			priorities: getPriorityMatchValues(row),
		});
		const targetColumnId = matchedColumn?.id;
		const changedColumn = targetColumnId ? changedColumnsById.get(targetColumnId) : undefined;

		if (!targetColumnId || targetColumnId === "archived" || !changedColumn) {
			continue;
		}

		const task = new Task(
			row,
			file,
			i,
			{
				columnDefinitions: oldColumnDefinitions,
				columnWriteDefinitions: newColumnDefinitions,
				columnPlacementTagTable: newPlacementTagTable,
				consolidateTags: settings.consolidateTags ?? false,
				doneStatusMarkers: settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
				cancelledStatusMarkers: settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
				ignoredStatusMarkers: settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
				propertySchema: getSchemaImpl(getMigrationSchema(changedColumn, oldPropertySchemaOption)),
			}
		);

		if (!task.done) {
			task.column = targetColumnId as ColumnTag;
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

function getMigrationSchema(
	changedColumn: ChangedColumnMatchRule,
	fallbackSchema: PropertySchemaOption,
): PropertySchemaOption {
	if (usesPriorityMatching(changedColumn.newColumn)) {
		return getColumnPrioritySchema(changedColumn.newColumn) ?? fallbackSchema;
	}
	if (usesPriorityMatching(changedColumn.oldColumn)) {
		return getColumnPrioritySchema(changedColumn.oldColumn) ?? fallbackSchema;
	}
	return fallbackSchema;
}

function getPriorityColumnContextSchema(
	propertySchemaOption: PropertySchemaOption,
): PropertySchemaOption.TasksPlugin | PropertySchemaOption.Dataview | undefined {
	return propertySchemaOption === PropertySchemaOption.TasksPlugin || propertySchemaOption === PropertySchemaOption.Dataview
		? propertySchemaOption
		: undefined;
}

function getPriorityMatchValue(
	propertySchemaOption: PropertySchemaOption,
	properties: TaskPropertyMap,
): string | undefined {
	const priority = properties.get("priority");
	if (propertySchemaOption === PropertySchemaOption.TasksPlugin && typeof priority?.value === "number") {
		return getTasksPriorityValueFromWeight(priority.value);
	}
	if (propertySchemaOption === PropertySchemaOption.Dataview && typeof priority?.value === "string") {
		return priority.value.trim();
	}
	return undefined;
}

function getPriorityMatchValues(rawLine: string): Partial<Record<PropertySchemaOption.TasksPlugin | PropertySchemaOption.Dataview, string | undefined>> {
	return {
		[PropertySchemaOption.TasksPlugin]: getPriorityMatchValue(
			PropertySchemaOption.TasksPlugin,
			getSchemaImpl(PropertySchemaOption.TasksPlugin).parseProperties(rawLine),
		),
		[PropertySchemaOption.Dataview]: getPriorityMatchValue(
			PropertySchemaOption.Dataview,
			getSchemaImpl(PropertySchemaOption.Dataview).parseProperties(rawLine),
		),
	};
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
