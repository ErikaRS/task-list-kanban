import { describe, expect, it } from "vitest";
import { floatingActionTop } from "../mobile_floating_action";

describe("section-bound mobile creation", () => {
	it("stays at the visible lower edge while a long section scrolls", () => {
		const before = floatingActionTop(100, 1500, 144, 700)!;
		const after = floatingActionTop(-200, 1200, 144, 700)!;
		expect(100 + before).toBe(640);
		expect(-200 + after).toBe(640);
	});
	it("travels upward with its section's trailing edge", () => {
		expect(floatingActionTop(-200, 400, 100, 700)).toBe(540);
	});
	it("keeps two short visible sections' controls in their own bounds", () => {
		expect(floatingActionTop(100, 200, 100, 700)).toBe(40);
		expect(floatingActionTop(244, 344, 244, 700)).toBe(40);
	});
	it("hides a sliver instead of covering sticky headers or the next section", () => {
		expect(floatingActionTop(-200, 150, 100, 700)).toBeNull();
		expect(floatingActionTop(710, 810, 100, 700)).toBeNull();
	});
	it("stays above a reduced keyboard viewport", () => {
		expect(floatingActionTop(100, 1500, 144, 360)).toBe(200);
	});
	it("fits a compact empty section without a full-width add row", () => {
		expect(floatingActionTop(100, 172, 100, 700)).toBe(12);
	});
});
