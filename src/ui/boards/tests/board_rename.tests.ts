import { describe, expect, it } from "vitest";
import { boardRenameTarget } from "../board_rename";

describe("boardRenameTarget", () => {
	it("keeps the board's folder and appends .md", () => {
		expect(
			boardRenameTarget({ path: "projects/Work.md", folder: "projects" }, "Jobs"),
		).toEqual({ ok: true, path: "projects/Jobs.md" });
	});

	it("handles root boards for both root folder spellings", () => {
		expect(boardRenameTarget({ path: "Home.md", folder: "" }, "House")).toEqual({
			ok: true,
			path: "House.md",
		});
		expect(boardRenameTarget({ path: "Home.md", folder: "/" }, "House")).toEqual({
			ok: true,
			path: "House.md",
		});
	});

	it("trims the new name", () => {
		expect(boardRenameTarget({ path: "Home.md", folder: "" }, "  House  ")).toEqual({
			ok: true,
			path: "House.md",
		});
	});

	it("rejects empty names and path separators", () => {
		expect(boardRenameTarget({ path: "Home.md", folder: "" }, "   ").ok).toBe(false);
		expect(boardRenameTarget({ path: "Home.md", folder: "" }, "a/b").ok).toBe(false);
		expect(boardRenameTarget({ path: "Home.md", folder: "" }, "a\\b").ok).toBe(false);
	});
});
