import { describe, expect, it } from "vitest";
import type { ColumnTag } from "../columns/columns";
import { getBoardTaskCount } from "../board_counts";

describe("getBoardTaskCount", () => {
	it("excludes done-state tasks from the board total", () => {
		expect(
			getBoardTaskCount([
				{ done: false, column: "uncategorised" },
				{ done: false, column: "next" as unknown as ColumnTag },
				{ done: true, column: undefined },
				{ done: false, column: "done" },
				{ done: false, column: "archived" },
			]),
		).toBe(2);
	});

	it("counts incomplete non-archived tasks in active columns", () => {
		expect(
			getBoardTaskCount([
				{ done: false, column: undefined },
				{ done: false, column: "uncategorised" },
				{ done: false, column: "in-progress" as unknown as ColumnTag },
			]),
		).toBe(3);
	});
});
