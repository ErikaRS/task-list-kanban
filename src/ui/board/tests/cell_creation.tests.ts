import { describe, expect, it } from "vitest";
import type { AxisBucket, SecondaryBucketId } from "../board_matrix";
import { deriveCellCreationMetadata } from "../cell_creation";

function bucket(meta: AxisBucket<SecondaryBucketId>["meta"]): AxisBucket<SecondaryBucketId> {
	return {
		id: "group",
		label: "Group",
		kind: "group",
		collapsed: false,
		meta,
	};
}

describe("cell creation metadata", () => {
	it("uses the grouped file as the target file", () => {
		expect(
			deriveCellCreationMetadata(
				bucket({
					value: "projects/tasks.md",
					source: { kind: "file" },
				}),
			),
		).toEqual({
			targetFilePath: "projects/tasks.md",
			additionalTags: [],
		});
	});

	it("adds the grouped tag as task metadata", () => {
		expect(
			deriveCellCreationMetadata(
				bucket({
					value: "Project-Alpha",
					source: { kind: "tag-prefix", prefix: "Project-" },
				}),
			),
		).toEqual({
			targetFilePath: null,
			additionalTags: ["Project-Alpha"],
		});
	});

	it("does not add metadata for default groups", () => {
		expect(
			deriveCellCreationMetadata(
				bucket({
					value: null,
					source: { kind: "tag-prefix", prefix: "Project-" },
					isDefault: true,
				}),
			),
		).toEqual({
			targetFilePath: null,
			additionalTags: [],
		});
	});
});
