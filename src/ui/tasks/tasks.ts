import { getTagsFromContent } from "../../parsing/tags/tags";
import type { TFile, Vault } from "obsidian";
import {
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
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
	type SourceTaskNode,
} from "./source_block";
import type { ColumnDefinition, ColumnPlacementTagTable } from "../columns/columns";
import { get, type Readable } from "svelte/store";
import { parseMarkdownSource, sourceLines, type MarkdownSource } from "./markdown_source";
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

		const { nodesByRowIndex, parentByRowIndex } = buildSourceTree({ rows, fileHandle, parseContext, excludedTaskTags });
		for (const node of nodesByRowIndex.values()) {
			if (node.kind !== "task" || node.taskVisibility !== "visible"
				|| (treatNestedTasksAsSubtasks && hasOwningTaskAncestor(node, parentByRowIndex))) continue;
			const task = new Task(node.rawLine as ConstructorParameters<typeof Task>[0], fileHandle,
				node.rowIndex, parseContext, node.sourceChildren, node.source, treatNestedTasksAsSubtasks ?? false);
			cacheParsedTask({ task, rowIndex: node.rowIndex, fileHandle, tasksByTaskId, metadataByTaskId, newTaskIds });
			previousTaskIds.delete(task.id);
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
	sources?: MarkdownSource[];
	fileHandle: TFile;
	parseContext: ConstructorParameters<typeof Task>[3];
	excludedTaskTags: Set<string>;
};

export function buildSourceTree({ rows, sources, parseContext, excludedTaskTags }: BuildSourceTreeOptions) {
	const nodesByRowIndex = new Map<number, SourceBlockNode>();
	const parentByRowIndex = new Map<number, SourceBlockNode>();
	function convert(source: MarkdownSource, parent?: SourceBlockNode): SourceBlockNode {
		const rawLine = sourceLines(source.raw)[0] ?? "";
		const parsed = source.listPrefix ? parseSourceTaskLine(rawLine) : null;
		const visible = parsed && !isStatusMatch(parsed.status, parseContext.ignoredStatusMarkers)
			&& !Array.from(getTagsFromContent(parsed.content)).some(tag => excludedTaskTags.has(tag.toLowerCase()));
		const node: SourceBlockNode = parsed ? {
			kind: "task", source, rawLine, rowIndex: source.rowIndex, indentation: source.indentation,
			content: parsed.content, status: parsed.status || " ", sourceChildren: [],
			taskVisibility: !visible ? "ignored" : isArchivedTaskString(rawLine, parseContext.replaceArchiveTagWithStatus, parseContext.archiveStatusMarkers) ? "archived" : "visible",
		} : { kind: "raw", source, rawLine, rowIndex: source.rowIndex, indentation: source.indentation, sourceChildren: [] };
		nodesByRowIndex.set(node.rowIndex, node);
		if (parent) parentByRowIndex.set(node.rowIndex, parent);
		node.sourceChildren.push(...source.children.map(child => convert(child, node)));
		return node;
	}
	(sources ?? parseMarkdownSource(rows.join("\n"))).forEach(source => convert(source));
	return { nodesByRowIndex, parentByRowIndex };
}

export function hasOwningTaskAncestor(
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
