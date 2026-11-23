import { addTextLiteral, findTextLiteralMatches, replaceTextLiteral } from "../../parsing/text_literals/text_literals";
import { insertNewTask, type TaskInsertionSettings } from "./task_insertion";
import { editableMarkdownSource, flattenMarkdownSource, markdownBlock, markdownBody, parseMarkdownSource, removeContainerPrefix, replaceMarkdownBlock, replaceMarkdownBody, sourceLines, type MarkdownSource } from "./markdown_source";
import {
	Keymap,
	MarkdownView,
	Notice,
	TFile,
	type Vault,
	type Workspace,
} from "obsidian";
import type { Task } from "./task";
import type { Metadata } from "./tasks";
import type { ColumnDefinition, ColumnTag, DefaultColumns } from "../columns/columns";
import { shouldIncludeFilePath } from "./scope";
import { resolveDateTemplate } from "./path_scope";
import { createDailyNote, DAILY_NOTE_TARGET, resolveDailyNotePath, type DailyNoteSource } from "./daily_note";
import { createDuplicateLine } from "./duplicate";
import { flattenSourceBlockNodes } from "./source_block";
import { getTaskTagGroupValue } from "./task_grouping";
import {
	formatLocalDate,
	getPropertyWriteAdapter,
	updateCompletionDateForTransition,
	PropertySchemaOption,
	type EditableDatePropertyKey,
} from "../../parsing/properties";
import { createSwimlanePropertyTransform } from "./swimlane_property";
import { showFilePickerMenu, type PinnedPickerEntry } from "../components/file_picker_menu";
import {
	buildOrderEntries,
	computeDropPlan,
	ensureRowBlockLink,
	removeEntry,
	taskKey,
	type ManualOrderStore,
} from "./manual_order";
import {
	readFileRows,
	replaceSourceRanges,
	serializeFileRows,
	transformSourceRows,
	writeFileRows,
	type PrepareFileContentsForWrite,
} from "./source_line_editor";
import { buildNewTaskLine, type GroupProperty, type NewTaskColumn } from "./task_line_builder";
import {
	archiveTransform,
	changeColumnTransform,
	replaceStatusMarker,
	replacePlacementTags,
	type ColumnChangeOptions,
} from "./column_change";

/**
 * Today's daily note as a new-task destination. `file` is null until the
 * note exists; the path is re-resolved when the task is written, so a draft
 * started before midnight lands in the new day's note.
 */
export type DailyNoteDestination = {
	kind: "dailyNote";
	path: string;
	file: TFile | null;
	source: DailyNoteSource;
};

/** Where a new task goes: a specific file, or Today's daily note. */
export type NewTaskTarget = TFile | DailyNoteDestination;

export function isDailyNoteDestination(target: NewTaskTarget): target is DailyNoteDestination {
	return (target as Partial<DailyNoteDestination>).kind === "dailyNote";
}

/** The resolved target plus whether it came from the Default task file. */
export type TaskDestination = { target: NewTaskTarget; isDefault: boolean };

type DailyNoteState =
	| { status: "ready"; path: string; file: TFile }
	| { status: "missing"; path: string }
	| { status: "outsideScope"; path: string };

