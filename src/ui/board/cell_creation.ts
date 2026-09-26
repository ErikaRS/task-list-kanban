import type { AxisBucket, SecondaryBucketId } from "./board_matrix";
import type { GroupProperty } from "../tasks/task_line_builder";

export interface CellCreationMetadata {
	targetFilePath: string | null;
	additionalTags: string[];
	/** The property a property lane's new tasks need to stay in that lane. */
	groupProperty: GroupProperty | null;
}

export function deriveCellCreationMetadata(
	secondaryAxisBucket: AxisBucket<SecondaryBucketId>,
): CellCreationMetadata {
	const value = secondaryAxisBucket.meta?.value;
	const source = secondaryAxisBucket.meta?.source;

	switch (source?.kind) {
		case "file":
			return {
				targetFilePath: typeof value === "string" ? value : null,
				additionalTags: [],
				groupProperty: null,
			};
		case "tag-prefix":
			return {
				targetFilePath: null,
				additionalTags: typeof value === "string" ? [value] : [],
				groupProperty: null,
			};
		case "property":
			// Unassigned and Overdue lanes carry no single value to write.
			return {
				targetFilePath: null,
				additionalTags: [],
				groupProperty: value === null || value === undefined
					? null
					: { key: source.key, value },
			};
		case "none":
		default:
			return {
				targetFilePath: null,
				additionalTags: [],
				groupProperty: null,
			};
	}
}
