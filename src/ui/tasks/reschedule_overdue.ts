import { getWritablePropertyTarget, type EditableDatePropertyKey } from "../../parsing/properties";
import type { Task } from "./task";
import { isOverdueValue, type GroupSource } from "./task_grouping";

/**
 * The editable date key a board grouped by `source` can reschedule, or null
 * when the grouping is not an editable date (created, completion, tags, …).
 */
export function getReschedulableDateKey(source: GroupSource | undefined): EditableDatePropertyKey | null {
	if (source?.kind !== "property") {
		return null;
	}
	const target = getWritablePropertyTarget(source.key);
	return target?.kind === "date" ? target.key : null;
}

/**
 * Tasks whose grouped date is before today and can be moved to today (SPEC
 * 0046). `tasks` is the board's visible task list, so filtered-out tasks are
 * never touched. Done and cancelled tasks are left alone. Eligibility uses the
 * same overdue rule as the Overdue swimlane but does not depend on whether
 * past dates are combined into it.
 */
export function getReschedulableOverdueTasks(
	tasks: Task[],
	source: GroupSource | undefined,
	today: Date,
): Task[] {
	const key = getReschedulableDateKey(source);
	if (key === null) {
		return [];
	}
	return tasks.filter((task) => {
		if (task.done || task.isCancelled) {
			return false;
		}
		const value = task.properties.get(key)?.value ?? null;
		return value !== null && isOverdueValue(value, today);
	});
}
