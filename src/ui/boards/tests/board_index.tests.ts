import { describe, expect, it } from "vitest";
import {
	movePathRelativeTo,
	resolveTabEntries,
	rewriteBoardPath,
	sortBoardEntries,
	type BoardIndexEntry,
} from "../board_index";

function entry(path: string): BoardIndexEntry {
	const name = path.split("/").pop()!.replace(/\.md$/, "");
	const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	return { path, name, folder };
}

const work = entry("projects/Work.md");
const home = entry("Home.md");
const archiveHome = entry("archive/Home.md");

describe("sortBoardEntries", () => {
	it("sorts by name case-insensitively with path tie-break", () => {
		const sorted = sortBoardEntries([work, entry("zoo/apples.md"), archiveHome, home]);

		expect(sorted.map((board) => board.path)).toEqual([
			"zoo/apples.md",
			"archive/Home.md",
			"Home.md",
			"projects/Work.md",
		]);
	});
});

describe("resolveTabEntries", () => {
	it("resolves nothing when tabs are disabled or unset", () => {
		expect(resolveTabEntries([work, home], undefined, work.path)).toEqual([]);
		expect(resolveTabEntries([work, home], { enabled: false }, work.path)).toEqual([]);
	});

	it("lists all boards alphabetically when enabled", () => {
		const tabs = resolveTabEntries([work, home], { enabled: true }, home.path);

		expect(tabs.map((board) => board.path)).toEqual(["Home.md", "projects/Work.md"]);
	});

	it("hides the strip when fewer than two tabs would show", () => {
		expect(resolveTabEntries([work], { enabled: true }, work.path)).toEqual([]);
		expect(resolveTabEntries([], { enabled: true }, null)).toEqual([]);
	});

	it("puts explicitly ordered boards first and the rest alphabetically", () => {
		const tabs = resolveTabEntries(
			[work, home, archiveHome],
			{ enabled: true, boardPaths: [work.path, "missing/Gone.md", home.path] },
			work.path,
		);

		expect(tabs.map((board) => board.path)).toEqual([
			"projects/Work.md",
			"Home.md",
			"archive/Home.md",
		]);
	});

	it("hides unpinned boards", () => {
		const tabs = resolveTabEntries(
			[work, home, archiveHome],
			{ enabled: true, unpinnedPaths: [archiveHome.path] },
			work.path,
		);

		expect(tabs.map((board) => board.path)).toEqual(["Home.md", "projects/Work.md"]);
	});

	it("appends the current board even when it is unpinned", () => {
		const tabs = resolveTabEntries(
			[work, home, archiveHome],
			{ enabled: true, unpinnedPaths: [archiveHome.path] },
			archiveHome.path,
		);

		expect(tabs.map((board) => board.path)).toEqual([
			"Home.md",
			"projects/Work.md",
			"archive/Home.md",
		]);
	});

	it("ignores order and unpinned lists when tabs are disabled", () => {
		expect(
			resolveTabEntries(
				[work, home],
				{ enabled: false, boardPaths: [work.path], unpinnedPaths: [home.path] },
				work.path,
			),
		).toEqual([]);
	});
});

describe("movePathRelativeTo", () => {
	const paths = ["a.md", "b.md", "c.md", "d.md"];

	it("moves a path before and after a target", () => {
		expect(movePathRelativeTo(paths, "d.md", "b.md", "before")).toEqual([
			"a.md",
			"d.md",
			"b.md",
			"c.md",
		]);
		expect(movePathRelativeTo(paths, "a.md", "c.md", "after")).toEqual([
			"b.md",
			"c.md",
			"a.md",
			"d.md",
		]);
	});

	it("returns the input for self-drops and unknown paths", () => {
		expect(movePathRelativeTo(paths, "a.md", "a.md", "before")).toBe(paths);
		expect(movePathRelativeTo(paths, "x.md", "a.md", "before")).toBe(paths);
	});
});

describe("rewriteBoardPath", () => {
	it("rewrites the renamed file and children of a renamed folder", () => {
		expect(rewriteBoardPath("projects/Work.md", "projects/Work.md", "projects/Jobs.md")).toBe(
			"projects/Jobs.md",
		);
		expect(rewriteBoardPath("projects/Work.md", "projects", "active")).toBe("active/Work.md");
	});

	it("leaves unrelated and prefix-lookalike paths alone", () => {
		expect(rewriteBoardPath("Home.md", "projects/Work.md", "projects/Jobs.md")).toBe("Home.md");
		expect(rewriteBoardPath("projects-old/Work.md", "projects", "active")).toBe(
			"projects-old/Work.md",
		);
	});
});
