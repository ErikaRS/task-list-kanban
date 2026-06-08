import { describe, it, expect } from "vitest";
import { deriveBoardMatrix } from "../board_matrix";
import type { Task } from "../../tasks/task";
import type { ColumnDefinition } from "../../columns/columns";
import { FlowDirection, VisibilityOption, type SettingValues, defaultSettings } from "../../settings/settings_store";
import { DEFAULT_GROUP_BUCKET_ID } from "../../tasks/task_grouping";
import { ColumnOrderMode } from "../../../parsing/properties/comparators";

function taskWithProperty(
	overrides: Partial<Task> & { path: string; rowIndex: number },
	property?: { key: string; value: string | number | Date },
): Task {
	const properties = new Map();
	if (property) {
		properties.set(property.key, { key: property.key, rawValue: String(property.value), value: property.value });
	}
	return { column: "col-1", done: false, properties, ...overrides } as unknown as Task;
}

describe("deriveBoardMatrix", () => {
	it("derives empty matrix correctly", () => {
		const settings: SettingValues = {
			...defaultSettings,
			uncategorizedVisibility: VisibilityOption.Auto,
			doneVisibility: VisibilityOption.Auto,
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const matrix = deriveBoardMatrix([], columns, settings);

		// Auto visibility hides empty done and uncategorised
		expect(matrix.primaryAxis.length).toBe(1);
		expect(matrix.primaryAxis[0]?.id).toBe("col-1");

		expect(matrix.secondaryAxis.length).toBe(1);
			expect(matrix.secondaryAxis[0]?.id).toBe(DEFAULT_GROUP_BUCKET_ID);
			expect(matrix.secondaryAxis[0]?.meta?.isDefault).toBe(true);

			// Cells are materialized explicitly
			expect(matrix.cells["col-1"]).toBeDefined();
			expect(matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]).toBeDefined();
			expect(matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.isEmpty).toBe(true);
			expect(matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks).toEqual([]);
	});

	it("partitions tasks and sorts them", () => {
		const settings: SettingValues = { ...defaultSettings };
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			{ column: "col-1", path: "fileB", rowIndex: 1, done: false } as unknown as Task,
			{ column: "col-1", path: "fileA", rowIndex: 2, done: false } as unknown as Task,
			{ column: "uncategorised", path: "fileA", rowIndex: 1, done: false } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);

		// Uncategorized is shown since we have tasks and setting might be Auto/Always
			expect(matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks).toHaveLength(2);
			expect(matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks[0]?.path).toBe("fileA"); // Sorted first
			expect(matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks[1]?.path).toBe("fileB");

			expect(matrix.cells["uncategorised"]![DEFAULT_GROUP_BUCKET_ID]!.tasks).toHaveLength(1);
	});

	it("sorts a column by property when columnOrderMode is Property", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Property,
			sortProperty: "due",
			sortDirection: "asc",
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		// File order would be a, b, c (rowIndex). Due dates reorder to b, a, c.
		const tasks = [
			taskWithProperty({ path: "f", rowIndex: 1 }, { key: "due", value: new Date("2024-03-01") }),
			taskWithProperty({ path: "f", rowIndex: 2 }, { key: "due", value: new Date("2024-01-01") }),
			taskWithProperty({ path: "f", rowIndex: 3 }), // missing due → last
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);
		const sorted = matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks;

		expect(sorted.map((t) => t.rowIndex)).toEqual([2, 1, 3]);
	});

	it("respects descending property sort", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Property,
			sortProperty: "due",
			sortDirection: "desc",
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			taskWithProperty({ path: "f", rowIndex: 1 }, { key: "due", value: new Date("2024-01-01") }),
			taskWithProperty({ path: "f", rowIndex: 2 }, { key: "due", value: new Date("2024-03-01") }),
			taskWithProperty({ path: "f", rowIndex: 3 }), // missing still last
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);
		const sorted = matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks;

		expect(sorted.map((t) => t.rowIndex)).toEqual([2, 1, 3]);
	});

	it("falls back to file order when property sort has no sortProperty", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Property,
			sortProperty: null,
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			taskWithProperty({ path: "f", rowIndex: 2 }, { key: "due", value: new Date("2024-01-01") }),
			taskWithProperty({ path: "f", rowIndex: 1 }, { key: "due", value: new Date("2024-03-01") }),
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);
		const sorted = matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks;

		expect(sorted.map((t) => t.rowIndex)).toEqual([1, 2]);
	});

	it.each([
		["asc" as const, ["one", "ten", "eleven", "two"]],
		["desc" as const, ["two", "eleven", "ten", "one"]],
	])("sorts a column by task name lexicographically %s", (sortDirection, expectedIds) => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.TaskName,
			sortDirection,
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			{ id: "ten", column: "col-1", path: "f", rowIndex: 1, done: false, content: "Task 10", properties: new Map() } as unknown as Task,
			{ id: "two", column: "col-1", path: "f", rowIndex: 2, done: false, content: "Task 2", properties: new Map() } as unknown as Task,
			{ id: "one", column: "col-1", path: "f", rowIndex: 3, done: false, content: "Task 1", properties: new Map() } as unknown as Task,
			{ id: "eleven", column: "col-1", path: "f", rowIndex: 4, done: false, content: "Task 11", properties: new Map() } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);
		const sorted = matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks;

		expect(sorted.map((t) => t.id)).toEqual(expectedIds);
	});

	it("applies manual order with a pinned prefix and file-order tail", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Manual,
			manualOrder: {
				[DEFAULT_GROUP_BUCKET_ID]: {
					"col-1": ["f::lc", "f::la"],
				},
			},
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		// File order is a, b, c, d. Pin c then a; b and d follow in file order.
		const tasks = [
			{ id: "a", column: "col-1", path: "f", rowIndex: 1, done: false, blockLink: "la", properties: new Map() } as unknown as Task,
			{ id: "b", column: "col-1", path: "f", rowIndex: 2, done: false, blockLink: undefined, properties: new Map() } as unknown as Task,
			{ id: "c", column: "col-1", path: "f", rowIndex: 3, done: false, blockLink: "lc", properties: new Map() } as unknown as Task,
			{ id: "d", column: "col-1", path: "f", rowIndex: 4, done: false, blockLink: undefined, properties: new Map() } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);
		const ordered = matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks;

		expect(ordered.map((t) => t.rowIndex)).toEqual([3, 1, 2, 4]);
	});

	it("renders file order in manual mode when nothing is pinned", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Manual,
			manualOrder: {},
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			{ id: "x", column: "col-1", path: "f", rowIndex: 2, done: false, properties: new Map() } as unknown as Task,
			{ id: "y", column: "col-1", path: "f", rowIndex: 1, done: false, properties: new Map() } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);
		const ordered = matrix.cells["col-1"]![DEFAULT_GROUP_BUCKET_ID]!.tasks;

		expect(ordered.map((t) => t.rowIndex)).toEqual([1, 2]);
	});

	it("applies manual order independently inside grouped cells", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Manual,
			groupSource: { kind: "file" },
			manualOrder: {
				"file:a.md": {
					"col-1": ["a.md::a2"],
				},
				"file:b.md": {
					"col-1": ["b.md::b2"],
				},
			},
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			{ id: "a1", column: "col-1", path: "a.md", rowIndex: 1, done: false, blockLink: "a1", properties: new Map() } as unknown as Task,
			{ id: "a2", column: "col-1", path: "a.md", rowIndex: 2, done: false, blockLink: "a2", properties: new Map() } as unknown as Task,
			{ id: "b1", column: "col-1", path: "b.md", rowIndex: 1, done: false, blockLink: "b1", properties: new Map() } as unknown as Task,
			{ id: "b2", column: "col-1", path: "b.md", rowIndex: 2, done: false, blockLink: "b2", properties: new Map() } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);

		expect(matrix.cells["col-1"]!["file:a.md"]!.tasks.map((t) => t.id)).toEqual(["a2", "a1"]);
		expect(matrix.cells["col-1"]!["file:b.md"]!.tasks.map((t) => t.id)).toEqual(["b2", "b1"]);
	});

	it("respects RTL flow direction", () => {
		const settings: SettingValues = {
			...defaultSettings,
			flowDirection: FlowDirection.RightToLeft,
			uncategorizedVisibility: VisibilityOption.AlwaysShow,
			doneVisibility: VisibilityOption.AlwaysShow,
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const matrix = deriveBoardMatrix([], columns, settings);

		// Order should be Done, Col 1, Uncategorised
		expect(matrix.primaryAxis.map(a => a.id)).toEqual(["done", "col-1", "uncategorised"]);
	});

	it("derives secondary axis from files when grouped by file", () => {
		const settings: SettingValues = {
			...defaultSettings,
			groupSource: { kind: "file" }
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			{ column: "col-1", path: "fileB", rowIndex: 1, done: false } as unknown as Task,
			{ column: "col-1", path: "fileA", rowIndex: 2, done: false } as unknown as Task,
			{ column: "uncategorised", path: "fileA", rowIndex: 1, done: false } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);

		expect(matrix.secondaryAxis.length).toBe(2);
		expect(matrix.secondaryAxis[0]?.id).toBe("file:fileA");
		expect(matrix.secondaryAxis[0]?.meta?.isDefault).toBe(false);
		expect(matrix.secondaryAxis[1]?.id).toBe("file:fileB");

		expect(matrix.cells["col-1"]!["file:fileA"]!.tasks).toHaveLength(1);
		expect(matrix.cells["col-1"]!["file:fileA"]!.tasks[0]?.path).toBe("fileA");
		expect(matrix.cells["uncategorised"]!["file:fileA"]!.tasks).toHaveLength(1);

		expect(matrix.cells["col-1"]!["file:fileB"]!.tasks).toHaveLength(1);
		expect(matrix.cells["col-1"]!["file:fileB"]!.tasks[0]?.path).toBe("fileB");

		expect(matrix.cells["uncategorised"]!["file:fileB"]!).toBeDefined();
		expect(matrix.cells["uncategorised"]!["file:fileB"]!.tasks).toHaveLength(0);
	});

	it("namespaces file groups away from the default bucket id", () => {
		const settings: SettingValues = {
			...defaultSettings,
			groupSource: { kind: "file" }
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];
		const tasks = [
			{ column: "col-1", path: DEFAULT_GROUP_BUCKET_ID, rowIndex: 1, done: false } as unknown as Task,
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);

		expect(matrix.secondaryAxis[0]?.id).toBe(`file:${DEFAULT_GROUP_BUCKET_ID}`);
		expect(matrix.secondaryAxis[0]?.meta?.isDefault).toBe(false);
		expect(matrix.cells["col-1"]![`file:${DEFAULT_GROUP_BUCKET_ID}`]!.tasks).toHaveLength(1);
	});

	it("derives secondary axis from parsed properties with missing values last", () => {
		const settings: SettingValues = {
			...defaultSettings,
			groupSource: { kind: "property", key: "due" },
		};
		const columns: ColumnDefinition[] = [
			{ id: "col-1" as any, label: "Col 1", matchMode: "name", matchTags: [] }
		];

		const tasks = [
			taskWithProperty({ id: "late", path: "f", rowIndex: 1 }, { key: "due", value: new Date("2026-03-01") }),
			taskWithProperty({ id: "missing", path: "f", rowIndex: 2 }),
			taskWithProperty({ id: "early", path: "f", rowIndex: 3 }, { key: "due", value: new Date("2026-01-01") }),
		];

		const matrix = deriveBoardMatrix(tasks, columns, settings);

		expect(matrix.secondaryAxis.map((bucket) => bucket.label)).toEqual([
			"2026-01-01",
			"2026-03-01",
			"No value",
		]);
		expect(matrix.cells["col-1"]!["property:due:date:1767225600000"]!.tasks.map((task) => task.id)).toEqual(["early"]);
		expect(matrix.cells["col-1"]!["property:due:__missing__"]!.tasks.map((task) => task.id)).toEqual(["missing"]);
	});
});