export type TaskActions = {
	changeColumn: (id: string, column: ColumnTag | DefaultColumns) => Promise<void>;
	/**
	 * Moves tasks to a column, batching writes per file. Moving to "done"
	 * marks the tasks done (adding completion metadata where enabled) instead
	 * of retagging them.
	 */
	moveTasksToColumn: (ids: string[], column: ColumnTag | DefaultColumns) => Promise<void>;
	markDone: (id: string) => Promise<void>;
	toggleDone: (id: string) => Promise<void>;
	/**
	 * Applies one or more date edits to one task in a single write. An empty
	 * value clears that date. Separate writes per field would go through the
	 * task id, which is a hash of the row content and goes stale after the
	 * first write.
	 */
	applyDateEdits: (
		id: string,
		edits: ReadonlyArray<{ key: EditableDatePropertyKey; value: string }>,
	) => Promise<void>;
	updateContent: (id: string, content: string, dateEdits?: ReadonlyArray<{ key: EditableDatePropertyKey; value: string }>, expectedSource?: MarkdownSource) => Promise<void>;
	updateSourceBlockRow: (id: string, rowIndex: number, content: string, expectedSource?: MarkdownSource) => Promise<void>;
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
	deleteTask: (id: string) => Promise<void>;
	duplicateTask: (id: string) => Promise<void>;
	moveTasksToFile: (
		ids: string[],
		destinationFile: TFile,
		destinationColumn: ColumnTag | DefaultColumns,
	) => Promise<void>;
	updateSwimlaneText: (ids: string[], literal: string | null, literals: string[]) => Promise<void>;
	updateSwimlaneTag: (
		ids: string[],
		newTag: string | null,
		prefix: string,
		excludedTags: string[],
		includeTags?: string[],
	) => Promise<void>;
	/**
	 * Rewrites only the grouped property on each task's source line when it is
	 * dropped into a property swimlane. A `null` value (the Unassigned lane)
	 * removes the property.
	 */
	updateSwimlaneProperty: (
		ids: string[],
		key: string,
		value: string | number | Date | null,
	) => Promise<void>;
	pickFileForNewTask: (
		column: NewTaskColumn,
		e: MouseEvent | KeyboardEvent,
		onTargetSelected: (target: NewTaskTarget) => void,
		forceShowPicker?: boolean,
	) => void;
	/**
	 * Creates Today's daily note first when the target is a daily note that
	 * doesn't exist yet.
	 */
	createTask: (
		target: NewTaskTarget,
		content: string,
		column: NewTaskColumn,
		additionalTags?: string[],
		dateProperties?: Partial<Record<EditableDatePropertyKey, string>>,
		groupProperty?: GroupProperty | null,
		additionalText?: string[],
	) => Promise<void>;
	getTargetDestination: () => TaskDestination | null;
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
	getTaskInsertionSettings = () => ({}),
	getLastUsedTaskFile,
	setLastUsedTaskFile,
	getDailyNoteSource = () => ({ kind: "unconfigured" }),
	getPropertySchemaOption,
	getStatusMarkerOrder,
	getKeepColumnTagOnCompletion = () => false,
	getCurrentDate,
	getManualOrder,
	setManualOrder,
	onArchiveWrite,
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
	getTaskInsertionSettings?: () => TaskInsertionSettings;
	getLastUsedTaskFile: () => string | null;
	setLastUsedTaskFile: (path: string) => void;
	getDailyNoteSource?: () => DailyNoteSource;
	getPropertySchemaOption: () => PropertySchemaOption;
	getStatusMarkerOrder: () => string;
	getKeepColumnTagOnCompletion?: () => boolean;
	getCurrentDate?: () => Date;
	getManualOrder: () => ManualOrderStore;
	setManualOrder: (next: ManualOrderStore) => void;
	prepareFileContentsForWrite?: PrepareFileContentsForWrite;
	onArchiveWrite?: (path: string) => void;
}): TaskActions {
	function isInScope(path: string): boolean {
		return shouldIncludeFilePath(path, getFilenameFilter(), getExcludeFilter(), getBoardFolderPath());
	}

	/** Today's daily note, resolved now; null when no source is configured. */
	function getDailyNoteState(): DailyNoteState | null {
		const path = resolveDailyNotePath(getDailyNoteSource(), getCurrentDate?.());
		if (!path) return null;
		// Scope is checked first: an out-of-scope note is never offered,
		// whether or not it exists.
		if (!isInScope(path)) return { status: "outsideScope", path };
		const abstractFile = vault.getAbstractFileByPath(path);
		return abstractFile instanceof TFile
			? { status: "ready", path, file: abstractFile }
			: { status: "missing", path };
	}

	function dailyNoteDestination(path: string, file: TFile | null): DailyNoteDestination {
		return { kind: "dailyNote", path, file, source: getDailyNoteSource() };
	}

	/** A stored default / last-used value as a target; null when unusable. */
	function resolveTarget(value: string | null): NewTaskTarget | null {
		if (!value) return null;
		if (value === DAILY_NOTE_TARGET) {
			const dailyNote = getDailyNoteState();
			if (dailyNote?.status === "ready") return dailyNoteDestination(dailyNote.path, dailyNote.file);
			if (dailyNote?.status === "missing") return dailyNoteDestination(dailyNote.path, null);
			return null;
		}
		const resolvedPath = resolveDateTemplate(value, getCurrentDate?.());
		if (!resolvedPath) return null;
		const abstractFile = vault.getAbstractFileByPath(resolvedPath);
		if (!(abstractFile instanceof TFile)) return null;
		if (!isInScope(resolvedPath)) return null;
		return abstractFile;
	}

	function getTargetDestination(): TaskDestination | null {
		const fromDefault = resolveTarget(getDefaultTaskFile());
		if (fromDefault) return { target: fromDefault, isDefault: true };
		const fromLastUsed = resolveTarget(getLastUsedTaskFile());
		return fromLastUsed ? { target: fromLastUsed, isDefault: false } : null;
	}

	/** The file to write into, creating Today's daily note when needed. */
	async function prepareTarget(
		target: NewTaskTarget,
		buildNewNoteContents: (initialContents: string) => string,
	): Promise<{ file: TFile; written: boolean }> {
		if (!isDailyNoteDestination(target)) return { file: target, written: false };
		const dailyNote = getDailyNoteState();
		if (!dailyNote) throw new Error("Today's daily note isn't configured.");
		if (dailyNote.status === "outsideScope") {
			throw new Error(`Today's daily note (${dailyNote.path}) is outside the board's scope.`);
		}
		if (dailyNote.status === "ready") return { file: dailyNote.file, written: false };
		const { file, created } = await createDailyNote(
			vault,
			dailyNote.path,
			getDailyNoteSource(),
			getCurrentDate?.() ?? new Date(),
			buildNewNoteContents,
		);
		return { file, written: created };
	}

	function defaultFilePickerEntry(
		defaultTaskFilePath: string,
		onFileSelected: (file: TFile) => void,
	): PinnedPickerEntry {
		const resolvedPath = resolveDateTemplate(defaultTaskFilePath, getCurrentDate?.());
		if (!resolvedPath) return { title: `★ ${defaultTaskFilePath} (not found)` };
		const abstractFile = vault.getAbstractFileByPath(resolvedPath);
		if (!(abstractFile instanceof TFile)) return { title: `★ ${resolvedPath} (not found)` };
		if (!isInScope(resolvedPath)) return { title: `★ ${resolvedPath} (outside scope)` };
		return { title: `★ ${abstractFile.path}`, onSelect: () => onFileSelected(abstractFile) };
	}

	function dailyNotePickerEntry(
		dailyNote: DailyNoteState | null,
		isDefault: boolean,
		onSelected: (target: DailyNoteDestination) => void,
	): PinnedPickerEntry {
		const label = `${isDefault ? "★" : "📅"} Today's daily note`;
		switch (dailyNote?.status) {
			case undefined:
				return { title: `${label} (not configured)` };
			case "outsideScope":
				return { title: `${label} (outside scope)` };
			case "missing": {
				const target = dailyNoteDestination(dailyNote.path, null);
				return { title: `${label} — ${dailyNote.path} (new)`, onSelect: () => onSelected(target) };
			}
			case "ready": {
				const target = dailyNoteDestination(dailyNote.path, dailyNote.file);
				return { title: `${label} — ${dailyNote.path}`, onSelect: () => onSelected(target) };
			}
		}
	}

	function collectTaskEntriesByFile(
		ids: string[],
	): Map<TFile, { task: Task; metadata: Metadata }[]> {
		const byFile = new Map<TFile, { task: Task; metadata: Metadata }[]>();
		for (const id of ids) {
			const entry = getTaskWithMetadata(id);
			if (!entry) continue;
			const list = byFile.get(entry.metadata.fileHandle) ?? [];
			list.push(entry);
			byFile.set(entry.metadata.fileHandle, list);
		}
		return byFile;
	}

	/**
	 * Surfaces silently-skipped work: ids the board handed us that no longer
	 * resolve to a task (usually because the file changed underneath the
	 * board and the store has not caught up yet).
	 */
	function notifyMissingTasks(requestedCount: number, foundCount: number) {
		if (foundCount >= requestedCount) return;
		const missing = requestedCount - foundCount;
		new Notice(
			missing === 1
				? "A task could not be updated because it is out of sync with its file."
				: `${missing} tasks could not be updated because they are out of sync with their files.`,
		);
	}

	/**
	 * EDIT path: applies a surgical string transform to each task's raw
	 * source row, reading and writing each affected file exactly once.
	 * Everything the transform does not touch is preserved byte-for-byte.
	 */
	async function editTaskSourceRows(
		ids: string[],
		transform: (row: string) => string,
	) {
		await editTasks(ids, (_task, row) => transform(row));
	}

	/**
	 * EDIT path with the parsed task at hand: like `editTaskSourceRows`, but
	 * the transform may depend on the task's current state.
	 */
	async function editTasks(ids: string[], transform: (task: Task, row: string) => string) {
		const entriesByFile = collectTaskEntriesByFile(ids);
		notifyMissingTasks(
			ids.length,
			Array.from(entriesByFile.values()).reduce((sum, entries) => sum + entries.length, 0),
		);

		for (const [fileHandle, entries] of entriesByFile) {
			await transformSourceRows(
				vault,
				fileHandle,
				entries.map(({ task, metadata }) => ({
					rowIndex: metadata.rowIndex,
					transform: (row: string) => {
						if (row !== task.originalLine) throw new Error("Task changed in the source file. Refresh the board before updating it.");
						return transform(task, row);
					},
				})),
				prepareFileContentsForWrite,
			);
		}
	}

	/**
	 * The custom column a task is leaving. A done task leaves the column its
	 * kept metadata identifies, so the normal column-change rules still apply to it.
	 */
	function getSourceColumn(task: Task): ColumnTag | undefined {
		if (task.done) return task.taggedColumn;
		return task.column && task.column !== "archived" && task.column !== "done" && task.column !== "uncategorised"
			? task.column
			: undefined;
	}

	function getColumnChangeOptions(task: Task, column: ColumnTag | DefaultColumns): ColumnChangeOptions {
		return {
			fromColumn: getSourceColumn(task),
			toColumn: column,
			columnDefinitions: getColumnDefinitions(),
			propertySchemaOption: getPropertySchemaOption(),
			doneStatusMarker: task.doneStatusMarker,
			wasDone: task.done,
			addCompletionDate: column === "done"
				? formatLocalDate(getCurrentDate?.() ?? new Date())
				: undefined,
			keepColumnTag: getKeepColumnTagOnCompletion(),
		};
	}

	/**
	 * Every column change, completion included, goes through this one
	 * surgical transform.
	 */
	async function editTaskColumns(ids: string[], column: ColumnTag | DefaultColumns) {
		await editTasks(ids, (task, row) => changeColumnTransform(row, getColumnChangeOptions(task, column)));
	}

	function changeTaskStatus(task: Task, row: string, status: string): string {
		const next = replaceStatusMarker(row, status);
		return updateCompletionDateForTransition(next, getPropertySchemaOption(),
			task.isSourceTaskLineComplete(row), task.isSourceTaskLineComplete(next), formatLocalDate(getCurrentDate?.() ?? new Date()));
	}

	function getTaskWithMetadata(id: string): { task: Task; metadata: Metadata } | null {
		const metadata = metadataByTaskId.get(id);
		const task = tasksByTaskId.get(id);
		return task && metadata ? { task, metadata } : null;
	}

	async function editableSource(task: Task, metadata: Metadata, rowIndex = metadata.rowIndex): Promise<MarkdownSource> {
		if (rowIndex === metadata.rowIndex && task.editableSource) return task.editableSource;
		const contents = await vault.read(metadata.fileHandle);
		const source = flattenMarkdownSource(parseMarkdownSource(contents)).find(source => source.rowIndex === rowIndex);
		if (!source || (rowIndex === metadata.rowIndex && sourceLines(source.raw)[0] !== task.originalLine)) {
			throw new Error("Task changed in the source file. Reopen the editor and try again.");
		}
		return editableMarkdownSource(source);
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
			await editTaskColumns([id], column);
		},

		async moveTasksToColumn(ids, column) {
			await editTaskColumns(ids, column);
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
			await editTaskColumns([id], "done");
		},

		async toggleDone(id) {
			const task = tasksByTaskId.get(id);
			if (!task) {
				notifyMissingTasks(1, 0);
				return;
			}
			const next = task.nextStatus(getStatusMarkerOrder());
			if (next.done) {
				await editTaskColumns([id], "done");
				return;
			}
			await editTaskSourceRows([id], (row) => changeTaskStatus(task, row, next.status));
		},

		async updateContent(id, content, dateEdits = [], expectedSource) {
			const entry = getTaskWithMetadata(id);
			if (!entry) throw new Error("Task changed. Reopen the editor and try again.");
			const source = expectedSource ? editableMarkdownSource(expectedSource) : await editableSource(entry.task, entry.metadata);
			let replacement = content === markdownBody(source) ? source.raw : replaceMarkdownBody(source, content);
			if (dateEdits.length) {
				const adapter = getPropertyWriteAdapter(getPropertySchemaOption());
				const lines = sourceLines(replacement);
				const trailing = lines[0]!.match(/[ \t]+$/)?.[0];
				if (adapter) lines[0] = dateEdits.reduce((line, { key, value }) => value ? adapter.upsertDate(line, key, value) : adapter.removeDate(line, key), lines[0]!);
				if (trailing) lines[0] = lines[0]!.replace(/[ \t]*$/, trailing);
				replacement = lines.join("\n");
			}
			await replaceSourceRanges(vault, entry.metadata.fileHandle, [{ start: source.start, end: source.end, expected: source.raw, replacement }], prepareFileContentsForWrite);
		},

		async updateSourceBlockRow(id, rowIndex, content, expectedSource) {
			const entry = getTaskWithMetadata(id);
			if (!entry) throw new Error("Task changed. Reopen the editor and try again.");
			const node = flattenSourceBlockNodes(entry.task.sourceChildren).find(node => node.rowIndex === rowIndex);
			if (!node) throw new Error("Note changed. Reopen the editor and try again.");
			const source = editableMarkdownSource(expectedSource ?? node.source ?? await editableSource(entry.task, entry.metadata, rowIndex));
			let replacement = source.raw;
			if (content !== markdownBlock(source)) replacement = replaceMarkdownBlock(source, content);
			await replaceSourceRanges(vault, entry.metadata.fileHandle, [{ start: source.start, end: source.end, expected: source.raw, replacement }], prepareFileContentsForWrite);
		},

		async toggleSourceTaskStatus(id, rowIndex) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				return;
			}

			let nextRow = entry.task.cycleSourceTaskRowStatus(rowIndex, getStatusMarkerOrder());
			if (nextRow == null) {
				return;
			}
			const original = flattenSourceBlockNodes(entry.task.sourceChildren).find(node => node.rowIndex === rowIndex);
			if (original?.kind === "task") {
				nextRow = updateCompletionDateForTransition(nextRow, getPropertySchemaOption(),
					entry.task.isSourceTaskLineComplete(original.rawLine), entry.task.isSourceTaskLineComplete(nextRow),
					formatLocalDate(getCurrentDate?.() ?? new Date()));
			}

			if (original?.source) {
				const source = original.source;
				await replaceSourceRanges(vault, entry.metadata.fileHandle, [{ start: source.start, end: source.end, expected: source.raw,
					replacement: [nextRow, ...sourceLines(source.raw).slice(1)].join("\n") }], prepareFileContentsForWrite);
			} else if (original) {
				await transformSourceRows(vault, entry.metadata.fileHandle, [{ rowIndex, transform: row => {
					if (row !== original.rawLine) throw new Error("Subtask changed; refresh the board before changing its status.");
					return nextRow;
				} }], prepareFileContentsForWrite);
			}
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

			checkedTaskBlock(entry.task, rows, entry.metadata.rowIndex);
			const block = getNodeBlock(rows, rowIndex);
			let targetIndex = block.start;
			let indentation = block.indentation;

			if (location === "child") {
				// We append as a child, so we insert at the end of the block
				targetIndex = block.end;
				indentation = block.continuationPrefix;
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

			checkedTaskBlock(entry.task, rows, entry.metadata.rowIndex);
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

			checkedTaskBlock(entry.task, rows, entry.metadata.rowIndex);
			const draggedBlock = getNodeBlock(rows, draggedRowIndex);
			const parentCardRow = rows[entry.task.rowIndex];
			if (parentCardRow == null) {
				return;
			}
			const parentCardIndentation = parentCardRow.match(/^\s*/)?.[0] ?? "";
			const stepChar = detectIndentationStep(rows);

			const safeTargetDepth = Math.max(1, targetDepth);
			const newRootIndentation = parentCardIndentation + stepChar.repeat(safeTargetDepth);
			const blockRows = rows.slice(draggedBlock.start, draggedBlock.end).map((row) => {
				if (!row) return "";
				return newRootIndentation + removeContainerPrefix(row, draggedBlock.indentation);
			});

			const targetBlock = getNodeBlock(rows, targetRowIndex);
			if (targetBlock.start >= draggedBlock.start && targetBlock.start < draggedBlock.end) return;
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

		async applyDateEdits(id, edits) {
			if (edits.length === 0) return;
			await editTaskSourceRows([id], (row) => {
				const adapter = getPropertyWriteAdapter(getPropertySchemaOption());
				if (!adapter) return row;
				return edits.reduce(
					(line, { key, value }) =>
						value ? adapter.upsertDate(line, key, value) : adapter.removeDate(line, key),
					row,
				);
			});
		},

		async archiveTasks(ids) {
			const files = [...collectTaskEntriesByFile(ids).keys()];
			await editTasks(ids, (task, row) => archiveTransform(row, {
				fromColumn: getSourceColumn(task),
				columnDefinitions: getColumnDefinitions(),
				propertySchemaOption: getPropertySchemaOption(),
				doneStatusMarker: task.doneStatusMarker,
				wasDone: task.done,
				addCompletionDate: formatLocalDate(getCurrentDate?.() ?? new Date()),
				archiveStatusMarker: task.archiveStatusMarker,
				keepColumnTag: getKeepColumnTagOnCompletion(),
			}));
			files.forEach(file => onArchiveWrite?.(file.path));
		},

		async cancelTasks(ids) {
			await editTasks(ids, (task, row) => changeTaskStatus(task, row, task.cancelledStatusMarker));
		},

		async restoreTasks(ids) {
			await editTasks(ids, (task, row) => changeTaskStatus(task, row, " "));
		},

		async deleteTask(id) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				notifyMissingTasks(1, 0);
				return;
			}

			const rows = await readFileRows(vault, entry.metadata.fileHandle);
			const block = checkedTaskBlock(entry.task, rows, entry.metadata.rowIndex);
			rows.splice(block.start, block.end - block.start);
			await writeFileRows(vault, entry.metadata.fileHandle, rows, prepareFileContentsForWrite);
		},

		async updateSwimlaneText(ids, literal, literals) {
			await editTaskSourceRows(ids, (row) => {
				const content = row.replace(/^\s*[-*+]\s+\[[^[\]]*\]\s/u, "");
				const old = literals.find((value) => findTextLiteralMatches(content, value).length > 0);
				return old ? replaceTextLiteral(row, old, literal) : literal ? addTextLiteral(row, literal) : row;
			});
		},

		async updateSwimlaneTag(ids, newTag, prefix, excludedTags, includeTags) {
			await editTasks(ids, (task, row) => {
				const oldTag = getTaskTagGroupValue(
					task,
					{ kind: "tag-prefix", prefix, includeTags },
					excludedTags,
				);
				return replacePlacementTags(row, oldTag ? [oldTag] : [], newTag ? [newTag] : []);
			});
		},

		async updateSwimlaneProperty(ids, key, value) {
			const adapter = getPropertyWriteAdapter(getPropertySchemaOption());
			if (!adapter) return;

			const transform = createSwimlanePropertyTransform(adapter, key, value);
			if (!transform) return;

			await editTaskSourceRows(ids, transform);
		},

		async duplicateTask(id) {
			const entry = getTaskWithMetadata(id);
			if (!entry) {
				notifyMissingTasks(1, 0);
				return;
			}

			const { fileHandle, rowIndex } = entry.metadata;
			const rows = await readFileRows(vault, fileHandle);

			if (rowIndex >= rows.length) return;

			const block = checkedTaskBlock(entry.task, rows, rowIndex);
			const sourceBlockRows = rows.slice(block.start, block.end);
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
			const requested = [...new Set(ids)].map(getTaskWithMetadata).filter((entry): entry is { task: Task; metadata: Metadata } => !!entry)
				.filter(entry => entry.metadata.fileHandle.path !== destinationFile.path);
			if (!requested.length) return;
			const byFile = new Map<TFile, string[]>();
			for (const { metadata } of requested) if (!byFile.has(metadata.fileHandle)) byFile.set(metadata.fileHandle, await readFileRows(vault, metadata.fileHandle));
			const planned = requested.map(entry => ({ ...entry, block: checkedTaskBlock(entry.task, byFile.get(entry.metadata.fileHandle)!, entry.metadata.rowIndex) }));
			const roots = planned.filter(entry => !planned.some(other => other !== entry
				&& other.metadata.fileHandle === entry.metadata.fileHandle && other.block.start < entry.block.start && other.block.end >= entry.block.end));
			const destinationContents = await vault.read(destinationFile);
			let nextDestination = destinationContents;
			for (const root of roots) {
				const blockRows = byFile.get(root.metadata.fileHandle)!.slice(root.block.start, root.block.end);
				for (const entry of planned.filter(entry => entry.metadata.fileHandle === root.metadata.fileHandle
					&& entry.block.start >= root.block.start && entry.block.end <= root.block.end)) {
					const index = entry.block.start - root.block.start;
					blockRows[index] = changeColumnTransform(blockRows[index]!, getColumnChangeOptions(entry.task, destinationColumn));
				}
				nextDestination = insertNewTask(nextDestination, blockRows.map(row => removeContainerPrefix(row, root.block.indentation)).join("\n"));
			}
			await replaceSourceRanges(vault, destinationFile, [{ start: 0, end: destinationContents.length, expected: destinationContents, replacement: nextDestination }], prepareFileContentsForWrite);
			for (const [file, rows] of byFile) {
				const expected = serializeFileRows(rows);
				for (const root of roots.filter(entry => entry.metadata.fileHandle === file).sort((a, b) => b.block.start - a.block.start)) {
					rows.splice(root.block.start, root.block.end - root.block.start);
				}
				await replaceSourceRanges(vault, file, [{ start: 0, end: expected.length, expected, replacement: serializeFileRows(rows) }], prepareFileContentsForWrite)
					.catch(() => { throw new Error("Source could not be removed after the move. The destination copy was kept; refresh before retrying."); });
			}
		},

		async viewFile(id, event) {
			const metadata = metadataByTaskId.get(id);

			if (!metadata) {
				new Notice("Could not open the task's file; the board may be out of sync.");
				return;
			}

			const { fileHandle, rowIndex } = metadata;

			const leaf = workspace.getLeaf(Keymap.isModEvent(event));
			await leaf.openFile(fileHandle);

			const editorView = workspace.getActiveViewOfType(MarkdownView);
			editorView?.editor.setCursor(rowIndex);
		},

		getTargetDestination,

		pickFileForNewTask(column, e, onTargetSelected, forceShowPicker = false) {
			if (!forceShowPicker) {
				const destination = getTargetDestination();
				if (destination) {
					onTargetSelected(destination.target);
					return;
				}
			}

			// Wrap onTargetSelected to persist last-used file when picking through the menu
			const onFileSelectedWithPersist = (file: TFile) => {
				setLastUsedTaskFile(file.path);
				onTargetSelected(file);
			};

			const files = vault
				.getMarkdownFiles()
				.filter((file) => isInScope(file.path))
				.sort((a, b) => a.path.localeCompare(b.path));

			const target = e.target as HTMLButtonElement | undefined;
			if (!target) {
				return;
			}

			const boundingRect = target.getBoundingClientRect();
			const y = boundingRect.top + boundingRect.height / 2;
			const x = boundingRect.left + boundingRect.width / 2;

			// Pinned rows: the default (★) first, then Today's daily note
			// when it isn't already the default.
			const defaultTaskFilePath = getDefaultTaskFile();
			const defaultIsDailyNote = defaultTaskFilePath === DAILY_NOTE_TARGET;
			const dailyNote = getDailyNoteState();
			const onDailyNoteSelected = (target: DailyNoteDestination) => {
				setLastUsedTaskFile(DAILY_NOTE_TARGET);
				onTargetSelected(target);
			};
			const pinnedEntries: PinnedPickerEntry[] = [];
			if (defaultTaskFilePath && !defaultIsDailyNote) {
				pinnedEntries.push(defaultFilePickerEntry(defaultTaskFilePath, onFileSelectedWithPersist));
			}
			if (dailyNote || defaultIsDailyNote) {
				pinnedEntries.push(dailyNotePickerEntry(dailyNote, defaultIsDailyNote, onDailyNoteSelected));
			}

			showFilePickerMenu({
				files,
				position: { x, y },
				pinnedEntries,
				onFileSelected: onFileSelectedWithPersist,
			});
		},

		async createTask(target, content, column, additionalTags = [], dateProperties = {}, groupProperty = null, additionalText = []) {
			const taskLine = buildNewTaskLine({
				content,
				column,
				columnDefinitions: getColumnDefinitions(),
				getPlacementTagsForColumn,
				propertySchemaOption: getPropertySchemaOption(),
				additionalTags,
				dateProperties,
				groupProperty,
				additionalText,
			});
			const insert = (contents: string) =>
				insertNewTask(contents, taskLine, getTaskInsertionSettings());

			// A new daily note is written once, with the task already in it.
			const { file, written } = await prepareTarget(target, insert);
			if (written) return;

			const contents = await vault.read(file);
			const nextContents = insert(contents);
			await vault.modify(file, prepareFileContentsForWrite
				? prepareFileContentsForWrite(file, nextContents)
				: nextContents);
		},
	};
}

