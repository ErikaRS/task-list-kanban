import type { DraggingData } from "../dnd/store";
import type { GroupBucket } from "../tasks/task_grouping";
import { isWritableSwimlanePropertyKey } from "../tasks/swimlane_property";
import type { AxisBucket, PrimaryBucketId, SecondaryBucketId } from "./board_matrix";

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
}: {
	dragging: DraggingData | null;
	column: PrimaryBucketId;
	secondaryId: SecondaryBucketId;
	bucketMeta: AxisBucket<SecondaryBucketId>["meta"];
	/** The file a file-group lane writes to, or null if unresolved/invalid. */
	fileGroupTargetFilePath: string | null;
	/** Whether the active property schema has a write adapter. */
	canWriteProperties: boolean;
}): DropPlan | null {
	if (!dragging) return null;

	const crossLane = dragging.fromSecondaryId !== secondaryId;
	const changeColumn = dragging.fromColumn !== column;
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
