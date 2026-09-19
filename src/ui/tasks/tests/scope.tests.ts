import { describe, expect, it } from "vitest";
import {
	getProtectedBoardFolderPath,
	resolveScopeFilter,
	shouldIncludeFilePath,
} from "../scope";
import { ScopeOption } from "../../settings/settings_store";
import { createPathScope } from "../path_scope";

describe("shouldIncludeFilePath", () => {
	it.each([
		["work/todo.md", null, undefined, undefined, true],
		["projects/kanban.md", ["projects"], undefined, undefined, true],
		["projects/roadmap/plan.md", ["projects"], undefined, undefined, true],
		["notes/today.md", ["projects"], undefined, undefined, false],
		["project-archive/todo.md", ["project"], undefined, undefined, false],
		["projects/kanban.md", ["/projects"], undefined, undefined, true],
		["work/todo.md", ["projects", "work"], undefined, undefined, true],
		["work/active/plan.md", ["projects", "work"], undefined, undefined, true],
		["notes/today.md", ["projects", "work"], undefined, undefined, false],
		["work/todo.md", ["work/"], undefined, undefined, true],
		["projects/active/todo.md", ["projects", "projects/active"], undefined, undefined, true],
		["work/todo.md", [], undefined, undefined, false],
		["todo.md", [], undefined, undefined, false],
		["todo.md", [""], undefined, undefined, true],
		["work/todo.md", [""], undefined, undefined, true],
	])("applies include filters for %s", (path, includeFilter, excludeFilter, boardFolderPath, expected) => {
		expect(shouldIncludeFilePath(path, includeFilter, excludeFilter, boardFolderPath)).toBe(expected);
	});
});

describe("shouldIncludeFilePath with excludeFilter", () => {
	it.each([
		["templates/daily.md", null, ["templates"], undefined, false],
		["templates/sub/file.md", null, ["templates"], undefined, false],
		["notes/scratch.md", null, ["notes/scratch.md"], undefined, false],
		["work/todo.md", null, ["templates"], undefined, true],
		["templates-old/file.md", null, ["templates"], undefined, true],
		["templates/daily.md", null, ["templates", "AI/examples"], undefined, false],
		["AI/examples/sample.md", null, ["templates", "AI/examples"], undefined, false],
		["templates/daily.md", null, null, undefined, true],
		["templates/daily.md", null, undefined, undefined, true],
		["templates/daily.md", null, [], undefined, true],
		["projects/templates/daily.md", ["projects"], ["projects/templates"], undefined, false],
		["notes/todo.md", ["projects"], ["templates"], undefined, false],
		["templates/daily.md", null, ["templates/"], undefined, false],
		["templates/daily.md", null, ["/templates"], undefined, false],
		["todo.md", null, [""], null, false],
	])("applies exclude filters for %s", (path, includeFilter, excludeFilter, boardFolderPath, expected) => {
		expect(shouldIncludeFilePath(path, includeFilter, excludeFilter, boardFolderPath)).toBe(expected);
	});
});

describe("shouldIncludeFilePath with board folder override", () => {
	const boardFolder = "projects/active";

	it.each([
		["projects/active/todo.md", null, ["projects"], boardFolder, true],
		["projects/other/todo.md", null, ["projects"], boardFolder, false],
		["projects/active/todo.md", null, ["projects/active"], boardFolder, true],
		["projects/active/templates/daily.md", null, ["projects/active/templates"], boardFolder, false],
		["projects/active/scratch.md", null, ["projects/active/scratch.md"], boardFolder, false],
		["projects/active/todo.md", ["projects"], ["projects"], boardFolder, true],
		["projects/active/todo.md", null, ["projects"], null, false],
		["projects/active/todo.md", null, ["projects"], undefined, false],
		["projects/active", null, ["projects"], boardFolder, true],
		["myboard/todo.md", null, ["myboard"], "myboard", true],
		["myboard/templates/daily.md", null, ["myboard/templates"], "myboard", false],
		["todo.md", null, [""], "", true],
	])("applies board folder protection for %s", (path, includeFilter, excludeFilter, boardFolderPath, expected) => {
		expect(shouldIncludeFilePath(path, includeFilter, excludeFilter, boardFolderPath)).toBe(expected);
	});
});

