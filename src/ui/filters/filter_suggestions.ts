import { DATE_FILTER_OPERATORS, TODAY_FILTER_VALUE } from "./date_filter";
import { TEXT_BY_OPERATOR } from "./filter_query";

/**
 * Typed text suggestions for the unified filter bar (SPEC 0029, Phase 3).
 * Given the bar text and caret, produces plain-text completions scoped to
 * the token under the caret. Every suggestion carries its own replacement
 * range so accepting one is a pure string edit that touches only that
 * token (or comma segment) — the UI never re-derives boundaries.
 */

export interface FilterSuggestionContext {
	// Tags present on the board's task set.
	tags: readonly string[];
	// Paths of files currently contributing tasks (what the filter can
	// actually affect), not all vault files.
	filePaths: readonly string[];
	// Date-typed keys of the active property schema.
	dateKeys: readonly { key: string; label: string }[];
	// Unified saved-filter names (wired in Phase 4; empty until then).
	savedFilterNames: readonly string[];
}

export type FilterSuggestionKind = "prefix" | "tag" | "file" | "date" | "saved";

export interface FilterSuggestion {
	kind: FilterSuggestionKind;
	// Shown in the list; for value kinds this is the completed entry.
	label: string;
	// Muted annotation shown next to the label.
	detail?: string;
	// Range of the input text the acceptance replaces.
	replaceStart: number;
	replaceEnd: number;
	// Replacement text (may differ from label, e.g. quoted file paths).
	insert: string;
}

export function applyFilterSuggestion(
	text: string,
	suggestion: FilterSuggestion,
): { text: string; caret: number } {
	return {
		text:
			text.slice(0, suggestion.replaceStart) +
			suggestion.insert +
			text.slice(suggestion.replaceEnd),
		caret: suggestion.replaceStart + suggestion.insert.length,
	};
}

/**
 * Arrow-key navigation over an open list: down from -1 (nothing
 * highlighted) enters at the top, and both directions wrap.
 */
export function stepSuggestionIndex(
	count: number,
	index: number,
	delta: 1 | -1,
): number {
	if (count === 0) {
		return -1;
	}
	if (delta === 1) {
		return (index + 1) % count;
	}
	return index <= 0 ? count - 1 : index - 1;
}

interface Span {
	start: number;
	end: number;
}

/**
 * The token containing the caret, using the query tokenizer's boundary
 * rule: tokens are maximal runs of non-whitespace, with quoted regions
 * protecting whitespace. The caret belongs to a token when it sits inside
 * it or immediately after its last character; otherwise (between tokens,
 * at the start, or in empty text) the result is an empty span at the
 * caret, so an accepted suggestion inserts rather than eating a neighbor.
 */
function tokenSpanAt(text: string, caret: number): Span {
	let quoted = false;
	let start = -1;
	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		if (char === '"') {
			if (start === -1) {
				start = i;
			}
			quoted = !quoted;
		} else if (!quoted && /\s/.test(char)) {
			if (start !== -1) {
				if (start < caret && caret <= i) {
					return { start, end: i };
				}
				start = -1;
			}
		} else if (start === -1) {
			start = i;
		}
	}
	if (start !== -1 && start < caret) {
		return { start, end: text.length };
	}
	return { start: caret, end: caret };
}

/**
 * Case-insensitive match of items against the typed fragment: prefix
 * matches rank before substring matches (each group keeps the items'
 * incoming order). An item equal to the fragment is dropped — completing
 * it would be a no-op.
 */
function rankMatches(items: readonly string[], typed: string): string[] {
	const needle = typed.toLowerCase();
	const prefixMatches: string[] = [];
	const containsMatches: string[] = [];
	for (const item of items) {
		const lower = item.toLowerCase();
		if (lower === needle) {
			continue;
		}
		if (lower.startsWith(needle)) {
			prefixMatches.push(item);
		} else if (lower.includes(needle)) {
			containsMatches.push(item);
		}
	}
	return [...prefixMatches, ...containsMatches];
}

