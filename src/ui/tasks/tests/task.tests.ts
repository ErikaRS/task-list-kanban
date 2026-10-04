import { describe, expect, it } from "vitest";
import { createColumnData, type ColumnTag } from "src/ui/columns/columns";
import { kebab } from "src/parsing/kebab/kebab";
import {
	createCancelledStatusMarkers,
	createDoneStatusMarkers,
	createIgnoredStatusMarkers,
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
	isTrackedTaskString,
	validateCancelledStatusMarkers,
	validateDoneStatusMarkers,
	validateIgnoredStatusMarkers,
	validateStatusMarkerOrder,
} from "../task";
import {
	createNameModeColumns,
	createPriorityModeColumns,
	createStatusModeColumns,
	createTagModeColumns,
	defaultPlacementTags,
	parseTask,
	parseTaskWithColumns,
} from "./task_test_helpers";
import { TasksPluginSchema } from "src/parsing/properties/tasks_schema";
import { DataviewSchema } from "src/parsing/properties/dataview_schema";
import { PropertySchemaOption } from "src/parsing/properties/property_schema";

describe("Task", () => {
	describe("basic parsing and serialization", () => {
		it.each(["-", "*", "+"])("parses a basic task string for %s list markers", (marker) => {
			const task = parseTask(`${marker} [ ] Something #tag`);
			expect(task.content).toBe("Something #tag");
			expect(task.tags.has("tag")).toBe(true);
		});

		it("parses a basic task string with a column", () => {
			const task = parseTask("- [ ] Something #tag #column");
			expect(task.content).toBe("Something #tag");
			expect(task.column).toBe("column");
		});

		it.each([
			["- [ ] Something #tag #column", false],
			["- [ ] Something #tag #column", true],
		])("serialises a basic task string with consolidateTags=%s", (taskString, consolidateTags) => {
			const task = parseTask(taskString, { consolidateTags });
			expect(task.serialise()).toBe(taskString);
		});

		it("parses a task string with a block link", () => {
			const task = parseTask("- [ ] Something #tag #column ^link-link");
			expect(task.content).toBe("Something #tag");
			expect(task.blockLink).toBe("link-link");
		});

		it("parses Tasks plugin properties from the raw line while preserving task content cleanup", () => {
			const taskString = "- [ ] Something #tag #column 📅 2024-01-20 ^link-link";
			const task = parseTask(taskString, { propertySchema: new TasksPluginSchema() });
			const due = task.properties.get("due");

			expect(task.content).toBe("Something #tag 📅 2024-01-20");
			expect(task.blockLink).toBe("link-link");
			expect(due?.value).toBeInstanceOf(Date);
			expect(due?.rawValue).toBe("📅 2024-01-20");
			expect(taskString.slice(due?.startIndex ?? -1, due?.endIndex ?? -1)).toBe("📅 2024-01-20");
		});

		it("parses Dataview properties from the raw line when tags are consolidated", () => {
			const taskString = "- [ ] Something #tag #column [priority:: high]";
			const task = parseTask(taskString, {
				consolidateTags: true,
				propertySchema: new DataviewSchema(),
			});
			const priority = task.properties.get("priority");

			expect(task.content).toBe("Something [priority:: high]");
			expect(task.tags.has("tag")).toBe(true);
			expect(priority?.value).toBe("high");
			expect(taskString.slice(priority?.startIndex ?? -1, priority?.endIndex ?? -1)).toBe("[priority:: high]");
		});

		it("serialises a basic task string with a block link", () => {
			const task = parseTask("- [ ] Something #column #tag ^link-link");
			expect(task.column).toBe("column");
			expect(task.serialise()).toBe("- [ ] Something #tag #column ^link-link");
		});

		it("replaces a regular tag in unconsolidated task content", () => {
			const task = parseTask("- [ ] Something #Project-Alpha #column");
			task.replaceTag("Project-Alpha", "Project-Beta");

			expect(task.tags.has("Project-Alpha")).toBe(false);
			expect(task.tags.has("Project-Beta")).toBe(true);
			expect(task.serialise()).toBe("- [ ] Something #Project-Beta #column");
		});

		it("serialises an added regular tag when task tags are not consolidated", () => {
			const task = parseTask("- [ ] Something #column");
			task.replaceTag(null, "Project-Beta");

			expect(task.serialise()).toBe("- [ ] Something #Project-Beta #column");
		});

		it("replaces a regular tag before punctuation without stripping nested tags", () => {
			const task = parseTask("- [ ] Something #Project-Alpha, see #Project-Alpha/child #column");
			task.replaceTag("Project-Alpha", "Project-Beta");

			expect(task.serialise()).toBe("- [ ] Something , see #Project-Alpha/child #Project-Beta #column");
		});

		it("replaces a consolidated tag without duplicating it in content", () => {
			const task = parseTask("- [ ] Something #Project-Alpha #column", { consolidateTags: true });
			task.replaceTag("Project-Alpha", "Project-Beta");

			expect(task.content).toBe("Something");
			expect(task.serialise()).toBe("- [ ] Something #Project-Beta #column");
		});
	});

	describe("status-mode columns", () => {
		const statusColumns = createStatusModeColumns([
			{ id: "todo", label: "Todo", matchStatus: " " },
			{ id: "doing", label: "Doing", matchStatus: "/" },
			{ id: "blocked", label: "Blocked", matchStatus: "!" },
		]);

		it("matches a status-mode column by checkbox marker", () => {
			const task = parseTaskWithColumns("- [/] Draft API plan #project", statusColumns);

			expect(task.column).toBe("doing");
			expect(task.content).toBe("Draft API plan #project");
			expect(task.serialise()).toBe("- [/] Draft API plan #project");
		});

		it("matches unchecked tasks with the space marker", () => {
			const task = parseTaskWithColumns("- [ ] Triage inbox #project", statusColumns);

			expect(task.column).toBe("todo");
			expect(task.serialise()).toBe("- [ ] Triage inbox #project");
		});

		it("keeps done status precedence over custom status columns", () => {
			const columns = createStatusModeColumns([{ id: "done-ish", label: "Done-ish", matchStatus: "x" }]);
			const task = parseTaskWithColumns("- [x] Completed #tag", columns);

			expect(task.done).toBe(true);
			expect(task.column).toBeUndefined();
		});
	});

	describe("Tasks Plugin priority-mode columns", () => {
		const priorityColumns = createPriorityModeColumns([
			{ id: "highest", label: "Highest", matchPriority: "highest" },
			{ id: "high", label: "High", matchPriority: "high" },
			{ id: "medium", label: "Medium", matchPriority: "medium" },
			{ id: "low", label: "Low", matchPriority: "low" },
			{ id: "lowest", label: "Lowest", matchPriority: "lowest" },
		]);

		it.each([
			["🔺", "highest"],
			["⏫", "high"],
			["🔼", "medium"],
			["🔽", "low"],
			["⏬", "lowest"],
		])("matches Tasks priority %s", (emoji, expectedColumn) => {
			const task = parseTaskWithColumns(`- [ ] Triage release ${emoji} #project`, priorityColumns, {
				propertySchema: new TasksPluginSchema(),
			});

			expect(task.column).toBe(expectedColumn);
			expect(task.serialise()).toBe(`- [ ] Triage release ${emoji} #project`);
		});

		it("matches a Tasks priority column while Dataview properties are active", () => {
			const columns = [
				...createPriorityModeColumns([{ id: "highest", label: "Highest", matchPriority: "highest" }]),
				...createNameModeColumns(["Later"]),
				...createTagModeColumns([{ id: "later-cat", label: "Later Cat", matchTags: ["later", "cat"] }]),
			];
			const task = parseTaskWithColumns("- [ ] Draft 🔺 #later #cat", columns, {
				propertySchema: new DataviewSchema(),
			});

			expect(task.column).toBe("highest");
			expect(task.content).toBe("Draft 🔺 #later #cat");
		});

		it("keeps priority available as parsed metadata when priority placed the task", () => {
			const task = parseTaskWithColumns("- [ ] Something ⏫", priorityColumns, {
				propertySchema: new TasksPluginSchema(),
			});

			expect(task.properties.get("priority")?.value).toBe(4);
		});
	});

	describe("Dataview priority-mode columns", () => {
		const dataviewPriorityColumns = createPriorityModeColumns([
			{ id: "high", label: "High", matchPriority: "high", matchPropertySchema: PropertySchemaOption.Dataview },
			{ id: "low", label: "Low", matchPriority: "low", matchPropertySchema: PropertySchemaOption.Dataview },
		]);

		it("matches Dataview priority values case-insensitively", () => {
			const task = parseTaskWithColumns("- [ ] Triage release [priority:: HIGH] #project", dataviewPriorityColumns, {
				propertySchema: new DataviewSchema(),
			});

			expect(task.column).toBe("high");
			expect(task.serialise()).toBe("- [ ] Triage release [priority:: HIGH] #project");
		});
	});

	describe("tag-mode columns", () => {
		const activeWorkColumns = createTagModeColumns([
			{ id: "active-work", label: "Active Work", matchTags: ["project/alpha", "status/active"] },
		]);
		const activeWorkPlacementTags = createColumnData(activeWorkColumns).columnPlacementTagTable;

		it("matches a tags-mode column by explicit tag", () => {
			const columns = createTagModeColumns([
				{ id: "doing", label: "Doing", matchTags: ["status/now"] },
			]);
			const task = parseTaskWithColumns("- [ ] Something #tag #status/now", columns);
			expect(task.column).toBe("doing");
			expect(task.content).toBe("Something #tag");
			expect(task.serialise()).toBe("- [ ] Something #tag #status/now");
		});

		it("matches a tags-mode column only when all explicit tags are present", () => {
			const task = parseTask("- [ ] Something #tag #project/alpha #status/active", {
				columns: activeWorkColumns,
				placementTags: activeWorkPlacementTags,
			});
			expect(task.column).toBe("active-work");
			expect(task.content).toBe("Something #tag");
			expect(task.tags.size).toBe(1);
			expect(task.tags.has("tag")).toBe(true);
		});

		it.each([
			["- [ ] Something #tag #project/alpha", "project/alpha"],
			["- [ ] Something #tag #active-work", "active-work"],
		])("treats partial tag-mode matches as uncategorized for %s", (taskString, retainedTag) => {
			const task = parseTask(taskString, {
				columns: activeWorkColumns,
				placementTags: activeWorkPlacementTags,
			});
			expect(task.column).toBeUndefined();
			expect(task.content).toContain(`#${retainedTag}`);
			expect(task.tags.has(retainedTag)).toBe(true);
			expect(task.serialise()).toBe(taskString);
		});

		it("prefers the most specific matching column when multiple columns match", () => {
			const columns = createTagModeColumns([
				{ id: "a", label: "A", matchTags: ["A"] },
				{ id: "ab", label: "A B", matchTags: ["A", "B"] },
				{ id: "abc", label: "A B C", matchTags: ["A", "B", "C"] },
			]);
			const task = parseTaskWithColumns("- [ ] Something #A #B #C #tag", columns);
			expect(task.column).toBe("abc");
			expect(task.content).toBe("Something #tag");
			expect(task.tags.has("A")).toBe(false);
			expect(task.tags.has("B")).toBe(false);
			expect(task.tags.has("C")).toBe(false);
		});

		it("uses column order to break ties between equally specific matches", () => {
			const columns = createTagModeColumns([
				{ id: "a", label: "A", matchTags: ["A", "B"] },
				{ id: "c", label: "C", matchTags: ["B", "C"] },
			]);
			const task = parseTaskWithColumns("- [ ] Something #A #B #C #tag", columns);
			expect(task.column).toBe("a");
			expect(task.content).toBe("Something #C #tag");
			expect(task.tags.has("C")).toBe(true);
			expect(task.tags.has("A")).toBe(false);
			expect(task.tags.has("B")).toBe(false);
		});
	});

	describe("indented tasks", () => {
		it("parses mixed space and tab indentation", () => {
			const task = parseTask(" \t - [ ] Mixed spaces and tabs #tag");
			expect(task.indentation).toBe(" \t ");
			expect(task.content).toBe("Mixed spaces and tabs #tag");
		});

		it("serialises an indented task string unchanged", () => {
			const taskString = "\t  \t- [ ] Tab space tab #tag #column";
			expect(parseTask(taskString).serialise()).toBe(taskString);
		});
	});

	describe("customizable done status markers", () => {
		it.each([
			["- [✓] Custom done marker #tag", "xX✓", true],
			["- [✓] Custom done marker #tag", DEFAULT_DONE_STATUS_MARKERS, false],
			["- [🚀] Surrogate-pair emoji #tag", "xX🚀", true],
			["- [abc] Task with multi-char status #tag", "xX", false],
			["- [X] Uppercase done marker #tag", "x", false],
			["- [x] Lowercase done marker #tag", "x", true],
		])("parses done state for %s with markers %s", (taskString, doneStatusMarkers, expectedDone) => {
			const task = parseTask(taskString, { doneStatusMarkers });
			expect(task.done).toBe(expectedDone);
			expect(task.content).toContain("#tag");
		});
	});

	describe("obsidian links", () => {
		it.each([
			"- [[x]] some content",
			"- [x](foo)",
		])("does not identify %s as a task", (input) => {
			expect(isTrackedTaskString(input)).toBe(false);
		});
	});
});

