import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
	class TAbstractFile {
		path = "";
	}
	class TFile extends TAbstractFile {}
	return { TFile };
});

import { TFile } from "obsidian";
import { trashBoardFile } from "../board_deletion";

function fakeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	return file;
}

function fakeApp(file: TFile | null, trash = vi.fn(async () => undefined)) {
	return {
		vault: {
			getAbstractFileByPath: vi.fn(() => file),
			trash,
		},
	};
}

describe("trashBoardFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("moves the board file to system trash", async () => {
		const file = fakeFile("Projects/Board.md");
		const app = fakeApp(file);

		await expect(trashBoardFile(app as never, file.path)).resolves.toEqual({
			ok: true,
		});
		expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith(file.path);
		expect(app.vault.trash).toHaveBeenCalledWith(file, true);
	});

	it("reports a missing board file without calling trash", async () => {
		const app = fakeApp(null);

		await expect(trashBoardFile(app as never, "Missing.md")).resolves.toEqual({
			ok: false,
			reason: "missing",
		});
		expect(app.vault.trash).not.toHaveBeenCalled();
	});

	it("reports trash failures", async () => {
		const error = new Error("nope");
		const app = fakeApp(
			fakeFile("Projects/Board.md"),
			vi.fn(async () => {
				throw error;
			}),
		);

		await expect(trashBoardFile(app as never, "Projects/Board.md")).resolves.toEqual({
			ok: false,
			reason: "failed",
			error,
		});
	});
});
