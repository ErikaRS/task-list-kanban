export enum PropertySchemaOption {
	None = "none",
	TasksPlugin = "tasks",
	Dataview = "dataview",
}

export interface PropertyKeyMeta {
	key: string;
	label: string;
	type: "date" | "number" | "text" | "priority";
	aliases?: string[];
}

export interface TaskProperty {
	key: string;
	rawValue: string;
	value: string | number | Date | null;
	startIndex: number;
	endIndex: number;
}

export type TaskPropertyMap = Map<string, TaskProperty>;

export interface PropertySchema {
	id: PropertySchemaOption;
	label: string;
	parseProperties(rawLine: string): TaskPropertyMap;
	knownKeys(): PropertyKeyMeta[];
}

export const UNIVERSAL_STATUS_PROPERTY_KEY = "status";

function findStatusRange(statusMatch: RegExpMatchArray | null): { startIndex: number; endIndex: number } {
	if (!statusMatch?.[0]) {
		return { startIndex: -1, endIndex: -1 };
	}

	const bracketIndex = statusMatch[0].indexOf("[");
	const startIndex = bracketIndex >= 0 ? bracketIndex + 1 : -1;
	const endIndex = startIndex >= 0 ? startIndex + (statusMatch[1]?.length ?? 0) : -1;

	return { startIndex, endIndex };
}

/**
 * Extracts the universal status property from a raw task line.
 * This looks for the character between the square brackets `[<char>]`.
 */
export function parseUniversalStatus(rawLine: string): TaskProperty {
	// Look for the standard task checkbox pattern: optional whitespace, list marker, space, bracket, char, bracket
	const match = rawLine.match(/^\s*[-*+]\s\[([^\[\]]*)\]/);
	const statusChar = match ? match[1] ?? " " : " ";
	const { startIndex, endIndex } = findStatusRange(match);

	// Default to a single space if empty or multiple characters are found
	// (matching Task.displayStatus behavior while preserving Unicode code points).
	const value = statusChar === "" ? " " : Array.from(statusChar)[0] ?? " ";

	return {
		key: UNIVERSAL_STATUS_PROPERTY_KEY,
		rawValue: value,
		value: value,
		startIndex,
		endIndex,
	};
}

export function createPropertyMapWithStatus(rawLine: string): TaskPropertyMap {
	const properties: TaskPropertyMap = new Map();
	const statusProp = parseUniversalStatus(rawLine);
	properties.set(UNIVERSAL_STATUS_PROPERTY_KEY, statusProp);
	return properties;
}