describe("Ignored Status Markers", () => {
	describe("isTrackedTaskString with ignored status markers", () => {
		it.each([
			["- [-] Task with dash status #tag", undefined, true],
			["- [❌] Cancelled with emoji #tag", "❌", false],
			["- [~] Custom ignored task #tag", "-~", false],
		])("tracks ignored markers for %s", (taskString, ignoredStatusMarkers, expected) => {
			expect(isTrackedTaskString(taskString, ignoredStatusMarkers)).toBe(expected);
		});
	});
});

// The done, cancelled and ignored validators share validateStatusMarkers and
// differ only in their label and whether an empty string is allowed.
describe("Status marker validation", () => {
	describe("shared marker rules", () => {
		it.each(["xX", "✓🚀é"])("accepts valid marker strings for %s", (markers) => {
			expect(validateDoneStatusMarkers(markers)).toEqual([]);
		});

		it.each([
			["x X", "Marker at position 2 is whitespace"],
			["x\u0001X", "Marker at position 2 is a control character"],
			["xXx", "Duplicate marker 'x' at position 3"],
		])("rejects invalid markers for %s", (markers, message) => {
			expect(validateDoneStatusMarkers(markers)).toContain(message);
		});

		it("accumulates multiple errors", () => {
			const errors = validateDoneStatusMarkers("x x\tx");
			expect(errors.length).toBe(5);
			expect(errors).toContain("Marker at position 2 is whitespace");
			expect(errors).toContain("Duplicate marker 'x' at position 3");
		});
	});

	it.each([
		["done", validateDoneStatusMarkers, ["Done status markers cannot be empty"]],
		["cancelled", validateCancelledStatusMarkers, ["Cancelled status markers cannot be empty"]],
		["ignored", validateIgnoredStatusMarkers, []],
	])("handles empty %s markers", (_kind, validate, expected) => {
		expect(validate("")).toEqual(expected);
	});

	it("returns valid markers from the create functions", () => {
		expect(createDoneStatusMarkers("xX✓")).toBe("xX✓");
		expect(createCancelledStatusMarkers("cx✓")).toBe("cx✓");
		expect(createIgnoredStatusMarkers("")).toBe("");
	});

	it.each([
		["done", () => createDoneStatusMarkers(""), "Invalid done status markers: Done status markers cannot be empty"],
		["cancelled", () => createCancelledStatusMarkers("c c"), "Invalid cancelled status markers: Marker at position 2 is whitespace"],
		["ignored", () => createIgnoredStatusMarkers("- "), "Invalid ignored status markers: Marker at position 2 is whitespace"],
	])("throws a labelled error for invalid %s markers", (_kind, create, message) => {
		expect(create).toThrow(message);
	});

	it.each([
		["done", DEFAULT_DONE_STATUS_MARKERS, "xX", validateDoneStatusMarkers],
		["cancelled", DEFAULT_CANCELLED_STATUS_MARKERS, "-", validateCancelledStatusMarkers],
		["ignored", DEFAULT_IGNORED_STATUS_MARKERS, "", validateIgnoredStatusMarkers],
	])("defaults %s markers to a valid value", (_kind, markers, expected, validate) => {
		expect(markers).toBe(expected);
		expect(validate(markers)).toEqual([]);
	});
});

