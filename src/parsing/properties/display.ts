import { UNIVERSAL_STATUS_PROPERTY_KEY, type TaskProperty } from "./property_schema";
import { TASKS_PROPERTY_ICONS, getTasksPriorityEmoji, getTasksPriorityOption } from "./tasks_schema";

/**
 * Human-readable labels for the numeric Tasks-plugin priority weights
 * (see PRIORITY_VALUES in tasks_schema.ts: 🔺=5 … ⏬=1).
 */
const PRIORITY_LABELS: Record<number, string> = {
	5: "Highest",
	4: "High",
	3: "Medium",
	2: "Low",
	1: "Lowest",
};

export function formatPriorityColumnLabel(value: string | undefined): string {
	return getTasksPriorityOption(value)?.label ?? (value ? formatPropertyLabel(value) : "");
}

/**
 * A property formatted for display on a task card.
 *
 * When `icon` is set (a Tasks-plugin emoji), it stands in for `label` on the
 * card; `label` is always populated as an accessible fallback.
 */
export interface DisplayProperty {
	key: string;
	label: string;
	value: string;
	icon?: string;
}

/**
 * Turns a property key into a display label (e.g. "due" -> "Due").
 * Schema metadata isn't available at render time, so we capitalize the key.
 */
export function formatPropertyLabel(key: string): string {
	if (!key) return key;
	return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Formats a parsed property value for "Pretty" display. Presentation is
 * inferred from the runtime value type, with a key-based special case for
 * priority weights:
 * - Date -> locale-short value such as "Jan 20"
 * - priority number -> label such as "High"
 * - everything else -> the raw text as written
 */
export function formatPropertyValue(prop: TaskProperty): string {
	if (prop.value instanceof Date) {
		return prop.value.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	}

	if (prop.key === "priority" && typeof prop.value === "number") {
		return PRIORITY_LABELS[prop.value] ?? String(prop.value);
	}

	if (prop.value === null) {
		return prop.rawValue;
	}

	return String(prop.value);
}

/**
 * Resolves the Tasks-plugin emoji icon for a property, if one applies.
 * Date/recurrence keys have a fixed icon; priority's icon is value-derived.
 */
export function tasksIconFor(prop: TaskProperty): string | undefined {
	if (prop.key === "priority" && typeof prop.value === "number") {
		return getTasksPriorityEmoji(prop.value);
	}
	return TASKS_PROPERTY_ICONS[prop.key];
}

/**
 * Removes the raw text of every property shown in the "Pretty" strip from the
 * task body, so a property isn't displayed twice (once inline, once as a chip).
 * This mirrors how consolidated tags are stripped from the body and moved to
 * the footer. The universal `status` property lives in the checkbox and is left
 * untouched. Whitespace left behind is collapsed, matching tag stripping.
 */
export function stripDisplayedPropertiesFromContent(
	content: string,
	properties: ReadonlyMap<string, TaskProperty>
): string {
	let result = content;
	for (const [key, prop] of properties) {
		if (key === UNIVERSAL_STATUS_PROPERTY_KEY) continue;
		if (!prop.rawValue) continue;
		result = result.split(prop.rawValue).join(" ");
	}
	return result.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Builds the ordered list of properties to render in the "Pretty" strip.
 * The universal `status` property is omitted because the checkbox already
 * conveys it on the card. Recognized Tasks-plugin properties carry their
 * emoji icon so the strip mirrors Tasks-plugin notation.
 */
export function toDisplayProperties(
	properties: ReadonlyMap<string, TaskProperty>
): DisplayProperty[] {
	const result: DisplayProperty[] = [];
	for (const [key, prop] of properties) {
		if (key === UNIVERSAL_STATUS_PROPERTY_KEY) continue;
		result.push({
			key,
			label: formatPropertyLabel(key),
			value: formatPropertyValue(prop),
			icon: tasksIconFor(prop),
		});
	}
	return result;
}
