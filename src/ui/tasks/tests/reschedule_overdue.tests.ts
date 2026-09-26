import { describe, expect, it } from "vitest";
import { DataviewSchema, getPropertyWriteAdapter, PropertySchemaOption, TasksPluginSchema } from "src/parsing/properties";
import { createSwimlanePropertyTransform } from "../swimlane_property";
import { getReschedulableDateKey, getReschedulableOverdueTasks } from "../reschedule_overdue";
import { parseTask } from "./task_test_helpers";

const today = new Date("2026-02-01");

function tasksTask(line: string) {
	return parseTask(line, { propertySchema: new TasksPluginSchema() });
}

function contents(tasks: { content: string }[]) {
	return tasks.map((task) => task.content.split(" ")[0]);
}

describe("getReschedulableDateKey", () => {
	it("accepts editable date groupings", () => {
		expect(getReschedulableDateKey({ kind: "property", key: "due" })).toBe("due");
		expect(getReschedulableDateKey({ kind: "property", key: "scheduled" })).toBe("scheduled");
		expect(getReschedulableDateKey({ kind: "property", key: "start" })).toBe("start");
	});

	it("rejects non-editable dates and other groupings", () => {
		expect(getReschedulableDateKey({ kind: "property", key: "created" })).toBeNull();
		expect(getReschedulableDateKey({ kind: "property", key: "completion" })).toBeNull();
		expect(getReschedulableDateKey({ kind: "property", key: "priority" })).toBeNull();
		expect(getReschedulableDateKey({ kind: "tag-prefix" })).toBeNull();
		expect(getReschedulableDateKey({ kind: "none" })).toBeNull();
		expect(getReschedulableDateKey(undefined)).toBeNull();
	});
});

describe("getReschedulableOverdueTasks", () => {
	const past = tasksTask("- [ ] past 📅 2026-01-15");
	const dueToday = tasksTask("- [ ] today 📅 2026-02-01");
	const future = tasksTask("- [ ] future 📅 2026-03-01");
	const undated = tasksTask("- [ ] undated");
	const done = tasksTask("- [x] done 📅 2026-01-10");
	const cancelled = tasksTask("- [-] cancelled 📅 2026-01-10");
	const scheduledOnly = tasksTask("- [ ] scheduled ⏳ 2026-01-20");
	const all = [past, dueToday, future, undated, done, cancelled, scheduledOnly];

	it("returns open tasks whose grouped date is before today", () => {
		const result = getReschedulableOverdueTasks(all, { kind: "property", key: "due" }, today);
		expect(contents(result)).toEqual(["past"]);
	});

	it("uses the grouped key only", () => {
		const result = getReschedulableOverdueTasks(all, { kind: "property", key: "scheduled" }, today);
		expect(contents(result)).toEqual(["scheduled"]);
	});

	it("does not depend on combining past dates", () => {
		const result = getReschedulableOverdueTasks(
			all,
			{ kind: "property", key: "due", collapsePastDates: true },
			today,
		);
		expect(contents(result)).toEqual(["past"]);
	});

	it("only considers the tasks it is given", () => {
		expect(getReschedulableOverdueTasks([dueToday], { kind: "property", key: "due" }, today)).toEqual([]);
	});

	it("returns nothing for non-editable groupings", () => {
		const created = tasksTask("- [ ] created ➕ 2026-01-01");
		expect(getReschedulableOverdueTasks([created], { kind: "property", key: "created" }, today)).toEqual([]);
		expect(getReschedulableOverdueTasks(all, { kind: "tag-prefix" }, today)).toEqual([]);
	});

	it("works with Dataview dates", () => {
		const schema = new DataviewSchema();
		const yesterday = parseTask("- [ ] yesterday [due:: 2026-01-31]", { propertySchema: schema });
		const onDay = parseTask("- [ ] today [due:: 2026-02-01]", { propertySchema: schema });
		const result = getReschedulableOverdueTasks([yesterday, onDay], { kind: "property", key: "due" }, today);
		expect(contents(result)).toEqual(["yesterday"]);
	});
});

describe("rescheduling write", () => {
	// getToday() encodes the local day as UTC midnight; the swimlane writer
	// must write that calendar date and leave other dates alone.
	it("rewrites only the grouped date under the Tasks schema", () => {
		const adapter = getPropertyWriteAdapter(PropertySchemaOption.TasksPlugin)!;
		const transform = createSwimlanePropertyTransform(adapter, "due", today)!;
		expect(transform("- [ ] a 📅 2026-01-15 ⏳ 2026-01-10")).toBe("- [ ] a 📅 2026-02-01 ⏳ 2026-01-10");
	});

	it("rewrites only the grouped date under the Dataview schema", () => {
		const adapter = getPropertyWriteAdapter(PropertySchemaOption.Dataview)!;
		const transform = createSwimlanePropertyTransform(adapter, "scheduled", today)!;
		expect(transform("- [ ] a [due:: 2026-01-15] [scheduled:: 2026-01-10]"))
			.toBe("- [ ] a [due:: 2026-01-15] [scheduled:: 2026-02-01]");
	});
});
