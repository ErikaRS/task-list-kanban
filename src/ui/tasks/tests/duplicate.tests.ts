import { describe, expect, it } from "vitest";
import { createDuplicateLine } from "../duplicate";

describe("createDuplicateLine", () => {
	it.each([
		["- [x] Done task #column", "- [ ] Done task #column"],
		["- [X] Done task", "- [ ] Done task"],
		["- [-] Cancelled task #column", "- [ ] Cancelled task #column"],
		["- [ ] Open task #tag", "- [ ] Open task #tag"],
		["- [ ] Task with link #column ^abc-123", "- [ ] Task with link #column"],
		["- [x] Done with link ^block99", "- [ ] Done with link"],
		["* [x] Star task #tag", "* [ ] Star task #tag"],
		["+ [-] Plus task", "+ [ ] Plus task"],
		["    - [x] Indented task #col", "    - [ ] Indented task #col"],
		["\t- [x] Tab indented", "\t- [ ] Tab indented"],
		["- [ ] My task #tag1 #tag2 #column", "- [ ] My task #tag1 #tag2 #column"],
		["- [✓] Custom done", "- [ ] Custom done"],
		["- [ ] Task with ^caret in middle", "- [ ] Task with ^caret in middle"],
	])("duplicates %s", (input, expected) => {
		expect(createDuplicateLine(input)).toBe(expected);
	});
});
