import { getTagsFromContent } from "../../parsing/tags/tags";
import type { TFile, Vault } from "obsidian";
import {
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	isTrackedTaskString,
	isArchivedTaskString,
	isStatusMatch,
	Task,
} from "./task";
import type { SettingValues } from "../settings/settings_store";
import { getSchemaImpl } from "../../parsing/properties/index";
import { PropertySchemaOption } from "../../parsing/properties/property_schema";
import {
	parseSourceTaskLine,
	type SourceBlockNode,
	type SourceRawNode,
	type SourceTaskNode,
} from "./source_block";
import type { ColumnDefinition, ColumnPlacementTagTable } from "../columns/columns";
import { get, type Readable } from "svelte/store";
import type { PropertySchema } from "../../parsing/properties/property_schema";

export type Metadata = {
	rowIndex: number;
	fileHandle: TFile;
};

/**
 * The parse-affecting slice of a board's settings, with defaults applied —
 * everything `updateMapsFromFile` needs beyond the column tables. Shared by
 * the live tasks store and the dashboard's stats pass (SPEC 0033) so both
 * parse identically.
 */
export function getMarkerSettings(settings: SettingValues) {
	return {
		consolidateTags: settings.consolidateTags ?? false,
		doneStatusMarkers: settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
		cancelledStatusMarkers: settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
		ignoredStatusMarkers: settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
		replaceArchiveTagWithStatus: settings.replaceArchiveTagWithStatus ?? false,
		archiveStatusMarkers: settings.archiveStatusMarkers ?? "",
		excludedTaskTags: new Set(
			(settings.excludedTaskTags ?? []).map((t) => t.trim().toLowerCase())
		),
		propertySchema: getSchemaImpl(settings.propertySchema ?? PropertySchemaOption.None),
		treatNestedTasksAsSubtasks: settings.treatNestedTasksAsSubtasks ?? false,
	};
}

/**
 * mutates the supplied Maps
 */
export async function updateMapsFromFile({
	fileHandle,
	taskIdsByFileHandle,
	tasksByTaskId,
	metadataByTaskId,
	vault,
	columnDefinitionsStore,
	columnPlacementTagTableStore,
	consolidateTags,
	doneStatusMarkers,
	cancelledStatusMarkers,
	ignoredStatusMarkers,
	replaceArchiveTagWithStatus = false,
	archiveStatusMarkers = "",
	excludedTaskTags,
	propertySchema,
	treatNestedTasksAsSubtasks,
}: {
	fileHandle: TFile;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	taskIdsByFileHandle: Map<TFile, Set<string>>;
	// Only reads — so the dashboard's stats pass can substitute a
	// `cachedRead` facade for the tasks store's live vault (SPEC 0033).
	vault: Pick<Vault, "read">;
	columnDefinitionsStore: Readable<ColumnDefinition[]>;
	columnPlacementTagTableStore: Readable<ColumnPlacementTagTable>;
	consolidateTags: boolean;
	doneStatusMarkers: string;
	cancelledStatusMarkers: string;
	ignoredStatusMarkers: string;
	replaceArchiveTagWithStatus?: boolean;
	archiveStatusMarkers?: string;
	excludedTaskTags: Set<string>;
	propertySchema: PropertySchema;
	treatNestedTasksAsSubtasks?: boolean;
}) {
	try {
		const previousTaskIds =
			taskIdsByFileHandle.get(fileHandle) ?? new Set();
		const newTaskIds = new Set<string>();

		const contents = await vault.read(fileHandle);
		const rows = contents.split("\n");
		const columnDefinitions = get(columnDefinitionsStore);
		const columnPlacementTagTable = get(columnPlacementTagTableStore);
		const parseContext = {
			columnDefinitions,
			columnPlacementTagTable,
			consolidateTags,
			doneStatusMarkers,
			cancelledStatusMarkers,
			ignoredStatusMarkers,
			replaceArchiveTagWithStatus,
			archiveStatusMarkers,
			propertySchema,
		};

		if (treatNestedTasksAsSubtasks) {
			const { nodesByRowIndex, parentByRowIndex } = buildSourceTree({
				rows,
				fileHandle,
				parseContext,
				excludedTaskTags,
			});

			for (const node of nodesByRowIndex.values()) {
				if (
					node.kind !== "task" ||
					node.taskVisibility !== "visible" ||
					hasOwningTaskAncestor(node, parentByRowIndex)
				) {
					continue;
				}

				const task = new Task(
					node.rawLine as ConstructorParameters<typeof Task>[0],
					fileHandle,
					node.rowIndex,
					parseContext,
					node.sourceChildren,
				);

				cacheParsedTask({
					task,
					rowIndex: node.rowIndex,
					fileHandle,
					tasksByTaskId,
					metadataByTaskId,
					newTaskIds,
				});
				previousTaskIds.delete(task.id);
			}

			for (const prevId of previousTaskIds) {
				tasksByTaskId.delete(prevId);
				metadataByTaskId.delete(prevId);
			}

			taskIdsByFileHandle.set(fileHandle, newTaskIds);
			return;
		}

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row) {
				continue;
			}

			if (isTrackedTaskString(row, ignoredStatusMarkers, replaceArchiveTagWithStatus, archiveStatusMarkers)) {
				const task = new Task(
					row,
					fileHandle,
					i,
					parseContext,
				);

				const hasExcludedTag = Array.from(task.tags).some((tag) =>
					excludedTaskTags.has(tag.trim().toLowerCase())
				);

				if (!hasExcludedTag) {
					cacheParsedTask({
						task,
						rowIndex: i,
						fileHandle,
						tasksByTaskId,
						metadataByTaskId,
						newTaskIds,
					});
					previousTaskIds.delete(task.id);
				}
			}
		}

		for (const prevId of previousTaskIds) {
			tasksByTaskId.delete(prevId);
			metadataByTaskId.delete(prevId);
		}

		taskIdsByFileHandle.set(fileHandle, newTaskIds);
	} catch (error) {
		console.error(`Failed to update task cache for ${fileHandle.path}`, error);
	}
}

