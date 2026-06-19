import {
	type PropertySchema,
	PropertySchemaOption,
	type TaskPropertyMap,
	type PropertyKeyMeta,
	createPropertyMapWithStatus,
	UNIVERSAL_STATUS_PROPERTY_KEY,
} from "./property_schema";
import { getPropertyAliases } from "./normalization";
import { DATE_ONLY_PATTERN, escapeRegExp, parseDateOnly } from "./value_parsers";

const DATE_FIELDS = [
	{ key: "due", label: "Due", emojis: ["📅"] },
	{ key: "scheduled", label: "Scheduled", emojis: ["⏳", "⏰"] },
	{ key: "start", label: "Start", emojis: ["🛫"] },
	{ key: "done", label: "Done", emojis: ["✅", "🏁"] },
	{ key: "created", label: "Created", emojis: ["➕"] },
] as const;

export const TASKS_PRIORITY_OPTIONS = [
	{ value: "highest", label: "Highest", emoji: "🔺", weight: 5 },
	{ value: "high", label: "High", emoji: "⏫", weight: 4 },
	{ value: "medium", label: "Medium", emoji: "🔼", weight: 3 },
	{ value: "low", label: "Low", emoji: "🔽", weight: 2 },
	{ value: "lowest", label: "Lowest", emoji: "⏬", weight: 1 },
] as const;

export type TasksPriorityValue = (typeof TASKS_PRIORITY_OPTIONS)[number]["value"];

const PRIORITY_VALUES = new Map<string, number>(
	TASKS_PRIORITY_OPTIONS.map((option) => [option.emoji, option.weight]),
);

const METADATA_EMOJIS = [
	...DATE_FIELDS.flatMap((field) => field.emojis),
	...PRIORITY_VALUES.keys(),
	"🔁",
];

const RECURRENCE_EMOJI = "🔁";

/**
 * Canonical Tasks-plugin icon for each property key whose icon is fixed
 * (i.e. independent of the value). The primary emoji is used for display.
 * Priority is excluded because its icon encodes the value — see
 * {@link getTasksPriorityEmoji}.
 */
export const TASKS_PROPERTY_ICONS: Readonly<Record<string, string>> = {
	...Object.fromEntries(DATE_FIELDS.map((field) => [field.key, field.emojis[0]])),
	recurrence: RECURRENCE_EMOJI,
};

/**
 * Maps a numeric Tasks-plugin priority weight back to its emoji
 * (5 -> 🔺 … 1 -> ⏬). Returns undefined for unknown weights.
 */
export function getTasksPriorityEmoji(value: number): string | undefined {
	for (const [emoji, weight] of PRIORITY_VALUES) {
		if (weight === value) return emoji;
	}
	return undefined;
}

export function getTasksPriorityOption(value: string | undefined) {
	return TASKS_PRIORITY_OPTIONS.find((option) => option.value === value);
}

export function getTasksPriorityValueFromWeight(weight: number): TasksPriorityValue | undefined {
	return TASKS_PRIORITY_OPTIONS.find((option) => option.weight === weight)?.value;
}

type ParsedField = {
	index: number;
	endIndex: number;
	key: string;
	rawValue: string;
	value: string | number | Date | null;
};

function parseDateFields(rawLine: string): ParsedField[] {
	return DATE_FIELDS.flatMap((field) =>
		field.emojis.flatMap((emoji) => {
			const regex = new RegExp(`${escapeRegExp(emoji)}\\s*(${DATE_ONLY_PATTERN})`, "gu");
			return [...rawLine.matchAll(regex)].map((match) => ({
				index: match.index ?? Number.MAX_SAFE_INTEGER,
				endIndex: (match.index ?? 0) + match[0].length,
				key: field.key,
				rawValue: match[0],
				value: match[1] ? parseDateOnly(match[1]) : null,
			}));
		})
	);
}

function parsePriorityFields(rawLine: string): ParsedField[] {
	const priorityPattern = Array.from(PRIORITY_VALUES.keys()).map(escapeRegExp).join("|");
	const regex = new RegExp(priorityPattern, "gu");

	return [...rawLine.matchAll(regex)].map((match) => ({
		index: match.index ?? Number.MAX_SAFE_INTEGER,
		endIndex: (match.index ?? 0) + match[0].length,
		key: "priority",
		rawValue: match[0],
		value: PRIORITY_VALUES.get(match[0]) ?? null,
	}));
}

function parseRecurrenceFields(rawLine: string): ParsedField[] {
	const metadataPattern = METADATA_EMOJIS.map(escapeRegExp).join("|");
	const regex = new RegExp(`🔁\\s*(.+?)(?=\\s*(?:${metadataPattern})(?:\\s*${DATE_ONLY_PATTERN})?|$)`, "gu");

	return [...rawLine.matchAll(regex)]
		.map((match) => {
			const value = match[1]?.trim() ?? "";
			const rawValue = match[0].trimEnd();
			const index = match.index ?? Number.MAX_SAFE_INTEGER;
			return {
				index,
				endIndex: index + rawValue.length,
				key: "recurrence",
				rawValue,
				value,
			};
		})
		.filter((field) => field.value !== "");
}

export class TasksPluginSchema implements PropertySchema {
	id = PropertySchemaOption.TasksPlugin;
	label = "Tasks Plugin";

	parseProperties(rawLine: string): TaskPropertyMap {
		const properties = createPropertyMapWithStatus(rawLine);
		const parsedFields = [
			...parseDateFields(rawLine),
			...parsePriorityFields(rawLine),
			...parseRecurrenceFields(rawLine),
		].sort((a, b) => a.index - b.index);

		for (const field of parsedFields) {
			if (!properties.has(field.key)) {
				properties.set(field.key, {
					key: field.key,
					rawValue: field.rawValue,
					value: field.value,
					startIndex: field.index,
					endIndex: field.endIndex,
				});
			}
		}

		return properties;
	}

	knownKeys(): PropertyKeyMeta[] {
		return [
			{ key: UNIVERSAL_STATUS_PROPERTY_KEY, label: "Status", type: "text" },
			{ key: "due", label: "Due", type: "date" },
			{ key: "scheduled", label: "Scheduled", type: "date" },
			{ key: "start", label: "Start", type: "date" },
			{ key: "done", label: "Done", type: "date", aliases: getPropertyAliases("done") },
			{ key: "created", label: "Created", type: "date" },
			{ key: "priority", label: "Priority", type: "priority" },
			{ key: "recurrence", label: "Recurrence", type: "text", aliases: getPropertyAliases("recurrence") },
		];
	}
}
