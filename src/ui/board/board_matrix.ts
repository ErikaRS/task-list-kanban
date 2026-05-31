import type { Task } from "../tasks/task";
import type { ColumnTag, DefaultColumns, ColumnDefinition } from "../columns/columns";
import { VisibilityOption, FlowDirection, type SettingValues } from "../settings/settings_store";

export type PrimaryBucketId = ColumnTag | DefaultColumns;
export type SecondaryBucketId = string;

export interface AxisBucket {
	id: string; // PrimaryBucketId or SecondaryBucketId
	label: string;
	kind: "column" | "group";
	collapsed: boolean;
	meta?: any;
}

export interface BoardCell {
	primaryId: PrimaryBucketId;
	secondaryId: SecondaryBucketId;
	tasks: Task[];
	isEmpty: boolean;
}

export interface BoardMatrix {
	primaryAxis: AxisBucket[];
	secondaryAxis: AxisBucket[];
	cells: Record<string, Record<string, BoardCell>>;
}

export function deriveBoardMatrix(
	tasks: Task[],
	columns: ColumnDefinition[],
	settings: SettingValues
): BoardMatrix {
	const tasksByPrimary: Record<string, Task[]> = {
		uncategorised: [],
		done: [],
	};

	for (const column of columns) {
		tasksByPrimary[column.id] = [];
	}

	for (const task of tasks) {
		if (task.done || task.column === "done") {
			tasksByPrimary["done"]!.push(task);
		} else if (task.column === "archived") {
			// ignored
		} else if (task.column) {
			if (!tasksByPrimary[task.column]) {
				tasksByPrimary[task.column] = [];
			}
			tasksByPrimary[task.column]!.push(task);
		} else {
			tasksByPrimary["uncategorised"]!.push(task);
		}
	}

	// Apply file-order sorting inside each primary bucket
	for (const bucketTasks of Object.values(tasksByPrimary)) {
		sortTasksByFile(bucketTasks);
	}

	const collapsedColumns = new Set(settings.collapsedColumns ?? []);
	
	const uncategorizedVisibility = settings.uncategorizedVisibility ?? VisibilityOption.Auto;
	const showUncategorizedColumn =
		uncategorizedVisibility === VisibilityOption.AlwaysShow ||
		(uncategorizedVisibility === VisibilityOption.Auto && tasksByPrimary["uncategorised"]!.length > 0);

	const doneVisibility = settings.doneVisibility ?? VisibilityOption.AlwaysShow;
	const showDoneColumn =
		doneVisibility === VisibilityOption.AlwaysShow ||
		(doneVisibility === VisibilityOption.Auto && tasksByPrimary["done"]!.length > 0);

	const allColumns: string[] = [];
	if (showUncategorizedColumn) allColumns.push("uncategorised");
	for (const column of columns) {
		allColumns.push(column.id);
	}
	if (showDoneColumn) allColumns.push("done");

	const flowDirection = settings.flowDirection ?? FlowDirection.LeftToRight;
	const shouldReverse =
		flowDirection === FlowDirection.RightToLeft ||
		flowDirection === FlowDirection.BottomToTop;

	if (shouldReverse) {
		allColumns.reverse();
	}

	const primaryAxis: AxisBucket[] = allColumns.map((id) => {
		let label = id;
		let color: string | undefined = undefined;
		if (id === "uncategorised") {
			label = settings.uncategorizedColumnName || "Uncategorized";
		} else if (id === "done") {
			label = settings.doneColumnName || "Done";
		} else {
			const colDef = columns.find(c => c.id === id);
			if (colDef) {
				label = colDef.label;
				color = colDef.color;
			}
		}

		return {
			id,
			label,
			kind: "column",
			collapsed: collapsedColumns.has(id),
			meta: { color },
		};
	});

	// Phase 1 only supports ungrouped mode, meaning a single default secondary bucket
	const DEFAULT_SECONDARY_ID = "__default__";
	const secondaryAxis: AxisBucket[] = [
		{
			id: DEFAULT_SECONDARY_ID,
			label: "Default",
			kind: "group",
			collapsed: false,
		}
	];

	const cells: Record<string, Record<string, BoardCell>> = {};

	for (const primaryBucket of primaryAxis) {
		const pId = primaryBucket.id;
		cells[pId] = {};

		for (const secondaryBucket of secondaryAxis) {
			const sId = secondaryBucket.id;
			const cellTasks = tasksByPrimary[pId] ?? [];

			cells[pId]![sId] = {
				primaryId: pId as PrimaryBucketId,
				secondaryId: sId,
				tasks: cellTasks,
				isEmpty: cellTasks.length === 0,
			};
		}
	}

	return {
		primaryAxis,
		secondaryAxis,
		cells,
	};
}

function sortTasksByFile(tasks: Task[]) {
	tasks.sort((a, b) => {
		if (a.path === b.path) {
			return a.rowIndex - b.rowIndex;
		}
		return a.path.localeCompare(b.path);
	});
}