describe("Status Marker Order Validation", () => {
	it.each(["", " /x"])("accepts valid order strings for %s", (markers) => {
		expect(validateStatusMarkerOrder(markers)).toEqual([]);
	});

	it("rejects duplicate markers", () => {
		expect(validateStatusMarkerOrder("/x/")).toContain("Duplicate marker '/' at position 3");
	});

	it("rejects whitespace other than the blank status marker", () => {
		expect(validateStatusMarkerOrder("/\tx")).toContain("Marker at position 2 is whitespace");
	});
});

describe("Task archiving", () => {
	it("exposes no archive status marker in #archived tag mode", () => {
		expect(parseTask("- [ ] Task #column").archiveStatusMarker).toBeUndefined();
	});

	it("exposes the first archive status marker in archive-status mode", () => {
		const task = parseTask("- [ ] Task #column", {
			replaceArchiveTagWithStatus: true,
			archiveStatusMarkers: "dD",
		});
		expect(task.archiveStatusMarker).toBe("d");
	});

	it("ignores legacy archive tags when archive statuses replace them", () => {
		expect(isTrackedTaskString("- [ ] Legacy #archived", "", true, "d")).toBe(true);
		expect(isTrackedTaskString("- [d] Archive status #archived", "", true, "d")).toBe(false);
		expect(isTrackedTaskString("- [D] Second archive status", "", true, "dD")).toBe(false);
	});
});