function cacheParsedTask({
	task,
	rowIndex,
	fileHandle,
	tasksByTaskId,
	metadataByTaskId,
	newTaskIds,
}: {
	task: Task;
	rowIndex: number;
	fileHandle: TFile;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	newTaskIds: Set<string>;
}) {
	newTaskIds.add(task.id);
	tasksByTaskId.set(task.id, task);
	metadataByTaskId.set(task.id, { rowIndex, fileHandle });
}

type BuildSourceTreeOptions = {
	rows: string[];
	fileHandle: TFile;
	parseContext: ConstructorParameters<typeof Task>[3];
	excludedTaskTags: Set<string>;
};

export function buildSourceTree(options: BuildSourceTreeOptions) {
	const tree = createSourceTree(options);
	options.rows.forEach((rawLine, rowIndex) => tree.add(rawLine, rowIndex));
	return tree;
}

// Raw source ownership is shared with the archive scanner; no Task objects
// are needed to decide which root owns a nested row.
export function createSourceTree({ parseContext, excludedTaskTags }: Omit<BuildSourceTreeOptions, "rows">) {
	const nodesByRowIndex = new Map<number, SourceBlockNode>();
	const parentByRowIndex = new Map<number, SourceBlockNode>();
	const stack: SourceBlockNode[] = [];
	return { nodesByRowIndex, parentByRowIndex, add(rawLine: string, rowIndex: number) {
		if (rawLine === "") { stack.length = 0; return; }
		const node = createSourceNode({ rawLine, rowIndex, parseContext, excludedTaskTags });
		nodesByRowIndex.set(rowIndex, node);
		while (stack.length && !isSourceDescendant(node.indentation, stack[stack.length - 1]!.indentation)) stack.pop();
		const parent = stack[stack.length - 1];
		if (parent) {
			parent.sourceChildren.push(node);
			parentByRowIndex.set(rowIndex, parent);
		}
		stack.push(node);
	} };
}

function createSourceNode({
	rawLine,
	rowIndex,
	parseContext,
	excludedTaskTags,
}: {
	rawLine: string;
	rowIndex: number;
	parseContext: ConstructorParameters<typeof Task>[3];
	excludedTaskTags: Set<string>;
}): SourceBlockNode {
	const parsedTaskLine = parseSourceTaskLine(rawLine);
	if (!parsedTaskLine) {
		return createRawNode(rawLine, rowIndex);
	}

	const visible = !isStatusMatch(parsedTaskLine.status, parseContext.ignoredStatusMarkers)
		&& !Array.from(getTagsFromContent(parsedTaskLine.content)).some(tag => excludedTaskTags.has(tag.toLowerCase()));

	return {
		kind: "task",
		taskVisibility: !visible ? "ignored" : isArchivedTaskString(rawLine, parseContext.replaceArchiveTagWithStatus, parseContext.archiveStatusMarkers) ? "archived" : "visible",
		rowIndex,
		rawLine,
		indentation: parsedTaskLine.indentation,
		status: parsedTaskLine.status || " ",
		content: parsedTaskLine.content,
		sourceChildren: [],
	};
}

function createRawNode(rawLine: string, rowIndex: number): SourceRawNode {
	return {
		kind: "raw",
		rowIndex,
		rawLine,
		indentation: rawLine.match(/^\s*/)?.[0] ?? "",
		sourceChildren: [],
	};
}

function isSourceDescendant(indentation: string, ancestorIndentation: string): boolean {
	return indentation.length > ancestorIndentation.length && indentation.startsWith(ancestorIndentation);
}

function hasOwningTaskAncestor(
	node: SourceTaskNode,
	parentByRowIndex: Map<number, SourceBlockNode>,
): boolean {
	let parent = parentByRowIndex.get(node.rowIndex);
	while (parent) {
		if (parent.kind === "task" && parent.taskVisibility !== "ignored") {
			return true;
		}
		parent = parentByRowIndex.get(parent.rowIndex);
	}
	return false;
}
