import { describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { PropertySchemaOption } from "../../../parsing/properties";
import { DataviewSchema } from "../../../parsing/properties/dataview_schema";
import { NoneSchema } from "../../../parsing/properties/none_schema";
import { TasksPluginSchema } from "../../../parsing/properties/tasks_schema";
import { createColumnData, type ColumnDefinition, type ColumnTag } from "../../columns/columns";
import { createTaskActions } from "../actions";
import { updateMapsFromFile, type Metadata } from "../tasks";
import {
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	type Task,
} from "../task";
import { createTaskLine } from "../task_creation";
import { parseTask } from "./task_test_helpers";

vi.mock("obsidian", () => ({
	Keymap: { isModEvent: () => false },
	MarkdownView: class MarkdownView {},
	Menu: class Menu {
		addItem() {
			return this;
		}
		addSeparator() {
			return this;
		}
		showAtPosition() {
			return undefined;
		}
	},
	TFile: class TFile {},
}));

describe("task actions", () => {
	describe("createTaskLine", () => {
		it("adds both column placement tags and tag swimlane tags", () => {
			expect(createTaskLine("Ship it", ["status/active"], ["Project-Alpha"])).toBe(
				"- [ ] Ship it #status/active #Project-Alpha",
			);
		});

		it("does not duplicate tags appended from multiple placement sources", () => {
			expect(createTaskLine("Ship it", ["status/active"], ["#Status/Active", "Project-Alpha"])).toBe(
				"- [ ] Ship it #status/active #Project-Alpha",
			);
		});
	});

	describe("completion date write-back", () => {
		it("does not add completion metadata when property schema is none", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice #today",
				PropertySchemaOption.None,
				new NoneSchema(),
			);

			await actions.markDone(taskId);

			expect(contents()).toBe("- [x] Send invoice #today");
		});

		it("adds Tasks-plugin completion metadata when marking an open task done", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice #today ^abc123",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.markDone(taskId);

			expect(contents()).toBe("- [x] Send invoice #today ✅ 2026-06-15 ^abc123");
		});

		it("preserves an existing Tasks-plugin completion date", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice ✅ 2026-06-01",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.markDone(taskId);

			expect(contents()).toBe("- [x] Send invoice ✅ 2026-06-01");
		});

		it("adds Dataview completion metadata when toggling an open task done", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice [due:: 2026-06-20]",
				PropertySchemaOption.Dataview,
				new DataviewSchema(),
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [x] Send invoice [due:: 2026-06-20] [completion:: 2026-06-15]");
		});

		it("does not rewrite completion metadata when toggling a done task open", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [x] Send invoice [completion:: 2026-06-01]",
				PropertySchemaOption.Dataview,
				new DataviewSchema(),
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [ ] Send invoice [completion:: 2026-06-01]");
		});

		it("cycles open tasks through the configured status marker order", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
				{ statusMarkerOrder: "/!" },
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [/] Send invoice");
		});

		it("cycles to an emoji status marker from the configured status marker order", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [/] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
				{ statusMarkerOrder: "/🟣" },
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [🟣] Send invoice");
		});

		it("respects an explicit blank marker position in the status marker order", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [/] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
				{ statusMarkerOrder: "/ !" },
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [ ] Send invoice");
		});

		it("marks the last configured status marker done and adds completion metadata", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [!] Send invoice",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
				{ statusMarkerOrder: "/!" },
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [x] Send invoice ✅ 2026-06-15");
		});

		it("marks statuses outside the configured marker order done immediately", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [?] Send invoice",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
				{ statusMarkerOrder: "/!" },
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [x] Send invoice ✅ 2026-06-15");
		});

		it("marks done when the next configured status marker is a done marker", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [/] Send invoice",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
				{ statusMarkerOrder: "/x" },
			);

			await actions.toggleDone(taskId);

			expect(contents()).toBe("- [x] Send invoice ✅ 2026-06-15");
		});
	});

	describe("column changes", () => {
		it("moves a done task to uncategorised as an open task", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [x] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
			);

			await actions.changeColumn(taskId, "uncategorised");

			expect(contents()).toBe("- [ ] Send invoice");
		});

		it("moves a done task to a custom column as an open task", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [x] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
			);

			await actions.changeColumn(taskId, "next" as ColumnTag);

			expect(contents()).toBe("- [ ] Send invoice #next");
		});
	});

	describe("nested source block actions", () => {
		it("updates subtask and raw source rows without changing siblings", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] Child\n  - raw note",
			);

			await actions.updateSourceBlockRow(taskId, 1, "Updated child #tag");
			expect(contents()).toBe("- [ ] Parent\n  - [ ] Updated child #tag\n  - raw note");

			await actions.updateSourceBlockRow(taskId, 2, "- updated raw");
			expect(contents()).toBe("- [ ] Parent\n  - [ ] Updated child #tag\n  - updated raw");
		});

		it("edits ignored task rows as task content", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [-] Ignored child",
				{ ignoredStatusMarkers: "-" },
			);

			await actions.updateSourceBlockRow(taskId, 1, "Still ignored");

			expect(contents()).toBe("- [ ] Parent\n  - [-] Still ignored");
		});

		it("cycles only the clicked subtask status", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] Child\n  - [ ] Sibling",
				{ statusMarkerOrder: "/" },
			);

			await actions.toggleSourceTaskStatus(taskId, 1);

			expect(contents()).toBe("- [ ] Parent\n  - [/] Child\n  - [ ] Sibling");
		});

		it("cycles a subtask into an ignored marker row-local", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [/] Child",
				{
					statusMarkerOrder: "/-",
					ignoredStatusMarkers: "-",
				},
			);

			await actions.toggleSourceTaskStatus(taskId, 1);

			expect(contents()).toBe("- [ ] Parent\n  - [-] Child");
		});

		it("reopens done subtasks without touching the parent", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [x] Child",
			);

			await actions.toggleSourceTaskStatus(taskId, 1);

			expect(contents()).toBe("- [ ] Parent\n  - [ ] Child");
		});

		it("cycles a custom done subtask marker back to the start", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [D] Child",
				{
					doneStatusMarkers: "D",
					statusMarkerOrder: "/D",
				},
			);

			await actions.toggleSourceTaskStatus(taskId, 1);

			expect(contents()).toBe("- [ ] Parent\n  - [ ] Child");
		});

		it("deletes the full owned source block for a parent card", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] Child\n- [ ] Sibling",
			);

			await actions.deleteTask(taskId);

			expect(contents()).toBe("- [ ] Sibling");
		});

		it("duplicates the full owned source block and resets only the parent copy", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [x] Parent ^abc123\n  - [x] Child\n- [ ] Sibling",
			);

			await actions.duplicateTask(taskId);

			expect(contents()).toBe(
				"- [x] Parent ^abc123\n  - [x] Child\n- [ ] Parent\n  - [x] Child\n- [ ] Sibling",
			);
		});

		it("moves full owned source blocks to another file and retags only the parent row", async () => {
			const sourceFile = { path: "source.md" };
			const destinationFile = { path: "done.md" };
			const fileContents = new Map([
				["source.md", "- [ ] Parent\n  - [ ] Child\n- [ ] Sibling"],
				["done.md", "# Done"],
			]);
			const tasksByTaskId = new Map<string, Task>();
			const metadataByTaskId = new Map<string, Metadata>();

			await parseNestedFileIntoMaps({
				fileHandle: sourceFile,
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
			});
			const task = Array.from(tasksByTaskId.values())[0]!;
			const actions = setupActionsWithFileMap({
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
			});

			await actions.moveTasksToFile([task.id], destinationFile as never, "done");

			expect(fileContents.get("source.md")).toBe("- [ ] Sibling");
			expect(fileContents.get("done.md")).toBe("# Done\n- [x] Parent\n  - [ ] Child");
		});
	});

	describe("date property updates", () => {
		it("sets and clears Tasks-plugin date properties", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice 📅 2026-06-01 ^abc123",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.setDateProperty(taskId, "due", "2026-06-15");
			expect(contents()).toBe("- [ ] Send invoice 📅 2026-06-15 ^abc123");

			await actions.clearDateProperty(taskId, "due");
			expect(contents()).toBe("- [ ] Send invoice ^abc123");
		});

		it("sets and clears Dataview date properties", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice [scheduled:: 2026-06-01] ^abc123",
				PropertySchemaOption.Dataview,
				new DataviewSchema(),
			);

			await actions.setDateProperty(taskId, "scheduled", "2026-06-15");
			expect(contents()).toBe("- [ ] Send invoice [scheduled:: 2026-06-15] ^abc123");

			await actions.clearDateProperty(taskId, "scheduled");
			expect(contents()).toBe("- [ ] Send invoice ^abc123");
		});

		it("leaves date property updates unchanged when schema is none", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
			);

			await actions.setDateProperty(taskId, "start", "2026-06-15");

			expect(contents()).toBe("- [ ] Send invoice");
		});
	});

	describe("createTask date properties", () => {
		it("writes Tasks-plugin dates when creating a task", async () => {
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.TasksPlugin,
			);

			await actions.createTask(
				fileHandle as never,
				"New task",
				"in-progress" as never,
				["project/alpha"],
				{ due: "2026-06-15", scheduled: "2026-06-16", start: "2026-06-17" },
			);

			expect(contents()).toBe(
				"# Tasks\n- [ ] New task #in-progress #project/alpha 📅 2026-06-15 ⏳ 2026-06-16 🛫 2026-06-17",
			);
		});

		it("writes Dataview dates when creating a task", async () => {
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.Dataview,
			);

			await actions.createTask(
				fileHandle as never,
				"New task",
				"in-progress" as never,
				[],
				{ due: "2026-06-15", start: "2026-06-17" },
			);

			expect(contents()).toBe(
				"# Tasks\n- [ ] New task #in-progress [due:: 2026-06-15] [start:: 2026-06-17]",
			);
		});

		it("ignores create-task dates when schema is none", async () => {
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.None,
			);

			await actions.createTask(
				fileHandle as never,
				"New task",
				"in-progress" as never,
				[],
				{ due: "2026-06-15" },
			);

			expect(contents()).toBe("# Tasks\n- [ ] New task #in-progress");
		});

		it("uses the status marker when creating a task in a status column", async () => {
			const doingColumn: ColumnDefinition = {
				id: "doing" as ColumnTag,
				label: "Doing",
				matchMode: "status",
				matchTags: [],
				matchStatus: "/",
			};
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.None,
				new Map(),
				new Map(),
				{ path: "tasks.md" },
				[doingColumn],
			);

			await actions.createTask(fileHandle as never, "New task", "doing" as ColumnTag);

			expect(contents()).toBe("# Tasks\n- [/] New task");
		});

		it("uses the priority value when creating a task in a Tasks priority column", async () => {
			const highColumn: ColumnDefinition = {
				id: "high" as ColumnTag,
				label: "High",
				matchMode: "priority",
				matchTags: [],
				matchPriority: "high",
			};
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.TasksPlugin,
				new Map(),
				new Map(),
				{ path: "tasks.md" },
				[highColumn],
			);

			await actions.createTask(fileHandle as never, "New task", "high" as ColumnTag);

			expect(contents()).toBe("# Tasks\n- [ ] New task ⏫");
		});

		it("uses the priority value when creating a task in a Dataview priority column", async () => {
			const highColumn: ColumnDefinition = {
				id: "high" as ColumnTag,
				label: "High",
				matchMode: "priority",
				matchTags: [],
				matchPriority: "high",
				matchPropertySchema: PropertySchemaOption.Dataview,
			};
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.Dataview,
				new Map(),
				new Map(),
				{ path: "tasks.md" },
				[highColumn],
			);

			await actions.createTask(fileHandle as never, "New task", "high" as ColumnTag);

			expect(contents()).toBe("# Tasks\n- [ ] New task [priority:: high]");
		});

		it("uses the column priority schema when creating a task", async () => {
			const highColumn: ColumnDefinition = {
				id: "high" as ColumnTag,
				label: "High",
				matchMode: "priority",
				matchTags: [],
				matchPriority: "high",
				matchPropertySchema: PropertySchemaOption.TasksPlugin,
			};
			const { actions, fileHandle, contents } = setupActions(
				"# Tasks",
				PropertySchemaOption.Dataview,
				new Map(),
				new Map(),
				{ path: "tasks.md" },
				[highColumn],
			);

			await actions.createTask(fileHandle as never, "New task", "high" as ColumnTag);

			expect(contents()).toBe("# Tasks\n- [ ] New task ⏫");
		});
	});
});

