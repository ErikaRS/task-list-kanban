import type { TFile, Vault } from "obsidian";
import { isTrackedTaskString, Task } from "./task";
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
	excludedTaskTags,
	propertySchema,
	treatNestedTasksAsSubtasks,
}: {
	fileHandle: TFile;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	taskIdsByFileHandle: Map<TFile, Set<string>>;
	vault: Vault;
	columnDefinitionsStore: Readable<ColumnDefinition[]>;
	columnPlacementTagTableStore: Readable<ColumnPlacementTagTable>;
	consolidateTags: boolean;
	doneStatusMarkers: string;
	cancelledStatusMarkers: string;
	ignoredStatusMarkers: string;
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
					hasVisibleTaskAncestor(node, parentByRowIndex)
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

			if (isTrackedTaskString(row, ignoredStatusMarkers)) {
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
	const previous = tasksByTaskId.get(task.id);
	newTaskIds.add(task.id);
	tasksByTaskId.set(task.id, previous && hasSameSourceBlock(previous, task) ? previous : task);
	metadataByTaskId.set(task.id, { rowIndex, fileHandle });
}

function hasSameSourceBlock(left: Task, right: Task): boolean {
	const leftRows = left.sourceBlockRows();
	const rightRows = right.sourceBlockRows();
	if (leftRows.length !== rightRows.length) {
		return false;
	}

	return leftRows.every((row, index) => row === rightRows[index]);
}

type BuildSourceTreeOptions = {
	rows: string[];
	fileHandle: TFile;
	parseContext: ConstructorParameters<typeof Task>[3];
	excludedTaskTags: Set<string>;
};

function buildSourceTree({
	rows,
	fileHandle,
	parseContext,
	excludedTaskTags,
}: BuildSourceTreeOptions): {
	nodesByRowIndex: Map<number, SourceBlockNode>;
	parentByRowIndex: Map<number, SourceBlockNode>;
} {
	const nodesByRowIndex = new Map<number, SourceBlockNode>();
	const parentByRowIndex = new Map<number, SourceBlockNode>();
	const stack: SourceBlockNode[] = [];

	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const rawLine = rows[rowIndex] ?? "";
		if (rawLine === "") {
			stack.length = 0;
			continue;
		}

		const node = createSourceNode({
			rawLine,
			rowIndex,
			fileHandle,
			parseContext,
			excludedTaskTags,
		});
		nodesByRowIndex.set(rowIndex, node);

		while (stack.length > 0 && !isSourceDescendant(node.indentation, stack[stack.length - 1]!.indentation)) {
			stack.pop();
		}

		const parent = stack[stack.length - 1];
		if (parent) {
			parent.sourceChildren.push(node);
			parentByRowIndex.set(rowIndex, parent);
		}

		stack.push(node);
	}

	return { nodesByRowIndex, parentByRowIndex };
}

function createSourceNode({
	rawLine,
	rowIndex,
	fileHandle,
	parseContext,
	excludedTaskTags,
}: {
	rawLine: string;
	rowIndex: number;
	fileHandle: TFile;
	parseContext: ConstructorParameters<typeof Task>[3];
	excludedTaskTags: Set<string>;
}): SourceBlockNode {
	const parsedTaskLine = parseSourceTaskLine(rawLine);
	if (!parsedTaskLine) {
		return createRawNode(rawLine, rowIndex);
	}

	if (!isTrackedTaskString(rawLine, parseContext.ignoredStatusMarkers)) {
		return {
			kind: "task",
			taskVisibility: "ignored",
			rowIndex,
			rawLine,
			indentation: parsedTaskLine.indentation,
			status: parsedTaskLine.status || " ",
			content: parsedTaskLine.content,
			sourceChildren: [],
		};
	}

	const task = new Task(
		rawLine as ConstructorParameters<typeof Task>[0],
		fileHandle,
		rowIndex,
		parseContext,
	);
	const hasExcludedTag = Array.from(task.tags).some((tag) =>
		excludedTaskTags.has(tag.trim().toLowerCase())
	);

	return {
		kind: "task",
		taskVisibility: hasExcludedTag ? "ignored" : "visible",
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

function hasVisibleTaskAncestor(
	node: SourceTaskNode,
	parentByRowIndex: Map<number, SourceBlockNode>,
): boolean {
	let parent = parentByRowIndex.get(node.rowIndex);
	while (parent) {
		if (parent.kind === "task" && parent.taskVisibility === "visible") {
			return true;
		}
		parent = parentByRowIndex.get(parent.rowIndex);
	}
	return false;
}
