import type { Task } from "../tasks/task";
import type { ColumnTag, DefaultColumns, ColumnDefinition } from "../columns/columns";
import { VisibilityOption, FlowDirection, type SettingValues } from "../settings/settings_store";
import {
	deriveGroupBuckets,
	createGroupAssigner,
	type GroupBucket,
} from "../tasks/task_grouping";
import {
	ColumnOrderMode,
	compareByProperty,
	type SortDirection,
} from "../../parsing/properties/comparators";
import { computeDisplayOrder } from "../tasks/manual_order";
import { getToday } from "../filters/date_filter";

export type PrimaryBucketId = ColumnTag | DefaultColumns;
export type SecondaryBucketId = string;

export interface AxisBucket<TId extends string = string> {
	id: TId;
	label: string;
	kind: "column" | "group";
	collapsed: boolean;
	meta?: {
		color?: string;
		value?: GroupBucket["value"];
		source?: GroupBucket["source"];
		isDefault?: boolean;
	};
}

export interface BoardCell {
	primaryId: PrimaryBucketId;
	secondaryId: SecondaryBucketId;
	tasks: Task[];
	isEmpty: boolean;
}

export interface BoardMatrix {
	primaryAxis: AxisBucket<PrimaryBucketId>[];
	secondaryAxis: AxisBucket<SecondaryBucketId>[];
	cells: Record<string, Record<string, BoardCell>>;
}

export function deriveBoardMatrix(
	tasks: Task[],
	columns: ColumnDefinition[],
	settings: SettingValues,
	today: Date = getToday(),
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

	// Apply primary-bucket ordering. Property sort falls back to file order as a
	// stable tiebreak. Manual mode starts from file order here, then applies pins
	// after secondary grouping so each grouped cell owns its own prefix.
	const orderMode = settings.columnOrderMode ?? ColumnOrderMode.FileOrder;
	const sortProperty = settings.sortProperty ?? null;
	const sortDirection: SortDirection = settings.sortDirection ?? "asc";
	const useProperty = orderMode === ColumnOrderMode.Property && !!sortProperty;
	const useManual = orderMode === ColumnOrderMode.Manual;
	const manualOrder = settings.manualOrder ?? {};

	for (const bucketTasks of Object.values(tasksByPrimary)) {
		if (orderMode === ColumnOrderMode.TaskName) {
			sortTasksByTaskName(bucketTasks, sortDirection);
		} else if (useProperty && sortProperty) {
			sortTasksByProperty(
				bucketTasks,
				sortProperty,
				sortDirection,
				settings.statusMarkerOrder ?? "",
				settings.doneStatusMarkers ?? "",
				settings.propertySchema,
			);
		} else {
			sortTasksByFile(bucketTasks);
		}
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

	const primaryAxis: AxisBucket<PrimaryBucketId>[] = allColumns.map((id) => {
		let label = id;
		let color: string | undefined = undefined;
		const colDef = columns.find(c => c.id === id);

		if (id === "uncategorised") {
			label = settings.uncategorizedColumnName || "Uncategorized";
		} else if (id === "done") {
			label = settings.doneColumnName || "Done";
		} else {
			if (colDef) {
				label = colDef.label;
				color = colDef.color;
			}
		}

		return {
			id: id as PrimaryBucketId,
			label,
			kind: "column",
			collapsed: collapsedColumns.has(id),
			meta: { color },
		};
	});

	const groupSource = settings.groupSource ?? { kind: "none" };
	const groupBuckets = deriveGroupBuckets(
		Object.values(tasksByPrimary).flat(),
		groupSource,
		settings.excludedTags,
		settings.statusMarkerOrder ?? "",
		settings.doneStatusMarkers ?? "",
		settings.groupDirection ?? "asc",
		today,
	);
	const assignTaskToBucket = createGroupAssigner(groupBuckets, groupSource, settings.excludedTags, today);
	const secondaryAxis: AxisBucket<SecondaryBucketId>[] = groupBuckets.map((bucket) => ({
		id: bucket.id,
		label: bucket.label,
		kind: "group",
		collapsed: false,
		meta: {
			value: bucket.value,
			source: bucket.source,
			isDefault: bucket.isDefault,
		},
	}));

	const cells: Record<string, Record<string, BoardCell>> = {};

	for (const primaryBucket of primaryAxis) {
		const pId = primaryBucket.id;
		cells[pId] = {};
		const cellTasksByPrimary = tasksByPrimary[pId] ?? [];

		const cellTasksBySecondary = new Map<string, Task[]>();
		for (const task of cellTasksByPrimary) {
			const sId = assignTaskToBucket(task);
			if (sId === undefined) continue;
			let bucketTasks = cellTasksBySecondary.get(sId);
			if (!bucketTasks) {
				bucketTasks = [];
				cellTasksBySecondary.set(sId, bucketTasks);
			}
			bucketTasks.push(task);
		}

		for (const groupBucket of groupBuckets) {
			const sId = groupBucket.id;
			const cellTasks = cellTasksBySecondary.get(sId) ?? [];
			const orderedCellTasks = useManual
				? computeDisplayOrder(cellTasks, manualOrder[sId]?.[pId])
				: cellTasks;

			cells[pId]![sId] = {
				primaryId: pId as PrimaryBucketId,
				secondaryId: sId,
				tasks: orderedCellTasks,
				isEmpty: orderedCellTasks.length === 0,
			};
		}
	}

	return {
		primaryAxis,
		secondaryAxis,
		cells,
	};
}

/**
 * Looks up a cell by axis ids. `deriveBoardMatrix` populates every
 * (primary, secondary) pair, so the fallback only guards against axis ids
 * from a stale render.
 */
export function getBoardCell(
	matrix: BoardMatrix,
	primaryId: PrimaryBucketId,
	secondaryId: SecondaryBucketId,
): BoardCell {
	return (
		matrix.cells[primaryId]?.[secondaryId] ?? {
			primaryId,
			secondaryId,
			tasks: [],
			isEmpty: true,
		}
	);
}

function sortTasksByFile(tasks: Task[]) {
	tasks.sort(compareByFile);
}

function compareByFile(a: Task, b: Task): number {
	if (a.path === b.path) {
		return a.rowIndex - b.rowIndex;
	}
	return a.path.localeCompare(b.path);
}

function sortTasksByProperty(
	tasks: Task[],
	key: string,
	direction: SortDirection,
	statusMarkerOrder: string,
	doneStatusMarkers: string,
	propertySchema: SettingValues["propertySchema"],
) {
	tasks.sort((a, b) => {
		const result = compareByProperty(a, b, key, direction, { statusMarkerOrder, doneStatusMarkers, propertySchema });
		return result !== 0 ? result : compareByFile(a, b);
	});
}

function sortTasksByTaskName(tasks: Task[], direction: SortDirection) {
	tasks.sort((a, b) => {
		const result = a.content.trim().localeCompare(b.content.trim());
		if (result !== 0) {
			return direction === "desc" ? -result : result;
		}
		return compareByFile(a, b);
	});
}
