import { expect, test } from "vitest";
import { NoneSchema } from "../none_schema";
import { TasksPluginSchema } from "../tasks_schema";
import { DataviewSchema } from "../dataview_schema";
import { UNIVERSAL_STATUS_PROPERTY_KEY } from "../property_schema";

function expectRange(rawLine: string, key: string, rawValue: string, startIndex: number, endIndex: number) {
	expect(rawLine.slice(startIndex, endIndex), `${key} source range`).toBe(rawValue);
}

test("NoneSchema returns only status", () => {
	const schema = new NoneSchema();
	const props = schema.parseProperties("- [x] My task");
	expect(props.size).toBe(1);
	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("x");
	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.startIndex).toBe(3);
	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.endIndex).toBe(4);
});

test("NoneSchema preserves Unicode status markers", () => {
	const schema = new NoneSchema();
	const props = schema.parseProperties("- [✅] My task");
	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("✅");
});

test("TasksPluginSchema extracts current Tasks emoji dates, priority, recurrence and status", () => {
	const schema = new TasksPluginSchema();
	const line = "- [/] My task 🔺 🔁 every day when done ⏳ 2024-01-19 📅 2024-01-20 🛫 2024-01-18 ➕ 2024-01-01 ✅ 2024-01-21";
	const props = schema.parseProperties(line);

	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("/");

	const due = props.get("due");
	expect(due?.value).toBeInstanceOf(Date);
	expect((due?.value as Date).toISOString().startsWith("2024-01-20")).toBe(true);
	expectRange(line, "due", due?.rawValue ?? "", due?.startIndex ?? -1, due?.endIndex ?? -1);

	const scheduled = props.get("scheduled");
	expect(scheduled?.value).toBeInstanceOf(Date);
	expect((scheduled?.value as Date).toISOString().startsWith("2024-01-19")).toBe(true);

	const start = props.get("start");
	expect(start?.value).toBeInstanceOf(Date);
	expect((start?.value as Date).toISOString().startsWith("2024-01-18")).toBe(true);

	const created = props.get("created");
	expect(created?.value).toBeInstanceOf(Date);
	expect((created?.value as Date).toISOString().startsWith("2024-01-01")).toBe(true);

	const done = props.get("done");
	expect(done?.value).toBeInstanceOf(Date);
	expect((done?.value as Date).toISOString().startsWith("2024-01-21")).toBe(true);

	const priority = props.get("priority");
	expect(priority?.rawValue).toBe("🔺");
	expect(priority?.value).toBe(5);
	expectRange(line, "priority", "🔺", priority?.startIndex ?? -1, priority?.endIndex ?? -1);

	const recurrence = props.get("recurrence");
	expect(recurrence?.value).toBe("every day when done");
	expectRange(line, "recurrence", recurrence?.rawValue ?? "", recurrence?.startIndex ?? -1, recurrence?.endIndex ?? -1);
});

test("TasksPluginSchema exposes semantic key aliases", () => {
	const schema = new TasksPluginSchema();
	const keys = schema.knownKeys();

	expect(keys.find((key) => key.key === "done")?.aliases).toContain("completion");
	expect(keys.find((key) => key.key === "recurrence")?.aliases).toContain("repeat");
});

test("TasksPluginSchema supports legacy scheduled and done emoji aliases", () => {
	const schema = new TasksPluginSchema();
	const props = schema.parseProperties("- [ ] My task ⏰ 2024-01-20 🏁 2024-01-21");

	expect(props.get("scheduled")?.value).toBeInstanceOf(Date);
	expect(props.get("done")?.value).toBeInstanceOf(Date);
});

test("TasksPluginSchema uses first occurrence for duplicate keys by source order", () => {
	const schema = new TasksPluginSchema();
	const props = schema.parseProperties("- [ ] My task 📅 2024-01-20 📅 2024-01-21 ⏬ 🔺");

	expect((props.get("due")?.value as Date).toISOString().startsWith("2024-01-20")).toBe(true);
	expect(props.get("priority")?.rawValue).toBe("⏬");
	expect(props.get("priority")?.value).toBe(1);
});

test("TasksPluginSchema rejects invalid calendar dates", () => {
	const schema = new TasksPluginSchema();
	const props = schema.parseProperties("- [ ] My task 📅 2024-02-31");

	expect(props.get("due")?.value).toBeNull();
});

test("DataviewSchema extracts inline fields and status", () => {
	const schema = new DataviewSchema();

	const line1 = "- [ ] Task [due:: 2024-01-20] [priority:: high] (estimate:: 5)";
	const props1 = schema.parseProperties(line1);

	expect(props1.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe(" ");

	const due1 = props1.get("due");
	expect(due1?.value).toBeInstanceOf(Date);
	expect((due1?.value as Date).toISOString().startsWith("2024-01-20")).toBe(true);

	expect(props1.get("priority")?.value).toBe("high");
	expect(props1.get("estimate")?.value).toBe(5);
	expectRange(line1, "priority", "[priority:: high]", props1.get("priority")?.startIndex ?? -1, props1.get("priority")?.endIndex ?? -1);

	const line2 = "- [-] Another task cost:: 100.50";
	const props2 = schema.parseProperties(line2);
	expect(props2.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("-");
	expect(props2.get("cost")?.value).toBe(100.5);
});

test("DataviewSchema extracts current Tasks Dataview-format fields", () => {
	const schema = new DataviewSchema();
	const props = schema.parseProperties("- [ ] Task [repeat:: every day when done] [completion:: 2024-01-20] [created:: 2024-01-01]");

	expect(props.get("repeat")?.value).toBe("every day when done");
	expect(props.get("completion")?.value).toBeInstanceOf(Date);
	expect(props.get("created")?.value).toBeInstanceOf(Date);
});

test("DataviewSchema keeps adjacent unbracketed fields separate", () => {
	const schema = new DataviewSchema();
	const line = "- [ ] Task due:: 2024-01-20 priority:: high";
	const props = schema.parseProperties(line);

	expect((props.get("due")?.value as Date).toISOString().startsWith("2024-01-20")).toBe(true);
	expect(props.get("priority")?.value).toBe("high");
	expectRange(line, "due", "due:: 2024-01-20", props.get("due")?.startIndex ?? -1, props.get("due")?.endIndex ?? -1);
	expectRange(line, "priority", "priority:: high", props.get("priority")?.startIndex ?? -1, props.get("priority")?.endIndex ?? -1);
});

test("DataviewSchema treats the next bare field marker as a delimiter", () => {
	const schema = new DataviewSchema();
	const props = schema.parseProperties("- [ ] Task note:: call Alice priority:: high");

	expect(props.get("note")?.value).toBe("call Alice");
	expect(props.get("priority")?.value).toBe("high");
});

test("DataviewSchema preserves first occurrence by source order", () => {
	const schema = new DataviewSchema();
	const props = schema.parseProperties("- [ ] Task priority:: low [priority:: high]");

	expect(props.get("priority")?.value).toBe("low");
});

test("DataviewSchema rejects invalid calendar dates", () => {
	const schema = new DataviewSchema();
	const props = schema.parseProperties("- [ ] Task [due:: 2024-02-31]");

	expect(props.get("due")?.value).toBe("2024-02-31");
});

test("DataviewSchema exposes semantic key aliases", () => {
	const schema = new DataviewSchema();
	const keys = schema.knownKeys();

	expect(keys.find((key) => key.key === "done")?.aliases).toContain("completion");
	expect(keys.find((key) => key.key === "repeat")?.aliases).toContain("recurrence");
});
