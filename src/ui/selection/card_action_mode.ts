import type { ColumnTag, DefaultColumns } from "../columns/columns";
import type { TaskActions } from "../tasks/actions";

export type CardActionMode = "done" | "advance" | "select";
export type AdvanceDestination = ColumnTag | DefaultColumns | "archive";

/** Configured workflow order is independent of the board's visual direction. */
export function nextAdvanceDestination(
	from: ColumnTag | DefaultColumns,
	columns: readonly ColumnTag[],
): AdvanceDestination | null {
	if (from === "done") return "archive";
	const workflow: Array<ColumnTag | DefaultColumns> = ["uncategorised", ...columns, "done"];
	const index = workflow.indexOf(from);
	return index < 0 ? null : workflow[index + 1] ?? null;
}

export async function advanceCard(
	id: string,
	from: ColumnTag | DefaultColumns,
	columns: readonly ColumnTag[],
	actions: TaskActions,
): Promise<void> {
	const destination = nextAdvanceDestination(from, columns);
	if (!destination) return;
	if (destination === "archive") {
		await actions.archiveTasks([id]);
	} else {
		await actions.moveTasksToColumn([id], destination);
	}
}
