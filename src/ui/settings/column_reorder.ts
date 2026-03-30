import type { ColumnDefinition } from "../columns/columns";

export type DropPosition = "before" | "after";

export function moveColumnRelativeTo(
	columns: ColumnDefinition[],
	draggedColumnId: string,
	targetColumnId: string,
	position: DropPosition,
): ColumnDefinition[] {
	if (draggedColumnId === targetColumnId) {
		return columns;
	}

	const draggedIndex = columns.findIndex((column) => column.id === draggedColumnId);
	const targetIndex = columns.findIndex((column) => column.id === targetColumnId);
	if (draggedIndex < 0 || targetIndex < 0) {
		return columns;
	}

	const nextColumns = [...columns];
	const [draggedColumn] = nextColumns.splice(draggedIndex, 1);
	if (!draggedColumn) {
		return columns;
	}

	const baseTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
	const adjustedTargetIndex = position === "after" ? baseTargetIndex + 1 : baseTargetIndex;
	nextColumns.splice(adjustedTargetIndex, 0, draggedColumn);
	return nextColumns;
}
