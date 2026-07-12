import type { BoardMatrix } from "../board/board_matrix";

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
