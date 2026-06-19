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
			const task = parseTask("- [ ] Something #tag ^link-link");
			task.column = "column" as ColumnTag;
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

		it("uses column order to break equal-specificity status and tag ties", () => {
			const columns = [
				...createTagModeColumns([{ id: "this-week", label: "This Week", matchTags: ["this-week"] }]),
				...createStatusModeColumns([{ id: "doing", label: "Doing", matchStatus: "/" }]),
			];
			const task = parseTaskWithColumns("- [/] Draft #this-week #project", columns);

			expect(task.column).toBe("this-week");
			expect(task.content).toBe("Draft #project");
		});

		it("prefers a multi-tag column over a status column", () => {
			const columns = [
				...createStatusModeColumns([{ id: "doing", label: "Doing", matchStatus: "/" }]),
				...createTagModeColumns([
					{ id: "active-work", label: "Active Work", matchTags: ["project/alpha", "this-week"] },
				]),
			];
			const task = parseTaskWithColumns("- [/] Draft #project/alpha #this-week #note", columns);

			expect(task.column).toBe("active-work");
			expect(task.content).toBe("Draft #note");
		});

		it("writes the destination marker when moving into a status column", () => {
			const columns = [
				...createNameModeColumns(["Backlog"]),
				...createStatusModeColumns([{ id: "doing", label: "Doing", matchStatus: "/" }]),
			];
			const task = parseTaskWithColumns("- [ ] Something #tag #backlog", columns);

			task.column = "doing" as ColumnTag;

			expect(task.serialise()).toBe("- [/] Something #tag");
		});

		it("clears the source marker when moving out of a status column", () => {
			const columns = [
				...createStatusModeColumns([{ id: "doing", label: "Doing", matchStatus: "/" }]),
				...createNameModeColumns(["Backlog"]),
			];
			const task = parseTaskWithColumns("- [/] Something #tag", columns);

			task.column = "backlog" as ColumnTag;

			expect(task.serialise()).toBe("- [ ] Something #tag #backlog");
		});

		it("replaces the marker when moving between status columns", () => {
			const task = parseTaskWithColumns("- [/] Something #tag", statusColumns);

			task.column = "blocked" as ColumnTag;

			expect(task.serialise()).toBe("- [!] Something #tag");
		});

		it("preserves unrelated custom status markers when moving between tag columns", () => {
			const columns = createNameModeColumns(["Backlog", "Next"]);
			const task = parseTaskWithColumns("- [?] Something #tag #backlog", columns);

			task.column = "next" as ColumnTag;

			expect(task.serialise()).toBe("- [?] Something #tag #next");
		});

		it("preserves unrelated custom status markers when moving to uncategorised", () => {
			const columns = createNameModeColumns(["Backlog"]);
			const task = parseTaskWithColumns("- [?] Something #tag #backlog", columns);

			expect(task.serialiseForColumn("uncategorised")).toBe("- [?] Something #tag");
		});

		it("clears status placement when moving from a status column to uncategorised", () => {
			const task = parseTaskWithColumns("- [/] Something #tag", statusColumns);

			expect(task.serialiseForColumn("uncategorised")).toBe("- [ ] Something #tag");
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

		it("writes the destination priority when moving into a priority column", () => {
			const columns = [
				...createNameModeColumns(["Backlog"]),
				...createPriorityModeColumns([{ id: "high", label: "High", matchPriority: "high" }]),
			];
			const task = parseTaskWithColumns("- [ ] Something #tag #backlog", columns, {
				propertySchema: new TasksPluginSchema(),
			});

			task.column = "high" as ColumnTag;

			expect(task.serialise()).toBe("- [ ] Something #tag ⏫");
		});

		it("replaces the priority when moving between priority columns", () => {
			const task = parseTaskWithColumns("- [ ] Something #tag ⏫", priorityColumns, {
				propertySchema: new TasksPluginSchema(),
			});

			task.column = "low" as ColumnTag;

			expect(task.serialise()).toBe("- [ ] Something #tag 🔽");
		});

		it("removes source priority when moving from a priority column to a tag column", () => {
			const columns = [
				...createPriorityModeColumns([{ id: "high", label: "High", matchPriority: "high" }]),
				...createNameModeColumns(["Backlog"]),
			];
			const task = parseTaskWithColumns("- [ ] Something #tag ⏫", columns, {
				propertySchema: new TasksPluginSchema(),
			});

			task.column = "backlog" as ColumnTag;

			expect(task.serialise()).toBe("- [ ] Something #tag #backlog");
		});

		it("preserves unrelated priority when moving between tag columns", () => {
			const columns = createNameModeColumns(["Backlog", "Next"]);
			const task = parseTaskWithColumns("- [ ] Something #tag ⏫ #backlog", columns, {
				propertySchema: new TasksPluginSchema(),
			});

			task.column = "next" as ColumnTag;

			expect(task.serialise()).toBe("- [ ] Something #tag ⏫ #next");
		});

		it("uses column order to break equal-specificity priority and tag ties", () => {
			const columns = [
				...createTagModeColumns([{ id: "this-week", label: "This Week", matchTags: ["this-week"] }]),
				...createPriorityModeColumns([{ id: "high", label: "High", matchPriority: "high" }]),
			];
			const task = parseTaskWithColumns("- [ ] Draft #this-week ⏫ #project", columns, {
				propertySchema: new TasksPluginSchema(),
			});

			expect(task.column).toBe("this-week");
			expect(task.content).toBe("Draft ⏫ #project");
		});

		it("prefers a multi-tag column over a priority column", () => {
			const columns = [
				...createPriorityModeColumns([{ id: "high", label: "High", matchPriority: "high" }]),
				...createTagModeColumns([
					{ id: "active-work", label: "Active Work", matchTags: ["project/alpha", "this-week"] },
				]),
			];
			const task = parseTaskWithColumns("- [ ] Draft ⏫ #project/alpha #this-week #note", columns, {
				propertySchema: new TasksPluginSchema(),
			});

			expect(task.column).toBe("active-work");
			expect(task.content).toBe("Draft ⏫ #note");
		});

		it("keeps priority available as parsed metadata when priority placed the task", () => {
			const task = parseTaskWithColumns("- [ ] Something ⏫", priorityColumns, {
				propertySchema: new TasksPluginSchema(),
			});

			expect(task.properties.get("priority")?.value).toBe(4);
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
			["- [ ] Something #tag #status/active", "status/active"],
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

		it("writes all placement tags for a tags-mode column", () => {
			const task = parseTask("- [ ] Something #tag", {
				columns: activeWorkColumns,
				placementTags: activeWorkPlacementTags,
			});
			task.column = "active-work" as ColumnTag;
			expect(task.serialise()).toBe("- [ ] Something #tag #project/alpha #status/active");
		});

		it("removes all placement tags when moving out of a multi-tag column", () => {
			const columns = [
				...activeWorkColumns,
				...createNameModeColumns(["Backlog"]),
			];
			const task = parseTaskWithColumns("- [ ] Something #tag #project/alpha #status/active", columns);
			task.column = "backlog" as ColumnTag;
			expect(task.serialise()).toBe("- [ ] Something #tag #backlog");
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

		it("matches a multi-tag column regardless of tag order in task content", () => {
			const orderedTask = parseTask("- [ ] Ordered #project/alpha #status/active", {
				columns: activeWorkColumns,
				placementTags: activeWorkPlacementTags,
			});
			const reversedTask = parseTask("- [ ] Reversed #status/active #project/alpha", {
				columns: activeWorkColumns,
				placementTags: activeWorkPlacementTags,
				rowIndex: 1,
			});
			expect(orderedTask.column).toBe("active-work");
			expect(reversedTask.column).toBe("active-work");
		});

		it("archives a multi-tag column by removing all placement tags and adding archived", () => {
			const task = parseTask("- [ ] Something #tag #project/alpha #status/active", {
				columns: activeWorkColumns,
				placementTags: activeWorkPlacementTags,
			});
			task.archive();
			expect(task.serialise()).toBe("- [x] Something #tag #archived");
		});

		it("does not duplicate an explicit placement tag already present in task content", () => {
			const doingPlacementTags = {
				...defaultPlacementTags,
				doing: ["status/now"],
			};
			const task = parseTask("- [ ] Something #tag #status/now", {
				placementTags: doingPlacementTags,
			});
			task.column = "doing" as ColumnTag;
			expect(task.serialise()).toBe("- [ ] Something #tag #status/now");
		});
	});

	describe("indented tasks", () => {
		it.each([
			["  - [ ] Indented with 2 spaces #tag", "  ", "Indented with 2 spaces #tag", false, undefined],
			["\t- [ ] Indented with tab #tag", "\t", "Indented with tab #tag", false, undefined],
			[" \t - [ ] Mixed spaces and tabs #tag", " \t ", "Mixed spaces and tabs #tag", false, undefined],
			["  - [x] Completed indented task #tag", "  ", "Completed indented task #tag", true, undefined],
			["\t- [ ] Indented with block link #tag ^block123", "\t", "Indented with block link #tag", false, "block123"],
		])("parses indentation details for %s", (taskString, indentation, content, done, blockLink) => {
			const task = parseTask(taskString);
			expect(task.indentation).toBe(indentation);
			expect(task.content).toBe(content);
			expect(task.done).toBe(done);
			expect(task.blockLink).toBe(blockLink);
		});

		it.each([
			"    - [ ] Four spaces #tag #column",
			"\t\t- [ ] Two tabs #tag #column",
			"\t  \t- [ ] Tab space tab #tag #column",
		])("serialises indented task strings unchanged for %s", (taskString) => {
			expect(parseTask(taskString).serialise()).toBe(taskString);
		});
	});

	describe("customizable done status markers", () => {
		it.each([
			["- [✓] Custom done marker #tag", "xX✓", true],
			["- [✓] Custom done marker #tag", DEFAULT_DONE_STATUS_MARKERS, false],
			["- [👍] Multi-codepoint emoji #tag", "xX👍", true],
			["- [✅] Task with checkmark #tag", "xX✅", true],
			["- [abc] Task with multi-char status #tag", "xX", false],
			["- [  ] Task with spaces #tag", "xX", false],
			["- [\t] Task with tab #tag", "xX", false],
			["- [z] Task with unknown char #tag", "xX", false],
			["- [1] Task with number #tag", "xX", false],
			["- [X] Uppercase done marker #tag", "x", false],
			["- [x] Lowercase done marker #tag", "x", true],
			["- [*] Asterisk done marker #tag", "xX*", true],
			["- [+] Plus done marker #tag", "xX+", true],
			["- [?] Question mark done marker #tag", "xX?", true],
			["- [.] Dot done marker #tag", "xX.", true],
			["- [\\] Backslash done marker #tag", "xX\\", true],
			["- [é] Combining accent #tag", "xXé", true],
			["- [\u200B] Zero-width space #tag", "xX\u200B", true],
			["- [🚀] Rocket emoji #tag", "xX🚀", true],
		])("parses done state for %s with markers %s", (taskString, doneStatusMarkers, expectedDone) => {
			const task = parseTask(taskString, { doneStatusMarkers });
			expect(task.done).toBe(expectedDone);
			expect(task.content).toContain("#tag");
		});
	});

	describe("obsidian links", () => {
		it.each([
			"- [[x]]",
			"- [[x]] some content",
			"  - [[x]]",
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
			["- [~] Custom ignored task #tag", "~", false],
			["- [-] Cancelled task #tag", "-", false],
			["- [ ] Regular task #tag", undefined, true],
			["- [x] Done task #tag", undefined, true],
			["  - [-] Indented cancelled task #tag", "-", false],
			["- [❌] Cancelled with emoji #tag", "❌", false],
		])("tracks ignored markers for %s", (taskString, ignoredStatusMarkers, expected) => {
			expect(isTrackedTaskString(taskString, ignoredStatusMarkers)).toBe(expected);
		});

		it("excludes tasks with multiple ignored statuses", () => {
			expect(isTrackedTaskString("- [-] Cancelled with dash #tag", "-~")).toBe(false);
			expect(isTrackedTaskString("- [~] Cancelled with tilde #tag", "-~")).toBe(false);
		});
	});
});

describe("Ignored Status Markers Validation", () => {
	describe("validateIgnoredStatusMarkers", () => {
		it.each(["-~", "❌🚫", "-", "~"])("accepts valid marker strings for %s", (markers) => {
			expect(validateIgnoredStatusMarkers(markers)).toEqual([]);
		});

		it("accepts empty strings (no ignored statuses)", () => {
			expect(validateIgnoredStatusMarkers("")).toEqual([]);
		});

		it.each([
			["- ", "Marker at position 2 is whitespace"],
			["--", "Duplicate marker '-' at position 2"],
		])("rejects invalid ignored markers for %s", (markers, message) => {
			expect(validateIgnoredStatusMarkers(markers)).toContain(message);
		});
	});

	describe("createIgnoredStatusMarkers", () => {
		it.each(["-~", ""])("creates ignored markers for %s", (markers) => {
			expect(createIgnoredStatusMarkers(markers)).toBe(markers);
		});

		it("throws with detailed error messages for invalid characters", () => {
			expect(() => createIgnoredStatusMarkers("- ")).toThrow(
				"Invalid ignored status markers: Marker at position 2 is whitespace",
			);
		});
	});

	describe("DEFAULT_IGNORED_STATUS_MARKERS", () => {
		it("is valid according to validation rules", () => {
			expect(validateIgnoredStatusMarkers(DEFAULT_IGNORED_STATUS_MARKERS)).toEqual([]);
		});

		it("is empty by default (no tasks ignored)", () => {
			expect(DEFAULT_IGNORED_STATUS_MARKERS).toBe("");
		});

		it("can be used to create validated markers", () => {
			expect(() => createIgnoredStatusMarkers(DEFAULT_IGNORED_STATUS_MARKERS)).not.toThrow();
		});
	});
});

describe("Done Status Markers Validation", () => {
	describe("validateDoneStatusMarkers", () => {
		it.each(["xX", "✓✅👍", "x", "*+?", "🚀👍✅", "éñü"])("accepts valid marker strings for %s", (markers) => {
			expect(validateDoneStatusMarkers(markers)).toEqual([]);
		});

		it("rejects empty strings", () => {
			expect(validateDoneStatusMarkers("")).toEqual(["Done status markers cannot be empty"]);
			expect(validateDoneStatusMarkers("   ")).not.toEqual([]);
		});

		it.each([
			["x X", "Marker at position 2 is whitespace"],
			["x\nX", "Marker at position 2 is whitespace"],
			["x\tX", "Marker at position 2 is whitespace"],
			["x\u0001X", "Marker at position 2 is a control character"],
			["xXx", "Duplicate marker 'x' at position 3"],
		])("rejects invalid done markers for %s", (markers, message) => {
			expect(validateDoneStatusMarkers(markers)).toContain(message);
		});

		it("accumulates multiple errors", () => {
			const errors = validateDoneStatusMarkers("x x\tx");
			expect(errors.length).toBe(5);
			expect(errors).toContain("Marker at position 2 is whitespace");
			expect(errors).toContain("Duplicate marker 'x' at position 3");
		});
	});

	describe("createDoneStatusMarkers", () => {
		it("creates valid markers successfully", () => {
			expect(createDoneStatusMarkers("xX✓")).toBe("xX✓");
		});

		it("throws for invalid markers", () => {
			expect(() => createDoneStatusMarkers("")).toThrow(
				"Invalid done status markers: Done status markers cannot be empty",
			);
		});

		it("throws with detailed error messages", () => {
			expect(() => createDoneStatusMarkers("x x")).toThrow(
				"Invalid done status markers: Marker at position 2 is whitespace",
			);
		});

		it("throws with multiple error messages", () => {
			expect(() => createDoneStatusMarkers("x xx")).toThrow(/Multiple|whitespace|Duplicate/);
		});
	});

	describe("DEFAULT_DONE_STATUS_MARKERS", () => {
		it("is valid according to validation rules", () => {
			expect(validateDoneStatusMarkers(DEFAULT_DONE_STATUS_MARKERS)).toEqual([]);
		});

		it("contains expected default characters", () => {
			expect(DEFAULT_DONE_STATUS_MARKERS).toBe("xX");
		});

		it("can be used to create validated markers", () => {
			expect(() => createDoneStatusMarkers(DEFAULT_DONE_STATUS_MARKERS)).not.toThrow();
		});
	});
});

describe("Cancelled Status Markers Validation", () => {
	describe("validateCancelledStatusMarkers", () => {
		it.each(["-", "CX", "c", "*+?", "🚀👍✅", "éñü"])("accepts valid marker strings for %s", (markers) => {
			expect(validateCancelledStatusMarkers(markers)).toEqual([]);
		});

		it("rejects empty strings", () => {
			expect(validateCancelledStatusMarkers("")).toEqual(["Cancelled status markers cannot be empty"]);
			expect(validateCancelledStatusMarkers("   ")).not.toEqual([]);
		});

		it.each([
			["c C", "Marker at position 2 is whitespace"],
			["c\nC", "Marker at position 2 is whitespace"],
			["c\tC", "Marker at position 2 is whitespace"],
			["c\u0001C", "Marker at position 2 is a control character"],
			["cCc", "Duplicate marker 'c' at position 3"],
		])("rejects invalid cancelled markers for %s", (markers, message) => {
			expect(validateCancelledStatusMarkers(markers)).toContain(message);
		});

		it("accumulates multiple errors", () => {
			const errors = validateCancelledStatusMarkers("c c\tc");
			expect(errors.length).toBe(5);
			expect(errors).toContain("Marker at position 2 is whitespace");
			expect(errors).toContain("Duplicate marker 'c' at position 3");
		});
	});

	describe("createCancelledStatusMarkers", () => {
		it("creates valid markers successfully", () => {
			expect(createCancelledStatusMarkers("cx✓")).toBe("cx✓");
		});

		it("throws for invalid markers", () => {
			expect(() => createCancelledStatusMarkers("")).toThrow(
				"Invalid cancelled status markers: Cancelled status markers cannot be empty",
			);
		});

		it("throws with detailed error messages", () => {
			expect(() => createCancelledStatusMarkers("c c")).toThrow(
				"Invalid cancelled status markers: Marker at position 2 is whitespace",
			);
		});

		it("throws with multiple error messages", () => {
			expect(() => createCancelledStatusMarkers("c cc")).toThrow(/Multiple|whitespace|Duplicate/);
		});
	});

	describe("DEFAULT_CANCELLED_STATUS_MARKERS", () => {
		it("is valid according to validation rules", () => {
			expect(validateCancelledStatusMarkers(DEFAULT_CANCELLED_STATUS_MARKERS)).toEqual([]);
		});

		it("contains expected default characters", () => {
			expect(DEFAULT_CANCELLED_STATUS_MARKERS).toBe("-");
		});

		it("can be used to create validated markers", () => {
			expect(() => createCancelledStatusMarkers(DEFAULT_CANCELLED_STATUS_MARKERS)).not.toThrow();
		});
	});
});

describe("Status Marker Order Validation", () => {
	it.each(["", " /x", "/ x", "🚀 x"])("accepts valid order strings for %s", (markers) => {
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
	it.each([
		["- [X] Already done task #column", "xX", "- [X] Already done task #archived"],
		["- [x] Already done task #column", "xX", "- [x] Already done task #archived"],
		["- [✓] Custom done marker task #column", "xX✓", "- [✓] Custom done marker task #archived"],
		["- [✅] Emoji done marker task #column", "xX✅", "- [✅] Emoji done marker task #archived"],
		["- [ ] Incomplete task #column", "xX", "- [x] Incomplete task #archived"],
		["- [?] Unknown status task #column", "xX", "- [x] Unknown status task #archived"],
	])("archives %s using expected display status", (taskString, doneStatusMarkers, expected) => {
		const task = parseTask(taskString, { doneStatusMarkers });
		task.archive();
		expect(task.done).toBe(true);
		expect(task.column).toBe("archived");
		expect(task.serialise()).toBe(expected);
	});
});

describe("Task marking as done", () => {
	it.each([
		["xX", "- [x] Incomplete task"],
		["✓✅", "- [✓] Incomplete task"],
		["✅", "- [✅] Incomplete task"],
	])("uses the first configured done marker for %s", (doneStatusMarkers, expected) => {
		const task = parseTask("- [ ] Incomplete task #column", { doneStatusMarkers });
		task.done = true;
		expect(task.done).toBe(true);
		expect(task.column).toBeUndefined();
		expect(task.serialise()).toBe(expected);
	});

	it("clears column when marking as done", () => {
		const task = parseTask("- [ ] Task in column #column");
		task.done = true;
		expect(task.column).toBeUndefined();
		expect(task.serialise()).not.toContain("#column");
	});

	it("preserves task content when marking as done", () => {
		const task = parseTask("- [ ] Important task with #tags #column");
		task.done = true;
		expect(task.content).toBe("Important task with #tags");
		expect(task.serialise()).toBe("- [x] Important task with #tags");
	});
});

describe("Task serialiseForColumn", () => {
	it("serialises a task for a destination column without mutating the task", () => {
		const task = parseTask("- [ ] Task in column #column");

		expect(task.serialiseForColumn("next" as ColumnTag)).toBe("- [ ] Task in column #next");
		expect(task.column).toBe("column");
		expect(task.done).toBe(false);
		expect(task.serialise()).toBe("- [ ] Task in column #column");
	});

	it("serialises a task for uncategorised by removing placement tags", () => {
		const task = parseTask("- [ ] Task in column #column");

		expect(task.serialiseForColumn("uncategorised")).toBe("- [ ] Task in column");
		expect(task.column).toBe("column");
		expect(task.serialise()).toBe("- [ ] Task in column #column");
	});

	it("serialises a task for done without mutating the task", () => {
		const task = parseTask("- [ ] Task in column #column");

		expect(task.serialiseForColumn("done")).toBe("- [x] Task in column");
		expect(task.column).toBe("column");
		expect(task.done).toBe(false);
		expect(task.displayStatus).toBe(" ");
	});
});

describe("Task display status", () => {
	it("exposes default unchecked status as a space", () => {
		expect(parseTask("- [ ] Incomplete task #column").displayStatus).toBe(" ");
	});

	it("preserves parsed custom status marker", () => {
		expect(parseTask("- [/] In progress task #column").displayStatus).toBe("/");
	});

	it("updates to first done marker when marked done", () => {
		const task = parseTask("- [ ] Incomplete task #column", { doneStatusMarkers: "✓✅" });
		task.done = true;
		expect(task.displayStatus).toBe("✓");
	});

	it("updates to cancel marker and then resets on restore", () => {
		const task = parseTask("- [ ] Incomplete task #column", { cancelledStatusMarkers: "CA" });
		task.cancel();
		expect(task.displayStatus).toBe("C");
		task.restore();
		expect(task.displayStatus).toBe(" ");
	});
});

describe("Task cancelling", () => {
	it("cancelling a task updates the status to '-'", () => {
		const task = parseTask("- [ ] Incomplete task #column");
		task.cancel();
		expect(task.isCancelled).toBe(true);
		expect(task.serialise()).toBe("- [-] Incomplete task #column");
	});

	it("restoring a task updates the status to ' '", () => {
		const task = parseTask("- [-] Cancelled task #column");
		task.restore();
		expect(task.isCancelled).toBe(false);
		expect(task.serialise()).toBe("- [ ] Cancelled task #column");
	});

	it.each([
		["- [c] Cancelled task #column", "c"],
		["- [A] Parsed as cancelled #column", "CA"],
	])("returns true for isCancelled with custom markers for %s", (taskString, cancelledStatusMarkers) => {
		expect(parseTask(taskString, { cancelledStatusMarkers }).isCancelled).toBe(true);
	});

	it("outputs first configured cancel marker on cancel()", () => {
		const task = parseTask("- [ ] Incomplete task #column", { cancelledStatusMarkers: "CA" });
		task.cancel();
		expect(task.isCancelled).toBe(true);
		expect(task.serialise()).toBe("- [C] Incomplete task #column");
	});
});

describe("Columns with spaces and special characters", () => {
	const specialColumns = createNameModeColumns(["In Progress", "Waiting for review", "Done!", "My-Tag"]);
	const specialPlacementTags = createColumnData(specialColumns).columnPlacementTagTable;

	it.each([
		["- [ ] Something #in-progress", "in-progress"],
		["- [ ] Something #waiting-for-review", "waiting-for-review"],
		["- [ ] Something #my-tag", "my-tag"],
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

	it("serialises a task after moving to 'In Progress' column", () => {
		const task = parseTask("- [ ] Something", {
			columns: specialColumns,
			placementTags: specialPlacementTags,
		});
		task.column = kebab<ColumnTag>("In Progress");
		expect(task.serialise()).toBe("- [ ] Something #in-progress");
	});
});
