export enum PropertySchemaOption {
	None = "none",
	TasksPlugin = "tasks",
	Dataview = "dataview",
}

export interface PropertyKeyMeta {
	key: string;
	label: string;
	type: "date" | "number" | "text" | "priority";
}

export interface TaskProperty {
	key: string;
	rawValue: string;
	value: string | number | Date | null;
}

export type TaskPropertyMap = Map<string, TaskProperty>;

export interface PropertySchema {
	id: PropertySchemaOption;
	label: string;
	parseProperties(rawLine: string): TaskPropertyMap;
	knownKeys(): PropertyKeyMeta[];
}

export const UNIVERSAL_STATUS_PROPERTY_KEY = "status";

/**
 * Extracts the universal status property from a raw task line.
 * This looks for the character between the square brackets `[<char>]`.
 */
export function parseUniversalStatus(rawLine: string): TaskProperty {
	// Look for the standard task checkbox pattern: optional whitespace, list marker, space, bracket, char, bracket
	const match = rawLine.match(/^\s*[-*+]\s\[([^\[\]]*)\]/);
	const statusChar = match ? match[1] ?? " " : " ";
	
	// Default to a single space if empty or multiple characters are found
	// (though multi-character within brackets should technically be handled carefully,
	//  the original code logic assumes exactly one character, or empty string.
	//  If empty, we treat as " " based on old `_displayStatus = status || " "`).
	const value = statusChar === "" ? " " : statusChar.charAt(0);
	
	return {
		key: UNIVERSAL_STATUS_PROPERTY_KEY,
		rawValue: value,
		value: value,
	};
}