function setupActionsForLine(
	line: string,
	propertySchemaOption: PropertySchemaOption,
	propertySchema: NoneSchema | TasksPluginSchema | DataviewSchema,
	options: { statusMarkerOrder?: string } = {},
) {
	const fileHandle = { path: "tasks.md" };
	const task = parseTask(line, { propertySchema });
	const tasksByTaskId = new Map([[task.id, task]]);
	const metadataByTaskId = new Map([[task.id, { fileHandle, rowIndex: 0 }]]) as never;
	const { actions, contents } = setupActions(
		line,
		propertySchemaOption,
		tasksByTaskId,
		metadataByTaskId,
		fileHandle,
		[],
		options,
	);

	return {
		actions,
		taskId: task.id,
		contents,
	};
}

async function setupNestedActions(
	initialContents: string,
	options: { statusMarkerOrder?: string; doneStatusMarkers?: string; ignoredStatusMarkers?: string } = {},
) {
	const fileHandle = { path: "tasks.md" };
	const fileContents = new Map([[fileHandle.path, initialContents]]);
	const tasksByTaskId = new Map<string, Task>();
	const metadataByTaskId = new Map<string, Metadata>();

	await parseNestedFileIntoMaps({
		fileHandle,
		fileContents,
		tasksByTaskId,
		metadataByTaskId,
		doneStatusMarkers: options.doneStatusMarkers,
		ignoredStatusMarkers: options.ignoredStatusMarkers,
	});
	const task = Array.from(tasksByTaskId.values())[0]!;
	const { actions, contents } = setupActions(
		initialContents,
		PropertySchemaOption.None,
		tasksByTaskId,
		metadataByTaskId as never,
		fileHandle,
		[],
		{ statusMarkerOrder: options.statusMarkerOrder },
	);

	return {
		actions,
		taskId: task.id,
		contents,
	};
}

