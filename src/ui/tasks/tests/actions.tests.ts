import { describe, expect, it } from "vitest";
import { createTaskLine } from "../task_creation";

describe("task actions", () => {
	describe("createTaskLine", () => {
		it("adds both column placement tags and tag swimlane tags", () => {
			expect(createTaskLine("Ship it", ["status/active"], ["Project-Alpha"])).toBe(
				"- [ ] Ship it #status/active #Project-Alpha",
			);
		});

		it("does not duplicate tags appended from multiple placement sources", () => {
			expect(createTaskLine("Ship it", ["status/active"], ["#Status/Active", "Project-Alpha"])).toBe(
				"- [ ] Ship it #status/active #Project-Alpha",
			);
		});
	});
});
