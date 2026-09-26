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
	// Present for queries using negation or explicit OR. Legacy queries keep
	// their original shape and behavior for compatibility.
	clauses?: FilterClause[];
}

export type FilterAtom =
	| { kind: "content" | "tag" | "file"; value: string; negative: boolean }
	| { kind: "date"; condition: DateFilterCondition; negative: false };

export interface FilterClause {
	atoms: FilterAtom[];
	// Explicit parentheses prevent file alternatives from merging with
	// ungrouped positive file tokens elsewhere in the query.
	explicit?: boolean;
}

export interface FilterQueryResult {
	query: FilterQuery;
	error?: string;
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
	if (query.clauses) return query.clauses.length === 0;
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
function parseLegacyFilterQuery(text: string, dateKeys: string[]): FilterQuery {
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

function rawTokens(text: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quoted = false;
	for (const char of text) {
		if (char === '"') quoted = !quoted;
		if (!quoted && /\s/.test(char)) {
			if (current) tokens.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}

function hasUnquotedParenthesis(text: string): boolean {
	let quoted = false;
	for (const char of text) {
		if (char === '"') quoted = !quoted;
		else if (!quoted && (char === "(" || char === ")")) return true;
	}
	return false;
}

function groupHasOr(tokens: string[], start: number): boolean {
	for (let i = start; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (token === "OR" || token === "OR)") return true;
		if (token.endsWith(")")) return false;
	}
	return false;
}

function hasBooleanSyntax(tokens: string[]): boolean {
	return tokens.some((token, index) => token.startsWith("-")
		|| (token.startsWith("(") && groupHasOr(tokens, index)));
}

function parseSignedAtom(raw: string, dateKeys: string[]): { atoms?: FilterAtom[]; error?: string } {
	const negative = raw.startsWith("-");
	const text = negative ? raw.slice(1) : raw;
	if (!text) return { error: "Add a term after -." };
	if (text.startsWith("(") && negative) return { error: "- can only exclude one term, not a group." };
	const parsed = parseLegacyFilterQuery(text, dateKeys);
	if (parsed.tagGroups.length > 0) {
		const tags = parsed.tagGroups[0]!;
		if (negative && tags.length > 1) return { error: "Exclude tags individually; - cannot apply to a comma list." };
		return { atoms: tags.map((value) => ({ kind: "tag", value, negative })) };
	}
	if (parsed.filePaths.length > 0) {
		if (negative && parsed.filePaths.length > 1) return { error: "Exclude files individually; - cannot apply to a comma list." };
		return { atoms: parsed.filePaths.map((value) => ({ kind: "file", value, negative })) };
	}
	if (parsed.dateConditions.length > 0) {
		if (negative) return { error: "Date comparisons cannot be excluded." };
		return { atoms: [{ kind: "date", condition: parsed.dateConditions[0]!, negative: false }] };
	}
	const value = parsed.contentTerms[0];
	if (!value) return negative
		? { error: "Add a term to the filter." }
		: { atoms: [] };
	return { atoms: [{ kind: "content", value, negative }] };
}

/** Parse a committed query, returning a syntax error without changing its meaning. */
export function parseFilterQueryResult(text: string, dateKeys: string[]): FilterQueryResult {
	const tokens = rawTokens(text);
	if (!hasBooleanSyntax(tokens)) return { query: parseLegacyFilterQuery(text, dateKeys) };

	const clauses: FilterClause[] = [];
	let fileClause: FilterClause | undefined;
	for (let i = 0; i < tokens.length; i++) {
		const raw = tokens[i]!;
		if (raw.startsWith("(") && groupHasOr(tokens, i)) {
			const group: string[] = [];
			let closed = false;
			while (i < tokens.length) {
				const part = tokens[i]!;
				group.push(part);
				if (part.endsWith(")")) { closed = true; break; }
				i++;
			}
			if (!closed) return { query: emptyFilterQuery(), error: "Close the OR group with )." };
			group[0] = group[0]!.slice(1);
			group[group.length - 1] = group[group.length - 1]!.slice(0, -1);
			const parts = group.filter((part) => part !== "");
			if (parts.some(hasUnquotedParenthesis)) {
				return { query: emptyFilterQuery(), error: "OR groups cannot be nested or contain empty terms." };
			}
			const alternatives: string[][] = [[]];
			for (const part of parts) {
				if (part === "OR") alternatives.push([]);
				else alternatives[alternatives.length - 1]!.push(part);
			}
			if (alternatives.length < 2 || alternatives.some((arm) => arm.length !== 1)) {
				return { query: emptyFilterQuery(), error: "Separate each OR alternative with OR inside parentheses." };
			}
			const atoms: FilterAtom[] = [];
			for (const arm of alternatives) {
				const parsed = parseSignedAtom(arm[0]!, dateKeys);
				if (parsed.error) return { query: emptyFilterQuery(), error: parsed.error };
				if (!parsed.atoms?.length) return { query: emptyFilterQuery(), error: "Add a term to every OR alternative." };
				atoms.push(...parsed.atoms);
			}
			clauses.push({ atoms, explicit: true });
			continue;
		}
		if (raw.startsWith("-(")) return { query: emptyFilterQuery(), error: "- can only exclude one term, not a group." };
		const parsed = parseSignedAtom(raw, dateKeys);
		if (parsed.error) return { query: emptyFilterQuery(), error: parsed.error };
		const atoms = parsed.atoms!;
		if (atoms.length === 0) continue;
		if (atoms.every((atom) => atom.kind === "file" && !atom.negative)) {
			if (!fileClause) {
				fileClause = { atoms: [] };
				clauses.push(fileClause);
			}
			fileClause.atoms.push(...atoms);
		} else clauses.push({ atoms });
	}
	return { query: { ...emptyFilterQuery(), clauses } };
}

export function parseFilterQuery(text: string, dateKeys: string[]): FilterQuery {
	return parseFilterQueryResult(text, dateKeys).query;
}

/** Adapt existing flat queries to the clause editor without changing their semantics. */
export function filterQueryClauses(query: FilterQuery): FilterClause[] {
	if (query.clauses) return query.clauses.map((clause) => ({
		atoms: clause.atoms.map((atom) => atom.kind === "date"
			? { ...atom, condition: { ...atom.condition } }
			: { ...atom }),
		explicit: clause.explicit,
	}));
	const clauses: FilterClause[] = [
		...query.contentTerms.map((value) => ({ atoms: [{ kind: "content" as const, value, negative: false }] })),
		...query.tagGroups.map((group) => ({ atoms: group.map((value) => ({ kind: "tag" as const, value, negative: false })) })),
	];
	if (query.filePaths.length) clauses.push({ atoms: query.filePaths.map((value) => ({ kind: "file", value, negative: false })) });
	clauses.push(...query.dateConditions.map((condition) => ({ atoms: [{ kind: "date" as const, condition: { ...condition }, negative: false as const }] })));
	return clauses;
}

/**
 * A content term is quoted when unquoted text would tokenize or parse
 * differently: whitespace, a leading quote, or a leading `word:` prefix
 * (a superset of the recognized prefixes, since date keys vary by schema —
 * over-quoting is harmless and keeps the round-trip schema-independent).
 */
function serializeContentTerm(term: string): string {
	const needsQuoting = /\s/.test(term) || /^[^\s:"]+:/.test(term) || term.startsWith('"') || term.startsWith("-") || term === "OR" || term.startsWith("(") || term.endsWith(")");
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
	if (query.clauses) {
		return query.clauses.map((clause) => {
			const atoms = clause.atoms.map((atom) => {
				let text: string;
				switch (atom.kind) {
					case "content": text = serializeContentTerm(atom.value); break;
					case "tag": text = `tag:${atom.value}`; break;
					case "file": text = `file:${serializeFileEntry(atom.value)}`; break;
					case "date": text = `${atom.condition.property}:${TEXT_BY_OPERATOR[atom.condition.operator]}${atom.condition.value}`; break;
				}
				return atom.negative ? `-${text}` : text;
			});
			if (clause.explicit && atoms.length > 1) return `(${atoms.join(" OR ")})`;
			if (atoms.length > 1 && clause.atoms.every((atom) => atom.kind === "tag" && !atom.negative)) {
				return `tag:${clause.atoms.map((atom) => (atom as { value: string }).value).join(",")}`;
			}
			if (atoms.length > 1 && clause.atoms.every((atom) => atom.kind === "file" && !atom.negative)) {
				return `file:${clause.atoms.map((atom) => serializeFileEntry((atom as { value: string }).value)).join(",")}`;
			}
			return atoms.length > 1 ? `(${atoms.join(" OR ")})` : atoms[0] ?? "";
		}).filter(Boolean).join(" ");
	}
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
	if (query.clauses) {
		let descendants: SourceBlockNode[] | undefined;
		let texts: string[] | undefined;
		let tags: Set<string> | undefined;
		const getDescendants = () => descendants ??= task.sourceChildren?.length
			? flattenSourceBlockNodes(task.sourceChildren)
			: [];
		return query.clauses.every((clause) => clause.atoms.some((atom) => {
			let matches: boolean;
			switch (atom.kind) {
				case "content":
					texts ??= [task.content, ...getDescendants().map(getSourceNodeText)].map((text) => text.toLowerCase());
					matches = texts.some((text) => text.includes(atom.value.toLowerCase()));
					break;
				case "tag":
					if (!tags) {
						tags = new Set(task.tags);
						for (const node of getDescendants()) {
							for (const tag of getTagsFromContent(getSourceNodeText(node))) tags.add(tag);
						}
					}
					matches = tags.has(atom.value);
					break;
				case "file": matches = task.path.toLowerCase().includes(atom.value.toLowerCase()); break;
				case "date": matches = taskMatchesDateConditions(task, [atom.condition], today); break;
			}
			return atom.negative ? !matches : matches;
		}));
	}
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
