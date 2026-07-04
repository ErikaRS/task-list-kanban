import { parseDateOnly } from "../../parsing/properties/value_parsers";
import type { TaskPropertyMap } from "../../parsing/properties/property_schema";
import { getTagsFromContent } from "../../parsing/tags/tags";
import {
	flattenSourceBlockNodes,
	getSourceNodeText,
	type SourceBlockNode,
} from "../tasks/source_block";
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
	// One OR-group: a task matches when its path contains any entry. A task
	// has exactly one path, so AND-ing path substrings is rarely
	// satisfiable; repeated `file:` tokens merge into this list.
	filePaths: string[];
	dateConditions: DateFilterCondition[];
}

export interface FilterableTask {
	content: string;
	path: string;
	tags: ReadonlySet<string>;
	properties: TaskPropertyMap;
	// Nested subtask/note rows rendered on the card (populated when "treat
	// nested tasks as subtasks" is on). Content and tag matching search
	// these along with the task's own line — the card matches if any of its
	// rendered rows satisfies each token.
	sourceChildren?: SourceBlockNode[];
}

const OPERATORS_BY_TEXT: ReadonlyArray<[string, DateFilterOperator]> = [
	// Two-character operators must be tried before their one-character prefixes.
	["<=", "on-or-before"],
	[">=", "on-or-after"],
	["<", "before"],
	[">", "after"],
	["=", "on"],
];

export const TEXT_BY_OPERATOR: Record<DateFilterOperator, string> = {
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
			// Comma = "any of", like tags. A comma inside a file name is not
			// expressible (same class of loss as a literal quote).
			query.filePaths.push(
				...rest.split(",").filter((path) => path !== ""),
			);
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

function serializeFileEntry(path: string): string {
	return /\s/.test(path) ? `"${path}"` : path;
}

/**
 * Content-only parsing/serialization for the structured editor's Content
 * field: the same tokenizer and quoting rules as the full query (bare
 * words are independent terms, quotes bind a phrase), but every token is
 * a content term — prefixes are never interpreted.
 */
export function parseContentTerms(text: string): string[] {
	return tokenize(text)
		.map(segmentsText)
		.filter((term) => term !== "");
}

export function serializeContentTerms(terms: string[]): string {
	return terms.map(serializeContentTerm).join(" ");
}

/**
 * Inverse of parseFilterQuery: `parse(serialize(query))` equals `query`
 * for any query whose terms contain no `"` (not expressible in the syntax).
 */
export function serializeFilterQuery(query: FilterQuery): string {
	return [
		...query.contentTerms.map(serializeContentTerm),
		...query.tagGroups.map((group) => `tag:${group.join(",")}`),
		...(query.filePaths.length > 0
			? [`file:${query.filePaths.map(serializeFileEntry).join(",")}`]
			: []),
		...query.dateConditions.map(
			(condition) =>
				`${condition.property}:${TEXT_BY_OPERATOR[condition.operator]}${condition.value}`,
		),
	].join(" ");
}

/**
 * ANDs every part of the query. Content and file matching is
 * case-insensitive substring; tag matching is exact set membership with OR
 * inside each group; the file list is one OR-group (any entry may match);
 * date conditions follow taskMatchesDateConditions (missing/non-date
 * property values always pass).
 *
 * Content terms and tag groups match against the whole rendered card: the
 * task's own line plus every nested subtask/note row. Each token is
 * satisfied independently by any row, so `fix tag:home` matches a card
 * whose parent carries #home while a subtask says "fix". File paths and
 * date properties belong to the top-level task only.
 */
export function taskMatchesFilterQuery(
	task: FilterableTask,
	query: FilterQuery,
	today: Date,
): boolean {
	const descendants = task.sourceChildren?.length
		? flattenSourceBlockNodes(task.sourceChildren)
		: [];

	if (query.contentTerms.length > 0) {
		const texts = [
			task.content,
			...descendants.map(getSourceNodeText),
		].map((text) => text.toLowerCase());
		const matchesEveryTerm = query.contentTerms.every((term) => {
			const needle = term.toLowerCase();
			return texts.some((text) => text.includes(needle));
		});
		if (!matchesEveryTerm) {
			return false;
		}
	}

	if (query.tagGroups.length > 0) {
		const tags = new Set(task.tags);
		for (const node of descendants) {
			for (const tag of getTagsFromContent(getSourceNodeText(node))) {
				tags.add(tag);
			}
		}
		if (!query.tagGroups.every((group) => group.some((tag) => tags.has(tag)))) {
			return false;
		}
	}

	if (query.filePaths.length > 0) {
		const path = task.path.toLowerCase();
		if (!query.filePaths.some((term) => path.includes(term.toLowerCase()))) {
			return false;
		}
	}

	return taskMatchesDateConditions(task, query.dateConditions, today);
}
