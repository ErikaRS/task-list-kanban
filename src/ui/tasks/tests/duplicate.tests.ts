import { describe, expect, it } from "vitest";
import { createDuplicateLine } from "../duplicate";

describe("createDuplicateLine", () => {
	it("resets checkbox status to unchecked", () => {
		expect(createDuplicateLine("- [x] Done task #column")).toBe(
			"- [ ] Done task #column"
		);
	});

	it("resets uppercase done marker", () => {
		expect(createDuplicateLine("- [X] Done task")).toBe(
			"- [ ] Done task"
		);
	});

	it("resets cancelled status marker", () => {
		expect(createDuplicateLine("- [-] Cancelled task #column")).toBe(
			"- [ ] Cancelled task #column"
		);
	});

	it("preserves already-unchecked status", () => {
		expect(createDuplicateLine("- [ ] Open task #tag")).toBe(
			"- [ ] Open task #tag"
		);
	});

	it("strips block link from end", () => {
		expect(
			createDuplicateLine("- [ ] Task with link #column ^abc-123")
		).toBe("- [ ] Task with link #column");
	});

	it("strips block link and resets status together", () => {
		expect(
			createDuplicateLine("- [x] Done with link ^block99")
		).toBe("- [ ] Done with link");
	});

	it("preserves * list marker", () => {
		expect(createDuplicateLine("* [x] Star task #tag")).toBe(
			"* [ ] Star task #tag"
		);
	});

	it("preserves + list marker", () => {
		expect(createDuplicateLine("+ [-] Plus task")).toBe(
			"+ [ ] Plus task"
		);
	});

	it("preserves indentation", () => {
		expect(createDuplicateLine("    - [x] Indented task #col")).toBe(
			"    - [ ] Indented task #col"
		);
	});

	it("preserves tab indentation", () => {
		expect(createDuplicateLine("\t- [x] Tab indented")).toBe(
			"\t- [ ] Tab indented"
		);
	});

	it("preserves all tags", () => {
		expect(
			createDuplicateLine("- [ ] My task #tag1 #tag2 #column")
		).toBe("- [ ] My task #tag1 #tag2 #column");
	});

	it("handles custom status markers like emoji", () => {
		expect(createDuplicateLine("- [✓] Custom done")).toBe(
			"- [ ] Custom done"
		);
	});

	it("does not strip caret in middle of content", () => {
		expect(createDuplicateLine("- [ ] Task with ^caret in middle")).toBe(
			"- [ ] Task with ^caret in middle"
		);
	});
});