function setupActions(
	initialContents: string,
	propertySchemaOption: PropertySchemaOption,
	tasksByTaskId = new Map(),
	metadataByTaskId = new Map(),
	fileHandle = { path: "tasks.md" },
	columnDefinitions: ColumnDefinition[] = [],
	options: { statusMarkerOrder?: string } = {},
) {
	let fileContents = initialContents;
	const placementTags = createColumnData(columnDefinitions).columnPlacementTagTable;
	const actions = createTaskActions({
		tasksByTaskId: tasksByTaskId as never,
		metadataByTaskId: metadataByTaskId as never,
		vault: {
			read: async () => fileContents,
			modify: async (_file: unknown, nextContents: string) => {
				fileContents = nextContents;
			},
		} as never,
		workspace: {} as never,
		getFilenameFilter: () => null,
		getExcludeFilter: () => null,
		getBoardFolderPath: () => null,
		getPlacementTagsForColumn: (column) => placementTags[column] ?? [column],
		getColumnDefinitions: () => columnDefinitions,
		getDefaultTaskFile: () => null,
		getLastUsedTaskFile: () => null,
		setLastUsedTaskFile: () => undefined,
		getPropertySchemaOption: () => propertySchemaOption,
		getStatusMarkerOrder: () => options.statusMarkerOrder ?? "",
		getCurrentDate: () => new Date(2026, 5, 15, 12),
		getManualOrder: () => ({}),
		setManualOrder: () => undefined,
	});

	return {
		actions,
		fileHandle,
		contents: () => fileContents,
	};
}

