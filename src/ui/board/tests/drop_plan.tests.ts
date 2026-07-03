import { describe, expect, it } from "vitest";
import { deriveDropPlan } from "../drop_plan";
import type { DraggingData } from "../../dnd/store";
import type { AxisBucket, PrimaryBucketId, SecondaryBucketId } from "../board_matrix";
import type { GroupSource } from "../../tasks/task_grouping";

const COLUMN = "in-progress" as PrimaryBucketId;
const OTHER_COLUMN = "review" as PrimaryBucketId;

function dragging(overrides: Partial<DraggingData> = {}): DraggingData {
	return {
		fromColumn: COLUMN,
		fromSecondaryId: "lane-a",
		draggedTaskIds: ["task-1"],
		taskSecondaryIds: { "task-1": "lane-a" },
		...overrides,
	};
}

function derive({
	drag = dragging(),
	column = COLUMN,
	secondaryId = "lane-b",
	bucketMeta = undefined,
	fileGroupTargetFilePath = null,
	canWriteProperties = true,
}: {
	drag?: DraggingData | null;
	column?: PrimaryBucketId;
	secondaryId?: SecondaryBucketId;
	bucketMeta?: AxisBucket<SecondaryBucketId>["meta"];
	fileGroupTargetFilePath?: string | null;
	canWriteProperties?: boolean;
} = {}) {
	return deriveDropPlan({
		dragging: drag,
		column,
		secondaryId,
		bucketMeta,
		fileGroupTargetFilePath,
		canWriteProperties,
	});
}

describe("deriveDropPlan", () => {
	it("returns null when nothing is being dragged", () => {
		expect(derive({ drag: null })).toBeNull();
	});

	it("returns null for a drop on the task's own cell", () => {
		expect(derive({ column: COLUMN, secondaryId: "lane-a" })).toBeNull();
	});

	it("plans a column change for a same-lane drop on another column", () => {
		expect(derive({ column: OTHER_COLUMN, secondaryId: "lane-a" })).toEqual({
			kind: "column-only",
			changeColumn: true,
		});
	});

	describe("file lanes", () => {
		const meta = { source: { kind: "file" } as const, value: "b.md" };

		it("plans a file move for a cross-lane drop", () => {
			expect(
				derive({ bucketMeta: meta, fileGroupTargetFilePath: "b.md" }),
			).toEqual({ kind: "move-to-file", targetFilePath: "b.md", changeColumn: false });
		});

		it("plans a file move for a same-lane drop when the selection spans files", () => {
			const drag = dragging({
				fromSecondaryId: "lane-b",
				draggedTaskIds: ["task-1", "task-2"],
				taskSecondaryIds: { "task-1": "b.md", "task-2": "a.md" },
			});
			expect(
				derive({ drag, secondaryId: "lane-b", bucketMeta: meta, fileGroupTargetFilePath: "b.md" }),
			).toEqual({ kind: "move-to-file", targetFilePath: "b.md", changeColumn: false });
		});

		it("rejects a cross-lane drop when the lane's file is unresolved", () => {
			expect(
				derive({ bucketMeta: meta, fileGroupTargetFilePath: null }),
			).toBeNull();
		});

		it("still plans a column change within the lane when the file is unresolved", () => {
			expect(
				derive({
					column: OTHER_COLUMN,
					secondaryId: "lane-a",
					bucketMeta: meta,
					fileGroupTargetFilePath: null,
				}),
			).toEqual({ kind: "column-only", changeColumn: true });
		});
	});

	describe("tag lanes", () => {
		const source: GroupSource = {
			kind: "tag-prefix",
			prefix: "sprint-",
			includeTags: ["sprint-1"],
		};

		it("plans a tag swap for a cross-lane drop, without a column change", () => {
			expect(
				derive({ bucketMeta: { source, value: "sprint-1" } }),
			).toEqual({
				kind: "set-tag",
				tag: "sprint-1",
				prefix: "sprint-",
				includeTags: ["sprint-1"],
				changeColumn: false,
			});
		});

		it("plans a tag removal for a drop on the unassigned lane", () => {
			expect(
				derive({ bucketMeta: { source, value: null } }),
			).toMatchObject({ kind: "set-tag", tag: null });
		});

		it("includes the column change for a diagonal drop", () => {
			expect(
				derive({ column: OTHER_COLUMN, bucketMeta: { source, value: "sprint-1" } }),
			).toMatchObject({ kind: "set-tag", changeColumn: true });
		});
	});

	describe("property lanes", () => {
		const dueSource = { kind: "property", key: "due" } as const;
		const dueDate = new Date(Date.UTC(2026, 6, 3));

		it("plans a property write when grouped by due date (issue #157)", () => {
			expect(
				derive({ bucketMeta: { source: dueSource, value: dueDate } }),
			).toEqual({
				kind: "set-property",
				key: "due",
				value: dueDate,
				changeColumn: false,
			});
		});

		it("plans a property removal for a drop on the unassigned lane", () => {
			expect(
				derive({ bucketMeta: { source: dueSource, value: null } }),
			).toMatchObject({ kind: "set-property", key: "due", value: null });
		});

		it("rejects lanes for properties without a writer, even across columns", () => {
			expect(
				derive({
					column: OTHER_COLUMN,
					bucketMeta: { source: { kind: "property", key: "created" }, value: dueDate },
				}),
			).toBeNull();
		});

		it("rejects property lanes when the schema has no write adapter", () => {
			expect(
				derive({
					bucketMeta: { source: dueSource, value: dueDate },
					canWriteProperties: false,
				}),
			).toBeNull();
		});

		it("still plans a column change within the lane for unwritable properties", () => {
			expect(
				derive({
					column: OTHER_COLUMN,
					secondaryId: "lane-a",
					bucketMeta: { source: { kind: "property", key: "created" }, value: dueDate },
				}),
			).toEqual({ kind: "column-only", changeColumn: true });
		});
	});
});
