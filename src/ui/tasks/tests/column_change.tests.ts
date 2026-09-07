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

	it("covers every custom-column mode transition without rebuilding preserved text", () => {
		const sourceRows: Record<string, string> = {
			backlog: "  + [ ] Preserve  #backlog #note ^block",
			active: "  + [ ] Preserve  #status/active #project #note ^block",
			doing: "  + [/] Preserve  #note ^block",
			high: "  + [ ] Preserve  #note ⏫ ^block",
		};

		for (const [fromColumn, rawLine] of Object.entries(sourceRows)) {
			for (const toColumn of ["backlog", "active", "doing", "high"] as const) {
				const next = transform(rawLine, fromColumn as ColumnTag, toColumn as ColumnTag, {
					propertySchemaOption: PropertySchemaOption.TasksPlugin,
				});

				// The task body, its deliberately repeated space, unrelated tag, list
				// marker, indentation, and block link are all outside column encoding.
				expect(next).toContain("  + [");
				expect(next).toContain("Preserve  ");
				expect(next).toContain("#note");
				expect(next).toContain("^block");

				if (toColumn === "backlog") {
					expect(next).toContain("[ ]");
					expect(next).toContain("#backlog");
					expect(next).not.toContain("#status/active");
					expect(next).not.toContain("⏫");
				} else if (toColumn === "active") {
					expect(next).toContain("[ ]");
					expect(next).toContain("#status/active #project");
					expect(next).not.toContain("#backlog");
					expect(next).not.toContain("⏫");
				} else if (toColumn === "doing") {
					expect(next).toContain("[/]");
					expect(next).not.toContain("#backlog");
					expect(next).not.toContain("#status/active");
					expect(next).not.toContain("⏫");
				} else {
					expect(next).toContain("[ ]");
					expect(next).toContain("⏫");
					expect(next).not.toContain("#backlog");
					expect(next).not.toContain("#status/active");
				}
			}
		}
	});

	it("uses the Dataview writer for priority moves and preserves completion metadata", () => {
		const dataviewPriority: ColumnDefinition = {
			id: "urgent" as ColumnTag,
			label: "Urgent",
			matchMode: "priority",
			matchTags: [],
			matchPriority: "urgent",
			matchPropertySchema: PropertySchemaOption.Dataview,
		};
		expect(changeColumnTransform("- [x] Keep  #note [completion:: 2026-06-01] ^block", {
			fromColumn: undefined,
			toColumn: dataviewPriority.id,
			columnDefinitions: [...columns, dataviewPriority],
			propertySchemaOption: PropertySchemaOption.Dataview,
			doneStatusMarker: "x",
			wasDone: true,
		})).toBe("- [ ] Keep  #note [completion:: 2026-06-01] [priority:: urgent] ^block");
	});

	it("fails safely for legacy priority columns without a writable schema", () => {
		const legacyPriority: ColumnDefinition = {
			id: "legacy" as ColumnTag,
			label: "Legacy",
			matchMode: "priority",
			matchTags: [],
			matchPriority: "high",
			// Persisted settings can predate the priority-schema validation.
			matchPropertySchema: "legacy" as never,
		};
		expect(changeColumnTransform("- [ ] Keep  #note ⏫ ^block", {
			fromColumn: legacyPriority.id,
			toColumn: "backlog" as ColumnTag,
			columnDefinitions: [...columns, legacyPriority],
			propertySchemaOption: PropertySchemaOption.None,
			doneStatusMarker: "x",
		})).toBe("- [ ] Keep  #note ⏫ #backlog ^block");
	});

	it("is idempotent when a row already encodes the destination column", () => {
		const rawLine = "- [ ] Keep  #status/active #project #note ^block";
		expect(transform(rawLine, "active" as ColumnTag, "active" as ColumnTag)).toBe(rawLine);
	});
});
