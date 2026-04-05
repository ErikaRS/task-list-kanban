import { describe, expect, it } from "vitest";
import { type ColumnTag } from "../../columns/columns";
import { columnRuleSignature, migrateColumnDefinitions, usesTagMatching } from "../../columns/definitions";
import { getColumnValidationError } from "../column_validation";

describe("getColumnValidationError", () => {
	it("rejects a name-mode column that collides with a camel-cased explicit tag", () => {
		const [nameModeColumn] = migrateColumnDefinitions(["In Progress"]);
		const [explicitTagColumn] = migrateColumnDefinitions(["Current Work"]);

		const error = getColumnValidationError([
			nameModeColumn!,
			{
				...explicitTagColumn!,
				matchMode: "tags",
				matchTags: ["InProgress"],
			},
		]);

		expect(error).toBe('Columns "In Progress" and "Current Work" match the same tag.');
	});
});

describe("columnRuleSignature", () => {
	it("does not mutate explicit tag order", () => {
		const [column] = migrateColumnDefinitions([
			{
				id: "doing" as ColumnTag,
				label: "Doing",
				matchMode: "tags",
				matchTags: ["status/now", "project/alpha"],
			},
		]);

		expect(column?.matchTags).toEqual(["status/now", "project/alpha"]);
		expect(columnRuleSignature(column!)).toBe("tags:project/alpha,status/now");
		expect(column?.matchTags).toEqual(["status/now", "project/alpha"]);
	});
});

describe("usesTagMatching", () => {
	it("returns true only for tag-matched columns", () => {
		const [nameModeColumn] = migrateColumnDefinitions(["In Progress"]);
		const [explicitTagColumn] = migrateColumnDefinitions([
			{
				id: "doing" as ColumnTag,
				label: "Doing",
				matchMode: "tags",
				matchTags: ["status/now"],
			},
		]);

		expect(usesTagMatching(nameModeColumn!)).toBe(false);
		expect(usesTagMatching(explicitTagColumn!)).toBe(true);
	});
});
