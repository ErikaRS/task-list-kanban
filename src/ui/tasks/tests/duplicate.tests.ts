import { describe, expect, it } from "vitest";
import { createDuplicateLine } from "../duplicate";

describe("createDuplicateLine", () => {
	it.each([
		["- [x] Done task #column", "- [ ] Done task #column"],
		["- [-] Cancelled task #column", "- [ ] Cancelled task #column"],
		["- [ ] Open task #tag", "- [ ] Open task #tag"],
		["- [ ] Task with link #column ^abc-123", "- [ ] Task with link #column"],
		["* [x] Star task #tag", "* [ ] Star task #tag"],
		["+ [-] Plus task", "+ [ ] Plus task"],
		["    - [x] Indented task #col", "    - [ ] Indented task #col"],
		["\t- [x] Tab indented", "\t- [ ] Tab indented"],
		["- [ ] Task with ^caret in middle", "- [ ] Task with ^caret in middle"],
	])("duplicates %s", (input, expected) => {
		expect(createDuplicateLine(input)).toBe(expected);
	});
});
