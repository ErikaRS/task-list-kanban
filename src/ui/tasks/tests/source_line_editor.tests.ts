import { describe, expect, it, vi } from "vitest";
import {
	deleteRowBlocks,
	deleteRows,
	transformSourceRow,
	updateRow,
	replaceSourceRanges,
} from "../source_line_editor";

describe("source line editor", () => {
	it("validates all spans before replacing growing and shrinking blocks from one revision", async () => {
		const h = createEditableFile("one\ntwo\nthree");
		await replaceSourceRanges(h.vault as never, h.file as never, [
			{ start: 0, end: 3, expected: "one", replacement: "first\nextra" },
			{ start: 4, end: 7, expected: "two", replacement: "2" },
		]);
		expect(h.contents()).toBe("first\nextra\n2\nthree");
		expect(h.modify).toHaveBeenCalledOnce();
		await expect(replaceSourceRanges(h.vault as never, h.file as never, [
			{ start: 0, end: 3, expected: "one", replacement: "overwrite" },
		])).rejects.toThrow("Task changed");
		expect(h.contents()).toBe("first\nextra\n2\nthree");
	});

	it("preserves BOM, CRLF, trailing spaces and final newline and skips an unchanged save", async () => {
		const h = createEditableFile("\uFEFF- [ ] One  \r\n  note\r\n\r\nOutside\r\n");
		const expected = "- [ ] One  \r\n  note";
		const edit = { start: 1, end: 1 + expected.length, expected, replacement: expected };
		await replaceSourceRanges(h.vault as never, h.file as never, [edit]);
		expect(h.modify).not.toHaveBeenCalled();
		await replaceSourceRanges(h.vault as never, h.file as never, [{ ...edit, replacement: "- [ ] New  \n  note\n\n  paragraph" }]);
		expect(h.contents()).toBe("\uFEFF- [ ] New  \r\n  note\r\n\r\n  paragraph\r\n\r\nOutside\r\n");
	});

	it("revalidates against the atomic vault snapshot and propagates write failure", async () => {
		const h = createEditableFile("original");
		const edit = { start: 0, end: 8, expected: "original", replacement: "new" };
		const process = vi.fn(async (_file, transform: (content: string) => string) => transform("external"));
		await expect(replaceSourceRanges({ ...h.vault, process } as never, h.file as never, [edit])).rejects.toThrow("Task changed");
		expect(h.modify).not.toHaveBeenCalled();
		h.modify.mockRejectedValueOnce(new Error("Disk full"));
		await expect(replaceSourceRanges(h.vault as never, h.file as never, [edit])).rejects.toThrow("Disk full");
		expect(h.contents()).toBe("original");
	});
	it("transforms an existing source row", async () => {
		const { vault, file, contents } = createEditableFile("one\ntwo");

		const changed = await transformSourceRow(vault as never, file as never, 1, (row) => row.toUpperCase());

		expect(changed).toBe(true);
		expect(contents()).toBe("one\nTWO");
	});

	it("does not write when a transform leaves the row unchanged", async () => {
		const { vault, file, modify } = createEditableFile("one\ntwo");

		const changed = await transformSourceRow(vault as never, file as never, 1, (row) => row);

		expect(changed).toBe(false);
		expect(modify).not.toHaveBeenCalled();
	});

	it("appends when updateRow has no row index", async () => {
		const { vault, file, contents } = createEditableFile("one");

		await updateRow(vault as never, file as never, undefined, "two");

		expect(contents()).toBe("one\ntwo");
	});

	it("prepares outgoing contents before modifying the vault", async () => {
		const { vault, file, contents } = createEditableFile("---\nold: true\n---\none");

		await updateRow(
			vault as never,
			file as never,
			3,
			"two",
			(_file, nextContents) => nextContents.replace("old: true", "new: true"),
		);

		expect(contents()).toBe("---\nnew: true\n---\ntwo");
	});

	it("deletes rows from bottom to top", async () => {
		const { vault, file, contents } = createEditableFile("zero\none\ntwo\nthree");

		await deleteRows(vault as never, file as never, [1, 3]);

		expect(contents()).toBe("zero\ntwo");
	});

	it("deletes row blocks from bottom to top", async () => {
		const { vault, file, contents } = createEditableFile("zero\none\ntwo\nthree\nfour");

		await deleteRowBlocks(vault as never, file as never, [
			{ rowIndex: 1, lineCount: 2 },
			{ rowIndex: 4, lineCount: 1 },
		]);

		expect(contents()).toBe("zero\nthree");
	});
});

function createEditableFile(initialContents: string) {
	let fileContents = initialContents;
	const file = { path: "tasks.md" };
	const modify = vi.fn(async (_file: unknown, nextContents: string) => {
		fileContents = nextContents;
	});
	const vault = {
		read: vi.fn(async () => fileContents),
		modify,
	};

	return {
		vault,
		file,
		modify,
		contents: () => fileContents,
	};
}
