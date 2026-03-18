import { TFile, Vault, type EventRef, Workspace } from "obsidian";
import { updateMapsFromFile, type Metadata } from "./tasks";
import { Task, DEFAULT_DONE_STATUS_MARKERS, DEFAULT_CANCELLED_STATUS_MARKERS, DEFAULT_IGNORED_STATUS_MARKERS } from "./task";
import { get, writable, type Readable, type Writable } from "svelte/store";
import type { ColumnTagTable } from "../columns/columns";
import { createTaskActions, type TaskActions } from "./actions";
import type { SettingValues } from "../settings/settings_store";
import { shouldIncludeFilePath } from "./scope";

function getMarkerSettings(settings: SettingValues) {
	return {
		consolidateTags: settings.consolidateTags ?? false,
		doneStatusMarkers: settings.doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
		cancelledStatusMarkers: settings.cancelledStatusMarkers ?? DEFAULT_CANCELLED_STATUS_MARKERS,
		ignoredStatusMarkers: settings.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
		parseSubtasks: settings.parseSubtasks ?? true,
	};
}

export function createTasksStore(
	vault: Vault,
	workspace: Workspace,
	registerEvent: (eventRef: EventRef) => void,
	columnTagTableStore: Readable<ColumnTagTable>,
	getFilenameFilter: () => string[] | null,
	getExcludeFilter: () => string[] | null,
	getBoardFolderPath: () => string | null,
	settingsStore: Writable<SettingValues>
): {
	tasksStore: Writable<Task[]>;
	taskActions: TaskActions;
	initialise: () => void;
} {
	const tasksStore = writable<Task[]>([]);
	let timer: number | undefined;

	const tasksByTaskId = new Map<string, Task>();
	const metadataByTaskId = new Map<string, Metadata>();
	const taskIdsByFileHandle = new Map<TFile, Set<string>>();

	const fileHandles = vault.getMarkdownFiles();

	function debounceSetTasks() {
		if (!timer) {
			timer = window.setTimeout(() => {
				timer = undefined;
				tasksStore.set(
					[...tasksByTaskId.values()].sort((a, b) => {
						if (a.path !== b.path) {
							return a.path.localeCompare(b.path);
						}
						return a.rowIndex - b.rowIndex;
					})
				);
			}, 50);
		}
	}

	function shouldHandle(file: TFile): boolean {
		return shouldIncludeFilePath(file.path, getFilenameFilter(), getExcludeFilter(), getBoardFolderPath());
	}

	function processFile(fileHandle: TFile) {
		updateMapsFromFile({
			fileHandle,
			tasksByTaskId,
			metadataByTaskId,
			taskIdsByFileHandle,
			vault,
			columnTagTableStore,
			...getMarkerSettings(get(settingsStore)),
		}).then(() => {
			debounceSetTasks();
		});
	}

	function initialise() {
		tasksByTaskId.clear();
		metadataByTaskId.clear();
		taskIdsByFileHandle.clear();

		for (const fileHandle of fileHandles) {
			if (!shouldHandle(fileHandle)) {
				continue;
			}

			processFile(fileHandle);
		}
	}

	registerEvent(
		vault.on("modify", (fileHandle) => {
			if (fileHandle instanceof TFile && shouldHandle(fileHandle)) {
				processFile(fileHandle);
			}
		})
	);

	registerEvent(
		vault.on("create", (fileHandle) => {
			if (fileHandle instanceof TFile && shouldHandle(fileHandle)) {
				processFile(fileHandle);
			}
		})
	);

	registerEvent(
		vault.on("delete", (fileHandle) => {
			if (fileHandle instanceof TFile) {
				const tasksToDelete = taskIdsByFileHandle.get(fileHandle);
				if (!tasksToDelete) return;

				for (const taskId of tasksToDelete) {
					tasksByTaskId.delete(taskId);
					metadataByTaskId.delete(taskId);
				}
				taskIdsByFileHandle.delete(fileHandle);
			}
		})
	);

	registerEvent(
		vault.on("rename", (fileHandle) => {
			if (fileHandle instanceof TFile) {
				initialise();
			}
		})
	);

	const taskActions = createTaskActions({
		tasksByTaskId,
		metadataByTaskId,
		vault,
		workspace,
		getFilenameFilter,
		getExcludeFilter,
		getBoardFolderPath,
		getDefaultTaskFile: () => get(settingsStore).defaultTaskFile || null,
		getSyncParentStatus: () => get(settingsStore).syncParentStatus ?? true,
	});

	return { tasksStore, taskActions, initialise };
}
