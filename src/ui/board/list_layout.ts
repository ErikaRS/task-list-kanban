import { getBoardCell, type BoardMatrix, type PrimaryBucketId, type SecondaryBucketId } from "./board_matrix";
import type { Task } from "../tasks/task";
import type { BoardLayout } from "../settings/settings_store";

export type ListHierarchyMode = "column-dominant" | "group-dominant";

export function shouldUseMobileBoardLayout(isMobile: boolean): boolean {
	return isMobile;
}

/**
 * Whether the matrix renders as the stacked list (SPEC 0055). Mobile always
 * lists and ignores the stored layout; desktop lists only when asked to.
 */
export function shouldUseListRenderer(isMobile: boolean, layout: BoardLayout | undefined): boolean {
	return isMobile || layout === "list";
}

/**
 * Key for a single folded cell in List (SPEC 0055). Group first, then
 * column; JSON so ids containing any separator cannot collide.
 */
export function listCellKey(secondaryId: SecondaryBucketId, primaryId: PrimaryBucketId): string {
	return JSON.stringify([secondaryId, primaryId]);
}

/**
 * Which folds apply to a List cell. The outer header folds for the whole
 * board (shared with Table); the inner header folds only this cell. The
 * inner axis's whole-board fold is ignored in List.
 */
export function resolveListCellFold(
	mode: ListHierarchyMode,
	folds: { columnCollapsed: boolean; groupCollapsed: boolean; cellCollapsed: boolean },
): { outerCollapsed: boolean; cellCollapsed: boolean } {
	return {
		outerCollapsed: mode === "column-dominant" ? folds.columnCollapsed : folds.groupCollapsed,
		cellCollapsed: folds.cellCollapsed,
	};
}

/** A default bucket represents an ungrouped board, not a visible group. */
export function hasVisibleListGroupHeaders(matrix: BoardMatrix): boolean {
	if (matrix.secondaryAxis.some(bucket => bucket.meta?.source?.kind !== undefined && bucket.meta.source.kind !== "none")) {
		return true;
	}
	return matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0]?.meta?.isDefault);
}

export function deriveListHierarchyMode(
	matrix: BoardMatrix,
	isVerticalFlow: boolean,
): ListHierarchyMode {
	return isVerticalFlow && hasVisibleListGroupHeaders(matrix)
		? "group-dominant"
		: "column-dominant";
}

export function getPrimaryBucketTasks(
	matrix: BoardMatrix,
	primaryId: PrimaryBucketId,
): Task[] {
	return Object.values(matrix.cells[primaryId] ?? {}).flatMap((cell) => cell.tasks);
}

export function getSecondaryBucketTasks(
	matrix: BoardMatrix,
	secondaryId: SecondaryBucketId,
): Task[] {
	return matrix.primaryAxis.flatMap((primary) =>
		getBoardCell(matrix, primary.id, secondaryId).tasks,
	);
}

export function getListCellTaskCount(
	matrix: BoardMatrix,
	primaryId: PrimaryBucketId,
	secondaryId: SecondaryBucketId,
): number {
	return getBoardCell(matrix, primaryId, secondaryId).tasks.length;
}

export function formatListTaskCount(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}
