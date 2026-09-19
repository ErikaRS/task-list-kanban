import type { DraggingData } from "../dnd/store";
import type { GroupBucket } from "../tasks/task_grouping";
import { isWritableSwimlanePropertyKey } from "../tasks/swimlane_property";
import type { AxisBucket, PrimaryBucketId, SecondaryBucketId } from "./board_matrix";
import type { TaskActions } from "../tasks/actions";
import type { TFile } from "obsidian";

/**
 * What a drop onto a board cell should do. Derived once per drag state by
 * {@link deriveDropPlan}; `canDrop` is simply "the plan is not null", and the
 * drop handler executes the plan, so drop detection and drop behaviour cannot
 * drift apart.
 *
 * `changeColumn` is false for drops within the task's current column, so a
 * pure lane move touches nothing but the swimlane metadata.
 */
export type DropPlan =
	| { kind: "column-only"; changeColumn: true }
	| { kind: "move-to-file"; targetFilePath: string; changeColumn: boolean }
	| {
			kind: "set-tag";
			tag: string | null;
			prefix: string;
			includeTags?: string[];
			changeColumn: boolean;
	  }
	| {
			kind: "set-property";
			key: string;
			value: GroupBucket["value"];
			changeColumn: boolean;
	  };

export function deriveDropPlan({
	dragging,
	column,
	secondaryId,
	bucketMeta,
	fileGroupTargetFilePath,
	canWriteProperties,
	changeColumnOverride,
}: {
	dragging: DraggingData | null;
	column: PrimaryBucketId;
	secondaryId: SecondaryBucketId;
	bucketMeta: AxisBucket<SecondaryBucketId>["meta"];
	/** The file a file-group lane writes to, or null if unresolved/invalid. */
	fileGroupTargetFilePath: string | null;
	/** Whether the active property schema has a write adapter. */
	canWriteProperties: boolean;
	/** Used by collapsed group headers, which only change swimlane metadata. */
	changeColumnOverride?: boolean;
}): DropPlan | null {
	if (!dragging) return null;

	const crossLane = dragging.fromSecondaryId !== secondaryId;
	const changeColumn = changeColumnOverride ?? dragging.fromColumn !== column;
	const source = bucketMeta?.source;

	if (source && source.kind !== "none") {
		switch (source.kind) {
			case "file": {
				if (fileGroupTargetFilePath === null) break;
				// A same-lane drop still moves files when the multi-selection
				// includes tasks living outside this lane's file.
				const hasTaskOutsideTargetFile = dragging.draggedTaskIds.some(
					(id) => dragging.taskSecondaryIds[id] !== fileGroupTargetFilePath,
				);
				if (crossLane || hasTaskOutsideTargetFile) {
					return {
						kind: "move-to-file",
						targetFilePath: fileGroupTargetFilePath,
						changeColumn,
					};
				}
				break;
			}
			case "folder": {
				// A folder bucket spans many files, so there's no single file to
				// move a cross-lane drop into. Only ever change the column; the
				// task keeps living in its current file and folder.
				return changeColumn ? { kind: "column-only", changeColumn: true } : null;
			}
			case "tag-prefix": {
				if (!crossLane) break;
				const value = bucketMeta?.value;
				return {
					kind: "set-tag",
					tag: typeof value === "string" ? value : null,
					prefix: source.prefix ?? "",
					includeTags: source.includeTags,
					changeColumn,
				};
			}
			case "property": {
				if (!crossLane) break;
				// Reject drops onto lanes we cannot write back; accepting them
				// would only change the column and the card would snap back to
				// its original lane.
				if (!canWriteProperties || !isWritableSwimlanePropertyKey(source.key)) {
					return null;
				}
				return {
					kind: "set-property",
					key: source.key,
					value: bucketMeta?.value ?? null,
					changeColumn,
				};
			}
			default: {
				// Compile-time exhaustiveness: adding a GroupSource kind without
				// deciding its drop behaviour is an error, not a dead drop zone.
				const unhandled: never = source;
				return unhandled;
			}
		}
	}

	return changeColumn && !crossLane ? { kind: "column-only", changeColumn: true } : null;
}

/**
 * Plans a drop onto a folded group header. Its semantic column is always the
 * source column. Overdue is an aggregate, not a writable property value, so
 * it deliberately remains unavailable as a collapsed-lane destination.
 */
export function deriveCollapsedGroupDropPlan({
	dragging,
	secondaryId,
	bucketMeta,
	fileGroupTargetFilePath,
	canWriteProperties,
}: Omit<Parameters<typeof deriveDropPlan>[0], "column" | "changeColumnOverride">): DropPlan | null {
	const source = bucketMeta?.source;
	if (source?.kind === "property" && secondaryId === `property:${source.key}:__overdue__`) {
		return null;
	}
	return deriveDropPlan({
		dragging,
		column: (dragging?.fromColumn ?? "uncategorised") as PrimaryBucketId,
		secondaryId,
		bucketMeta,
		fileGroupTargetFilePath,
		canWriteProperties,
		changeColumnOverride: false,
	});
}

/**
 * Runs the part of a drop that changes a task's group. Board cells and
 * collapsed group headers share this so their writes cannot drift apart.
 */
export async function executeDropPlan({
	plan,
	taskActions,
	taskIds,
	taskSecondaryIds,
	targetFile,
	column,
	excludedTags,
}: {
	plan: DropPlan;
	taskActions: TaskActions;
	taskIds: string[];
	taskSecondaryIds: Record<string, string>;
	targetFile: TFile | null;
	column: PrimaryBucketId;
	excludedTags: string[];
}): Promise<void> {
	switch (plan.kind) {
		case "move-to-file": {
			if (!targetFile) return;
			const idsBySourceGroup = groupIdsBySecondaryId(taskIds, taskSecondaryIds);
			for (const [sourceFilePath, ids] of idsBySourceGroup) {
				if (sourceFilePath === plan.targetFilePath) {
					if (plan.changeColumn) await taskActions.moveTasksToColumn(ids, column);
				} else {
					await taskActions.moveTasksToFile(ids, targetFile, column);
				}
			}
			return;
		}
		case "set-tag":
			await taskActions.updateSwimlaneTag(
				taskIds, plan.tag, plan.prefix, excludedTags, plan.includeTags,
			);
			if (plan.changeColumn) await taskActions.moveTasksToColumn(taskIds, column);
			return;
		case "set-property":
			await taskActions.updateSwimlaneProperty(taskIds, plan.key, plan.value);
			if (plan.changeColumn) await taskActions.moveTasksToColumn(taskIds, column);
			return;
		case "column-only":
			await taskActions.moveTasksToColumn(taskIds, column);
	}
}

function groupIdsBySecondaryId(
	taskIds: string[],
	taskSecondaryIds: Record<string, string>,
): Map<string, string[]> {
	const grouped = new Map<string, string[]>();
	for (const id of taskIds) {
		const secondaryId = taskSecondaryIds[id] ?? "";
		const ids = grouped.get(secondaryId) ?? [];
		ids.push(id);
		grouped.set(secondaryId, ids);
	}
	return grouped;
}
