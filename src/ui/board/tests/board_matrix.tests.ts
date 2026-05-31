import { describe, it, expect } from "vitest";
import { deriveBoardMatrix } from "../board_matrix";
import type { Task } from "../../tasks/task";
import type { ColumnDefinition } from "../../columns/columns";
import { FlowDirection, VisibilityOption, type SettingValues, defaultSettings } from "../../settings/settings_store";

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
		expect(matrix.secondaryAxis[0]?.id).toBe("__default__");
		
		// Cells are materialized explicitly
		expect(matrix.cells["col-1"]).toBeDefined();
		expect(matrix.cells["col-1"]!["__default__"]).toBeDefined();
		expect(matrix.cells["col-1"]!["__default__"]!.isEmpty).toBe(true);
		expect(matrix.cells["col-1"]!["__default__"]!.tasks).toEqual([]);
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
		expect(matrix.cells["col-1"]!["__default__"]!.tasks).toHaveLength(2);
		expect(matrix.cells["col-1"]!["__default__"]!.tasks[0]?.path).toBe("fileA"); // Sorted first
		expect(matrix.cells["col-1"]!["__default__"]!.tasks[1]?.path).toBe("fileB");
		
		expect(matrix.cells["uncategorised"]!["__default__"]!.tasks).toHaveLength(1);
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
});
