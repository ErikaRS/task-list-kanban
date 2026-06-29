import {
	Keymap,
	MarkdownView,
	Menu,
	TFile,
	type Vault,
	type Workspace,
} from "obsidian";
import type { Task } from "./task";
import type { Metadata } from "./tasks";
import type { ColumnDefinition, ColumnTag, DefaultColumns } from "../columns/columns";
import { getColumnPriority, getColumnPrioritySchema, getColumnStatus } from "../columns/definitions";
import { shouldIncludeFilePath } from "./scope";
import { createDuplicateLine } from "./duplicate";
import { getTaskTagGroupValue } from "./task_grouping";
import { createTaskLine } from "./task_creation";
import {
	formatLocalDate,
	getPropertyWriteAdapter,
	PropertySchemaOption,
	type WritableDatePropertyKey,
} from "../../parsing/properties";
import {
	buildOrderEntries,
	computeDropPlan,
	ensureRowBlockLink,
	removeEntry,
	taskKey,
	type ManualOrderStore,
} from "./manual_order";
import {
	deleteRowBlocks,
	readFileRows,
	transformSourceRow,
	updateRow,
	writeFileRows,
	type PrepareFileContentsForWrite,
} from "./source_line_editor";
import { parseSourceTaskLine } from "./source_block";

export type TaskActions = {
	changeColumn: (id: string, column: ColumnTag | DefaultColumns) => Promise<void>;
	markDone: (id: string) => Promise<void>;
	toggleDone: (id: string) => Promise<void>;
	setDateProperty: (
		id: string,
		key: Exclude<WritableDatePropertyKey, "completion">,
		date: string,
	) => Promise<void>;
	clearDateProperty: (id: string, key: WritableDatePropertyKey) => Promise<void>;
	updateContent: (id: string, content: string) => Promise<void>;
	updateSourceBlockRow: (id: string, rowIndex: number, content: string) => Promise<void>;
	toggleSourceTaskStatus: (id: string, rowIndex: number) => Promise<void>;
	addSourceBlockRow: (
		id: string,
		rowIndex: number,
		location: "child" | "sibling",
		kind: "task" | "raw",
	) => Promise<void>;
	deleteSourceBlockRow: (id: string, rowIndex: number) => Promise<void>;
	moveSourceBlockRow: (
		id: string,
		draggedRowIndex: number,
		targetRowIndex: number,
		position: "before" | "after",
		targetDepth: number,
	) => Promise<void>;
	viewFile: (id: string, event?: MouseEvent | KeyboardEvent) => Promise<void>;
	archiveTasks: (ids: string[]) => Promise<void>;
	cancelTasks: (ids: string[]) => Promise<void>;
	restoreTasks: (ids: string[]) => Promise<void>;
	deleteTask: (ids: string) => Promise<void>;
	duplicateTask: (id: string) => Promise<void>;
	moveTasksToFile: (
		ids: string[],
		destinationFile: TFile,
		destinationColumn: ColumnTag | DefaultColumns,
	) => Promise<void>;
	updateSwimlaneTag: (
		ids: string[],
		newTag: string | null,
		prefix: string,
		excludedTags: string[],
		includeTags?: string[],
	) => Promise<void>;
	pickFileForNewTask: (
		column: ColumnTag,
		e: MouseEvent,
		onFileSelected: (file: TFile) => void,
		forceShowPicker?: boolean,
	) => void;
	createTask: (
		file: TFile,
		content: string,
		column: ColumnTag,
		additionalTags?: string[],
		dateProperties?: Partial<Record<Exclude<WritableDatePropertyKey, "completion">, string>>,
	) => Promise<void>;
	getTargetFile: () => TFile | null;
	/**
	 * Pins a manual reorder: drops `draggedId` at `targetIndex` within a column's
	 * current `displayOrderIds`, assigning block links to the new prefix as needed.
	 */
	reorderTask: (
		groupId: string,
		columnTag: string,
		displayOrderIds: string[],
		draggedId: string,
		targetIndex: number,
	) => Promise<void>;
	/** Unpins a task: removes its store entry, leaving the block link in place. */
	unpinTask: (groupId: string, columnTag: string, taskId: string) => Promise<void>;
	/**
	 * Prunes stale order entries (tasks deleted or moved out of their column).
	 * `presentKeysByGroupAndColumn` lists the keys still present in each cell.
	 */
	pruneManualOrder: (presentKeysByGroupAndColumn: Record<string, Record<string, Set<string>>>) => void;
};

