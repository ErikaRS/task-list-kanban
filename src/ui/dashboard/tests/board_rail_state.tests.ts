import { describe, expect, it } from "vitest";
import { resolveBoardList, type BoardIndexEntry } from "../../boards/board_index";
import {
	RAIL_LABEL_MIN_WIDTH,
	RAIL_MAX_WIDTH,
	RAIL_MIN_WIDTH,
	clampRailWidth,
	railChipLabel,
	railDisplayMode,
	railDropPosition,
	railDropPositionHorizontal,
	railVisible,
} from "../board_rail_state";

describe("rail visibility", () => {
	it("shows the rail only when there is something to switch to", () => {
		expect(railVisible(0)).toBe(false);
		expect(railVisible(1)).toBe(false);
		expect(railVisible(2)).toBe(true);
		expect(railVisible(12)).toBe(true);
	});

	it("counts hidden boards, so curation cannot remove the rail", () => {
		// The visibility rule takes the discovered count (shown + hidden):
		// hiding every board but one still leaves a two-board vault railed.
		const boards: BoardIndexEntry[] = [
			{ path: "Home.md", name: "Home", folder: "" },
			{ path: "Work.md", name: "Work", folder: "" },
		];
		const resolved = resolveBoardList(boards, { unpinnedPaths: ["Work.md"] });
		expect(resolved.shown).toHaveLength(1);
		expect(railVisible(boards.length)).toBe(true);
	});
});

describe("rail display mode", () => {
	it("switches from chips to labels at the label threshold", () => {
		expect(railDisplayMode(RAIL_MIN_WIDTH)).toBe("chip");
		expect(railDisplayMode(RAIL_LABEL_MIN_WIDTH - 1)).toBe("chip");
		expect(railDisplayMode(RAIL_LABEL_MIN_WIDTH)).toBe("label");
		expect(railDisplayMode(RAIL_MAX_WIDTH)).toBe("label");
	});
});

describe("rail width clamp", () => {
	it("clamps to the min/max range and rounds to whole pixels", () => {
		expect(clampRailWidth(10)).toBe(RAIL_MIN_WIDTH);
		expect(clampRailWidth(9999)).toBe(RAIL_MAX_WIDTH);
		expect(clampRailWidth(120.6)).toBe(121);
		expect(clampRailWidth(RAIL_MIN_WIDTH)).toBe(RAIL_MIN_WIDTH);
	});
});

describe("rail chip labels", () => {
	it("takes the first character of the board name, uppercased", () => {
		expect(railChipLabel("work")).toBe("W");
		expect(railChipLabel("  padded")).toBe("P");
	});

	it("keeps whole code points, so emoji names keep their emoji", () => {
		expect(railChipLabel("🚀 Launch")).toBe("🚀");
	});

	it("falls back for empty names", () => {
		expect(railChipLabel("")).toBe("?");
		expect(railChipLabel("   ")).toBe("?");
	});
});

describe("rail drop position", () => {
	it("decides before/after by the pointer's side of the vertical midpoint", () => {
		const rect = { top: 100, height: 32 };
		expect(railDropPosition(100, rect)).toBe("before");
		expect(railDropPosition(115, rect)).toBe("before");
		expect(railDropPosition(116, rect)).toBe("before"); // exact midpoint
		expect(railDropPosition(117, rect)).toBe("after");
		expect(railDropPosition(132, rect)).toBe("after");
	});

	it("uses the horizontal midpoint for the top-docked strip", () => {
		const rect = { left: 100, width: 32 };
		expect(railDropPositionHorizontal(100, rect)).toBe("before");
		expect(railDropPositionHorizontal(116, rect)).toBe("before"); // exact midpoint
		expect(railDropPositionHorizontal(117, rect)).toBe("after");
		expect(railDropPositionHorizontal(132, rect)).toBe("after");
	});
});

describe("rail tab derivation", () => {
	// The rail's tabs are exactly the dashboard's shown boards in the
	// dashboard's order — the same resolver, so the two surfaces cannot
	// drift (SPEC 0034 req. 6).
	it("is the dashboard's shown list: curated order first, hidden boards excluded", () => {
		const boards: BoardIndexEntry[] = [
			{ path: "a/Alpha.md", name: "Alpha", folder: "a" },
			{ path: "b/Beta.md", name: "Beta", folder: "b" },
			{ path: "c/Gamma.md", name: "Gamma", folder: "c" },
		];
		const resolved = resolveBoardList(boards, {
			boardPaths: ["c/Gamma.md", "a/Alpha.md"],
			unpinnedPaths: ["b/Beta.md"],
		});
		expect(resolved.shown.map((board) => board.path)).toEqual([
			"c/Gamma.md",
			"a/Alpha.md",
		]);
	});
});
