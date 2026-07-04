import { parseDateOnly } from "../../parsing/properties/value_parsers";
import type { TaskPropertyMap } from "../../parsing/properties/property_schema";
import type {
	DateFilterCondition,
	DateFilterOperator,
} from "../settings/settings_store";
import { TODAY_FILTER_VALUE, taskMatchesDateConditions } from "./date_filter";

/**
 * Parsed form of the unified filter query (SPEC 0029). All parts AND
 * together; the only disjunction is inside a tag group.
 */
export interface FilterQuery {
	contentTerms: string[];
	// AND of OR-groups: each inner array is one `tag:` token; a task matches
	// a group by carrying any tag in it, and must match every group.
	tagGroups: string[][];
	filePaths: string[];
	dateConditions: DateFilterCondition[];
}

export interface FilterableTask {
	content: string;
	path: string;
	tags: ReadonlySet<string>;
	properties: TaskPropertyMap;
}

const OPERATORS_BY_TEXT: ReadonlyArray<[string, DateFilterOperator]> = [
	// Two-character operators must be tried before their one-character prefixes.
	["<=", "on-or-before"],
	[">=", "on-or-after"],
	["<", "before"],
	[">", "after"],
	["=", "on"],
];

const TEXT_BY_OPERATOR: Record<DateFilterOperator, string> = {
	before: "<",
	"on-or-before": "<=",
	on: "=",
	"on-or-after": ">=",
	after: ">",
};

export function emptyFilterQuery(): FilterQuery {
	return { contentTerms: [], tagGroups: [], filePaths: [], dateConditions: [] };
}

export function isEmptyFilterQuery(query: FilterQuery): boolean {
	return (
		query.contentTerms.length === 0 &&
		query.tagGroups.length === 0 &&
		query.filePaths.length === 0 &&
		query.dateConditions.length === 0
	);
}

interface TokenSegment {
	text: string;
	quoted: boolean;
}

/**
 * Splits the query into whitespace-separated tokens. A `"` opens a quoted
 * region running to the next `"` (or end of input); quoted regions may sit
 * anywhere in a token (`"a b"`, `file:"a b"`) and protect whitespace. There
 * is no escape syntax, so a literal `"` is not expressible.
 */
function tokenize(text: string): TokenSegment[][] {
	const tokens: TokenSegment[][] = [];
	let segments: TokenSegment[] = [];
	let current = "";
	let quoted = false;

	const endSegment = () => {
		if (current !== "" || quoted) {
			segments.push({ text: current, quoted });
		}
		current = "";
	};
	const endToken = () => {
		endSegment();
		if (segments.length > 0) {
			tokens.push(segments);
		}
		segments = [];
	};

	for (const char of text) {
		if (char === '"') {
			endSegment();
			quoted = !quoted;
		} else if (!quoted && /\s/.test(char)) {
			endToken();
		} else {
			current += char;
		}
	}
	endToken();

	return tokens;
}

function segmentsText(segments: TokenSegment[]): string {
	return segments.map((segment) => segment.text).join("");
}

function parseDateToken(
	property: string,
	rest: string,
): DateFilterCondition | null {
	const operatorEntry = OPERATORS_BY_TEXT.find(([text]) =>
		rest.startsWith(text),
	);
	if (!operatorEntry) {
		return null;
	}

	const rawValue = rest.slice(operatorEntry[0].length);
	// `today` / `$today` in any case canonicalizes to $TODAY.
	if (/^\$?today$/i.test(rawValue)) {
		return { property, operator: operatorEntry[1], value: TODAY_FILTER_VALUE };
	}
	if (parseDateOnly(rawValue)) {
		return { property, operator: operatorEntry[1], value: rawValue };
	}
	return null;
}

/**
 * Parses the search bar text into a query. `dateKeys` is the active
 * property schema's date-typed keys; tokens shaped like `<key>:<op><value>`
 * are date conditions only when the key matches one of them
 * (case-insensitively, canonicalized to the schema's key). Any token that
 * is not a recognized `tag:` / `file:` / date token — including a
 * date-shaped token whose op/value doesn't parse — falls back to a content
 * term, so the board visibly over-filters instead of silently dropping it.
 */
export function parseFilterQuery(text: string, dateKeys: string[]): FilterQuery {
	const query = emptyFilterQuery();

	for (const segments of tokenize(text)) {
		const first = segments[0]!;
		const colonIndex = first.quoted ? -1 : first.text.indexOf(":");
		if (colonIndex <= 0) {
			const term = segmentsText(segments);
			if (term !== "") {
				query.contentTerms.push(term);
			}
			continue;
		}

		const prefix = first.text.slice(0, colonIndex).toLowerCase();
		const rest =
			first.text.slice(colonIndex + 1) + segmentsText(segments.slice(1));

		if (prefix === "tag") {
			// Tags never contain commas/spaces/quotes, so a bare comma split is
			// safe; empty entries (`tag:a,,b`, trailing comma) are dropped.
			const tags = rest.split(",").filter((tag) => tag !== "");
			if (tags.length > 0) {
				query.tagGroups.push(tags);
			}
			continue;
		}

		if (prefix === "file") {
			if (rest !== "") {
				query.filePaths.push(rest);
			}
			continue;
		}

		const dateKey = dateKeys.find((key) => key.toLowerCase() === prefix);
		if (dateKey) {
			const condition = parseDateToken(dateKey, rest);
			if (condition) {
				query.dateConditions.push(condition);
				continue;
			}
		}

		query.contentTerms.push(segmentsText(segments));
	}

	return query;
}

/**
 * A content term is quoted when unquoted text would tokenize or parse
 * differently: whitespace, a leading quote, or a leading `word:` prefix
 * (a superset of the recognized prefixes, since date keys vary by schema —
 * over-quoting is harmless and keeps the round-trip schema-independent).
 */
function serializeContentTerm(term: string): string {
	const needsQuoting = /\s/.test(term) || /^[^\s:"]+:/.test(term) || term.startsWith('"');
	return needsQuoting ? `"${term}"` : term;
}

function serializeFileTerm(path: string): string {
	return /\s/.test(path) ? `file:"${path}"` : `file:${path}`;
}

/**
 * Inverse of parseFilterQuery: `parse(serialize(query))` equals `query`
 * for any query whose terms contain no `"` (not expressible in the syntax).
 */
export function serializeFilterQuery(query: FilterQuery): string {
	return [
		...query.contentTerms.map(serializeContentTerm),
		...query.tagGroups.map((group) => `tag:${group.join(",")}`),
		...query.filePaths.map(serializeFileTerm),
		...query.dateConditions.map(
			(condition) =>
				`${condition.property}:${TEXT_BY_OPERATOR[condition.operator]}${condition.value}`,
		),
	].join(" ");
}

/**
 * ANDs every part of the query. Content and file matching is
 * case-insensitive substring; tag matching is exact set membership with OR
 * inside each group; date conditions follow taskMatchesDateConditions
 * (missing/non-date property values always pass).
 */
export function taskMatchesFilterQuery(
	task: FilterableTask,
	query: FilterQuery,
	today: Date,
): boolean {
	const content = task.content.toLowerCase();
	if (!query.contentTerms.every((term) => content.includes(term.toLowerCase()))) {
		return false;
	}

	if (!query.tagGroups.every((group) => group.some((tag) => task.tags.has(tag)))) {
		return false;
	}

	const path = task.path.toLowerCase();
	if (!query.filePaths.every((term) => path.includes(term.toLowerCase()))) {
		return false;
	}

	return taskMatchesDateConditions(task, query.dateConditions, today);
}