describe("Done tasks keep their tags", () => {
	it("treats a done task's column tag as an ordinary tag", () => {
		const task = parseTask("- [x] Shipped #column #note");

		expect(task.done).toBe(true);
		expect(task.column).toBeUndefined();
		expect(task.taggedColumn).toBe("column");
		expect(task.tags.has("column")).toBe(true);
		expect(task.content).toBe("Shipped #column #note");
	});

	it("keeps a done task's column tag when the task is rewritten", () => {
		const task = parseTask("- [x] Shipped #column #note ^link");
		task.content = "Shipped again #column #note";

		expect(task.serialise()).toBe("- [x] Shipped again #column #note ^link");
	});

	it("keeps a done task's column tag with consolidated tags", () => {
		const task = parseTask("- [x] Shipped #column #note", { consolidateTags: true });

		expect(task.content).toBe("Shipped");
		expect(task.serialise()).toBe("- [x] Shipped #column #note");
	});

	it("keeps a done task's #done tag", () => {
		expect(parseTask("- [x] Shipped #done").serialise()).toBe("- [x] Shipped #done");
	});

	it("exposes the tagged column of an open task too", () => {
		expect(parseTask("- [ ] Open #column").taggedColumn).toBe("column");
		expect(parseTask("- [ ] Open").taggedColumn).toBeUndefined();
	});

	it("does not report a status or priority column as tagged", () => {
		const task = parseTaskWithColumns(
			"- [/] Draft #note",
			createStatusModeColumns([{ id: "doing", label: "Doing", matchStatus: "/" }]),
		);
		expect(task.column).toBe("doing");
		expect(task.taggedColumn).toBeUndefined();
	});
});

