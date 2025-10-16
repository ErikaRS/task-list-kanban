import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
        normalizePath: (path: string) =>
                path
                        .replace(/\\/g, "/")
                        .replace(/\/+/g, "/")
                        .replace(/^\/+/, "")
                        .replace(/\/+$/, ""),
}));

import { isPathExcluded, isPathInsideFolder, shouldIncludeFilePath } from "../src/utils/folders";

describe("isPathInsideFolder", () => {
        it("identifies files directly within the folder", () => {
                expect(isPathInsideFolder("notes/today.md", "notes")).toBe(true);
        });

        it("identifies files in nested subfolders", () => {
                expect(isPathInsideFolder("notes/projects/task.md", "notes/projects")).toBe(true);
        });

        it("returns false for sibling folders", () => {
                expect(isPathInsideFolder("notes-archive/task.md", "notes")).toBe(false);
        });

        it("returns false when file is outside folder", () => {
                expect(isPathInsideFolder("root.md", "notes")).toBe(false);
        });
});

describe("isPathExcluded", () => {
        const excluded = ["archive", "logs"];

        it("excludes files inside matching folder", () => {
                expect(isPathExcluded("archive/2024/report.md", excluded)).toBe(true);
        });

        it("does not exclude files outside listed folders", () => {
                expect(isPathExcluded("notes/tasks.md", excluded)).toBe(false);
        });
});

describe("shouldIncludeFilePath", () => {
        it("returns false when file is outside the selected folder scope", () => {
                expect(
                        shouldIncludeFilePath("docs/notes/task.md", {
                                filenameFilter: "projects",
                                excludeFolders: [],
                        })
                ).toBe(false);
        });

        it("returns false when file is inside an excluded folder", () => {
                expect(
                        shouldIncludeFilePath("notes/archive/task.md", {
                                filenameFilter: null,
                                excludeFolders: ["notes/archive"],
                        })
                ).toBe(false);
        });

        it("includes files that satisfy scope and are not excluded", () => {
                expect(
                        shouldIncludeFilePath("notes/project/task.md", {
                                filenameFilter: "notes",
                                excludeFolders: ["notes/archive"],
                        })
                ).toBe(true);
        });
});
