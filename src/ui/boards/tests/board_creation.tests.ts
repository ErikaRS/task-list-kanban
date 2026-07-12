import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
	class TAbstractFile {
		path = "";
	}
	class TFile extends TAbstractFile {}
	class TFolder extends TAbstractFile {
		children = [];
		constructor(path = "") {
			super();
			this.path = path;
		}
	}
	class FuzzySuggestModal<T> {
		limit = 0;
		emptyStateText = "";
		inputEl = {
			value: "",
			select: vi.fn(),
			dispatchEvent: vi.fn(),
		};
		constructor(readonly app: unknown) {}
		setPlaceholder = vi.fn();
		onOpen() {}
		onClose() {}
		open() {}
	}
	class Notice {}
	return { FuzzySuggestModal, Notice, TFile, TFolder };
});

import { TFile, TFolder } from "obsidian";
import {
	INITIAL_KANBAN_BOARD_CONTENT,
	boardFilePathForAttempt,
	createKanbanBoardInFolder,
	getDefaultFolderForActiveFile,
	getDefaultFolderForCurrentBoard,
	parentFolderPathForFilePath,
} from "../board_creation";

type FakeVault = {
	getRoot: () => TFolder;
	getAbstractFileByPath: (path: string) => TFile | TFolder | null;
	create: (path: string, contents: string) => Promise<TFile>;
};

function fakeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	return file;
}

function fakeFolder(path: string): TFolder {
	const folder = new TFolder();
	folder.path = path;
	return folder;
}

function createFakeVault(paths: string[] = []): FakeVault {
	const files = new Map<string, TFile | TFolder>();
	const root = fakeFolder("");
	files.set("", root);
	for (const path of paths) {
		files.set(path, path.endsWith(".md") ? fakeFile(path) : fakeFolder(path));
	}
	return {
		getRoot: () => root,
		getAbstractFileByPath: (path) => files.get(path) ?? null,
		create: vi.fn(async (path: string, contents: string) => {
			expect(contents).toBe(INITIAL_KANBAN_BOARD_CONTENT);
			if (files.has(path)) {
				throw new Error("File already exists");
			}
			const file = fakeFile(path);
			files.set(path, file);
			return file;
		}),
	};
}

describe("board creation path helpers", () => {
	it("derives parent folders from board and active-file paths", () => {
		expect(parentFolderPathForFilePath("Projects/Board.md")).toBe("Projects");
		expect(parentFolderPathForFilePath("Board.md")).toBe("");
		expect(parentFolderPathForFilePath(null)).toBe("");
		expect(getDefaultFolderForCurrentBoard("Areas/Home.md")).toBe("Areas");
		expect(getDefaultFolderForActiveFile("Daily/2026-07-12.md")).toBe("Daily");
	});

	it("builds root and nested candidate filenames with suffix retries", () => {
		expect(boardFilePathForAttempt("", 123, 0)).toBe("Kanban-123.md");
		expect(boardFilePathForAttempt("Projects", 123, 0)).toBe(
			"Projects/Kanban-123.md",
		);
		expect(boardFilePathForAttempt("Projects", 123, 2)).toBe(
			"Projects/Kanban-123-2.md",
		);
	});
});

describe("createKanbanBoardInFolder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates a board in the vault root", async () => {
		const vault = createFakeVault();

		const file = await createKanbanBoardInFolder(vault as never, "", () => 123);

		expect(file.path).toBe("Kanban-123.md");
		expect(vault.create).toHaveBeenCalledWith(
			"Kanban-123.md",
			INITIAL_KANBAN_BOARD_CONTENT,
		);
	});

	it("creates a board in a selected folder", async () => {
		const vault = createFakeVault(["Projects"]);

		const file = await createKanbanBoardInFolder(vault as never, "Projects", () => 456);

		expect(file.path).toBe("Projects/Kanban-456.md");
	});

	it("retries with a numeric suffix when the timestamp name is taken", async () => {
		const vault = createFakeVault(["Projects", "Projects/Kanban-456.md"]);

		const file = await createKanbanBoardInFolder(vault as never, "Projects", () => 456);

		expect(file.path).toBe("Projects/Kanban-456-1.md");
	});

	it("rejects missing destination folders", async () => {
		const vault = createFakeVault();

		await expect(
			createKanbanBoardInFolder(vault as never, "Missing", () => 123),
		).rejects.toThrow("Folder not found");
	});
});
