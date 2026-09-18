import { describe, expect, it } from "vitest";
import {
	deriveDesktopMatrixProjection,
	getCanonicalCellAxisIds,
} from "../desktop_matrix_projection";
import type { BoardMatrix } from "../board_matrix";

const matrix = {
	primaryAxis: [{ id: "todo", label: "Todo", kind: "column", collapsed: false }],
	secondaryAxis: [{ id: "file:tasks.md", label: "tasks.md", kind: "group", collapsed: false }],
	cells: {},
} as unknown as BoardMatrix;

describe("desktop matrix projection", () => {
	it("uses semantic columns as visual columns in column-dominant flow", () => {
		const projection = deriveDesktopMatrixProjection(matrix, false);
		expect(projection.visualColumns).toBe(matrix.primaryAxis);
		expect(projection.visualRows).toBe(matrix.secondaryAxis);
		expect(getCanonicalCellAxisIds(projection.visualColumns[0]!, projection.visualRows[0]!, false))
			.toEqual({ primaryId: "todo", secondaryId: "file:tasks.md" });
	});

	it("swaps only visual axes in group-dominant flow", () => {
		const projection = deriveDesktopMatrixProjection(matrix, true);
		expect(projection.visualColumns).toBe(matrix.secondaryAxis);
		expect(projection.visualRows).toBe(matrix.primaryAxis);
		expect(getCanonicalCellAxisIds(projection.visualColumns[0]!, projection.visualRows[0]!, true))
			.toEqual({ primaryId: "todo", secondaryId: "file:tasks.md" });
	});
});

it.each([false, true])("resolves canonical cells and collapsed roles (transposed=%s)", (transposed) => {
	const cell = { primaryId: "todo", secondaryId: "file:tasks.md", tasks: [], isEmpty: true };
	const collapsed = {
		...matrix,
		primaryAxis: [{ ...matrix.primaryAxis[0]!, collapsed: true }],
		cells: { todo: { "file:tasks.md": cell } },
	} as BoardMatrix;
	const projection = deriveDesktopMatrixProjection(collapsed, transposed);
	const resolved = projection.getCell(projection.visualColumns[0]!, projection.visualRows[0]!);
	expect(resolved.cell).toBe(cell);
	expect(resolved.primaryBucket).toBe(collapsed.primaryAxis[0]);
	expect(resolved.secondaryBucket).toBe(collapsed.secondaryAxis[0]);
	expect(projection.visualColumns[0]!.collapsed).toBe(!transposed);
	expect(projection.visualRows[0]!.collapsed).toBe(transposed);
});

it.each([false, true])("hides only the ungrouped default header (transposed=%s)", (transposed) => {
	for (const kind of ["none", "tag-prefix", "file", "property"] as const) {
		const grouped = {
			...matrix,
			secondaryAxis: [{ id: "__default__", label: "Unassigned", kind: "group", collapsed: false,
				meta: { isDefault: true, source: kind === "tag-prefix" ? { kind, prefix: "project/" } : kind === "property" ? { kind, key: "due" } : { kind } } }],
		} as BoardMatrix;
		const projection = deriveDesktopMatrixProjection(grouped, transposed);
		expect(transposed ? projection.showColumnHeaders : projection.showRowHeaders).toBe(kind !== "none");
		expect(transposed ? projection.showRowHeaders : projection.showColumnHeaders).toBe(true);
	}
});

it.each([false, true])("preserves axis order and maps every empty intersection (transposed=%s)", (transposed) => {
	const multiple = {
		primaryAxis: ["done", "todo", "uncategorised"].map(id => ({ id, label: id, kind: "column", collapsed: id === "todo" })),
		secondaryAxis: ["b", "a"].map(id => ({ id, label: id, kind: "group", collapsed: false })),
		cells: {},
	} as unknown as BoardMatrix;
	const projection = deriveDesktopMatrixProjection(multiple, transposed);
	expect(projection.visualColumns).toBe(transposed ? multiple.secondaryAxis : multiple.primaryAxis);
	expect(projection.visualRows).toBe(transposed ? multiple.primaryAxis : multiple.secondaryAxis);
	for (const column of projection.visualColumns) for (const row of projection.visualRows) {
		const { cell, primaryBucket, secondaryBucket } = projection.getCell(column, row);
		expect(cell.primaryId).toBe(primaryBucket.id);
		expect(cell.secondaryId).toBe(secondaryBucket.id);
		expect(cell.isEmpty).toBe(true);
	}
});
