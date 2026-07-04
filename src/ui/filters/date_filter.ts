import { parseDateOnly } from "../../parsing/properties/value_parsers";
import type { TaskPropertyMap } from "../../parsing/properties/property_schema";
import type {
	DateFilterCondition,
	DateFilterOperator,
} from "../settings/settings_store";

export const TODAY_FILTER_VALUE = "$TODAY";

export const DATE_FILTER_OPERATORS: ReadonlyArray<{
	value: DateFilterOperator;
	label: string;
}> = [
	{ value: "before", label: "before" },
	{ value: "on-or-before", label: "on or before" },
	{ value: "on", label: "on" },
	{ value: "on-or-after", label: "on or after" },
	{ value: "after", label: "after" },
];

/**
 * UTC midnight of the user's local calendar day. Parsed date-only values are
 * stored as UTC midnight of their written calendar date (see parseDateOnly),
 * so encoding "today" the same way makes every comparison an exact
 * local-calendar-day comparison via getTime().
 */
export function getToday(): Date {
	const now = new Date();
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Resolves the condition's value to a comparison date, or null for an
 * invalid/incomplete condition (unparseable or empty fixed date). Null
 * conditions are skipped rather than hiding tasks.
 */
export function resolveConditionDate(
	condition: DateFilterCondition,
	today: Date,
): Date | null {
	if (condition.value === TODAY_FILTER_VALUE) {
		return today;
	}
	return parseDateOnly(condition.value);
}

/**
 * Values at exactly UTC midnight are the canonical date-only encoding and
 * pass through; datetime values (Dataview) are truncated to their local
 * calendar day so they compare consistently with $TODAY and date-only values.
 */
function toCalendarDay(value: Date): Date {
	const isDateOnlyEncoding =
		value.getUTCHours() === 0 &&
		value.getUTCMinutes() === 0 &&
		value.getUTCSeconds() === 0 &&
		value.getUTCMilliseconds() === 0;
	if (isDateOnlyEncoding) {
		return value;
	}
	return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

function matchesOperator(
	taskDay: number,
	conditionDay: number,
	operator: DateFilterOperator,
): boolean {
	switch (operator) {
		case "before":
			return taskDay < conditionDay;
		case "on-or-before":
			return taskDay <= conditionDay;
		case "on":
			return taskDay === conditionDay;
		case "on-or-after":
			return taskDay >= conditionDay;
		case "after":
			return taskDay > conditionDay;
	}
}

/**
 * ANDs all valid conditions. A task with no value (or a non-date value) for
 * a condition's property always passes that condition: filters never hide
 * tasks that lack the filtered property.
 */
export function taskMatchesDateConditions(
	task: { properties: TaskPropertyMap },
	conditions: DateFilterCondition[],
	today: Date,
): boolean {
	for (const condition of conditions) {
		const conditionDate = resolveConditionDate(condition, today);
		if (!conditionDate) {
			continue;
		}

		const value = task.properties.get(condition.property)?.value;
		if (!(value instanceof Date)) {
			continue;
		}

		if (
			!matchesOperator(
				toCalendarDay(value).getTime(),
				conditionDate.getTime(),
				condition.operator,
			)
		) {
			return false;
		}
	}
	return true;
}
