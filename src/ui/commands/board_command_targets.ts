import type { BoardMatrix } from "../board/board_matrix";
import type { Task } from "../tasks/task";

export function getVisibleSelectedTaskIds(
	matrix: BoardMatrix,
	selectionMap: Map<string, boolean>,
	dashboardOpen: boolean,
): string[] {
	if (dashboardOpen) {
		return [];
	}

	const selected = new Set<string>();
	for (const [id, isSelected] of selectionMap) {
		if (isSelected) {
			selected.add(id);
		}
	}
	if (selected.size === 0) {
		return [];
	}

	const output: string[] = [];
	for (const primary of matrix.primaryAxis) {
		for (const secondary of matrix.secondaryAxis) {
			const cell = matrix.cells[primary.id]?.[secondary.id];
			if (!cell) continue;
			for (const task of cell.tasks) {
				if (selected.has(task.id)) {
					output.push(task.id);
				}
			}
		}
	}
	return output;
}

/**
 * Every task rendered on the board, in display order. Hidden columns are not
 * on the primary axis, so their tasks are excluded; collapsed columns and
 * swimlanes still count as visible. Empty while the dashboard covers the
 * board, matching the selected-card commands.
 */
export function getVisibleBoardTasks(matrix: BoardMatrix, dashboardOpen: boolean): Task[] {
	if (dashboardOpen) {
		return [];
	}

	const output: Task[] = [];
	for (const primary of matrix.primaryAxis) {
		for (const secondary of matrix.secondaryAxis) {
			const cell = matrix.cells[primary.id]?.[secondary.id];
			if (cell) {
				output.push(...cell.tasks);
			}
		}
	}
	return output;
}

export function clearTaskIdsFromSelection(
	selectionMap: Map<string, boolean>,
	taskIds: string[],
): Map<string, boolean> {
	const next = new Map(selectionMap);
	for (const id of taskIds) {
		next.delete(id);
	}
	return next;
}
