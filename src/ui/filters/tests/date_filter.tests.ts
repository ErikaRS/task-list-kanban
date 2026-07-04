import { afterEach, describe, expect, it, vi } from "vitest";
import {
	TODAY_FILTER_VALUE,
	dateConditionsEqual,
	describeDateConditions,
	getToday,
	resolveConditionDate,
	taskMatchesDateConditions,
} from "../date_filter";
import { parseDateOnly } from "../../../parsing/properties/value_parsers";
import type { TaskPropertyMap } from "../../../parsing/properties/property_schema";
import type {
	DateFilterCondition,
	DateFilterOperator,
} from "../../settings/settings_store";

function taskWithProperties(
	values: Record<string, string | number | Date | null>,
): { properties: TaskPropertyMap } {
	const properties: TaskPropertyMap = new Map();
	for (const [key, value] of Object.entries(values)) {
		properties.set(key, {
			key,
			rawValue: String(value),
			value,
			startIndex: 0,
			endIndex: 0,
		});
	}
	return { properties };
}

function condition(
	property: string,
	operator: DateFilterOperator,
	value: string,
): DateFilterCondition {
	return { property, operator, value };
}

const today = parseDateOnly("2026-07-03")!;

describe("getToday", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns UTC midnight of the local calendar day", () => {
		vi.useFakeTimers();
		// Local time without a timezone suffix, so the local calendar day is
		// 2026-07-03 regardless of the machine's timezone.
		vi.setSystemTime(new Date("2026-07-03T09:30:00"));

		expect(getToday().getTime()).toBe(Date.UTC(2026, 6, 3));
	});

	it("stays on the local day late in the evening", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-03T23:45:00"));

		expect(getToday().getTime()).toBe(Date.UTC(2026, 6, 3));
	});
});

describe("resolveConditionDate", () => {
	it("resolves $TODAY to the provided today", () => {
		expect(
			resolveConditionDate(condition("due", "on", TODAY_FILTER_VALUE), today),
		).toBe(today);
	});

	it("parses a fixed date", () => {
		expect(
			resolveConditionDate(condition("due", "on", "2026-01-15"), today)?.getTime(),
		).toBe(Date.UTC(2026, 0, 15));
	});

	it("returns null for unparseable or empty values", () => {
		expect(resolveConditionDate(condition("due", "on", "not-a-date"), today)).toBeNull();
		expect(resolveConditionDate(condition("due", "on", ""), today)).toBeNull();
		expect(resolveConditionDate(condition("due", "on", "2026-13-40"), today)).toBeNull();
	});
});

describe("describeDateConditions", () => {
	it("labels $TODAY as Today and keeps fixed dates verbatim", () => {
		const conditions = [
			condition("scheduled", "on-or-before", TODAY_FILTER_VALUE),
			condition("due", "before", "2026-07-01"),
		];

		expect(describeDateConditions(conditions)).toBe(
			"scheduled on or before Today; due before 2026-07-01",
		);
	});

	it("maps property keys through the provided label lookup", () => {
		const conditions = [condition("due", "on", TODAY_FILTER_VALUE)];

		expect(
			describeDateConditions(conditions, (key) => key.toUpperCase()),
		).toBe("DUE on Today");
	});
});

describe("dateConditionsEqual", () => {
	const a = condition("due", "before", TODAY_FILTER_VALUE);
	const b = condition("scheduled", "on-or-before", "2026-07-01");

	it("matches identical lists", () => {
		expect(dateConditionsEqual([a, b], [{ ...a }, { ...b }])).toBe(true);
		expect(dateConditionsEqual([], [])).toBe(true);
	});

	it("rejects differing length, order, or fields", () => {
		expect(dateConditionsEqual([a], [a, b])).toBe(false);
		expect(dateConditionsEqual([a, b], [b, a])).toBe(false);
		expect(
			dateConditionsEqual([a], [{ ...a, operator: "after" }]),
		).toBe(false);
		expect(dateConditionsEqual([a], [{ ...a, value: "2026-07-01" }])).toBe(false);
		expect(dateConditionsEqual([a], [{ ...a, property: "start" }])).toBe(false);
	});
});

