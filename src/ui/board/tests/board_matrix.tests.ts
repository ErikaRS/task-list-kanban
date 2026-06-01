import { describe, it, expect } from "vitest";
import { deriveBoardMatrix } from "../board_matrix";
import type { Task } from "../../tasks/task";
import type { ColumnDefinition } from "../../columns/columns";
import { FlowDirection, VisibilityOption, type SettingValues, defaultSettings } from "../../settings/settings_store";
import { DEFAULT_GROUP_BUCKET_ID } from "../../tasks/task_grouping";

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
});
