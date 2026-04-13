import { describe, expect, it } from "vitest";
import { type ColumnTag } from "../../columns/columns";
import {
	columnRuleSignature,
	getColumnMatchSpecificity,
	migrateColumnDefinitions,
	resolveMatchedColumnDefinition,
	usesTagMatching,
} from "../../columns/definitions";
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

	it("rejects two tags-mode columns with identical match tags in different orders", () => {
		const [firstColumn] = migrateColumnDefinitions([
			{ id: "alpha" as ColumnTag, label: "Alpha", matchMode: "tags", matchTags: ["a", "b"] },
		]);
		const [secondColumn] = migrateColumnDefinitions([
			{ id: "beta" as ColumnTag, label: "Beta", matchMode: "tags", matchTags: ["b", "a"] },
		]);

		const error = getColumnValidationError([firstColumn!, secondColumn!]);

		expect(error).toBe('Columns "Alpha" and "Beta" match the same tag.');
	});

	it("allows subset relationships between tags-mode columns", () => {
		const [firstColumn] = migrateColumnDefinitions([
			{ id: "active" as ColumnTag, label: "Active", matchMode: "tags", matchTags: ["status/active"] },
		]);
		const [secondColumn] = migrateColumnDefinitions([
			{
				id: "active-high" as ColumnTag,
				label: "Active High",
				matchMode: "tags",
				matchTags: ["status/active", "high"],
			},
		]);

		const error = getColumnValidationError([firstColumn!, secondColumn!]);

		expect(error).toBeNull();
	});

	it("allows partial overlap between tags-mode columns", () => {
		const [firstColumn] = migrateColumnDefinitions([
			{ id: "ab" as ColumnTag, label: "A B", matchMode: "tags", matchTags: ["a", "b"] },
		]);
		const [secondColumn] = migrateColumnDefinitions([
			{ id: "ac" as ColumnTag, label: "A C", matchMode: "tags", matchTags: ["a", "c"] },
		]);

		const error = getColumnValidationError([firstColumn!, secondColumn!]);

		expect(error).toBeNull();
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

describe("resolveMatchedColumnDefinition", () => {
	it("prefers the most specific matching column", () => {
		const columns = migrateColumnDefinitions([
			{ id: "a" as ColumnTag, label: "A", matchMode: "tags", matchTags: ["a"] },
			{ id: "ab" as ColumnTag, label: "A B", matchMode: "tags", matchTags: ["a", "b"] },
			{ id: "abc" as ColumnTag, label: "A B C", matchMode: "tags", matchTags: ["a", "b", "c"] },
		]);

		const matched = resolveMatchedColumnDefinition(columns, new Set(["a", "b", "c"]));

		expect(matched?.id).toBe("abc");
	});

	it("uses column order to break ties between equally specific matches", () => {
		const columns = migrateColumnDefinitions([
			{ id: "ab" as ColumnTag, label: "A B", matchMode: "tags", matchTags: ["a", "b"] },
			{ id: "bc" as ColumnTag, label: "B C", matchMode: "tags", matchTags: ["b", "c"] },
		]);

		const matched = resolveMatchedColumnDefinition(columns, new Set(["a", "b", "c"]));

		expect(matched?.id).toBe("ab");
	});

	it("changes the winner when equally specific columns are reordered", () => {
		const columns = migrateColumnDefinitions([
			{ id: "ab" as ColumnTag, label: "A B", matchMode: "tags", matchTags: ["a", "b"] },
			{ id: "bc" as ColumnTag, label: "B C", matchMode: "tags", matchTags: ["b", "c"] },
		]);
		const reordered = [columns[1]!, columns[0]!];

		const matched = resolveMatchedColumnDefinition(reordered, new Set(["a", "b", "c"]));

		expect(matched?.id).toBe("bc");
	});
});

describe("getColumnMatchSpecificity", () => {
	it("treats name mode as specificity one", () => {
		const [column] = migrateColumnDefinitions(["In Progress"]);

		expect(getColumnMatchSpecificity(column!)).toBe(1);
	});

	it("uses match tag count for tags mode", () => {
		const [column] = migrateColumnDefinitions([
			{
				id: "active-work" as ColumnTag,
				label: "Active Work",
				matchMode: "tags",
				matchTags: ["project/alpha", "status/active"],
			},
		]);

		expect(getColumnMatchSpecificity(column!)).toBe(2);
	});
});
