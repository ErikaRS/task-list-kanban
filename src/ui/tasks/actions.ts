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
import type { ColumnTag } from "../columns/columns";
import { shouldIncludeFilePath } from "./scope";
import { createDuplicateLine } from "./duplicate";

export type TaskActions = {
	changeColumn: (id: string, column: ColumnTag) => Promise<void>;
	markDone: (id: string) => Promise<void>;
	toggleDone: (id: string) => Promise<void>;
	updateContent: (id: string, content: string) => Promise<void>;
	viewFile: (id: string, event?: MouseEvent | KeyboardEvent) => Promise<void>;
	archiveTasks: (ids: string[]) => Promise<void>;
	cancelTasks: (ids: string[]) => Promise<void>;
	restoreTasks: (ids: string[]) => Promise<void>;
	deleteTask: (ids: string) => Promise<void>;
	duplicateTask: (id: string) => Promise<void>;
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
	) => Promise<void>;
	getTargetFile: () => TFile | null;
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
	getDefaultTaskFile,
	getLastUsedTaskFile,
	setLastUsedTaskFile,
}: {
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	vault: Vault;
	workspace: Workspace;
	getFilenameFilter: () => string[] | null;
	getExcludeFilter: () => string[] | null;
	getBoardFolderPath: () => string | null;
	getPlacementTagsForColumn: (column: ColumnTag) => string[];
	getDefaultTaskFile: () => string | null;
	getLastUsedTaskFile: () => string | null;
	setLastUsedTaskFile: (path: string) => void;
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
		updater: (task: Task) => void
	) {
		const metadata = metadataByTaskId.get(id);
		const task = tasksByTaskId.get(id);

		if (!metadata || !task) {
			return;
		}

		updater(task);

		const newTaskString = task.serialise();
		await updateRow(
			vault,
			metadata.fileHandle,
			metadata.rowIndex,
			newTaskString
		);
	}

	return {
		async changeColumn(id, column) {
			await updateRowWithTask(id, (task) => (task.column = column));
		},

		async markDone(id) {
			await updateRowWithTask(id, (task) => (task.done = true));
		},

		async toggleDone(id) {
			await updateRowWithTask(id, (task) => {
				if (task.done) {
					task.undone();
				} else {
					task.done = true;
				}
			});
		},

		async updateContent(id, content) {
			await updateRowWithTask(id, (task) => (task.content = content));
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
			await updateRowWithTask(id, (task) => task.delete());
		},

		async duplicateTask(id) {
			const metadata = metadataByTaskId.get(id);
			if (!metadata) return;

			const { fileHandle, rowIndex } = metadata;
			const file = await vault.read(fileHandle);
			const rows = file.split("\n");

			if (rowIndex >= rows.length) return;

			const originalLine = rows[rowIndex];
			if (!originalLine) return;

			const newLine = createDuplicateLine(originalLine);
			rows.splice(rowIndex + 1, 0, newLine);
			await vault.modify(fileHandle, rows.join("\n"));
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

		async createTask(file, content, column) {
			await updateRow(
				vault,
				file,
				undefined,
				`- [ ] ${content}${getPlacementTagsForColumn(column).map((tag) => ` #${tag}`).join("")}`,
			);
		},
	};
}

async function updateRow(
	vault: Vault,
	fileHandle: TFile,
	row: number | undefined,
	newText: string
) {
	const file = await vault.read(fileHandle);
	const rows = file.split("\n");

	if (row == null) {
		row = rows.length;
	}

	if (rows.length < row) {
		return;
	}

	if (newText === "") {
		rows.splice(row, 1);
	} else {
		rows[row] = newText;
	}
	const newFile = rows.join("\n");
	await vault.modify(fileHandle, newFile);
}