function stripQuotes(value: string): string {
	return value.replace(/"/g, "");
}

/**
 * Suggestions for one entry of a comma-separated "any of" list occupying
 * [listStart, listEnd) of `text`. Only the segment under the caret is
 * matched and replaced, so OR-groups build up naturally; entries already
 * present in other segments are not offered again. `quoteWhitespace`
 * wraps inserted entries containing whitespace in quotes (needed in the
 * bar's token syntax, not in the editor's plain list inputs).
 */
function listEntrySuggestions(
	text: string,
	listStart: number,
	listEnd: number,
	caret: number,
	items: readonly string[],
	kind: "tag" | "file",
	quoteWhitespace: boolean,
): FilterSuggestion[] {
	const value = text.slice(listStart, listEnd);
	const caretInValue = Math.min(Math.max(caret - listStart, 0), value.length);
	const segmentStart = value.lastIndexOf(",", caretInValue - 1) + 1;
	const nextComma = value.indexOf(",", caretInValue);
	const segmentEnd = nextComma === -1 ? value.length : nextComma;

	// The editor's inputs allow spaces after commas; trim them out of the
	// typed fragment so `home, er` still matches "errand".
	const typed = stripQuotes(value.slice(segmentStart, caretInValue)).trim();
	const segmentIndex = value.slice(0, segmentStart).split(",").length - 1;
	const used = new Set(
		value
			.split(",")
			.filter((_, i) => i !== segmentIndex)
			.map((entry) => stripQuotes(entry).trim().toLowerCase())
			.filter((entry) => entry !== ""),
	);

	const available = items.filter((item) => !used.has(item.toLowerCase()));
	return rankMatches(available, typed).map((item) => ({
		kind,
		label: item,
		replaceStart: listStart + segmentStart,
		replaceEnd: listStart + segmentEnd,
		insert: quoteWhitespace && /\s/.test(item) ? `"${item}"` : item,
	}));
}

/**
 * Suggestions for the editor's tag/file inputs, whose whole value is one
 * comma-separated list without a token prefix. Same sources and segment
 * semantics as the bar; no quoting, since those inputs strip `"`.
 */
export function getListSuggestions(
	value: string,
	caret: number,
	items: readonly string[],
	kind: "tag" | "file",
): FilterSuggestion[] {
	return listEntrySuggestions(value, 0, value.length, caret, items, kind, false);
}

function prefixSuggestions(
	typed: string,
	replaceStart: number,
	replaceEnd: number,
	context: FilterSuggestionContext,
): FilterSuggestion[] {
	const candidates: { insert: string; detail: string }[] = [
		{ insert: "tag:", detail: "filter by tag" },
		{ insert: "file:", detail: "filter by file path" },
		...context.dateKeys.map((key) => ({
			insert: `${key.key}:`,
			detail: `filter by ${key.label} date`,
		})),
	];
	const ranked = rankMatches(
		candidates.map((candidate) => candidate.insert),
		typed,
	);
	return ranked.map((insert) => ({
		kind: "prefix" as const,
		label: insert,
		detail: candidates.find((candidate) => candidate.insert === insert)?.detail,
		replaceStart,
		replaceEnd,
		insert,
	}));
}

/**
 * Suggestions for the token under the caret:
 * - bare word → literal prefixes (`tag:` / `file:` / date keys) and saved
 *   filter names;
 * - caret in the prefix part of a `word:...` token → prefixes only,
 *   replacing just the prefix and keeping the value;
 * - inside `tag:` / `file:` → board tags / task-contributing file paths,
 *   completing the comma segment under the caret;
 * - inside a date token → operator + $TODAY completions.
 * Quoted tokens are content terms and get no suggestions.
 */
export function getFilterSuggestions(
	text: string,
	caret: number,
	context: FilterSuggestionContext,
): FilterSuggestion[] {
	const span = tokenSpanAt(text, caret);
	const token = text.slice(span.start, span.end);

	if (token.startsWith('"')) {
		return [];
	}

	// Mirrors the parser's prefix rule: a colon in the first (unquoted)
	// segment of the token marks a prefixed token.
	const colonIndex = token.indexOf(":");
	const quoteIndex = token.indexOf('"');
	const hasPrefix =
		colonIndex > 0 && (quoteIndex === -1 || colonIndex < quoteIndex);

	if (!hasPrefix) {
		const typed = text.slice(span.start, caret);
		return [
			...prefixSuggestions(typed, span.start, span.end, context),
			...rankMatches(context.savedFilterNames, typed).map((name) => ({
				kind: "saved" as const,
				label: name,
				detail: "saved filter",
				replaceStart: span.start,
				replaceEnd: span.end,
				insert: name,
			})),
		];
	}

	// Caret still inside the prefix part: offer prefixes, replacing only
	// `word:` so the value survives (`t|ag:home` + `file:` → `file:home`).
	if (caret <= span.start + colonIndex) {
		return prefixSuggestions(
			text.slice(span.start, caret),
			span.start,
			span.start + colonIndex + 1,
			context,
		);
	}

	const prefix = token.slice(0, colonIndex).toLowerCase();
	const valueStart = span.start + colonIndex + 1;

	if (prefix === "tag") {
		return listEntrySuggestions(
			text,
			valueStart,
			span.end,
			caret,
			context.tags,
			"tag",
			false,
		);
	}

	if (prefix === "file") {
		return listEntrySuggestions(
			text,
			valueStart,
			span.end,
			caret,
			context.filePaths,
			"file",
			true,
		);
	}

	const dateKey = context.dateKeys.find(
		(key) => key.key.toLowerCase() === prefix,
	);
	if (dateKey) {
		const typed = text.slice(valueStart, caret);
		return DATE_FILTER_OPERATORS.map((operator) => ({
			insert: `${TEXT_BY_OPERATOR[operator.value]}${TODAY_FILTER_VALUE}`,
			detail: `${operator.label} today`,
		}))
			.filter(
				(candidate) =>
					candidate.insert.toLowerCase().startsWith(typed.toLowerCase()) &&
					candidate.insert.toLowerCase() !== typed.toLowerCase(),
			)
			.map((candidate) => ({
				kind: "date" as const,
				label: candidate.insert,
				detail: candidate.detail,
				replaceStart: valueStart,
				replaceEnd: span.end,
				insert: candidate.insert,
			}));
	}

	// Unknown prefix past the colon: the token is a content-term fallback.
	return [];
}
