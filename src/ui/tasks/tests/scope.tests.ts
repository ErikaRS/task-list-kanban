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