describe("taskMatchesDateConditions", () => {
	const yesterdayTask = taskWithProperties({ due: parseDateOnly("2026-07-02") });
	const todayTask = taskWithProperties({ due: parseDateOnly("2026-07-03") });
	const tomorrowTask = taskWithProperties({ due: parseDateOnly("2026-07-04") });

	it.each<[DateFilterOperator, boolean, boolean, boolean]>([
		// operator, keeps yesterday, keeps today, keeps tomorrow
		["before", true, false, false],
		["on-or-before", true, true, false],
		["on", false, true, false],
		["on-or-after", false, true, true],
		["after", false, false, true],
	])("applies %s against $TODAY", (operator, keepsYesterday, keepsToday, keepsTomorrow) => {
		const conditions = [condition("due", operator, TODAY_FILTER_VALUE)];

		expect(taskMatchesDateConditions(yesterdayTask, conditions, today)).toBe(keepsYesterday);
		expect(taskMatchesDateConditions(todayTask, conditions, today)).toBe(keepsToday);
		expect(taskMatchesDateConditions(tomorrowTask, conditions, today)).toBe(keepsTomorrow);
	});

	it("compares against a fixed date independently of today", () => {
		const conditions = [condition("due", "after", "2026-07-02")];

		expect(taskMatchesDateConditions(yesterdayTask, conditions, today)).toBe(false);
		expect(taskMatchesDateConditions(todayTask, conditions, today)).toBe(true);
	});

	it("always keeps tasks missing the property", () => {
		const noDates = taskWithProperties({});
		const otherDate = taskWithProperties({ scheduled: parseDateOnly("2020-01-01") });
		const conditions = [condition("due", "on", TODAY_FILTER_VALUE)];

		expect(taskMatchesDateConditions(noDates, conditions, today)).toBe(true);
		expect(taskMatchesDateConditions(otherDate, conditions, today)).toBe(true);
	});

	it("always keeps tasks whose property value is not a date", () => {
		const textValue = taskWithProperties({ due: "soon" });
		const nullValue = taskWithProperties({ due: null });
		const conditions = [condition("due", "before", TODAY_FILTER_VALUE)];

		expect(taskMatchesDateConditions(textValue, conditions, today)).toBe(true);
		expect(taskMatchesDateConditions(nullValue, conditions, today)).toBe(true);
	});

	it("ANDs conditions across properties", () => {
		// The overdue view stacked on the hygiene filter: scheduled on or
		// before today AND due before today.
		const conditions = [
			condition("scheduled", "on-or-before", TODAY_FILTER_VALUE),
			condition("due", "before", TODAY_FILTER_VALUE),
		];

		const overdueAndStarted = taskWithProperties({
			scheduled: parseDateOnly("2026-07-01"),
			due: parseDateOnly("2026-07-02"),
		});
		const overdueButFutureScheduled = taskWithProperties({
			scheduled: parseDateOnly("2026-07-10"),
			due: parseDateOnly("2026-07-02"),
		});
		const startedButDueToday = taskWithProperties({
			scheduled: parseDateOnly("2026-07-01"),
			due: parseDateOnly("2026-07-03"),
		});

		expect(taskMatchesDateConditions(overdueAndStarted, conditions, today)).toBe(true);
		expect(taskMatchesDateConditions(overdueButFutureScheduled, conditions, today)).toBe(false);
		expect(taskMatchesDateConditions(startedButDueToday, conditions, today)).toBe(false);
	});

	it("ANDs conditions on the same property", () => {
		// A closed date range: due on or after July 1, on or before July 3.
		const conditions = [
			condition("due", "on-or-after", "2026-07-01"),
			condition("due", "on-or-before", "2026-07-03"),
		];

		expect(taskMatchesDateConditions(todayTask, conditions, today)).toBe(true);
		expect(taskMatchesDateConditions(tomorrowTask, conditions, today)).toBe(false);
		expect(
			taskMatchesDateConditions(
				taskWithProperties({ due: parseDateOnly("2026-06-30") }),
				conditions,
				today,
			),
		).toBe(false);
	});

	it("only skips the missing property's condition in a multi-condition set", () => {
		// A task with no due date passes the due condition but must still
		// satisfy the scheduled condition.
		const conditions = [
			condition("scheduled", "on-or-before", TODAY_FILTER_VALUE),
			condition("due", "before", TODAY_FILTER_VALUE),
		];

		const undatedDueScheduledPast = taskWithProperties({
			scheduled: parseDateOnly("2026-07-01"),
		});
		const undatedDueScheduledFuture = taskWithProperties({
			scheduled: parseDateOnly("2026-07-10"),
		});

		expect(
			taskMatchesDateConditions(undatedDueScheduledPast, conditions, today),
		).toBe(true);
		expect(
			taskMatchesDateConditions(undatedDueScheduledFuture, conditions, today),
		).toBe(false);
	});

	it("skips invalid conditions while still applying valid ones", () => {
		const conditions = [
			condition("due", "on", "not-a-date"),
			condition("due", "on-or-before", TODAY_FILTER_VALUE),
		];

		expect(taskMatchesDateConditions(todayTask, conditions, today)).toBe(true);
		expect(taskMatchesDateConditions(tomorrowTask, conditions, today)).toBe(false);
	});

	it("matches with no conditions", () => {
		expect(taskMatchesDateConditions(tomorrowTask, [], today)).toBe(true);
	});

	it("truncates datetime values to their local calendar day", () => {
		// A local-time datetime on today's date: whatever the machine timezone,
		// its local calendar day is 2026-07-03.
		const datetimeTask = taskWithProperties({
			due: new Date(2026, 6, 3, 15, 30),
		});

		expect(
			taskMatchesDateConditions(
				datetimeTask,
				[condition("due", "on", TODAY_FILTER_VALUE)],
				today,
			),
		).toBe(true);
		expect(
			taskMatchesDateConditions(
				datetimeTask,
				[condition("due", "after", TODAY_FILTER_VALUE)],
				today,
			),
		).toBe(false);
	});
});
