import { describe, expect, it, vi } from "vitest";
import {
	deleteRows,
	transformSourceRow,
	updateRow,
} from "../source_line_editor";

describe("source line editor", () => {
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

	it("deletes rows from bottom to top", async () => {
		const { vault, file, contents } = createEditableFile("zero\none\ntwo\nthree");

		await deleteRows(vault as never, file as never, [1, 3]);

		expect(contents()).toBe("zero\ntwo");
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