async function parseNestedFileIntoMaps({
	fileHandle,
	fileContents,
	tasksByTaskId,
	metadataByTaskId,
	doneStatusMarkers,
	ignoredStatusMarkers,
}: {
	fileHandle: { path: string };
	fileContents: Map<string, string>;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	doneStatusMarkers?: string;
	ignoredStatusMarkers?: string;
}) {
	await updateMapsFromFile({
		fileHandle: fileHandle as never,
		tasksByTaskId,
		metadataByTaskId,
		taskIdsByFileHandle: new Map(),
		vault: {
			read: vi.fn(async (file: { path: string }) => fileContents.get(file.path) ?? ""),
		} as never,
		columnDefinitionsStore: writable([]),
		columnPlacementTagTableStore: writable({}),
		consolidateTags: false,
		doneStatusMarkers: doneStatusMarkers ?? DEFAULT_DONE_STATUS_MARKERS,
		cancelledStatusMarkers: DEFAULT_CANCELLED_STATUS_MARKERS,
		ignoredStatusMarkers: ignoredStatusMarkers ?? DEFAULT_IGNORED_STATUS_MARKERS,
		excludedTaskTags: new Set(),
		propertySchema: new NoneSchema(),
		treatNestedTasksAsSubtasks: true,
	});
}

function setupActionsWithFileMap({
	fileContents,
	tasksByTaskId,
	metadataByTaskId,
	statusMarkerOrder = "",
}: {
	fileContents: Map<string, string>;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	statusMarkerOrder?: string;
}) {
	return createTaskActions({
		tasksByTaskId,
		metadataByTaskId: metadataByTaskId as never,
		vault: {
			read: async (file: { path: string }) => fileContents.get(file.path) ?? "",
			modify: async (file: { path: string }, nextContents: string) => {
				fileContents.set(file.path, nextContents);
			},
		} as never,
		workspace: {} as never,
		getFilenameFilter: () => null,
		getExcludeFilter: () => null,
		getBoardFolderPath: () => null,
		getPlacementTagsForColumn: (column) => [column],
		getColumnDefinitions: () => [],
		getDefaultTaskFile: () => null,
		getLastUsedTaskFile: () => null,
		setLastUsedTaskFile: () => undefined,
		getPropertySchemaOption: () => PropertySchemaOption.None,
		getStatusMarkerOrder: () => statusMarkerOrder,
		getCurrentDate: () => new Date(2026, 5, 15, 12),
		getManualOrder: () => ({}),
		setManualOrder: () => undefined,
	});
}
