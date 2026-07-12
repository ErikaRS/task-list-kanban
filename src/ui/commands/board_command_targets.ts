import type { ColumnTag, DefaultColumns } from "../columns/columns";
import type { BoardMatrix, PrimaryBucketId } from "../board/board_matrix";

export type AddCardColumn = ColumnTag | DefaultColumns;

export function resolveAddCardColumn(
	matrix: BoardMatrix,
	focusedColumn: PrimaryBucketId | null,
	lastInteractedColumn: PrimaryBucketId | null,
): AddCardColumn | null {
	const visibleColumns = matrix.primaryAxis.map((bucket) => bucket.id);
	const visibleSet = new Set<PrimaryBucketId>(visibleColumns);

	const doneIsOnlyVisibleColumn = visibleColumns.length === 1 && visibleColumns[0] === "done";

	for (const candidate of [focusedColumn, lastInteractedColumn]) {
		if (candidate && visibleSet.has(candidate) && (candidate !== "done" || doneIsOnlyVisibleColumn)) {
			return candidate as AddCardColumn;
		}
	}

	const firstNormal = visibleColumns.find(
		(column): column is ColumnTag =>
			column !== "uncategorised" && column !== "done",
	);
	if (firstNormal) {
		return firstNormal;
	}

	if (visibleSet.has("uncategorised")) {
		return "uncategorised";
	}

	if (doneIsOnlyVisibleColumn) {
		return "done" as AddCardColumn;
	}

	return null;
}

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