describe("Task next status", () => {
	it("completes an open task without a status order", () => {
		expect(parseTask("- [ ] Task #column").nextStatus("")).toEqual({ status: "x", done: true });
	});

	it("advances through the status order before completing", () => {
		expect(parseTask("- [ ] Task #column").nextStatus(" /x")).toEqual({ status: "/", done: false });
		expect(parseTask("- [/] Task #column").nextStatus(" /x")).toEqual({ status: "x", done: true });
	});

	it("reopens a done task", () => {
		expect(parseTask("- [x] Task #column").nextStatus(" /x")).toEqual({ status: " ", done: false });
	});
});

describe("Task display status", () => {
	it("exposes default unchecked status as a space", () => {
		expect(parseTask("- [ ] Incomplete task #column").displayStatus).toBe(" ");
	});

	it("preserves parsed custom status marker", () => {
		expect(parseTask("- [/] In progress task #column").displayStatus).toBe("/");
	});
});

describe("Task cancelling", () => {
	it("exposes the first configured cancel marker", () => {
		expect(parseTask("- [ ] Task #column", { cancelledStatusMarkers: "CA" }).cancelledStatusMarker).toBe("C");
	});

	it.each([
		["- [c] Cancelled task #column", "c"],
		["- [A] Parsed as cancelled #column", "CA"],
	])("returns true for isCancelled with custom markers for %s", (taskString, cancelledStatusMarkers) => {
		expect(parseTask(taskString, { cancelledStatusMarkers }).isCancelled).toBe(true);
	});
});

describe("Columns with spaces and special characters", () => {
	const specialColumns = createNameModeColumns(["In Progress", "Waiting for review", "Done!", "My-Tag"]);
	const specialPlacementTags = createColumnData(specialColumns).columnPlacementTagTable;

	it.each([
		["- [ ] Something #waiting-for-review", "waiting-for-review"],
	])("serialises name-mode columns using kebab-case tags for %s", (taskString, column) => {
		const task = parseTask(taskString, {
			columns: specialColumns,
			placementTags: specialPlacementTags,
		});
		expect(task.column).toBe(column);
		expect(task.serialise()).toBe(taskString);
	});

	it("serialises a task in 'Done!' column using the derived done tag", () => {
		const task = parseTask("- [ ] Something #done", {
			columns: specialColumns,
			placementTags: specialPlacementTags,
		});
		expect(task.serialise()).toBe("- [ ] Something #done");
	});
});
