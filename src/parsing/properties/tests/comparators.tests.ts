import { describe, it, expect } from "vitest";
import { compareByProperty } from "../comparators";
import type { Task } from "../../../ui/tasks/task";
import { UNIVERSAL_STATUS_PROPERTY_KEY } from "../property_schema";

function taskWith(value: string | number | Date | null): Task {
	const properties = new Map();
	if (value !== null) {
		properties.set("key", { key: "key", rawValue: String(value), value });
	}
	return { properties } as unknown as Task;
}

function taskWithKey(key: string, value: string | number | Date | null): Task {
	const properties = new Map();
	if (value !== null) {
		properties.set(key, { key, rawValue: String(value), value });
	}
	return { properties } as unknown as Task;
}

describe("compareByProperty", () => {
	it("orders dates chronologically when ascending", () => {
		const a = taskWith(new Date("2024-01-01"));
		const b = taskWith(new Date("2024-02-01"));
		expect(compareByProperty(a, b, "key", "asc")).toBeLessThan(0);
		expect(compareByProperty(b, a, "key", "asc")).toBeGreaterThan(0);
	});

	it("reverses present values when descending", () => {
		const a = taskWith(new Date("2024-01-01"));
		const b = taskWith(new Date("2024-02-01"));
		expect(compareByProperty(a, b, "key", "desc")).toBeGreaterThan(0);
	});

	it("orders numbers numerically, not lexically", () => {
		const a = taskWith(2);
		const b = taskWith(10);
		expect(compareByProperty(a, b, "key", "asc")).toBeLessThan(0);
	});

	it("orders text lexically", () => {
		const a = taskWith("alpha");
		const b = taskWith("beta");
		expect(compareByProperty(a, b, "key", "asc")).toBeLessThan(0);
	});

	it("sorts missing values last ascending and first descending", () => {
		const present = taskWith("value");
		const missing = taskWith(null);

		expect(compareByProperty(present, missing, "key", "asc")).toBeLessThan(0);
		expect(compareByProperty(missing, present, "key", "asc")).toBeGreaterThan(0);

		expect(compareByProperty(present, missing, "key", "desc")).toBeGreaterThan(0);
		expect(compareByProperty(missing, present, "key", "desc")).toBeLessThan(0);
	});

	it("treats two missing values as equal", () => {
		expect(compareByProperty(taskWith(null), taskWith(null), "key", "asc")).toBe(0);
	});

	it("uses unchecked as the first ascending status marker when not explicitly ordered", () => {
		const unchecked = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, " ");
		const inProgress = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "/");

		expect(compareByProperty(
			unchecked,
			inProgress,
			UNIVERSAL_STATUS_PROPERTY_KEY,
			"asc",
			{ statusMarkerOrder: "x/" },
		)).toBeLessThan(0);
	});

	it("lets an explicit space marker move unchecked status elsewhere", () => {
		const unchecked = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, " ");
		const inProgress = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "/");

		expect(compareByProperty(
			unchecked,
			inProgress,
			UNIVERSAL_STATUS_PROPERTY_KEY,
			"asc",
			{ statusMarkerOrder: "/ x" },
		)).toBeGreaterThan(0);
	});

	it("keeps unspecified status markers after explicitly ordered markers", () => {
		const done = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "x");
		const unknown = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "?");

		expect(compareByProperty(
			done,
			unknown,
			UNIVERSAL_STATUS_PROPERTY_KEY,
			"asc",
			{ statusMarkerOrder: "x" },
		)).toBeLessThan(0);
	});

	it("keeps done status markers after unspecified markers when ascending", () => {
		const done = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "x");
		const unknown = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "?");

		expect(compareByProperty(
			done,
			unknown,
			UNIVERSAL_STATUS_PROPERTY_KEY,
			"asc",
			{ statusMarkerOrder: "/x", doneStatusMarkers: "xX" },
		)).toBeGreaterThan(0);
	});

	it("keeps done status markers after unspecified markers when descending", () => {
		const done = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "x");
		const unknown = taskWithKey(UNIVERSAL_STATUS_PROPERTY_KEY, "?");

		expect(compareByProperty(
			done,
			unknown,
			UNIVERSAL_STATUS_PROPERTY_KEY,
			"desc",
			{ statusMarkerOrder: "/x", doneStatusMarkers: "xX" },
		)).toBeGreaterThan(0);
	});
});
