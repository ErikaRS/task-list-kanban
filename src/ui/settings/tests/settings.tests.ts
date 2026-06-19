import { describe, expect, it } from "vitest";
import { type ColumnTag } from "../../columns/columns";
import {
	columnRuleSignature,
	getColumnMatchSpecificity,
	migrateColumnDefinitions,
	resolveMatchedColumnDefinition,
	usesPriorityMatching,
	usesStatusMatching,
	usesTagMatching,
} from "../../columns/definitions";
import { PropertySchemaOption } from "../../../parsing/properties/property_schema";
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

	it("rejects a status-mode column with no marker", () => {
		const [column] = migrateColumnDefinitions([
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [] },
		]);

		expect(getColumnValidationError([column!])).toBe('Column "Doing" must define a status marker.');
	});

	it("rejects status-mode columns that target done markers", () => {
		const [column] = migrateColumnDefinitions([
			{ id: "done-ish" as ColumnTag, label: "Done-ish", matchMode: "status", matchTags: [], matchStatus: "x" },
		]);

		expect(getColumnValidationError([column!], { doneStatusMarkers: "xX" })).toBe(
			'Column "Done-ish" uses done status marker "x".',
		);
	});

	it("rejects status-mode columns that target ignored markers", () => {
		const [column] = migrateColumnDefinitions([
			{ id: "ignored" as ColumnTag, label: "Ignored", matchMode: "status", matchTags: [], matchStatus: "-" },
		]);

		expect(getColumnValidationError([column!], { ignoredStatusMarkers: "-" })).toBe(
			'Column "Ignored" uses ignored status marker "-".',
		);
	});

	it("rejects duplicate status-mode markers", () => {
		const columns = migrateColumnDefinitions([
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
			{ id: "active" as ColumnTag, label: "Active", matchMode: "status", matchTags: [], matchStatus: "/" },
		]);

		expect(getColumnValidationError(columns)).toBe('Columns "Doing" and "Active" match the same status marker.');
	});

	it("allows tag and status columns to use overlapping task criteria", () => {
		const columns = migrateColumnDefinitions([
			{ id: "tagged" as ColumnTag, label: "Tagged", matchMode: "tags", matchTags: ["status/active"] },
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
		]);

		expect(getColumnValidationError(columns)).toBeNull();
	});

	it("rejects priority-mode columns when task properties are disabled", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);

		expect(getColumnValidationError(columns, { propertySchema: PropertySchemaOption.None })).toBe(
			'Column "High" uses priority matching, but task properties are disabled.',
		);
	});

	it("rejects priority-mode columns with no priority", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [] },
		]);

		expect(getColumnValidationError(columns, { propertySchema: PropertySchemaOption.TasksPlugin })).toBe(
			'Column "High" must define a priority.',
		);
	});

	it("rejects duplicate priority-mode values", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
			{ id: "urgent" as ColumnTag, label: "Urgent", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);

		expect(getColumnValidationError(columns, { propertySchema: PropertySchemaOption.TasksPlugin })).toBe(
			'Columns "High" and "Urgent" match the same priority "High".',
		);
	});

	it("allows an unchanged existing priority column when task properties are disabled", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);
		const editedColumns = [{ ...columns[0]!, label: "Urgent" }];

		expect(getColumnValidationError(editedColumns, {
			propertySchema: PropertySchemaOption.None,
			originalColumns: columns,
		})).toBeNull();
	});

	it("rejects changing an existing priority value while task properties are disabled", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);
		const editedColumns = [{ ...columns[0]!, matchPriority: "low" }];

		expect(getColumnValidationError(editedColumns, {
			propertySchema: PropertySchemaOption.None,
			originalColumns: columns,
		})).toBe(
			'Column "High" uses priority matching, but task properties are disabled.',
		);
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

describe("usesStatusMatching", () => {
	it("returns true only for status-matched columns", () => {
		const [nameModeColumn] = migrateColumnDefinitions(["In Progress"]);
		const [statusColumn] = migrateColumnDefinitions([
			{
				id: "doing" as ColumnTag,
				label: "Doing",
				matchMode: "status",
				matchTags: [],
				matchStatus: "/",
			},
		]);

		expect(usesStatusMatching(nameModeColumn!)).toBe(false);
		expect(usesStatusMatching(statusColumn!)).toBe(true);
	});
});

describe("usesPriorityMatching", () => {
	it("returns true only for priority-matched columns", () => {
		const [nameModeColumn] = migrateColumnDefinitions(["In Progress"]);
		const [priorityColumn] = migrateColumnDefinitions([
			{
				id: "high" as ColumnTag,
				label: "High",
				matchMode: "priority",
				matchTags: [],
				matchPriority: "high",
			},
		]);

		expect(usesPriorityMatching(nameModeColumn!)).toBe(false);
		expect(usesPriorityMatching(priorityColumn!)).toBe(true);
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

	it("matches status columns from the status context", () => {
		const columns = migrateColumnDefinitions([
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
		]);

		const matched = resolveMatchedColumnDefinition(columns, { tags: new Set(), status: "/" });

		expect(matched?.id).toBe("doing");
	});

	it("matches priority columns from the priority context", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);

		const matched = resolveMatchedColumnDefinition(columns, {
			tags: new Set(),
			priority: "high",
			prioritySchema: PropertySchemaOption.TasksPlugin,
		});

		expect(matched?.id).toBe("high");
	});

	it("does not match a priority column from a different property schema", () => {
		const columns = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);

		const matched = resolveMatchedColumnDefinition(columns, {
			tags: new Set(),
			priority: "high",
			prioritySchema: PropertySchemaOption.Dataview,
		});

		expect(matched).toBeUndefined();
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

	it("treats status mode as specificity one", () => {
		const [column] = migrateColumnDefinitions([
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
		]);

		expect(getColumnMatchSpecificity(column!)).toBe(1);
	});

	it("treats priority mode as specificity one", () => {
		const [column] = migrateColumnDefinitions([
			{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);

		expect(getColumnMatchSpecificity(column!)).toBe(1);
	});
});