export function createTaskActions({
	tasksByTaskId,
	metadataByTaskId,
	vault,
	workspace,
	getFilenameFilter,
	getExcludeFilter,
	getBoardFolderPath,
	getPlacementTagsForColumn,
	getColumnDefinitions,
	getDefaultTaskFile,
	getLastUsedTaskFile,
	setLastUsedTaskFile,
	getPropertySchemaOption,
	getStatusMarkerOrder,
	getCurrentDate,
	getManualOrder,
	setManualOrder,
	prepareFileContentsForWrite,
}: {
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	vault: Vault;
	workspace: Workspace;
	getFilenameFilter: () => string[] | null;
	getExcludeFilter: () => string[] | null;
	getBoardFolderPath: () => string | null;
	getPlacementTagsForColumn: (column: ColumnTag) => string[];
	getColumnDefinitions: () => ColumnDefinition[];
	getDefaultTaskFile: () => string | null;
	getLastUsedTaskFile: () => string | null;
	setLastUsedTaskFile: (path: string) => void;
	getPropertySchemaOption: () => PropertySchemaOption;
	getStatusMarkerOrder: () => string;
	getCurrentDate?: () => Date;
	getManualOrder: () => ManualOrderStore;
	setManualOrder: (next: ManualOrderStore) => void;
	prepareFileContentsForWrite?: PrepareFileContentsForWrite;
}): TaskActions {
	function resolveFileIfValid(filePath: string | null): TFile | null {
		if (!filePath) return null;
		const abstractFile = vault.getAbstractFileByPath(filePath);
		if (!(abstractFile instanceof TFile)) return null;
		if (!shouldIncludeFilePath(filePath, getFilenameFilter(), getExcludeFilter(), getBoardFolderPath())) return null;
		return abstractFile;
	}

	function getTargetFile(): TFile | null {
		return resolveFileIfValid(getDefaultTaskFile()) ?? resolveFileIfValid(getLastUsedTaskFile());
	}

	async function updateRowWithTask(
		id: string,
		updater: (task: Task) => void,
		transformSerialized?: (newTaskString: string) => string,
	) {
		const metadata = metadataByTaskId.get(id);
		const task = tasksByTaskId.get(id);

		if (!metadata || !task) {
			return;
		}

		updater(task);

		const serialized = task.serialise();
		const newTaskString = transformSerialized ? transformSerialized(serialized) : serialized;
		await updateRow(
			vault,
			metadata.fileHandle,
			metadata.rowIndex,
			newTaskString,
			prepareFileContentsForWrite,
		);
	}

	async function updateSourceRow(
		id: string,
		transform: (row: string) => string,
	) {
		const metadata = metadataByTaskId.get(id);
		if (!metadata) {
			return;
		}

		await transformSourceRow(
			vault,
			metadata.fileHandle,
			metadata.rowIndex,
			transform,
			prepareFileContentsForWrite,
		);
	}

	function getTaskWithMetadata(id: string): { task: Task; metadata: Metadata } | null {
		const metadata = metadataByTaskId.get(id);
		const task = tasksByTaskId.get(id);
		return task && metadata ? { task, metadata } : null;
	}

	/**
	 * Assigns block links to the given tasks (those lacking one), batched so each
	 * file is read and written exactly once. Returns a map of taskId → block link
	 * for every requested task (existing links are returned unchanged).
	 *
	 * The block link is appended to the raw source line; nothing else on the line
	 * is reformatted, and a task's `id` is unaffected (it hashes content + path +
	 * row, none of which include the block link).
	 */
	async function assignBlockLinks(
		tasks: Task[],
	): Promise<Map<string, string>> {
		const resolved = new Map<string, string>();
		const needsAssignment: { task: Task; metadata: Metadata }[] = [];

		for (const task of tasks) {
			if (task.blockLink) {
				resolved.set(task.id, task.blockLink);
				continue;
			}
			const metadata = metadataByTaskId.get(task.id);
			if (metadata) {
				needsAssignment.push({ task, metadata });
			}
		}

		if (needsAssignment.length === 0) {
			return resolved;
		}

		const byFile = new Map<TFile, { task: Task; metadata: Metadata }[]>();
		for (const entry of needsAssignment) {
			const list = byFile.get(entry.metadata.fileHandle) ?? [];
			list.push(entry);
			byFile.set(entry.metadata.fileHandle, list);
		}

		for (const [fileHandle, entries] of byFile) {
			const rows = await readFileRows(vault, fileHandle);

			// Collect block links already in the file so generated ids don't collide.
			const existing = new Set<string>();
			for (const row of rows) {
				const match = row.match(/\s\^([a-zA-Z0-9-]+)\s*$/);
				if (match?.[1]) existing.add(match[1]);
			}

			let changed = false;
			for (const { task, metadata } of entries) {
				const row = rows[metadata.rowIndex];
				if (row == null) continue;
				const ensured = ensureRowBlockLink(row, existing);
				rows[metadata.rowIndex] = ensured.row;
				changed = changed || ensured.changed;
				resolved.set(task.id, ensured.blockLink);
			}

			if (changed) {
				await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
			}
		}

		return resolved;
	}

	return {
		async changeColumn(id, column) {
			await updateRowWithTask(id, (task) => (task.column = column));
		},

		async reorderTask(groupId, columnTag, displayOrderIds, draggedId, targetIndex) {
			const displayOrder = displayOrderIds
				.map((id) => tasksByTaskId.get(id))
				.filter((task): task is Task => !!task);

			const plan = computeDropPlan(displayOrder, draggedId, targetIndex);
			if (plan.prefixTasks.length === 0) {
				return;
			}

			const resolved = await assignBlockLinks(plan.tasksNeedingBlockLink);
			const entries = buildOrderEntries(plan.prefixTasks, (task) => {
				const link = task.blockLink ?? resolved.get(task.id);
				if (!link) {
					// Should not happen: every prefix task either had a link or was
					// just assigned one. Fall back to its id to avoid a bad key.
					return task.id;
				}
				return link;
			});

			const current = getManualOrder();
			setManualOrder({
				...current,
				[groupId]: {
					...(current[groupId] ?? {}),
					[columnTag]: entries,
				},
			});
		},

		async unpinTask(groupId, columnTag, taskId) {
			const task = tasksByTaskId.get(taskId);
			if (!task) return;
			const key = taskKey(task);
			if (!key) return;

			const current = getManualOrder();
			const groupEntries = current[groupId];
			const entries = groupEntries?.[columnTag];
			const next = removeEntry(entries, key);
			if (next === entries) return;

			const nextStore: ManualOrderStore = { ...current };
			const nextGroup = { ...(groupEntries ?? {}) };
			if (next.length === 0) {
				delete nextGroup[columnTag];
			} else {
				nextGroup[columnTag] = next;
			}
			if (Object.keys(nextGroup).length === 0) {
				delete nextStore[groupId];
			} else {
				nextStore[groupId] = nextGroup;
			}
			setManualOrder(nextStore);
		},

		pruneManualOrder(presentKeysByGroupAndColumn) {
			const current = getManualOrder();
			let changed = false;
			const next: ManualOrderStore = { ...current };

			for (const [groupId, entriesByColumn] of Object.entries(current)) {
				const presentByColumn = presentKeysByGroupAndColumn[groupId] ?? {};
				const nextGroup = { ...entriesByColumn };

				for (const [columnTag, entries] of Object.entries(entriesByColumn)) {
					const present = presentByColumn[columnTag] ?? new Set<string>();
					const pruned = entries.filter((entry) => present.has(entry));
					if (pruned.length !== entries.length) {
						changed = true;
						if (pruned.length === 0) {
							delete nextGroup[columnTag];
						} else {
							nextGroup[columnTag] = pruned;
						}
					}
				}

				if (Object.keys(nextGroup).length === 0) {
					changed = true;
					delete next[groupId];
				} else {
					next[groupId] = nextGroup;
				}
			}

			if (changed) {
				setManualOrder(next);
			}
		},

		async markDone(id) {
			let shouldAddCompletionDate = false;
			await updateRowWithTask(
				id,
				(task) => {
					shouldAddCompletionDate = !task.done;
					task.done = true;
				},
				(row) => shouldAddCompletionDate ? addCompletionDateIfEnabled(row) : row,
			);
		},

		async toggleDone(id) {
			let shouldAddCompletionDate = false;
			await updateRowWithTask(
				id,
				(task) => {
					shouldAddCompletionDate = task.cycleStatus(getStatusMarkerOrder());
				},
				(row) => shouldAddCompletionDate ? addCompletionDateIfEnabled(row) : row,
			);
		},

		async updateContent(id, content) {
			await updateRowWithTask(id, (task) => (task.content = content));
		},

		async updateSourceBlockRow(id, rowIndex, content) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			const nextRow = entry.task.updateSourceBlockRowContent(rowIndex, content);
			if (nextRow == null) {
				return;
			}

			await updateRow(vault, entry.metadata.fileHandle, rowIndex, nextRow, prepareFileContentsForWrite);
		},

		async toggleSourceTaskStatus(id, rowIndex) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			const nextRow = entry.task.cycleSourceTaskRowStatus(rowIndex, getStatusMarkerOrder());
			if (nextRow == null) {
				return;
			}

			await updateRow(vault, entry.metadata.fileHandle, rowIndex, nextRow, prepareFileContentsForWrite);
		},

		async addSourceBlockRow(id, rowIndex, location, kind) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			const { fileHandle } = entry.metadata;
			const rows = await readFileRows(vault, fileHandle);
			const row = rows[rowIndex];
			if (row == null) {
				return;
			}

			const block = getNodeBlock(rows, rowIndex);
			let targetIndex = block.start;
			let indentation = block.indentation;

			if (location === "child") {
				// We append as a child, so we insert at the end of the block
				targetIndex = block.end;
				// Detect step char
				let stepChar = "  ";
				for (const r of rows) {
					if (r) {
						const match = r.match(/^(\s+)/);
						if (match && match[1]) {
							stepChar = match[1].includes("\t") ? "\t" : "  ";
							break;
						}
					}
				}
				indentation = block.indentation + stepChar;
			} else {
				// sibling: insert at the end of the block
				targetIndex = block.end;
			}

			// bullet style
			let bullet = "-";
			const bulletMatch = row.match(/^(\s*)([-*+])/);
			if (bulletMatch?.[2]) {
				bullet = bulletMatch[2];
			}

			const text = kind === "task" ? "New subtask" : "New note";
			const newLine = kind === "task"
				? `${indentation}${bullet} [ ] ${text}`
				: `${indentation}${bullet} ${text}`;

			rows.splice(targetIndex, 0, newLine);
			await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
		},

		async deleteSourceBlockRow(id, rowIndex) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			const { fileHandle } = entry.metadata;
			const rows = await readFileRows(vault, fileHandle);

			const block = getNodeBlock(rows, rowIndex);
			rows.splice(block.start, block.end - block.start);
			await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
		},

		async moveSourceBlockRow(id, draggedRowIndex, targetRowIndex, position, targetDepth) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			const { fileHandle } = entry.metadata;
			const rows = await readFileRows(vault, fileHandle);

			const draggedBlock = getNodeBlock(rows, draggedRowIndex);
			const parentCardRow = rows[entry.task.rowIndex];
			if (parentCardRow == null) {
				return;
			}
			const parentCardIndentation = parentCardRow.match(/^\s*/)?.[0] ?? "";

			// Detect step char
			let stepChar = "  ";
			for (const r of rows) {
				if (r) {
					const match = r.match(/^(\s+)/);
					if (match && match[1]) {
						stepChar = match[1].includes("\t") ? "\t" : "  ";
						break;
					}
				}
			}

			const safeTargetDepth = Math.max(1, targetDepth);
			const newRootIndentation = parentCardIndentation + stepChar.repeat(safeTargetDepth);
			const blockRows = rows.slice(draggedBlock.start, draggedBlock.end).map((row) => {
				if (row == null) return "";
				const rowIndentation = row.match(/^\s*/)?.[0] ?? "";
				const relativeIndentation = rowIndentation.slice(draggedBlock.indentation.length);
				const nextIndentation = newRootIndentation + relativeIndentation;
				return nextIndentation + row.slice(rowIndentation.length);
			});

			const targetBlock = getNodeBlock(rows, targetRowIndex);
			let insertIndex = position === "before" ? targetBlock.start : targetBlock.end;

			// Remove dragged block
			rows.splice(draggedBlock.start, blockRows.length);

			// Adjust insertIndex
			if (draggedBlock.start < insertIndex) {
				insertIndex -= blockRows.length;
			}

			// Insert block
			rows.splice(insertIndex, 0, ...blockRows);

			await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
		},

		async setDateProperty(id, key, date) {
			await updateSourceRow(
				id,
				(row) => getPropertyWriteAdapter(getPropertySchemaOption())?.upsertDate(row, key, date) ?? row,
			);
		},

		async clearDateProperty(id, key) {
			await updateSourceRow(
				id,
				(row) => getPropertyWriteAdapter(getPropertySchemaOption())?.removeDate(row, key) ?? row,
			);
		},

		async archiveTasks(ids) {
			for (const id of ids) {
				await updateRowWithTask(id, (task) => task.archive());
			}
		},

		async cancelTasks(ids) {
			for (const id of ids) {
				await updateRowWithTask(id, (task) => task.cancel());
			}
		},

		async restoreTasks(ids) {
			for (const id of ids) {
				await updateRowWithTask(id, (task) => task.restore());
			}
		},

		async deleteTask(id) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			await deleteRowBlocks(vault, entry.metadata.fileHandle, [
				{
					rowIndex: entry.metadata.rowIndex,
					lineCount: entry.task.sourceBlockLineCount,
				},
			], prepareFileContentsForWrite);
		},

		async updateSwimlaneTag(ids, newTag, prefix, excludedTags, includeTags) {
			for (const id of ids) {
				await updateRowWithTask(id, (task) => {
					const oldTag = getTaskTagGroupValue(
						task,
						{ kind: "tag-prefix", prefix, includeTags },
						excludedTags,
					);
					task.replaceTag(oldTag, newTag);
				});
			}
		},

		async duplicateTask(id) {
			const entry = getTaskWithMetadata(id);
			if (!entry) return;

			const { fileHandle, rowIndex } = entry.metadata;
			const rows = await readFileRows(vault, fileHandle);

			if (rowIndex >= rows.length) return;

			const sourceBlockRows = rows.slice(rowIndex, rowIndex + entry.task.sourceBlockLineCount);
			const originalLine = sourceBlockRows[0];
			if (!originalLine) return;

			const duplicatedRows = [
				createDuplicateLine(originalLine),
				...sourceBlockRows.slice(1),
			];
			rows.splice(rowIndex + sourceBlockRows.length, 0, ...duplicatedRows);
			await writeFileRows(vault, fileHandle, rows, prepareFileContentsForWrite);
		},

		async moveTasksToFile(ids, destinationFile, destinationColumn) {
			const moves = ids
				.map((id) => {
					const task = tasksByTaskId.get(id);
					const metadata = metadataByTaskId.get(id);
					return task && metadata ? { task, metadata } : null;
				})
				.filter((move): move is { task: Task; metadata: Metadata } => !!move)
				.filter((move) => move.metadata.fileHandle.path !== destinationFile.path);

			if (moves.length === 0) {
				return;
			}

			const destinationRows = await readFileRows(vault, destinationFile);
			for (const { task } of moves) {
				const serializedParent = taskIsInColumn(task, destinationColumn)
					? task.serialise()
					: task.serialiseForColumn(destinationColumn);
				destinationRows.push(...task.sourceBlockRows(serializedParent));
			}
			await writeFileRows(vault, destinationFile, destinationRows, prepareFileContentsForWrite);

			const movesBySourceFile = new Map<TFile, Array<{ rowIndex: number; lineCount: number }>>();
			for (const { task, metadata } of moves) {
				const sourceMoves = movesBySourceFile.get(metadata.fileHandle) ?? [];
				sourceMoves.push({
					rowIndex: metadata.rowIndex,
					lineCount: task.sourceBlockLineCount,
				});
				movesBySourceFile.set(metadata.fileHandle, sourceMoves);
			}

			for (const [sourceFile, sourceMoves] of movesBySourceFile) {
				await deleteRowBlocks(vault, sourceFile, sourceMoves, prepareFileContentsForWrite);
			}
		},

		async viewFile(id, event) {
			const metadata = metadataByTaskId.get(id);

			if (!metadata) {
				return;
			}

			const { fileHandle, rowIndex } = metadata;

			const leaf = workspace.getLeaf(Keymap.isModEvent(event));
			await leaf.openFile(fileHandle);

			const editorView = workspace.getActiveViewOfType(MarkdownView);
			editorView?.editor.setCursor(rowIndex);
		},

		getTargetFile,

		pickFileForNewTask(column, e, onFileSelected, forceShowPicker = false) {
			if (!forceShowPicker) {
				const targetFile = getTargetFile();
				if (targetFile) {
					onFileSelected(targetFile);
					return;
				}
			}

			// Wrap onFileSelected to persist last-used file when picking through the menu
			const onFileSelectedWithPersist = (file: TFile) => {
				setLastUsedTaskFile(file.path);
				onFileSelected(file);
			};

			const files = vault
				.getMarkdownFiles()
				.filter((file) =>
					shouldIncludeFilePath(file.path, getFilenameFilter(), getExcludeFilter(), getBoardFolderPath())
				)
				.sort((a, b) => a.path.localeCompare(b.path));

			const target = e.target as HTMLButtonElement | undefined;
			if (!target) {
				return;
			}

			const boundingRect = target.getBoundingClientRect();
			const y = boundingRect.top + boundingRect.height / 2;
			const x = boundingRect.left + boundingRect.width / 2;

			// Resolve the default task file if configured
			const defaultTaskFilePath = getDefaultTaskFile();
			let defaultFileState: { file: TFile } | { error: string } | null =
				null;
			if (defaultTaskFilePath) {
				const abstractFile =
					vault.getAbstractFileByPath(defaultTaskFilePath);
				if (!(abstractFile instanceof TFile)) {
					defaultFileState = {
						error: `★ ${defaultTaskFilePath} (not found)`,
					};
				} else if (
					!shouldIncludeFilePath(
						defaultTaskFilePath,
						getFilenameFilter(),
						getExcludeFilter(),
						getBoardFolderPath()
					)
				) {
					defaultFileState = {
						error: `★ ${defaultTaskFilePath} (outside scope)`,
					};
				} else {
					defaultFileState = { file: abstractFile };
				}
			}

			function createMenu(folder: Folder, parentMenu: Menu | undefined) {
				const menu = new Menu();
				menu.addItem((i) => {
					i.setTitle(parentMenu ? `← back` : "Choose a file")
						.setDisabled(!parentMenu)
						.onClick(() => {
							parentMenu?.showAtPosition({ x: x, y: y });
						});
				});

				// Show default file as first item in root menu
				if (!parentMenu && defaultFileState) {
					if ("file" in defaultFileState) {
						const df = defaultFileState.file;
						menu.addItem((i) => {
							i.setTitle(`★ ${df.path}`).onClick(() => {
								onFileSelectedWithPersist(df);
							});
						});
					} else {
						menu.addItem((i) => {
							i.setTitle(defaultFileState.error).setDisabled(
								true
							);
						});
					}
					menu.addSeparator();
				}

				for (const [label, folderItem] of Object.entries(folder)) {
					menu.addItem((i) => {
						i.setTitle(
							folderItem instanceof TFile ? label : label + " →"
						).onClick(() => {
							if (folderItem instanceof TFile) {
								onFileSelectedWithPersist(folderItem);
							} else {
								createMenu(folderItem, menu);
							}
						});
					});
				}

				menu.showAtPosition({ x: x, y: y });
			}

			interface Folder {
				[label: string]: Folder | TFile;
			}
			const folder: Folder = {};

			for (const file of files) {
				const segments = file.path.split("/");

				let currFolder = folder;
				for (const [i, segment] of segments.entries()) {
					if (i === segments.length - 1) {
						currFolder[segment] = file;
					} else {
						const nextFolder = currFolder[segment] || {};
						if (nextFolder instanceof TFile) {
							continue;
						}
						currFolder[segment] = nextFolder;
						currFolder = nextFolder;
					}
				}
			}

			createMenu(folder, undefined);
		},

		async createTask(file, content, column, additionalTags = [], dateProperties = {}) {
			const adapter = getPropertyWriteAdapter(getPropertySchemaOption());
			const columnDefinition = getColumnDefinitions().find((definition) => definition.id === column);
			const priorityAdapter = getPropertyWriteAdapter(getColumnPrioritySchema(columnDefinition) ?? getPropertySchemaOption());
			let taskLine = createTaskLine(
				content,
				getPlacementTagsForColumn(column),
				additionalTags,
				getColumnStatus(columnDefinition) ?? " ",
			);

			const priority = getColumnPriority(columnDefinition);
			if (priority && priorityAdapter) {
				taskLine = priorityAdapter.upsertPriority(taskLine, priority);
			}

			if (adapter) {
				for (const key of ["due", "scheduled", "start"] as const) {
					const date = dateProperties[key];
					if (date) {
						taskLine = adapter.upsertDate(taskLine, key, date);
					}
				}
			}

			await updateRow(
				vault,
				file,
				undefined,
				taskLine,
				prepareFileContentsForWrite,
			);
		},
	};

	function addCompletionDateIfEnabled(rawLine: string): string {
		const adapter = getPropertyWriteAdapter(getPropertySchemaOption());
		if (!adapter) {
			return rawLine;
		}

		return adapter.addCompletionDateIfMissing(rawLine, formatLocalDate(getCurrentDate?.() ?? new Date()));
	}
}

function taskIsInColumn(task: Task, column: ColumnTag | DefaultColumns): boolean {
	if (column === "done") {
		return task.done || task.column === "done";
	}

	if (column === "uncategorised") {
		return !task.done && !task.column;
	}

	return task.column === column;
}

export function getNodeBlock(rows: string[], rowIndex: number): { start: number; end: number; indentation: string } {
	const rootRow = rows[rowIndex];
	if (rootRow == null) return { start: rowIndex, end: rowIndex, indentation: "" };

	const indentation = rootRow.match(/^\s*/)?.[0] ?? "";

	let end = rowIndex + 1;
	while (end < rows.length) {
		const row = rows[end];
		if (row == null || row === "") {
			break;
		}
		const rowIndentation = row.match(/^\s*/)?.[0] ?? "";
		if (!rowIndentation.startsWith(indentation) || rowIndentation.length <= indentation.length) {
			break;
		}
		end++;
	}
	return { start: rowIndex, end, indentation };
}
