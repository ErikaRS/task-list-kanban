import { describe, expect, it, vi } from "vitest";
import { PropertySchemaOption } from "../../../parsing/properties";
import { DataviewSchema } from "../../../parsing/properties/dataview_schema";
import { NoneSchema } from "../../../parsing/properties/none_schema";
import { TasksPluginSchema } from "../../../parsing/properties/tasks_schema";
import { createColumnData, type ColumnDefinition, type ColumnTag } from "../../columns/columns";
import { createTaskActions } from "../actions";
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
	});
});

function setupActionsForLine(
	line: string,
	propertySchemaOption: PropertySchemaOption,
	propertySchema: NoneSchema | TasksPluginSchema | DataviewSchema,
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
