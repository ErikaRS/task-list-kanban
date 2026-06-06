import { expect, test } from "vitest";
import { NoneSchema } from "../none_schema";
import { TasksPluginSchema } from "../tasks_schema";
import { DataviewSchema } from "../dataview_schema";
import { UNIVERSAL_STATUS_PROPERTY_KEY } from "../property_schema";

test("NoneSchema returns only status", () => {
	const schema = new NoneSchema();
	const props = schema.parseProperties("- [x] My task");
	expect(props.size).toBe(1);
	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("x");
});

test("TasksPluginSchema extracts dates, priority, recurrence and status", () => {
	const schema = new TasksPluginSchema();
	const line = "- [/] My task 📅 2024-01-20 ⏫ 🔁 every day";
	const props = schema.parseProperties(line);
	
	expect(props.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("/");
	
	const due = props.get("due");
	expect(due?.value).toBeInstanceOf(Date);
	expect((due?.value as Date).toISOString().startsWith("2024-01-20")).toBe(true);

	const priority = props.get("priority");
	expect(priority?.value).toBe("⏫");

	const recurrence = props.get("recurrence");
	expect(recurrence?.value).toBe("every day");
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

	const line2 = "- [-] Another task cost:: 100.50";
	const props2 = schema.parseProperties(line2);
	expect(props2.get(UNIVERSAL_STATUS_PROPERTY_KEY)?.value).toBe("-");
	expect(props2.get("cost")?.value).toBe(100.5);
});
