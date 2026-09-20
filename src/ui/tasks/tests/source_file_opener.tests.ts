import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
	},
}));

import { TFile } from "obsidian";
import {
	migrateSourceFileSelectionPaths,
	openSourceFiles,
	openedMarkdownPaths,
	resolveSourceFiles,
	sourcePathsFromTasks,
} from "../source_file_opener";

function file(path: string): TFile {
	const result = new TFile();
	result.path = path;
	return result;
}

describe("source file opener", () => {
	it("deduplicates and sorts task source paths", () => {
		expect(sourcePathsFromTasks([
			{ path: "zeta.md" },
			{ path: "alpha.md" },
			{ path: "zeta.md" },
		])).toEqual(["alpha.md", "zeta.md"]);
	});

	it("resolves only live markdown files", () => {
		const files = new Map([["alpha.md", file("alpha.md")]]);
		expect(resolveSourceFiles({
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
		} as never, ["missing.md", "alpha.md"])).toEqual({
			files: [files.get("alpha.md")],
			unavailablePaths: ["missing.md"],
		});
	});

	it("finds Markdown tabs from view state without inspecting a loaded view", () => {
		const paths = openedMarkdownPaths({
			iterateAllLeaves(callback: (leaf: unknown) => void) {
				callback({ getViewState: () => ({ type: "markdown", state: { file: "pinned.md" } }) } as never);
				callback({ getViewState: () => ({ type: "kanban", state: { file: "board.md" } }) } as never);
				callback({ getViewState: () => ({ type: "markdown", state: {} }) } as never);
			},
		} as never);
		expect(paths).toEqual(new Set(["pinned.md"]));
	});

	it("always allocates a new tab for each unique target", async () => {
		const alpha = file("alpha.md");
		const beta = file("beta.md");
		const files = new Map([[alpha.path, alpha], [beta.path, beta]]);
		const openFile = vi.fn(async () => undefined);
		const getLeaf = vi.fn(() => ({ openFile }));
		const result = await openSourceFiles({
			vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null } as never,
			workspace: {
				iterateAllLeaves: (callback: (leaf: unknown) => void) => callback({ getViewState: () => ({ type: "markdown", state: { file: alpha.path } }) } as never),
				getLeaf,
			} as never,
			paths: [beta.path, alpha.path, beta.path],
			mode: "all",
		});
		expect(getLeaf).toHaveBeenNthCalledWith(1, "tab");
		expect(getLeaf).toHaveBeenNthCalledWith(2, "tab");
		expect(openFile).toHaveBeenCalledWith(alpha);
		expect(openFile).toHaveBeenCalledWith(beta);
		expect(result.openedPaths).toEqual(["alpha.md", "beta.md"]);
	});

	it("skips any Markdown file already open when requested", async () => {
		const alpha = file("alpha.md");
		const beta = file("beta.md");
		const openFile = vi.fn(async () => undefined);
		const result = await openSourceFiles({
			vault: { getAbstractFileByPath: (path: string) => ({ "alpha.md": alpha, "beta.md": beta }[path] ?? null) } as never,
			workspace: {
				iterateAllLeaves: (callback: (leaf: unknown) => void) => callback({ getViewState: () => ({ type: "markdown", state: { file: alpha.path } }) } as never),
				getLeaf: vi.fn(() => ({ openFile })),
			} as never,
			paths: [alpha.path, beta.path],
			mode: "unopened",
		});
		expect(openFile).toHaveBeenCalledTimes(1);
		expect(openFile).toHaveBeenCalledWith(beta);
		expect(result.skippedAlreadyOpenPaths).toEqual([alpha.path]);
	});

	it("keeps checkbox choices through source and ancestor-folder renames", () => {
		expect(migrateSourceFileSelectionPaths({
			"projects/alpha.md": false,
			"projects/nested/beta.md": true,
			"inbox.md": false,
		}, "projects", "archive/projects")).toEqual({
			"archive/projects/alpha.md": false,
			"archive/projects/nested/beta.md": true,
			"inbox.md": false,
		});
	});
});
