import { describe, expect, it } from "vitest";
import { migrateColumnDefinitions } from "../../columns/definitions";
import { moveColumnRelativeTo } from "../column_reorder";

describe("moveColumnBefore", () => {
	it("moves a column earlier in the list", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Doing", "Review"]);

		const reordered = moveColumnRelativeTo(columns, columns[2]!.id, columns[0]!.id, "before");

		expect(reordered.map((column) => column.label)).toEqual(["Review", "Backlog", "Doing"]);
	});

	it("moves a column later in the list", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Doing", "Review"]);

		const reordered = moveColumnRelativeTo(columns, columns[0]!.id, columns[2]!.id, "before");

		expect(reordered.map((column) => column.label)).toEqual(["Doing", "Backlog", "Review"]);
	});

	it("moves a column after the drop target when dropped on the lower half", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Doing", "Review"]);

		const reordered = moveColumnRelativeTo(columns, columns[0]!.id, columns[1]!.id, "after");

		expect(reordered.map((column) => column.label)).toEqual(["Doing", "Backlog", "Review"]);
	});

	it("returns the original array when the ids are invalid or identical", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Doing"]);

		expect(moveColumnRelativeTo(columns, columns[0]!.id, columns[0]!.id, "before")).toBe(columns);
		expect(moveColumnRelativeTo(columns, "missing", columns[0]!.id, "before")).toBe(columns);
		expect(moveColumnRelativeTo(columns, columns[0]!.id, "missing", "after")).toBe(columns);
	});
});
