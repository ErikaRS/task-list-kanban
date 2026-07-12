import { describe, expect, it } from "vitest";
import type { BoardMatrix, PrimaryBucketId } from "../../board/board_matrix";
import {
	clearTaskIdsFromSelection,
	getVisibleSelectedTaskIds,
} from "../board_command_targets";

describe("board command targets", () => {
	it("preserves board display order for visible selected task ids", () => {
		const matrix = matrixWithTasks({
			doing: ["a", "b"],
			done: ["c"],
		});
		const selection = new Map([
			["c", true],
			["hidden", true],
			["a", true],
			["b", false],
		]);

		expect(getVisibleSelectedTaskIds(matrix, selection, false)).toEqual(["a", "c"]);
	});

	it("returns no selected task ids while the dashboard is open", () => {
		const matrix = matrixWithTasks({ doing: ["a"] });

		expect(getVisibleSelectedTaskIds(matrix, new Map([["a", true]]), true)).toEqual([]);
	});

	it("clears only affected selected task ids", () => {
		const next = clearTaskIdsFromSelection(
			new Map([
				["a", true],
				["b", true],
			]),
			["a"],
		);

		expect([...next.entries()]).toEqual([["b", true]]);
	});
});

function matrixWithTasks(tasksByColumn: Record<string, string[]>): BoardMatrix {
	const primaryAxis = Object.keys(tasksByColumn).map((id) => ({
		id: id as PrimaryBucketId,
		label: id,
		kind: "column" as const,
		collapsed: false,
	}));
	const secondaryAxis = [
		{
			id: "default",
			label: "Default",
			kind: "group" as const,
			collapsed: false,
			meta: { isDefault: true },
		},
	];
	const cells = Object.fromEntries(
		Object.entries(tasksByColumn).map(([column, taskIds]) => [
			column,
			{
				default: {
					primaryId: column,
					secondaryId: "default",
					tasks: taskIds.map((id) => ({ id })),
					isEmpty: taskIds.length === 0,
				},
			},
		]),
	);

	return { primaryAxis, secondaryAxis, cells } as unknown as BoardMatrix;
}
