import { describe, it, expect } from "vitest";
import { compareByProperty } from "../comparators";
import type { Task } from "../../../ui/tasks/task";
import { PropertySchemaOption, UNIVERSAL_STATUS_PROPERTY_KEY } from "../property_schema";

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

	it("orders priority values numerically when they are textual", () => {
		const high = taskWithKey("priority", "high");
		const medium = taskWithKey("priority", "medium");
		const low = taskWithKey("priority", "low");

		// Ascending: low (2) < medium (3) < high (4)
		expect(compareByProperty(low, medium, "priority", "asc")).toBeLessThan(0);
		expect(compareByProperty(medium, high, "priority", "asc")).toBeLessThan(0);
		expect(compareByProperty(high, low, "priority", "asc")).toBeGreaterThan(0);

		// Descending: high (4) > medium (3) > low (2)
		expect(compareByProperty(high, medium, "priority", "desc")).toBeLessThan(0);
		expect(compareByProperty(medium, low, "priority", "desc")).toBeLessThan(0);
	});

	it("orders priority values numerically when they are mixed text and numbers", () => {
		const highText = taskWithKey("priority", "High");
		const lowNum = taskWithKey("priority", 2);

		expect(compareByProperty(lowNum, highText, "priority", "asc")).toBeLessThan(0);
		expect(compareByProperty(highText, lowNum, "priority", "asc")).toBeGreaterThan(0);
	});

	it("sorts missing Dataview priorities after present priorities", () => {
		const high = taskWithKey("priority", "high");
		const missing = taskWithKey("priority", null);

		expect(compareByProperty(high, missing, "priority", "desc", {
			propertySchema: PropertySchemaOption.Dataview,
		})).toBeLessThan(0);
		expect(compareByProperty(missing, high, "priority", "desc", {
			propertySchema: PropertySchemaOption.Dataview,
		})).toBeGreaterThan(0);
	});

	it("sorts missing Tasks priorities after medium and before low", () => {
		const medium = taskWithKey("priority", 3);
		const missing = taskWithKey("priority", null);
		const low = taskWithKey("priority", 2);
		const options = { propertySchema: PropertySchemaOption.TasksPlugin };

		expect(compareByProperty(medium, missing, "priority", "desc", options)).toBeLessThan(0);
		expect(compareByProperty(missing, low, "priority", "desc", options)).toBeLessThan(0);
	});
});
