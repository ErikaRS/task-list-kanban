import { describe, expect, it } from "vitest";
import { shouldIncludeFilePath } from "../scope";

describe("shouldIncludeFilePath", () => {
	it("includes all files when no filter is set", () => {
		expect(shouldIncludeFilePath("work/todo.md", null)).toBe(true);
	});

	it("supports filters with a leading slash", () => {
		expect(shouldIncludeFilePath("projects/kanban.md", "/projects")).toBe(
			true
		);
	});

	it("includes files directly in the scoped folder", () => {
		expect(shouldIncludeFilePath("projects/kanban.md", "projects")).toBe(
			true
		);
	});

	it("includes files in subfolders of the scoped folder", () => {
		expect(
			shouldIncludeFilePath("projects/roadmap/plan.md", "projects")
		).toBe(true);
	});

	it("excludes files outside the scoped folder", () => {
		expect(shouldIncludeFilePath("notes/today.md", "projects")).toBe(false);
	});

	it("does not match sibling folder names by prefix", () => {
		expect(shouldIncludeFilePath("project-archive/todo.md", "project")).toBe(
			false
		);
	});
});