describe("getProtectedBoardFolderPath", () => {
	it("allows exclusions to remove the board folder in selected paths", () => {
		const protectedBoardFolder = getProtectedBoardFolderPath(
			ScopeOption.SelectedPaths,
			"boards",
		);
		expect(protectedBoardFolder).toBeNull();
		expect(
			shouldIncludeFilePath("boards/task.md", ["boards"], ["boards"], protectedBoardFolder),
		).toBe(false);
	});

	it("preserves board-folder protection for legacy scope modes", () => {
		expect(getProtectedBoardFolderPath(ScopeOption.Folder, "boards")).toBe("boards");
	});
});

describe("resolveScopeFilter", () => {
	it("searches everywhere for the everywhere scope", () => {
		expect(resolveScopeFilter(ScopeOption.Everywhere, ["projects"], "boards")).toBeNull();
	});

	it("limits the folder scope to the board's own folder", () => {
		expect(resolveScopeFilter(ScopeOption.Folder, undefined, "boards")).toEqual(["boards"]);
		expect(resolveScopeFilter(ScopeOption.Folder, undefined, null)).toBeNull();
	});

	it("always includes the board folder first for selected folders", () => {
		expect(
			resolveScopeFilter(ScopeOption.SelectedFolders, ["projects", "boards"], "boards"),
		).toEqual(["boards", "projects"]);
	});

	it("uses only the selected folders when the board folder is unknown", () => {
		expect(resolveScopeFilter(ScopeOption.SelectedFolders, ["projects"], null)).toEqual([
			"projects",
		]);
		expect(resolveScopeFilter(ScopeOption.SelectedFolders, undefined, null)).toEqual([]);
	});

	it("uses exact selected paths without implicitly adding the board folder", () => {
		const pathScope = createPathScope(["daily/today.md", "projects/alpha"])!;
		expect(
			resolveScopeFilter(ScopeOption.SelectedPaths, undefined, "boards", pathScope),
		).toEqual(["daily/today.md", "projects/alpha"]);
	});

	it("adds the board folder only when selected paths requests it", () => {
		const pathScope = createPathScope(["daily/today.md"], true)!;
		expect(
			resolveScopeFilter(ScopeOption.SelectedPaths, undefined, "boards", pathScope),
		).toEqual(["boards", "daily/today.md"]);
	});

	it("returns empty include list when selected paths has no pathScope", () => {
		expect(
			resolveScopeFilter(ScopeOption.SelectedPaths, undefined, "boards", undefined),
		).toEqual([]);
	});

	it("distinguishes exact file matches from folder prefixes", () => {
		const filter = ["daily/2026-09-19.md", "projects/alpha"];

		// Exact file matches
		expect(shouldIncludeFilePath("daily/2026-09-19.md", filter)).toBe(true);
		// Sibling file with similar prefix does not match
		expect(shouldIncludeFilePath("daily/2026-09-19-notes.md", filter)).toBe(false);
		expect(shouldIncludeFilePath("daily/2026-09-19.markdown", filter)).toBe(false);

		// Folder matches descendants
		expect(shouldIncludeFilePath("projects/alpha/task.md", filter)).toBe(true);
		expect(shouldIncludeFilePath("projects/alpha/nested/task.md", filter)).toBe(true);
		// Sibling folder does not match
		expect(shouldIncludeFilePath("projects/alpha-2/task.md", filter)).toBe(false);
	});

	it("does not protect board folder from exclusions in selected paths mode", () => {
		const filter = ["boards", "daily/today.md"];
		const protectedBoardFolder = getProtectedBoardFolderPath(ScopeOption.SelectedPaths, "boards");
		expect(protectedBoardFolder).toBeNull();

		// An exclusion covering "boards" removes files inside "boards"
		expect(shouldIncludeFilePath("boards/task.md", filter, ["boards"], protectedBoardFolder)).toBe(false);
	});
});
