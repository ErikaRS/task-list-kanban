import { describe, expect, it } from "vitest";
import { PropertySchemaOption } from "../../../parsing/properties";
import type { ColumnDefinition, ColumnTag } from "../../columns/columns";
import { changeColumnTransform } from "../column_change";

const columns: ColumnDefinition[] = [
	{ id: "backlog" as ColumnTag, label: "Backlog", matchMode: "name", matchTags: [] },
	{ id: "active" as ColumnTag, label: "Active", matchMode: "tags", matchTags: ["status/active", "project"] },
	{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
	{ id: "high" as ColumnTag, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
];

function transform(
	rawLine: string,
	fromColumn: ColumnTag | undefined,
	toColumn: ColumnTag | "uncategorised" | "done",
	overrides: Partial<Parameters<typeof changeColumnTransform>[1]> = {},
) {
	return changeColumnTransform(rawLine, {
		fromColumn,
		toColumn,
		columnDefinitions: columns,
		propertySchemaOption: PropertySchemaOption.None,
		doneStatusMarker: "x",
		...overrides,
	});
}

describe("changeColumnTransform", () => {
	it("replaces a name-column tag in place without reformatting the task", () => {
		expect(transform("  * [ ] Ship #project #backlog  ^abc", "backlog" as ColumnTag, "active" as ColumnTag))
			.toBe("  * [ ] Ship #project #status/active  ^abc");
	});

	it("preserves tags that are shared by source and destination columns", () => {
		const source: ColumnDefinition = { id: "old" as ColumnTag, label: "Old", matchMode: "tags", matchTags: ["project", "old"] };
		const destination: ColumnDefinition = { id: "new" as ColumnTag, label: "New", matchMode: "tags", matchTags: ["project", "new"] };
		expect(changeColumnTransform("- [ ] Ship #project #old #note", {
			fromColumn: source.id,
			toColumn: destination.id,
			columnDefinitions: [source, destination],
			propertySchemaOption: PropertySchemaOption.None,
			doneStatusMarker: "x",
		})).toBe("- [ ] Ship #project #new #note");
	});

	it("appends a destination tag before a block link when no source tag exists", () => {
		expect(transform("+ [ ] Ship #note ^abc", undefined, "backlog" as ColumnTag))
			.toBe("+ [ ] Ship #note #backlog ^abc");
	});

	it("clears a status-column marker when moving to a tag column", () => {
		expect(transform("- [/] Ship #note", "doing" as ColumnTag, "backlog" as ColumnTag))
			.toBe("- [ ] Ship #note #backlog");
	});

	it("sets the target status marker without adding a tag", () => {
		expect(transform("- [ ] Ship #backlog #note", "backlog" as ColumnTag, "doing" as ColumnTag))
			.toBe("- [/] Ship #note");
	});

	it("changes priority through the Tasks writer without rebuilding the line", () => {
		expect(transform("- [ ] Ship #note ⏬ ^abc", undefined, "high" as ColumnTag, {
			propertySchemaOption: PropertySchemaOption.TasksPlugin,
		})).toBe("- [ ] Ship #note ⏫ ^abc");
	});

	it("marks a task done and adds completion metadata before its block link", () => {
		expect(transform("- [ ] Ship #note ^abc", undefined, "done", {
			propertySchemaOption: PropertySchemaOption.TasksPlugin,
			addCompletionDate: "2026-09-07",
		})).toBe("- [x] Ship #note ✅ 2026-09-07 ^abc");
	});

	it("removes every recognised placement tag when moving to uncategorised", () => {
		expect(transform("- [ ] Ship #backlog #status/active #project #note", "backlog" as ColumnTag, "uncategorised"))
			.toBe("- [ ] Ship #note");
	});
});
