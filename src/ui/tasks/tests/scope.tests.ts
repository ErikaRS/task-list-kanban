import { describe, expect, it } from "vitest";
import { shouldIncludeFilePath } from "../scope";

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
	])("applies board folder protection for %s", (path, includeFilter, excludeFilter, boardFolderPath, expected) => {
		expect(shouldIncludeFilePath(path, includeFilter, excludeFilter, boardFolderPath)).toBe(expected);
	});
});
