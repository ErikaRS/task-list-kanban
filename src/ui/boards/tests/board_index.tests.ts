import { describe, expect, it } from "vitest";
import {
	resolveTabEntries,
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
});
