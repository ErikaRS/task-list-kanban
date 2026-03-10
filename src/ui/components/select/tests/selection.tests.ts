import { describe, expect, it } from "vitest";
import { toValidSelectedOptions } from "../selection";

describe("toValidSelectedOptions", () => {
	it("keeps valid selected options", () => {
		const availableValues = new Set(["P1", "P2"]);
		const selected = [{ label: "P1", value: "P1" }];

		expect(toValidSelectedOptions(selected, availableValues)).toEqual(selected);
		expect(toValidSelectedOptions(selected, availableValues)[0]).toBe(selected[0]);
	});

	it("drops malformed and unavailable entries", () => {
		const availableValues = new Set(["P1", "P2"]);
		const selected = [
			{ label: "P1", value: "P1" },
			undefined,
			null,
			{ label: "MissingValue" },
			{ value: "P2" },
			{ label: "Unknown", value: "P3" },
			{ label: 42, value: "P2" },
			{ label: "P2", value: 10 },
			"bad",
		];

		expect(toValidSelectedOptions(selected, availableValues)).toEqual([
			{ label: "P1", value: "P1" },
		]);
	});

	it("returns empty array for non-array input", () => {
		const availableValues = new Set(["P1"]);

		expect(toValidSelectedOptions(undefined, availableValues)).toEqual([]);
		expect(toValidSelectedOptions(null, availableValues)).toEqual([]);
		expect(
			toValidSelectedOptions({ label: "P1", value: "P1" }, availableValues),
		).toEqual([]);
	});
});
