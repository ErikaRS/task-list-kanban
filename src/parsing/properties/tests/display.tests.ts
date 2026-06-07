import { describe, it, expect } from "vitest";
import {
	formatPropertyLabel,
	formatPropertyValue,
	stripDisplayedPropertiesFromContent,
	tasksIconFor,
	toDisplayProperties,
} from "../display";
import {
	UNIVERSAL_STATUS_PROPERTY_KEY,
	type TaskProperty,
	type TaskPropertyMap,
} from "../property_schema";

function prop(
	key: string,
	value: TaskProperty["value"],
	rawValue = String(value)
): TaskProperty {
	return { key, rawValue, value, startIndex: 0, endIndex: 0 };
}

describe("formatPropertyLabel", () => {
	it("capitalizes the key", () => {
		expect(formatPropertyLabel("due")).toBe("Due");
		expect(formatPropertyLabel("scheduled")).toBe("Scheduled");
	});

	it("leaves an empty key unchanged", () => {
		expect(formatPropertyLabel("")).toBe("");
	});
});

describe("formatPropertyValue", () => {
	it("formats dates as a locale-short month/day", () => {
		const value = formatPropertyValue(prop("due", new Date(Date.UTC(2024, 0, 20))));
		expect(value).toBe("Jan 20");
	});

	it("maps priority weights to labels", () => {
		expect(formatPropertyValue(prop("priority", 5))).toBe("Highest");
		expect(formatPropertyValue(prop("priority", 4))).toBe("High");
		expect(formatPropertyValue(prop("priority", 1))).toBe("Lowest");
	});

	it("falls back to the number for unknown priority weights", () => {
		expect(formatPropertyValue(prop("priority", 9))).toBe("9");
	});

	it("renders text values as-is", () => {
		expect(formatPropertyValue(prop("recurrence", "every week"))).toBe("every week");
	});

	it("uses the raw value when the parsed value is null", () => {
		expect(formatPropertyValue(prop("due", null, "not-a-date"))).toBe("not-a-date");
	});
});

describe("stripDisplayedPropertiesFromContent", () => {
	it("removes Tasks-plugin property text from the body", () => {
		const map: TaskPropertyMap = new Map([
			[UNIVERSAL_STATUS_PROPERTY_KEY, prop(UNIVERSAL_STATUS_PROPERTY_KEY, " ")],
			["due", prop("due", new Date(Date.UTC(2024, 0, 20)), "📅 2024-01-20")],
			["priority", prop("priority", 4, "⏫")],
		]);
		expect(
			stripDisplayedPropertiesFromContent("Fix login bug 📅 2024-01-20 ⏫", map)
		).toBe("Fix login bug");
	});

	it("removes Dataview inline fields from the body", () => {
		const map: TaskPropertyMap = new Map([
			["due", prop("due", new Date(Date.UTC(2024, 0, 20)), "[due:: 2024-01-20]")],
		]);
		expect(
			stripDisplayedPropertiesFromContent("Write docs [due:: 2024-01-20]", map)
		).toBe("Write docs");
	});

	it("leaves the status property (and its char) in place", () => {
		const map: TaskPropertyMap = new Map([
			[UNIVERSAL_STATUS_PROPERTY_KEY, prop(UNIVERSAL_STATUS_PROPERTY_KEY, "x")],
		]);
		expect(stripDisplayedPropertiesFromContent("Task x text", map)).toBe("Task x text");
	});

	it("collapses whitespace left between remaining words", () => {
		const map: TaskPropertyMap = new Map([
			["priority", prop("priority", 4, "⏫")],
		]);
		expect(stripDisplayedPropertiesFromContent("Do ⏫ thing", map)).toBe("Do thing");
	});
});

describe("tasksIconFor", () => {
	it("returns the fixed icon for date keys", () => {
		expect(tasksIconFor(prop("due", new Date(Date.UTC(2024, 0, 20))))).toBe("📅");
		expect(tasksIconFor(prop("scheduled", new Date(Date.UTC(2024, 0, 20))))).toBe("⏳");
		expect(tasksIconFor(prop("start", new Date(Date.UTC(2024, 0, 20))))).toBe("🛫");
	});

	it("returns the recurrence icon", () => {
		expect(tasksIconFor(prop("recurrence", "every week"))).toBe("🔁");
	});

	it("derives the priority icon from the numeric weight", () => {
		expect(tasksIconFor(prop("priority", 4))).toBe("⏫");
		expect(tasksIconFor(prop("priority", 1))).toBe("⏬");
	});

	it("has no icon for non-numeric priority (e.g. Dataview text)", () => {
		expect(tasksIconFor(prop("priority", "medium"))).toBeUndefined();
	});

	it("has no icon for unrecognized keys", () => {
		expect(tasksIconFor(prop("custom", "value"))).toBeUndefined();
	});
});

describe("toDisplayProperties", () => {
	it("omits the universal status property and carries Tasks icons", () => {
		const map: TaskPropertyMap = new Map([
			[UNIVERSAL_STATUS_PROPERTY_KEY, prop(UNIVERSAL_STATUS_PROPERTY_KEY, " ")],
			["due", prop("due", new Date(Date.UTC(2024, 0, 20)))],
		]);
		const result = toDisplayProperties(map);
		expect(result).toEqual([
			{ key: "due", label: "Due", value: "Jan 20", icon: "📅" },
		]);
	});

	it("leaves unrecognized keys without an icon", () => {
		const map: TaskPropertyMap = new Map([["custom", prop("custom", "value")]]);
		expect(toDisplayProperties(map)[0]?.icon).toBeUndefined();
	});

	it("preserves insertion order", () => {
		const map: TaskPropertyMap = new Map([
			["priority", prop("priority", 4)],
			["due", prop("due", new Date(Date.UTC(2024, 0, 20)))],
		]);
		expect(toDisplayProperties(map).map((p) => p.key)).toEqual(["priority", "due"]);
	});
});
