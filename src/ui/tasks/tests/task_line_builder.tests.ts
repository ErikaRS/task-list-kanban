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
});
