import { describe, expect, it } from "vitest";
import { parseEmbedBlock } from "../embed_block";

describe("parseEmbedBlock", () => {
	it("reads every parameter, with defaults for height and layout", () => {
		expect(parseEmbedBlock("board: Projects/Work Board.md").params).toEqual({
			board: "Projects/Work Board.md", height: 420, layout: "auto",
		});
		expect(parseEmbedBlock([
			"Board: [[Work Board|Work]]",
			"view: Today",
			"filter: #urgent and due < $TODAY+7d",
			"height: 600px",
			"layout: List",
		].join("\n"))).toEqual({
			params: {
				board: "Work Board",
				view: "Today",
				filter: "#urgent and due < $TODAY+7d",
				height: 600,
				layout: "list",
			},
			issues: [],
		});
	});

	it("reports errors per line and renders nothing", () => {
		const result = parseEmbedBlock("board: A.md\nheight: tall\nlayout: grid\nnot a pair\nboard: B.md");
		expect(result.params).toBeUndefined();
		expect(result.issues.map((issue) => [issue.line, issue.severity])).toEqual([
			[4, "error"], [5, "error"], [2, "error"], [3, "error"],
		]);
		expect(parseEmbedBlock("").issues).toEqual([
			{ line: 0, severity: "error", message: 'Add a "board:" line naming the board file.' },
		]);
	});

	it("warns, but still renders, for unknown keys and out-of-range heights", () => {
		const result = parseEmbedBlock("board: A.md\ntheme: dark\nheight: 5000");
		expect(result.params?.height).toBe(1200);
		expect(result.issues.map((issue) => [issue.line, issue.severity])).toEqual([
			[2, "warning"], [3, "warning"],
		]);
	});
});
