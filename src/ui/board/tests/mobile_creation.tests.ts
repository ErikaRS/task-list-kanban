import { describe, expect, it, vi } from "vitest";
import { captureMobileCreation, saveMobileCreation } from "../mobile_creation";
import { PropertySchemaOption } from "../../../parsing/properties";
import type { TaskActions } from "../../tasks/actions";
import type { ColumnTag } from "../../columns/columns";
import type { TFile } from "obsidian";

function fixture() {
	const createTask = vi.fn().mockResolvedValue(undefined);
	const source = captureMobileCreation({
		column: "this-week" as ColumnTag, context: "This Week / Project A",
		file: { path: "Project A.md" } as TFile, fixedFile: true,
		additionalTags: ["project/a"], groupProperty: { key: "scheduled", value: "2026-09-30" },
		propertySchemaOption: PropertySchemaOption.None,
		taskActions: { createTask } as unknown as TaskActions,
	});
	return { source, createTask };
}

describe("mobile creation sessions", () => {
	it("retains the tapped file, column, grouping tags and lane property after the source context changes", async () => {
		const { source, createTask } = fixture();
		const captured = captureMobileCreation(source);
		source.column = "later" as ColumnTag;
		source.file = { path: "Other.md" } as TFile;
		source.additionalTags[0] = "project/b";
		source.groupProperty!.value = "2026-10-01";
		await saveMobileCreation(captured, "  Task text  ", { due: "2026-09-25" });
		expect(createTask).toHaveBeenCalledWith(
			{ path: "Project A.md" }, "Task text", "this-week", ["project/a"], { due: "2026-09-25" },
			{ key: "scheduled", value: "2026-09-30" },
		);
	});
	it("never submits without a file or with blank content", async () => {
		const { source, createTask } = fixture();
		await expect(saveMobileCreation({ ...source, file: null }, "Task", {})).rejects.toThrow("destination file");
		await expect(saveMobileCreation(source, " \n ", {})).rejects.toThrow("task text");
		expect(createTask).not.toHaveBeenCalled();
	});
	it("creates an untagged task in the built-in Uncategorized section", async () => {
		const { source, createTask } = fixture();
		await saveMobileCreation({ ...source, column: "uncategorised", additionalTags: [], groupProperty: null }, "New task", {});
		expect(createTask).toHaveBeenCalledWith(source.file, "New task", "uncategorised", [], {}, null);
	});
	it("propagates failures without discarding the session, permitting a retry", async () => {
		const { source, createTask } = fixture();
		createTask.mockRejectedValueOnce(new Error("Disk unavailable"));
		await expect(saveMobileCreation(source, "First line\nSecond line", {})).rejects.toThrow("Disk unavailable");
		expect(source.file?.path).toBe("Project A.md");
		await saveMobileCreation(source, "First line\nSecond line", {});
		expect(createTask).toHaveBeenCalledTimes(2);
		expect(createTask.mock.calls[1]?.[1]).toBe("First line<br />Second line");
	});
});
