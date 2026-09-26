import { describe, expect, it } from "vitest";
import { PropertySchemaOption } from "../../../parsing/properties";
import { buildNewTaskLine } from "../task_line_builder";

describe("buildNewTaskLine", () => {
	it("creates an uncategorized task without placement tags", () => {
		expect(
			buildNewTaskLine({
				content: "Write release notes",
				column: "uncategorised",
				columnDefinitions: [],
				getPlacementTagsForColumn: () => ["should-not-write"],
				propertySchemaOption: PropertySchemaOption.None,
			}),
		).toBe("- [ ] Write release notes");
	});

	it("creates a done task with a completed checkbox marker", () => {
		expect(
			buildNewTaskLine({
				content: "Ship release",
				column: "done",
				columnDefinitions: [],
				getPlacementTagsForColumn: () => ["should-not-write"],
				propertySchemaOption: PropertySchemaOption.None,
			}),
		).toBe("- [x] Ship release");
	});

	it("writes a date lane's value so the new task stays in that lane", () => {
		expect(
			buildNewTaskLine({
				content: "Plan trip",
				column: "uncategorised",
				columnDefinitions: [],
				getPlacementTagsForColumn: () => [],
				propertySchemaOption: PropertySchemaOption.TasksPlugin,
				groupProperty: { key: "scheduled", value: new Date("2026-09-30T00:00:00.000Z") },
			}),
		).toBe("- [ ] Plan trip ⏳ 2026-09-30");
	});

	it("lets a date typed in the new-task form override the lane's date", () => {
		expect(
			buildNewTaskLine({
				content: "Plan trip",
				column: "uncategorised",
				columnDefinitions: [],
				getPlacementTagsForColumn: () => [],
				propertySchemaOption: PropertySchemaOption.Dataview,
				groupProperty: { key: "scheduled", value: "2026-09-30" },
				dateProperties: { scheduled: "2026-10-02", due: "2026-10-05" },
			}),
		).toBe("- [ ] Plan trip [scheduled:: 2026-10-02] [due:: 2026-10-05]");
	});

	it("writes a priority lane's value", () => {
		expect(
			buildNewTaskLine({
				content: "Fix bug",
				column: "uncategorised",
				columnDefinitions: [],
				getPlacementTagsForColumn: () => [],
				propertySchemaOption: PropertySchemaOption.Dataview,
				groupProperty: { key: "priority", value: "high" },
			}),
		).toBe("- [ ] Fix bug [priority:: high]");
	});

	it("ignores lanes whose property cannot be written", () => {
		for (const [propertySchemaOption, key] of [
			[PropertySchemaOption.Dataview, "created"],
			[PropertySchemaOption.None, "scheduled"],
		] as const) {
			expect(
				buildNewTaskLine({
					content: "Fix bug",
					column: "uncategorised",
					columnDefinitions: [],
					getPlacementTagsForColumn: () => [],
					propertySchemaOption,
					groupProperty: { key, value: "2026-09-30" },
				}),
			).toBe("- [ ] Fix bug");
		}
	});
});
