import { describe, expect, it } from "vitest";
import { shouldIncludeFilePath } from "../scope";

describe("shouldIncludeFilePath", () => {
	// --- null filter (include everything) ---
	it("includes all files when filter is null", () => {
		expect(shouldIncludeFilePath("work/todo.md", null)).toBe(true);
	});

	// --- single-element array (same as old "This folder" behavior) ---
	it("includes files directly in the scoped folder", () => {
		expect(shouldIncludeFilePath("projects/kanban.md", ["projects"])).toBe(
			true
		);
	});

	it("includes files in subfolders of the scoped folder", () => {
		expect(
			shouldIncludeFilePath("projects/roadmap/plan.md", ["projects"])
		).toBe(true);
	});

	it("excludes files outside the scoped folder", () => {
		expect(shouldIncludeFilePath("notes/today.md", ["projects"])).toBe(
			false
		);
	});

	it("does not match sibling folder names by prefix", () => {
		expect(
			shouldIncludeFilePath("project-archive/todo.md", ["project"])
		).toBe(false);
	});

	it("supports filters with a leading slash", () => {
		expect(
			shouldIncludeFilePath("projects/kanban.md", ["/projects"])
		).toBe(true);
	});

	// --- multi-element array (new "Selected folders" behavior) ---
	it("includes files matching any folder in a multi-folder filter", () => {
		expect(
			shouldIncludeFilePath("work/todo.md", ["projects", "work"])
		).toBe(true);
	});

	it("includes files in subfolders of any folder in a multi-folder filter", () => {
		expect(
			shouldIncludeFilePath("work/active/plan.md", ["projects", "work"])
		).toBe(true);
	});

	it("excludes files not matching any folder in a multi-folder filter", () => {
		expect(
			shouldIncludeFilePath("notes/today.md", ["projects", "work"])
		).toBe(false);
	});

	it("handles trailing slashes in folder paths", () => {
		expect(
			shouldIncludeFilePath("work/todo.md", ["work/"])
		).toBe(true);
	});

	it("handles overlapping folders without issues", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", [
				"projects",
				"projects/active",
			])
		).toBe(true);
	});

	// --- empty array (include nothing) ---
	it("excludes all files when filter is an empty array", () => {
		expect(shouldIncludeFilePath("work/todo.md", [])).toBe(false);
	});

	it("excludes root files when filter is an empty array", () => {
		expect(shouldIncludeFilePath("todo.md", [])).toBe(false);
	});
});

describe("shouldIncludeFilePath with excludeFilter", () => {
	// --- exclude basics ---
	it("excludes a file matching a single exclude path", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, ["templates"])
		).toBe(false);
	});

	it("excludes files in subdirectories of an excluded path", () => {
		expect(
			shouldIncludeFilePath("templates/sub/file.md", null, ["templates"])
		).toBe(false);
	});

	it("excludes an exact file path", () => {
		expect(
			shouldIncludeFilePath("notes/scratch.md", null, ["notes/scratch.md"])
		).toBe(false);
	});

	it("does not exclude files not matching the exclude path", () => {
		expect(
			shouldIncludeFilePath("work/todo.md", null, ["templates"])
		).toBe(true);
	});

	it("does not match prefix-similar paths", () => {
		expect(
			shouldIncludeFilePath("templates-old/file.md", null, ["templates"])
		).toBe(true);
	});

	it("excludes files matching any of multiple exclude paths", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, ["templates", "AI/examples"])
		).toBe(false);
		expect(
			shouldIncludeFilePath("AI/examples/sample.md", null, ["templates", "AI/examples"])
		).toBe(false);
	});

	// --- exclude with null/empty/undefined (no-op) ---
	it("does not exclude when excludeFilter is null", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, null)
		).toBe(true);
	});

	it("does not exclude when excludeFilter is undefined", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, undefined)
		).toBe(true);
	});

	it("does not exclude when excludeFilter is empty array", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, [])
		).toBe(true);
	});

	// --- exclude combined with include filter ---
	it("applies exclude after include filter", () => {
		expect(
			shouldIncludeFilePath("projects/templates/daily.md", ["projects"], ["projects/templates"])
		).toBe(false);
	});

	it("include filter takes precedence when file is outside scope", () => {
		expect(
			shouldIncludeFilePath("notes/todo.md", ["projects"], ["templates"])
		).toBe(false); // excluded by include, not by exclude
	});

	// --- exclude with trailing/leading slashes ---
	it("handles trailing slashes in exclude paths", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, ["templates/"])
		).toBe(false);
	});

	it("handles leading slashes in exclude paths", () => {
		expect(
			shouldIncludeFilePath("templates/daily.md", null, ["/templates"])
		).toBe(false);
	});
});

describe("shouldIncludeFilePath with board folder override", () => {
	const boardFolder = "projects/active";

	// --- parent directory excluded, board folder protected ---
	it("protects board folder files when parent directory is excluded", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", null, ["projects"], boardFolder)
		).toBe(true);
	});

	it("excludes non-board files when parent directory is excluded", () => {
		expect(
			shouldIncludeFilePath("projects/other/todo.md", null, ["projects"], boardFolder)
		).toBe(false);
	});

	// --- board folder itself excluded is a no-op ---
	it("protects board folder files when board folder itself is excluded", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", null, ["projects/active"], boardFolder)
		).toBe(true);
	});

	// --- subdirectory of board folder can be excluded ---
	it("excludes subdirectory of board folder", () => {
		expect(
			shouldIncludeFilePath("projects/active/templates/daily.md", null, ["projects/active/templates"], boardFolder)
		).toBe(false);
	});

	// --- individual file within board folder can be excluded ---
	it("excludes individual file within board folder", () => {
		expect(
			shouldIncludeFilePath("projects/active/scratch.md", null, ["projects/active/scratch.md"], boardFolder)
		).toBe(false);
	});

	// --- board folder override with include filter ---
	it("protects board folder when used with include and exclude filters", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", ["projects"], ["projects"], boardFolder)
		).toBe(true);
	});

	// --- no board folder path provided (no override) ---
	it("does not apply override when boardFolderPath is null", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", null, ["projects"], null)
		).toBe(false);
	});

	it("does not apply override when boardFolderPath is undefined", () => {
		expect(
			shouldIncludeFilePath("projects/active/todo.md", null, ["projects"])
		).toBe(false);
	});

	// --- files at exact board folder path ---
	it("protects file path matching board folder exactly", () => {
		expect(
			shouldIncludeFilePath("projects/active", null, ["projects"], boardFolder)
		).toBe(true);
	});

	// --- root-level board folder ---
	it("protects root-level board folder when parent-like path is excluded", () => {
		expect(
			shouldIncludeFilePath("myboard/todo.md", null, ["myboard"], "myboard")
		).toBe(true);
	});

	it("excludes subdirectory of root-level board folder", () => {
		expect(
			shouldIncludeFilePath("myboard/templates/daily.md", null, ["myboard/templates"], "myboard")
		).toBe(false);
	});
});
