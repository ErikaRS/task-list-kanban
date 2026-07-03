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
	Notice: class Notice {},
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
		it("prepares task writes before saving markdown back to the vault", async () => {
			const taskLine = "- [ ] Send invoice";
			const initialContents = "---\nkanban_plugin: old\n---\n" + taskLine;
			const fileHandle = { path: "board.md" };
			const task = parseTask(taskLine, { propertySchema: new NoneSchema() });
			const tasksByTaskId = new Map([[task.id, task]]);
			const metadataByTaskId = new Map([[task.id, { fileHandle, rowIndex: 3 }]]) as never;
			const { actions, contents } = setupActions(
				initialContents,
				PropertySchemaOption.None,
				tasksByTaskId,
				metadataByTaskId,
				fileHandle,
				[],
				{
					prepareFileContentsForWrite: (_file, nextContents) =>
						nextContents.replace("kanban_plugin: old", "kanban_plugin: current"),
				},
			);

			await actions.changeColumn(task.id, "next" as ColumnTag);

			expect(contents()).toBe("---\nkanban_plugin: current\n---\n- [ ] Send invoice #next");
		});

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

		it("preserves raw list bullets when editing raw list item text", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - raw note",
			);

			await actions.updateSourceBlockRow(taskId, 1, "updated raw");

			expect(contents()).toBe("- [ ] Parent\n  - updated raw");
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
			const { actions } = setupActionsWithFileMap({
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
			});

			await actions.moveTasksToFile([task.id], destinationFile as never, "done");

			expect(fileContents.get("source.md")).toBe("- [ ] Sibling");
			expect(fileContents.get("done.md")).toBe("# Done\n- [x] Parent\n  - [ ] Child");
		});
	});

	describe("subtask block operations", () => {
		it("adds a subtask or raw note as sibling or child", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] Child",
			);

			// Add sibling task below Child (rowIndex = 1)
			await actions.addSourceBlockRow(taskId, 1, "sibling", "task");
			expect(contents()).toBe("- [ ] Parent\n  - [ ] Child\n  - [ ] New subtask");

			// Add child raw note under Child (rowIndex = 1)
			await actions.addSourceBlockRow(taskId, 1, "child", "raw");
			expect(contents()).toBe("- [ ] Parent\n  - [ ] Child\n    - New note\n  - [ ] New subtask");
		});

		it("deletes a subtask and all of its descendants", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] A\n    - [ ] B\n  - [ ] C",
			);

			// Delete A (rowIndex = 1), which should also delete B (rowIndex = 2)
			await actions.deleteSourceBlockRow(taskId, 1);
			expect(contents()).toBe("- [ ] Parent\n  - [ ] C");
		});

		it("moves a subtask up/down and shifts indentation", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] A\n    - [ ] B\n  - [ ] C",
			);

			// Move C (rowIndex = 3) up, and shift indentation to targetDepth = 2 (become child of A/B)
			await actions.moveSourceBlockRow(taskId, 3, 2, "before", 2);
			expect(contents()).toBe("- [ ] Parent\n  - [ ] A\n    - [ ] C\n    - [ ] B");
		});

		it("restricts targetDepth to at least 1 to prevent escaping parent card", async () => {
			const { actions, taskId, contents } = await setupNestedActions(
				"- [ ] Parent\n  - [ ] A\n    - [ ] B\n  - [ ] C",
			);

			// Attempt to move C (rowIndex = 3) to targetDepth = 0 (clamped to 1, stays under Parent)
			await actions.moveSourceBlockRow(taskId, 3, 2, "before", 0);
			expect(contents()).toBe("- [ ] Parent\n  - [ ] A\n  - [ ] C\n    - [ ] B");
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

	describe("batched multi-task updates", () => {
		async function setupMultiFileTasks(files: Record<string, string>) {
			const fileContents = new Map(Object.entries(files));
			const tasksByTaskId = new Map<string, Task>();
			const metadataByTaskId = new Map<string, Metadata>();

			for (const path of Object.keys(files)) {
				await parseNestedFileIntoMaps({
					fileHandle: { path },
					fileContents,
					tasksByTaskId,
					metadataByTaskId,
				});
			}

			return { fileContents, tasksByTaskId, metadataByTaskId };
		}

		it("writes each file once when retagging tasks across files", async () => {
			const { fileContents, tasksByTaskId, metadataByTaskId } = await setupMultiFileTasks({
				"a.md": "- [ ] One #sprint-1\n- [ ] Two #sprint-1",
				"b.md": "- [ ] Three #sprint-1",
			});
			const { actions, writeCount } = setupActionsWithFileMap({
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
			});

			await actions.updateSwimlaneTag(
				Array.from(tasksByTaskId.keys()),
				"sprint-2",
				"sprint-",
				[],
			);

			expect(fileContents.get("a.md")).toBe("- [ ] One #sprint-2\n- [ ] Two #sprint-2");
			expect(fileContents.get("b.md")).toBe("- [ ] Three #sprint-2");
			expect(writeCount()).toBe(2);
		});

		it("writes once when updating a swimlane property for several tasks in one file", async () => {
			const { fileContents, tasksByTaskId, metadataByTaskId } = await setupMultiFileTasks({
				"a.md": "- [ ] One 📅 2026-06-01\n- [ ] Two 📅 2026-06-02",
			});
			const { actions, writeCount } = setupActionsWithFileMap({
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
				propertySchemaOption: PropertySchemaOption.TasksPlugin,
			});

			await actions.updateSwimlaneProperty(
				Array.from(tasksByTaskId.keys()),
				"due",
				new Date(Date.UTC(2026, 5, 15)),
			);

			expect(fileContents.get("a.md")).toBe(
				"- [ ] One 📅 2026-06-15\n- [ ] Two 📅 2026-06-15",
			);
			expect(writeCount()).toBe(1);
		});

		it("moves tasks to done in one write, adding completion dates only to open tasks", async () => {
			const { fileContents, tasksByTaskId, metadataByTaskId } = await setupMultiFileTasks({
				"a.md": "- [ ] One\n- [x] Two ✅ 2026-06-01",
			});
			const { actions, writeCount } = setupActionsWithFileMap({
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
				propertySchemaOption: PropertySchemaOption.TasksPlugin,
			});

			await actions.moveTasksToColumn(Array.from(tasksByTaskId.keys()), "done");

			expect(fileContents.get("a.md")).toBe(
				"- [x] One ✅ 2026-06-15\n- [x] Two ✅ 2026-06-01",
			);
			expect(writeCount()).toBe(1);
		});

		it("skips the write entirely when nothing changes", async () => {
			const { fileContents, tasksByTaskId, metadataByTaskId } = await setupMultiFileTasks({
				"a.md": "- [x] One\n- [x] Two",
			});
			const { actions, writeCount } = setupActionsWithFileMap({
				fileContents,
				tasksByTaskId,
				metadataByTaskId,
			});

			await actions.moveTasksToColumn(Array.from(tasksByTaskId.keys()), "done");

			expect(fileContents.get("a.md")).toBe("- [x] One\n- [x] Two");
			expect(writeCount()).toBe(0);
		});
	});

	describe("swimlane property updates", () => {
		it("rewrites only the due date when moving between Tasks-plugin date lanes", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice #today 📅 2026-06-01 ^abc123",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "due", new Date(Date.UTC(2026, 5, 15)));

			expect(contents()).toBe("- [ ] Send invoice #today 📅 2026-06-15 ^abc123");
		});

		it("adds the lane's due date to a task without one", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice ^abc123",
				PropertySchemaOption.Dataview,
				new DataviewSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "due", new Date(Date.UTC(2026, 5, 15)));

			expect(contents()).toBe("- [ ] Send invoice [due:: 2026-06-15] ^abc123");
		});

		it("removes the date when dropping into the unassigned lane", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice 📅 2026-06-01",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "due", null);

			expect(contents()).toBe("- [ ] Send invoice");
		});

		it("maps Tasks-plugin priority lane weights back to priority emojis", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice 🔼",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "priority", 4);

			expect(contents()).toBe("- [ ] Send invoice ⏫");
		});

		it("writes Dataview priority lane values as inline fields", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice [priority:: low]",
				PropertySchemaOption.Dataview,
				new DataviewSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "priority", "high");

			expect(contents()).toBe("- [ ] Send invoice [priority:: high]");
		});

		it("leaves tasks unchanged for non-writable property lanes", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice ➕ 2026-06-01",
				PropertySchemaOption.TasksPlugin,
				new TasksPluginSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "created", new Date(Date.UTC(2026, 5, 15)));

			expect(contents()).toBe("- [ ] Send invoice ➕ 2026-06-01");
		});

		it("does nothing when property schema is none", async () => {
			const { actions, taskId, contents } = setupActionsForLine(
				"- [ ] Send invoice",
				PropertySchemaOption.None,
				new NoneSchema(),
			);

			await actions.updateSwimlaneProperty([taskId], "due", new Date(Date.UTC(2026, 5, 15)));

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
	options: {
		statusMarkerOrder?: string;
		prepareFileContentsForWrite?: Parameters<typeof createTaskActions>[0]["prepareFileContentsForWrite"];
	} = {},
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
		prepareFileContentsForWrite: options.prepareFileContentsForWrite,
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
	propertySchemaOption = PropertySchemaOption.None,
}: {
	fileContents: Map<string, string>;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	statusMarkerOrder?: string;
	propertySchemaOption?: PropertySchemaOption;
}) {
	let writeCount = 0;
	const actions = createTaskActions({
		tasksByTaskId,
		metadataByTaskId: metadataByTaskId as never,
		vault: {
			read: async (file: { path: string }) => fileContents.get(file.path) ?? "",
			modify: async (file: { path: string }, nextContents: string) => {
				writeCount += 1;
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
		getPropertySchemaOption: () => propertySchemaOption,
		getStatusMarkerOrder: () => statusMarkerOrder,
		getCurrentDate: () => new Date(2026, 5, 15, 12),
		getManualOrder: () => ({}),
		setManualOrder: () => undefined,
	});

	return { actions, writeCount: () => writeCount };
}