/**
 * Detects the indentation step used in a file: a tab when the first indented
 * row uses tabs, otherwise two spaces.
 */
function detectIndentationStep(rows: string[]): string {
	for (const row of rows) {
		if (!row) continue;
		const match = row.match(/^([ \t]+)[-*+]\s/);
		if (match?.[1]) {
			return match[1].includes("\t") ? "\t" : "  ";
		}
	}
	return "  ";
}

export function getNodeBlock(rows: string[], rowIndex: number): { start: number; end: number; indentation: string; continuationPrefix: string } {
	const rootRow = rows[rowIndex];
	if (rootRow == null) return { start: rowIndex, end: rowIndex, indentation: "", continuationPrefix: "" };

	const source = flattenMarkdownSource(parseMarkdownSource(rows.join("\n"))).find(source => source.rowIndex === rowIndex);
	if (!source) throw new Error("Markdown block changed; refresh the board before moving it.");
	return { start: source.rowIndex, end: source.endRowIndex, indentation: source.indentation, continuationPrefix: source.continuationPrefix };
}

function checkedTaskBlock(task: Task, rows: string[], rowIndex: number) {
	const block = getNodeBlock(rows, rowIndex);
	const actual = rows.slice(block.start, block.end).join("\n");
	if (rows[rowIndex] !== task.originalLine || (task.source && actual !== sourceLines(task.source.raw).join("\n"))) {
		throw new Error("Task changed in the source file. Refresh the board before moving or deleting it.");
	}
	return block;
}
