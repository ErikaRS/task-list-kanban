import { FuzzySuggestModal, Notice, TFile, TFolder, type App, type Vault } from "obsidian";

export const INITIAL_KANBAN_BOARD_CONTENT = `---
kanban_plugin: {}
---
`;

const DEFAULT_BOARD_BASENAME = "Kanban";
const MAX_FILENAME_ATTEMPTS = 100;

export function parentFolderPathForFilePath(path: string | null | undefined): string {
	if (!path) {
		return "";
	}
	const slashIndex = path.lastIndexOf("/");
	return slashIndex === -1 ? "" : path.slice(0, slashIndex);
}

export function boardFilePathForAttempt(
	folderPath: string,
	timestamp: number,
	attempt: number,
): string {
	const suffix = attempt === 0 ? "" : `-${attempt}`;
	const fileName = `${DEFAULT_BOARD_BASENAME}-${timestamp}${suffix}.md`;
	return folderPath ? `${folderPath}/${fileName}` : fileName;
}

export function getDefaultFolderForCurrentBoard(currentBoardPath: string | null): string {
	return parentFolderPathForFilePath(currentBoardPath);
}

export function getDefaultFolderForActiveFile(activeFilePath: string | null): string {
	return parentFolderPathForFilePath(activeFilePath);
}

export async function createKanbanBoardInFolder(
	vault: Vault,
	folderPath: string,
	now: () => number = Date.now,
): Promise<TFile> {
	const normalizedFolderPath = folderPath === "/" ? "" : folderPath;
	const folder = normalizedFolderPath
		? vault.getAbstractFileByPath(normalizedFolderPath)
		: vault.getRoot();
	if (!(folder instanceof TFolder)) {
		throw new Error(`Folder not found: ${folderPath || "vault root"}`);
	}

	const timestamp = now();
	for (let attempt = 0; attempt < MAX_FILENAME_ATTEMPTS; attempt += 1) {
		const path = boardFilePathForAttempt(normalizedFolderPath, timestamp, attempt);
		if (vault.getAbstractFileByPath(path)) {
			continue;
		}
		try {
			return await vault.create(path, INITIAL_KANBAN_BOARD_CONTENT);
		} catch (error) {
			if (vault.getAbstractFileByPath(path)) {
				continue;
			}
			throw error;
		}
	}

	throw new Error("Could not find an available kanban board filename.");
}

export class BoardFolderPickerModal extends FuzzySuggestModal<TFolder> {
	private readonly onChooseFolder: (folder: TFolder) => void;

	constructor(
		app: App,
		private readonly defaultFolderPath: string,
		onChooseFolder: (folder: TFolder) => void,
	) {
		super(app);
		this.onChooseFolder = onChooseFolder;
		this.setPlaceholder("Choose destination folder for the new board");
		this.emptyStateText = "No matching folders";
		this.limit = 50;
	}

	onOpen(): void {
		super.onOpen();
		this.inputEl.value = this.defaultFolderPath;
		this.inputEl.select();
		this.inputEl.dispatchEvent(new Event("input"));
	}

	getItems(): TFolder[] {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder);
		if (!folders.some((folder) => folder.path === this.app.vault.getRoot().path)) {
			folders.push(this.app.vault.getRoot());
		}
		return folders.sort((a, b) => this.getItemText(a).localeCompare(this.getItemText(b)));
	}

	getItemText(folder: TFolder): string {
		return folder.path || "Vault root";
	}

	onChooseItem(folder: TFolder): void {
		this.onChooseFolder(folder);
	}
}

export async function createBoardWithNotice(
	vault: Vault,
	folderPath: string,
): Promise<TFile | null> {
	try {
		return await createKanbanBoardInFolder(vault, folderPath);
	} catch (error) {
		console.error("Failed to create kanban board", error);
		new Notice("Failed to create kanban board.");
		return null;
	}
}
