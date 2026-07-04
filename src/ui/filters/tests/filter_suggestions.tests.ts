import { describe, expect, it } from "vitest";
import {
	applyFilterSuggestion,
	getFilterSuggestions,
	getListSuggestions,
	stepSuggestionIndex,
	type FilterSuggestion,
	type FilterSuggestionContext,
} from "../filter_suggestions";

const CONTEXT: FilterSuggestionContext = {
	tags: ["errand", "home", "homework"],
	filePaths: ["projects/alpha.md", "my project/notes.md", "archive/old.md"],
	dateKeys: [
		{ key: "due", label: "Due" },
		{ key: "scheduled", label: "Scheduled" },
	],
	savedFilterNames: ["overdue", "home projects"],
};

/** `|` in the input marks the caret. */
function suggest(
	marked: string,
	context: FilterSuggestionContext = CONTEXT,
): FilterSuggestion[] {
	const caret = marked.indexOf("|");
	if (caret === -1) {
		throw new Error("test input needs a | caret marker");
	}
	const text = marked.slice(0, caret) + marked.slice(caret + 1);
	return getFilterSuggestions(text, caret, context);
}

function labels(suggestions: FilterSuggestion[]): string[] {
	return suggestions.map((suggestion) => suggestion.label);
}

/** Accepts the suggestion with the given label; returns text with `|` at the caret. */
function accept(marked: string, label: string): string {
	const caret = marked.indexOf("|");
	const text = marked.slice(0, caret) + marked.slice(caret + 1);
	const suggestion = getFilterSuggestions(text, caret, CONTEXT).find(
		(s) => s.label === label,
	);
	expect(suggestion, `no suggestion labelled ${label}`).toBeDefined();
	const applied = applyFilterSuggestion(text, suggestion!);
	return applied.text.slice(0, applied.caret) + "|" + applied.text.slice(applied.caret);
}

describe("bare tokens", () => {
	it("suggests all prefixes and saved filter names in empty text", () => {
		expect(labels(suggest("|"))).toEqual([
			"tag:",
			"file:",
			"due:",
			"scheduled:",
			"overdue",
			"home projects",
		]);
	});

	it("narrows prefixes as you type", () => {
		expect(labels(suggest("ta|"))).toEqual(["tag:"]);
	});

	it("ranks prefix matches before substring matches, prefixes before saved names", () => {
		expect(labels(suggest("ue|"))).toEqual(["due:", "overdue"]);
	});

	it("matches saved filter names case-insensitively", () => {
		expect(labels(suggest("HOME|"))).toEqual(["home projects"]);
	});

	it("marks saved filter suggestions with their kind", () => {
		expect(suggest("over|")[0]).toMatchObject({
			kind: "saved",
			label: "overdue",
			detail: "saved filter",
		});
	});

	it("accepting a prefix replaces the whole bare token", () => {
		expect(accept("fix ta| bar", "tag:")).toBe("fix tag:| bar");
	});

	it("offers no suggestions inside a quoted content term", () => {
		expect(suggest('"big ro|cks"')).toEqual([]);
	});
});

describe("prefix part of a prefixed token", () => {
	it("suggests prefixes, replacing only the prefix and keeping the value", () => {
		expect(labels(suggest("t|a:home"))).toEqual(["tag:"]);
		expect(accept("t|a:home", "tag:")).toBe("tag:|home");
	});

	it("does not offer saved filter names while editing a prefix", () => {
		// "o" matches the saved name "overdue" but the token has a value.
		expect(labels(suggest("o|ther:x"))).toEqual([]);
	});
});

describe("tag tokens", () => {
	it("suggests every known tag right after tag:", () => {
		expect(labels(suggest("tag:|"))).toEqual(["errand", "home", "homework"]);
	});

	it("narrows by prefix", () => {
		expect(labels(suggest("tag:ho|"))).toEqual(["home", "homework"]);
	});

	it("drops an exact match but keeps longer completions", () => {
		expect(labels(suggest("tag:home|"))).toEqual(["homework"]);
	});

	it("completes only the segment after the last comma and skips used tags", () => {
		expect(labels(suggest("tag:home,|"))).toEqual(["errand", "homework"]);
		expect(accept("tag:home,er|", "errand")).toBe("tag:home,errand|");
	});

	it("completes a middle segment without touching its neighbors", () => {
		expect(accept("tag:ho|me,errand", "homework")).toBe(
			"tag:homework|,errand",
		);
	});

	it("replaces only the token under the caret", () => {
		expect(accept("fix tag:ho| file:x", "home")).toBe(
			"fix tag:home| file:x",
		);
	});

	it("matches the prefix case-insensitively", () => {
		expect(labels(suggest("TAG:ho|"))).toEqual(["home", "homework"]);
	});
});

