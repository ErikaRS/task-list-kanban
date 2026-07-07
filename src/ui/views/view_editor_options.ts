import { ColumnOrderMode } from "../../parsing/properties/comparators";

/**
 * The option-value protocol shared by the view editor's sort and group
 * selects and the board logic that reads them: non-property choices use
 * sentinel values, property choices encode their key as `prop:<key>`.
 */
export const SORT_FILE_VALUE = "__file__";
export const SORT_TASK_NAME_VALUE = "__task_name__";
export const SORT_MANUAL_VALUE = "__manual__";

const PROPERTY_OPTION_PREFIX = "prop:";

export function propertyOptionValue(key: string): string {
	return `${PROPERTY_OPTION_PREFIX}${key}`;
}

/** The property key an option value encodes, or undefined for sentinels. */
export function propertyKeyFromOptionValue(value: string): string | undefined {
	return value.startsWith(PROPERTY_OPTION_PREFIX)
		? value.slice(PROPERTY_OPTION_PREFIX.length)
		: undefined;
}

export function sortSelectValueFor(
	mode: ColumnOrderMode,
	sortProperty: string | null | undefined,
): string {
	switch (mode) {
		case ColumnOrderMode.Manual:
			return SORT_MANUAL_VALUE;
		case ColumnOrderMode.TaskName:
			return SORT_TASK_NAME_VALUE;
		case ColumnOrderMode.Property:
			return sortProperty ? propertyOptionValue(sortProperty) : SORT_FILE_VALUE;
		default:
			return SORT_FILE_VALUE;
	}
}

/**
 * The sort selection an option value encodes. `property` is present only
 * for property sorts, so callers can leave the last-used sort property
 * untouched when switching between non-property modes.
 */
export function sortSelectionFromValue(value: string): {
	mode: ColumnOrderMode;
	property?: string;
} {
	const property = propertyKeyFromOptionValue(value);
	if (property !== undefined) {
		return { mode: ColumnOrderMode.Property, property };
	}
	if (value === SORT_TASK_NAME_VALUE) {
		return { mode: ColumnOrderMode.TaskName };
	}
	if (value === SORT_MANUAL_VALUE) {
		return { mode: ColumnOrderMode.Manual };
	}
	return { mode: ColumnOrderMode.FileOrder };
}
