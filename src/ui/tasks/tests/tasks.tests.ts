import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { NoneSchema } from "../../../parsing/properties/none_schema";
import { updateMapsFromFile } from "../tasks";
import {
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
} from "../task";
import { getVisibleSourceTaskDescendants } from "../source_block";
import type { ColumnDefinition, ColumnPlacementTagTable } from "../../columns/columns";

const columns: ColumnDefinition[] = [
	{ id: "todo" as never, label: "Todo", matchMode: "name", matchTags: [] },
];

const placementTags: ColumnPlacementTagTable = {
	todo: ["todo"],
} as never;

describe("updateMapsFromFile", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("logs file-specific read or parse failures", async () => {
		const error = new Error("read failed");
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fileHandle = { path: "bad.md" };

		await updateMapsFromFile({
			fileHandle: fileHandle as never,
			tasksByTaskId: new Map(),
			metadataByTaskId: new Map(),
			taskIdsByFileHandle: new Map(),
			vault: {
				read: vi.fn(async () => {
					throw error;
				}),
			} as never,
			columnDefinitionsStore: writable(columns),
			columnPlacementTagTableStore: writable(placementTags),
			consolidateTags: false,
			doneStatusMarkers: DEFAULT_DONE_STATUS_MARKERS,
			cancelledStatusMarkers: DEFAULT_CANCELLED_STATUS_MARKERS,
			ignoredStatusMarkers: DEFAULT_IGNORED_STATUS_MARKERS,
			excludedTaskTags: new Set(),
			propertySchema: new NoneSchema(),
		});

		expect(consoleError).toHaveBeenCalledWith("Failed to update task cache for bad.md", error);
	});

	it("keeps nested tasks as independent cards when nested subtask parsing is off", async () => {
		const { tasks } = await parseFileTasks("- [ ] Parent #todo\n  - [ ] Child #todo");

		expect(tasks.map((task) => task.content)).toEqual(["Parent", "Child"]);
		expect(tasks.every((task) => task.sourceBlockLineCount === 1)).toBe(true);
	});

	it("creates only root-most visible task cards with source children when nested subtask parsing is on", async () => {
		const { tasks } = await parseFileTasks(
			[
				"- [ ] A #todo",
				"  - B",
				"    - [ ] C #todo",
				"  - [x] D #todo",
			].join("\n"),
			{ treatNestedTasksAsSubtasks: true },
		);

		expect(tasks.map((task) => task.content)).toEqual(["A"]);
		expect(tasks[0]?.sourceBlockLineCount).toBe(4);
		expect(tasks[0]?.sourceChildren).toMatchObject([
			{
				kind: "raw",
				rowIndex: 1,
				rawLine: "  - B",
				sourceChildren: [
					{
						kind: "task",
						taskVisibility: "visible",
						rowIndex: 2,
						content: "C #todo",
					},
				],
			},
			{
				kind: "task",
				taskVisibility: "visible",
				rowIndex: 3,
				content: "D #todo",
			},
		]);
	});

	it("does not count raw or ignored task rows as visible task ancestors", async () => {
		const { tasks } = await parseFileTasks(
			[
				"- raw parent",
				"  - [ ] From raw #todo",
				"- [-] Ignored parent #todo",
				"  - [ ] From ignored #todo",
			].join("\n"),
			{
				treatNestedTasksAsSubtasks: true,
				ignoredStatusMarkers: "-",
			},
		);

		expect(tasks.map((task) => task.content)).toEqual(["From raw", "From ignored"]);
	});

	it("lets visible descendants of excluded tasks become board roots", async () => {
		const { tasks } = await parseFileTasks(
			"- [ ] Hidden #skip\n  - [ ] Child #todo",
			{
				treatNestedTasksAsSubtasks: true,
				excludedTaskTags: new Set(["skip"]),
			},
		);

		expect(tasks.map((task) => task.content)).toEqual(["Child"]);
	});

	it("ends source block ownership at blank lines", async () => {
		const { tasks } = await parseFileTasks(
			"- [ ] Parent #todo\n  - [ ] Child #todo\n\n  - [ ] After blank #todo",
			{ treatNestedTasksAsSubtasks: true },
		);

		expect(tasks.map((task) => task.content)).toEqual(["Parent", "After blank"]);
		expect(tasks[0]?.sourceBlockLineCount).toBe(2);
		expect(tasks[1]?.sourceBlockLineCount).toBe(1);
	});

	it("breaks ancestry for mixed indentation without a shared prefix", async () => {
		const { tasks } = await parseFileTasks(
			"  - [ ] Space parent #todo\n \t- [ ] Mixed child #todo",
			{ treatNestedTasksAsSubtasks: true },
		);

		expect(tasks.map((task) => task.content)).toEqual(["Space parent", "Mixed child"]);
	});

	it("correctly identifies visible source task descendants for completion percentage", async () => {
		const { tasks } = await parseFileTasks(
			[
				"- [ ] A #todo",
				"  - B", // raw
				"    - [ ] C #todo", // visible task
				"      - [-] D #todo", // ignored task (not visible)
				"    - [x] E #todo", // visible task (completed)
				"  - F", // raw
				"    - [ ] G #todo", // visible task
			].join("\n"),
			{ treatNestedTasksAsSubtasks: true, ignoredStatusMarkers: "-" },
		);

		expect(tasks).toHaveLength(1);
		const parentTask = tasks[0];
		const descendants = getVisibleSourceTaskDescendants(parentTask.sourceChildren);

		// Descendants should only contain C, E, and G. Not B, D, F.
		expect(descendants.map((d) => d.content)).toEqual(["C #todo", "E #todo", "G #todo"]);

		// Check counts
		const totalCount = descendants.length;
		const completedCount = descendants.filter((node) => parentTask.isSourceTaskStatusDone(node.status)).length;
		const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

		expect(totalCount).toBe(3);
		expect(completedCount).toBe(1); // E is completed
		expect(percentage).toBe(33);
	});
});

async function parseFileTasks(
	contents: string,
	options: {
		treatNestedTasksAsSubtasks?: boolean;
		ignoredStatusMarkers?: string;
		excludedTaskTags?: Set<string>;
	} = {},
) {
	const fileHandle = { path: "tasks.md" };
	const tasksByTaskId = new Map();
	const metadataByTaskId = new Map();
	const taskIdsByFileHandle = new Map();

	await updateMapsFromFile({
		fileHandle: fileHandle as never,
		tasksByTaskId,
		metadataByTaskId,
		taskIdsByFileHandle,
		vault: {
			read: vi.fn(async () => contents),
		} as never,
		columnDefinitionsStore: writable(columns),
		columnPlacementTagTableStore: writable(placementTags),
		consolidateTags: false,
		doneStatusMarkers: DEFAULT_DONE_STATUS_MARKERS,
		cancelledStatusMarkers: DEFAULT_CANCELLED_STATUS_MARKERS,
		ignoredStatusMarkers: options.ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
		excludedTaskTags: options.excludedTaskTags ?? new Set(),
		propertySchema: new NoneSchema(),
		treatNestedTasksAsSubtasks: options.treatNestedTasksAsSubtasks ?? false,
	});

	return {
		tasks: Array.from(tasksByTaskId.values()).sort((a, b) => a.rowIndex - b.rowIndex),
		metadataByTaskId,
		taskIdsByFileHandle,
	};
}