describe("file tokens", () => {
	it("ranks path-prefix matches before substring matches", () => {
		expect(labels(suggest("file:pro|"))).toEqual([
			"projects/alpha.md",
			"my project/notes.md",
		]);
	});

	it("quotes inserted paths containing whitespace", () => {
		expect(accept("file:my|", "my project/notes.md")).toBe(
			'file:"my project/notes.md"|',
		);
	});

	it("completes inside an existing quoted segment", () => {
		expect(labels(suggest('file:"my pro|ject"'))).toEqual([
			"my project/notes.md",
		]);
	});

	it("does not re-offer paths already in the list", () => {
		expect(labels(suggest("file:archive/old.md,|"))).toEqual([
			"projects/alpha.md",
			"my project/notes.md",
		]);
	});
});

describe("date tokens", () => {
	it("suggests every operator with $TODAY right after the key", () => {
		expect(labels(suggest("due:|"))).toEqual([
			"<$TODAY",
			"<=$TODAY",
			"=$TODAY",
			">=$TODAY",
			">$TODAY",
		]);
		expect(suggest("due:|")[0]).toMatchObject({
			kind: "date",
			detail: "before today",
		});
	});

	it("narrows by the typed operator", () => {
		expect(labels(suggest("due:<|"))).toEqual(["<$TODAY", "<=$TODAY"]);
		expect(labels(suggest("due:>=|"))).toEqual([">=$TODAY"]);
	});

	it("matches the value case-insensitively and replaces the whole value", () => {
		expect(labels(suggest("due:<$to|"))).toEqual(["<$TODAY"]);
		expect(accept("due:<$to|", "<$TODAY")).toBe("due:<$TODAY|");
	});

	it("offers nothing once the value is complete", () => {
		expect(suggest("due:<$TODAY|")).toEqual([]);
	});

	it("only recognizes date-typed keys of the schema", () => {
		expect(suggest("random:|")).toEqual([]);
		expect(labels(suggest("scheduled:|")).length).toBe(5);
	});
});

describe("caret between tokens", () => {
	it("inserts at the caret without eating a neighboring token", () => {
		expect(accept("fix | tag:home", "file:")).toBe("fix file:| tag:home");
	});

	it("treats a caret before a token's first character as an insertion point", () => {
		expect(accept("|fix", "tag:")).toBe("tag:|fix");
	});
});

describe("getListSuggestions (editor inputs)", () => {
	it("completes the segment under the caret, trimming spaces after commas", () => {
		const suggestions = getListSuggestions("home, er", 8, CONTEXT.tags, "tag");
		expect(labels(suggestions)).toEqual(["errand"]);
		// The whole segment (including its leading space) is replaced, so
		// accepting canonicalizes the list's spacing.
		const applied = applyFilterSuggestion("home, er", suggestions[0]!);
		expect(applied.text).toBe("home,errand");
		expect(applied.caret).toBe(11);
	});

	it("does not quote whitespace entries", () => {
		const suggestions = getListSuggestions(
			"my pro",
			6,
			CONTEXT.filePaths,
			"file",
		);
		expect(suggestions[0]!.insert).toBe("my project/notes.md");
	});

	it("excludes entries used in other segments", () => {
		expect(
			labels(getListSuggestions("home,", 5, CONTEXT.tags, "tag")),
		).toEqual(["errand", "homework"]);
	});

	it("offers everything for an empty input", () => {
		expect(labels(getListSuggestions("", 0, CONTEXT.tags, "tag"))).toEqual([
			"errand",
			"home",
			"homework",
		]);
	});
});

describe("stepSuggestionIndex", () => {
	it("enters the list at the top from -1 and wraps both ways", () => {
		expect(stepSuggestionIndex(3, -1, 1)).toBe(0);
		expect(stepSuggestionIndex(3, 0, 1)).toBe(1);
		expect(stepSuggestionIndex(3, 2, 1)).toBe(0);
		expect(stepSuggestionIndex(3, -1, -1)).toBe(2);
		expect(stepSuggestionIndex(3, 0, -1)).toBe(2);
		expect(stepSuggestionIndex(0, -1, 1)).toBe(-1);
	});
});
