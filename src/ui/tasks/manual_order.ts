import type { Task } from "./task";

/**
 * Stable key for a task that persists across board reloads.
 * Prefers blockLink when available (survives content edits).
 * Falls back to content (loses position if the task content is edited).
 * Format: `path::blockLink` or `path::content`
 */
export function stableTaskKey(task: Task): string {
	if (task.blockLink) {
		return `${task.path}::${task.blockLink}`; // Survives content edits
	}
	return `${task.path}::${task.content}`; // Breaks if task content is edited
}

/**
 * Ordered list of stable task keys. Key: columnId, Value: array of stableTaskKey() values.
 * Tasks present in the array appear first in key order; tasks absent fall back to file order.
 */
export type ManualOrderStore = Record<string, string[]>;

/**
 * Compute new manual order after inserting a task at a specific drop index.
 * Used when a task is dragged and dropped within a column.
 * If the task is not yet in currentOrder, it is added at dropIndex.
 * If the task is already in currentOrder, it is moved to dropIndex.
 *
 * @param currentOrder - The current manual order array (keys)
 * @param draggedTaskKey - The task being moved or added
 * @param dropIndex - The index to insert at (0 = top, 1 = after first task, etc.)
 * @returns New order array with the task moved/added at dropIndex
 */
export function reorderAfterDrop(
	currentOrder: string[],
	draggedTaskKey: string,
	dropIndex: number
): string[] {
	// Find the original position of the dragged task
	const draggedIndex = currentOrder.indexOf(draggedTaskKey);

	// Remove the dragged task from its current position (if it exists)
	const filtered = draggedIndex >= 0
		? currentOrder.filter((k) => k !== draggedTaskKey)
		: currentOrder;

	// Adjust drop index: if dragged task was in the array and was before the drop position,
	// the insertion point shifts down by one after filtering
	const actualDropIndex = draggedIndex >= 0 && draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;

	// Insert at the adjusted drop index
	const newOrder = [...filtered];
	newOrder.splice(actualDropIndex, 0, draggedTaskKey);

	return newOrder;
}

/**
 * Apply manual ordering to a task list.
 * Tasks present in `orderedKeys` appear first, sorted by their position in the array.
 * Tasks absent from `orderedKeys` are appended after in file order (path, then rowIndex).
 * Stale keys in `orderedKeys` (no matching task) are silently ignored.
 */
export function applyManualOrder(tasks: Task[], orderedKeys: string[]): Task[] {
	if (orderedKeys.length === 0) {
		// No manual order: return all tasks in file order
		return [...tasks].sort((a, b) => {
			if (a.path !== b.path) {
				return a.path.localeCompare(b.path);
			}
			return a.rowIndex - b.rowIndex;
		});
	}

	const keyIndex = new Map(orderedKeys.map((k, i) => [k, i]));
	const listed: Task[] = [];
	const unlisted: Task[] = [];

	for (const task of tasks) {
		const key = stableTaskKey(task);
		if (keyIndex.has(key)) {
			listed.push(task);
		} else {
			unlisted.push(task);
		}
	}

	// Sort listed tasks by their position in orderedKeys
	listed.sort((a, b) => keyIndex.get(stableTaskKey(a))! - keyIndex.get(stableTaskKey(b))!);

	// Sort unlisted tasks by file order (path, then rowIndex)
	unlisted.sort((a, b) => {
		if (a.path !== b.path) {
			return a.path.localeCompare(b.path);
		}
		return a.rowIndex - b.rowIndex;
	});

	return [...listed, ...unlisted];
}

/**
 * Move a task up one position in the manual order.
 * If the task is at the top or not in the order, returns the unchanged order.
 *
 * @param currentOrder - The current manual order array (keys)
 * @param taskKey - The task key to move up
 * @returns New order array with the task moved up one position (or unchanged if at top)
 */
export function moveTaskUp(currentOrder: string[], taskKey: string): string[] {
	const index = currentOrder.indexOf(taskKey);
	if (index <= 0) {
		// Task not in order or already at top
		return currentOrder;
	}

	const newOrder = [...currentOrder];
	// Swap with previous task
	const temp = newOrder[index]!;
	newOrder[index] = newOrder[index - 1]!;
	newOrder[index - 1] = temp;
	return newOrder;
}

/**
 * Move a task down one position in the manual order.
 * If the task is at the bottom or not in the order, returns the unchanged order.
 *
 * @param currentOrder - The current manual order array (keys)
 * @param taskKey - The task key to move down
 * @returns New order array with the task moved down one position (or unchanged if at bottom)
 */
export function moveTaskDown(currentOrder: string[], taskKey: string): string[] {
	const index = currentOrder.indexOf(taskKey);
	if (index < 0 || index >= currentOrder.length - 1) {
		// Task not in order or already at bottom
		return currentOrder;
	}

	const newOrder = [...currentOrder];
	// Swap with next task
	const temp = newOrder[index]!;
	newOrder[index] = newOrder[index + 1]!;
	newOrder[index + 1] = temp;
	return newOrder;
}

/**
 * Compute the initial manual order for a column when switching from File to Manual mode.
 * Returns an order initialised with file-order stable keys, or the existing order unchanged
 * if it is already populated.
 *
 * @param tasks - All tasks currently in the column
 * @param existingOrder - Current order (may be empty on first enable)
 * @returns New order array (stable keys sorted by file order) or existingOrder if already set
 */
export function initializeColumnOrder(tasks: Task[], existingOrder: string[]): string[] {
	if (existingOrder.length > 0) {
		return existingOrder; // Already initialized — do not overwrite
	}

	const sorted = [...tasks].sort((a, b) => {
		if (a.path !== b.path) return a.path.localeCompare(b.path);
		return a.rowIndex - b.rowIndex;
	});

	return sorted.map(stableTaskKey);
}
