import { describe, expect, it } from "vitest";
import {
	movePathRelativeTo,
	resolveBoardList,
	rewriteBoardListPaths,
	rewriteBoardPath,
	rewriteLastOpenedPaths,
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

describe("resolveBoardList", () => {
	it("shows every board alphabetically with no curation", () => {
		const resolved = resolveBoardList([work, home], undefined);

		expect(resolved.shown.map((board) => board.path)).toEqual([
			"Home.md",
			"projects/Work.md",
		]);
		expect(resolved.hidden).toEqual([]);
	});

	it("puts explicitly ordered boards first and the rest alphabetically", () => {
		const resolved = resolveBoardList([work, home, archiveHome], {
			boardPaths: [work.path, "missing/Gone.md", home.path],
		});

		expect(resolved.shown.map((board) => board.path)).toEqual([
			"projects/Work.md",
			"Home.md",
			"archive/Home.md",
		]);
		expect(resolved.hidden).toEqual([]);
	});

	it("moves unpinned boards to the hidden section, alphabetical", () => {
		const resolved = resolveBoardList([work, home, archiveHome], {
			unpinnedPaths: [work.path, archiveHome.path],
		});

		expect(resolved.shown.map((board) => board.path)).toEqual(["Home.md"]);
		expect(resolved.hidden.map((board) => board.path)).toEqual([
			"archive/Home.md",
			"projects/Work.md",
		]);
	});

	it("hides an unpinned board even when it is also explicitly ordered", () => {
		const resolved = resolveBoardList([work, home], {
			boardPaths: [work.path, home.path],
			unpinnedPaths: [work.path],
		});

		expect(resolved.shown.map((board) => board.path)).toEqual(["Home.md"]);
		expect(resolved.hidden.map((board) => board.path)).toEqual(["projects/Work.md"]);
	});

	it("resolves a single board and an empty vault without special cases", () => {
		// Unlike the tab strip's "minimum two tabs" rule, the dashboard
		// always shows what exists.
		expect(resolveBoardList([work], undefined).shown).toEqual([work]);
		expect(resolveBoardList([], undefined)).toEqual({ shown: [], hidden: [] });
	});
});

describe("rewriteBoardListPaths", () => {
	it("rewrites both lists after a folder rename", () => {
		expect(
			rewriteBoardListPaths(
				{
					boardPaths: ["projects/Work.md", "Home.md"],
					unpinnedPaths: ["projects/Old.md"],
				},
				"projects",
				"active",
			),
		).toEqual({
			boardPaths: ["active/Work.md", "Home.md"],
			unpinnedPaths: ["active/Old.md"],
		});
	});

	it("returns null when the rename touches neither list", () => {
		expect(
			rewriteBoardListPaths(
				{ boardPaths: ["Home.md"] },
				"projects/Work.md",
				"projects/Jobs.md",
			),
		).toBeNull();
		expect(rewriteBoardListPaths(undefined, "a.md", "b.md")).toBeNull();
	});
});

describe("rewriteLastOpenedPaths", () => {
	it("moves stamps for the renamed file and children of a renamed folder", () => {
		expect(
			rewriteLastOpenedPaths(
				{ "projects/Work.md": 100, "Home.md": 200 },
				"projects",
				"active",
			),
		).toEqual({ "active/Work.md": 100, "Home.md": 200 });
	});

	it("keeps the later stamp when a rename collides with an existing entry", () => {
		expect(
			rewriteLastOpenedPaths(
				{ "Old.md": 300, "New.md": 100 },
				"Old.md",
				"New.md",
			),
		).toEqual({ "New.md": 300 });
		expect(
			rewriteLastOpenedPaths(
				{ "Old.md": 100, "New.md": 300 },
				"Old.md",
				"New.md",
			),
		).toEqual({ "New.md": 300 });
	});

	it("returns null when the rename touches no stamped path", () => {
		expect(
			rewriteLastOpenedPaths({ "Home.md": 100 }, "projects/Work.md", "projects/Jobs.md"),
		).toBeNull();
		expect(rewriteLastOpenedPaths(undefined, "a.md", "b.md")).toBeNull();
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
