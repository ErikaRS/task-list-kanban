import { expect, test } from "vitest";
import {
	createCanonicalPropertyMap,
	getPropertyAliases,
	getPropertyByKey,
	normalizePropertyKey,
} from "../normalization";
import { TasksPluginSchema } from "../tasks_schema";
import { DataviewSchema } from "../dataview_schema";

test("normalizePropertyKey maps shared source-specific aliases to canonical keys", () => {
	expect(normalizePropertyKey("completion")).toBe("done");
	expect(normalizePropertyKey("repeat")).toBe("recurrence");
	expect(normalizePropertyKey("due")).toBe("due");
});

test("getPropertyAliases returns aliases for canonical and source-specific keys", () => {
	expect(getPropertyAliases("done")).toContain("completion");
	expect(getPropertyAliases("completion")).toContain("done");
	expect(getPropertyAliases("recurrence")).toContain("repeat");
	expect(getPropertyAliases("repeat")).toContain("recurrence");
});

test("getPropertyByKey finds Dataview completion by canonical done while preserving source metadata", () => {
	const line = "- [ ] Task [completion:: 2024-01-20]";
	const props = new DataviewSchema().parseProperties(line);
	const completion = getPropertyByKey(props, "done");

	expect(completion?.key).toBe("completion");
	expect(completion?.value).toBeInstanceOf(Date);
	expect(line.slice(completion?.startIndex ?? -1, completion?.endIndex ?? -1)).toBe("[completion:: 2024-01-20]");
});

test("getPropertyByKey finds Tasks recurrence by Dataview repeat alias", () => {
	const props = new TasksPluginSchema().parseProperties("- [ ] Task 🔁 every week");
	const recurrence = getPropertyByKey(props, "repeat");

	expect(recurrence?.key).toBe("recurrence");
	expect(recurrence?.value).toBe("every week");
});

test("getPropertyByKey prefers exact source key matches before canonical aliases", () => {
	const props = new DataviewSchema().parseProperties("- [ ] Task [done:: 2024-01-19] [completion:: 2024-01-20]");

	expect(getPropertyByKey(props, "done")?.key).toBe("done");
	expect(getPropertyByKey(props, "completion")?.key).toBe("completion");
});

test("createCanonicalPropertyMap indexes first parsed source property by canonical key", () => {
	const props = new DataviewSchema().parseProperties("- [ ] Task [completion:: 2024-01-20] [repeat:: every week]");
	const canonical = createCanonicalPropertyMap(props);

	expect(canonical.get("done")?.key).toBe("completion");
	expect(canonical.get("recurrence")?.key).toBe("repeat");
});
