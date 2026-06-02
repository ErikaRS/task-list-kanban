import type { AxisBucket, SecondaryBucketId } from "./board_matrix";

export interface CellCreationMetadata {
	targetFilePath: string | null;
	additionalTags: string[];
}

export function deriveCellCreationMetadata(
	secondaryAxisBucket: AxisBucket<SecondaryBucketId>,
): CellCreationMetadata {
	const value = secondaryAxisBucket.meta?.value;

	switch (secondaryAxisBucket.meta?.source?.kind) {
		case "file":
			return {
				targetFilePath: typeof value === "string" ? value : null,
				additionalTags: [],
			};
		case "tag-prefix":
			return {
				targetFilePath: null,
				additionalTags: typeof value === "string" ? [value] : [],
			};
		case "none":
		default:
			return {
				targetFilePath: null,
				additionalTags: [],
			};
	}
}
