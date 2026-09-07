import { getBoardCell, type BoardMatrix, type PrimaryBucketId, type SecondaryBucketId } from "./board_matrix";
import type { Task } from "../tasks/task";

export type MobileHierarchyMode = "column-dominant" | "group-dominant";

export function shouldUseMobileBoardLayout(isMobile: boolean): boolean {
	return isMobile;
}

/** A default bucket represents an ungrouped board, not a visible group. */
export function hasVisibleMobileGroupHeaders(matrix: BoardMatrix): boolean {
	return matrix.secondaryAxis.length > 1 ||
		(matrix.secondaryAxis.length > 0 && !matrix.secondaryAxis[0]?.meta?.isDefault);
}

export function deriveMobileHierarchyMode(
	matrix: BoardMatrix,
	isVerticalFlow: boolean,
): MobileHierarchyMode {
	return isVerticalFlow && hasVisibleMobileGroupHeaders(matrix)
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

export function getMobileCellTaskCount(
	matrix: BoardMatrix,
	primaryId: PrimaryBucketId,
	secondaryId: SecondaryBucketId,
): number {
	return getBoardCell(matrix, primaryId, secondaryId).tasks.length;
}

export function formatMobileTaskCount(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}
