const blockLinkRegexp = /[ \t]\^[a-zA-Z0-9-]+([ \t]*)$/;
const checkboxRegexp = /^(\s*[-*+]\s)\[([^[\]]*)\]/;

/**
 * Creates a duplicate of a raw task line with checkbox reset to unchecked
 * and block link removed.
 */
export function createDuplicateLine(rawLine: string): string {
	return rawLine
		.replace(blockLinkRegexp, "$1")
		.replace(checkboxRegexp, "$1[ ]");
}
