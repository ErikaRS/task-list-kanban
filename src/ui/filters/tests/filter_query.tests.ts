import { describe, expect, it } from "vitest";
import {
	emptyFilterQuery,
	isEmptyFilterQuery,
	parseContentTerms,
	parseFilterQuery,
	parseFilterQueryResult,
	serializeContentTerms,
	serializeFilterQuery,
	taskMatchesFilterQuery,
	type FilterableTask,
	type FilterQuery,
} from "../filter_query";
import { parseDateOnly } from "../../../parsing/properties/value_parsers";
import type { TaskPropertyMap } from "../../../parsing/properties/property_schema";
import type {
	SourceBlockNode,
	SourceRawNode,
	SourceTaskNode,
} from "../../tasks/source_block";

const DATE_KEYS = ["due", "scheduled", "start", "done", "created"];

function subtaskNode(
	content: string,
	children: SourceBlockNode[] = [],
): SourceTaskNode {
	return {
		kind: "task",
		taskVisibility: "visible",
		rowIndex: 0,
		rawLine: `\t- [ ] ${content}`,
		indentation: "\t",
		status: " ",
		content,
		sourceChildren: children,
	};
}

function noteNode(text: string): SourceRawNode {
	return {
		kind: "raw",
		rowIndex: 0,
		rawLine: `\t${text}`,
		indentation: "\t",
		sourceChildren: [],
	};
}

function task(overrides: {
	content?: string;
	path?: string;
	tags?: string[];
	properties?: Record<string, Date>;
	sourceChildren?: SourceBlockNode[];
}): FilterableTask {
	const properties: TaskPropertyMap = new Map();
	for (const [key, value] of Object.entries(overrides.properties ?? {})) {
		properties.set(key, {
			key,
			rawValue: String(value),
			value,
			startIndex: 0,
			endIndex: 0,
		});
	}
	return {
		content: overrides.content ?? "",
		path: overrides.path ?? "",
		tags: new Set(overrides.tags ?? []),
		properties,
		sourceChildren: overrides.sourceChildren,
	};
}

const today = parseDateOnly("2026-07-03")!;

describe("parseFilterQuery", () => {
	it("returns an empty query for empty and whitespace-only text", () => {
		expect(isEmptyFilterQuery(parseFilterQuery("", DATE_KEYS))).toBe(true);
		expect(isEmptyFilterQuery(parseFilterQuery("   \t ", DATE_KEYS))).toBe(true);
	});

	it("parses bare words as content terms", () => {
		expect(parseFilterQuery("fix bug", DATE_KEYS).contentTerms).toEqual([
			"fix",
			"bug",
		]);
	});

	it("parses quoted phrases as single content terms", () => {
		const query = parseFilterQuery('"big rocks" other', DATE_KEYS);
		expect(query.contentTerms).toEqual(["big rocks", "other"]);
	});

	it("parses the #128 example as two independent content terms", () => {
		const query = parseFilterQuery(
			'"[[•project name]]" "[[+concept name]]"',
			DATE_KEYS,
		);
		expect(query.contentTerms).toEqual([
			"[[•project name]]",
			"[[+concept name]]",
		]);
	});

	it("runs an unterminated quote to the end of the input", () => {
		expect(parseFilterQuery('"a b c', DATE_KEYS).contentTerms).toEqual([
			"a b c",
		]);
	});

	it("drops empty quoted terms", () => {
		expect(isEmptyFilterQuery(parseFilterQuery('""', DATE_KEYS))).toBe(true);
	});

	it("parses tag tokens into single-tag groups", () => {
		expect(parseFilterQuery("tag:home", DATE_KEYS).tagGroups).toEqual([
			["home"],
		]);
	});

	it("splits comma tag values into one OR-group", () => {
		expect(parseFilterQuery("tag:home,errand", DATE_KEYS).tagGroups).toEqual([
			["home", "errand"],
		]);
	});

	it("keeps repeated tag tokens as separate AND-ed groups", () => {
		expect(
			parseFilterQuery("tag:home tag:errand", DATE_KEYS).tagGroups,
		).toEqual([["home"], ["errand"]]);
	});

	it("drops empty comma entries and empty tag tokens", () => {
		expect(parseFilterQuery("tag:a,,b,", DATE_KEYS).tagGroups).toEqual([
			["a", "b"],
		]);
		expect(parseFilterQuery("tag:", DATE_KEYS).tagGroups).toEqual([]);
	});

	it("matches the tag prefix case-insensitively and preserves tag case", () => {
		expect(parseFilterQuery("TAG:Home", DATE_KEYS).tagGroups).toEqual([
			["Home"],
		]);
	});

	it("parses file tokens, including quoted values with spaces", () => {
		expect(parseFilterQuery("file:projects", DATE_KEYS).filePaths).toEqual([
			"projects",
		]);
		expect(parseFilterQuery('FILE:"a b"', DATE_KEYS).filePaths).toEqual([
			"a b",
		]);
		expect(parseFilterQuery("file:", DATE_KEYS).filePaths).toEqual([]);
	});

	it("splits comma file values and merges repeated file tokens into one any-of list", () => {
		expect(parseFilterQuery("file:a,b,", DATE_KEYS).filePaths).toEqual([
			"a",
			"b",
		]);
		expect(
			parseFilterQuery("file:projects file:archive", DATE_KEYS).filePaths,
		).toEqual(["projects", "archive"]);
		expect(
			parseFilterQuery('file:"a b",projects', DATE_KEYS).filePaths,
		).toEqual(["a b", "projects"]);
	});

	it("parses each date operator", () => {
		const cases: Array<[string, string]> = [
			["due:<2026-07-01", "before"],
			["due:<=2026-07-01", "on-or-before"],
			["due:=2026-07-01", "on"],
			["due:>=2026-07-01", "on-or-after"],
			["due:>2026-07-01", "after"],
		];
		for (const [text, operator] of cases) {
			expect(parseFilterQuery(text, DATE_KEYS).dateConditions).toEqual([
				{ property: "due", operator, value: "2026-07-01" },
			]);
		}
	});

	it("canonicalizes today aliases to $TODAY", () => {
		for (const value of ["$TODAY", "$today", "today", "TODAY", "Today"]) {
			expect(
				parseFilterQuery(`due:<${value}`, DATE_KEYS).dateConditions,
			).toEqual([{ property: "due", operator: "before", value: "$TODAY" }]);
		}
	});

	it("canonicalizes a case-insensitive date key to the schema key", () => {
		expect(parseFilterQuery("Due:<$TODAY", DATE_KEYS).dateConditions).toEqual([
			{ property: "due", operator: "before", value: "$TODAY" },
		]);
	});

	it("falls back to a content term for unknown prefixes", () => {
		const query = parseFilterQuery("tga:home note:x", DATE_KEYS);
		expect(query.contentTerms).toEqual(["tga:home", "note:x"]);
		expect(query.tagGroups).toEqual([]);
	});

	it("falls back to a content term for date tokens with bad op or value", () => {
		for (const text of [
			"due:tomorrow",
			"due:2026-07-01",
			"due:<2026-13-40",
			"due:<",
		]) {
			const query = parseFilterQuery(text, DATE_KEYS);
			expect(query.dateConditions).toEqual([]);
			expect(query.contentTerms).toEqual([text]);
		}
	});

	it("treats date-shaped tokens as content when the key is not date-typed", () => {
		const query = parseFilterQuery("due:<$TODAY", []);
		expect(query.dateConditions).toEqual([]);
		expect(query.contentTerms).toEqual(["due:<$TODAY"]);
	});

	it("treats a leading-colon token as content", () => {
		expect(parseFilterQuery(":foo", DATE_KEYS).contentTerms).toEqual([":foo"]);
	});

	it("does not treat a colon inside a quoted term as a prefix", () => {
		expect(parseFilterQuery('"tag:home"', DATE_KEYS)).toEqual({
			...emptyFilterQuery(),
			contentTerms: ["tag:home"],
		});
	});

	it("parses a mixed query of every token kind", () => {
		expect(
			parseFilterQuery(
				'fix "big rocks" tag:home,errand file:projects due:<$TODAY',
				DATE_KEYS,
			),
		).toEqual({
			contentTerms: ["fix", "big rocks"],
			tagGroups: [["home", "errand"]],
			filePaths: ["projects"],
			dateConditions: [
				{ property: "due", operator: "before", value: "$TODAY" },
			],
		});
	});
});

describe("limited CNF queries", () => {
	const reading = task({
		content: "Read Paul Krugman on trade #reading",
		path: "essays/economics.md",
		tags: ["reading"],
		properties: { due: parseDateOnly("2026-07-01")! },
	});
	const archived = task({
		content: "Read Keynes #archived",
		path: "archive/economics.md",
		tags: ["archived"],
	});

	function matches(text: string, candidate: FilterableTask): boolean {
		const result = parseFilterQueryResult(text, DATE_KEYS);
		expect(result.error).toBeUndefined();
		return taskMatchesFilterQuery(candidate, result.query, today);
	}

	it("excludes individual content, tag, and file atoms", () => {
		expect(matches('"Paul Krugman" -Keynes', reading)).toBe(true);
		expect(matches('"Paul Krugman" -trade', reading)).toBe(false);
		expect(matches("-tag:archived -file:archive", reading)).toBe(true);
		expect(matches("-tag:archived", archived)).toBe(false);
		expect(matches("-file:archive", archived)).toBe(false);
	});

	it("matches flat OR clauses across kinds and ANDs the clauses", () => {
		expect(matches("(tag:reading OR file:archive) -Keynes", reading)).toBe(true);
		expect(matches("(tag:reading OR file:archive) -Keynes", archived)).toBe(false);
		expect(matches("(Keynes OR tag:reading) (file:essays OR file:other)", reading)).toBe(true);
		expect(matches("(Keynes OR tag:reading) (file:essays OR file:other)", archived)).toBe(false);
		expect(matches("(due:<$TODAY OR tag:archived)", reading)).toBe(true);
		expect(matches("( tag:reading OR file:archive ) -Keynes", reading)).toBe(true);
	});

	it("negation sees tags and content in nested card rows", () => {
		const parent = task({
			content: "Plan a reading session",
			tags: [],
			sourceChildren: [subtaskNode("Read Keynes #school")],
		});
		expect(matches("-Keynes", parent)).toBe(false);
		expect(matches("-tag:school", parent)).toBe(false);
		expect(matches("(-Keynes OR tag:school)", parent)).toBe(true);
	});

	it("preserves positive comma OR and repeated-file OR when negation is present", () => {
		expect(matches("tag:reading,home -Keynes", reading)).toBe(true);
		expect(matches("file:archive -file:archive file:essays", reading)).toBe(true);
		expect(matches("file:archive -file:archive file:essays", archived)).toBe(false);
		expect(matches("(tag:reading,home OR file:archive) -Keynes", reading)).toBe(true);
		expect(matches("tag:reading,home tag:home -Keynes", reading)).toBe(false);
	});

	it("matches legacy filters identically when an unrelated exclusion is added", () => {
		const candidates = [reading, archived, task({ content: "Plan a home errand", path: "notes/home.md", tags: ["home", "errand"] })];
		for (const legacy of [
			"tag:reading,home",
			"tag:home,errand tag:reading",
			"file:archive,essays",
			"file:archive file:essays",
			'file:"home notes",essays tag:reading,home',
			"due:<$TODAY tag:reading,home",
		]) {
			const before = parseFilterQuery(legacy, DATE_KEYS);
			const after = parseFilterQueryResult(`${legacy} -unrelated`, DATE_KEYS);
			expect(after.error).toBeUndefined();
			for (const candidate of candidates) {
				expect(taskMatchesFilterQuery(candidate, after.query, today), legacy).toBe(
					taskMatchesFilterQuery(candidate, before, today),
				);
			}
		}
	});

	it("round-trips mixed clauses and keeps explicit file groups separate", () => {
		const original = '(file:essays OR tag:reading) file:archive -Keynes';
		const query = parseFilterQueryResult(original, DATE_KEYS).query;
		expect(serializeFilterQuery(query)).toBe(original);
		expect(parseFilterQueryResult(serializeFilterQuery(query), DATE_KEYS).query).toEqual(query);
		expect(matches(original, reading)).toBe(false);
		const literal = parseFilterQueryResult('("OR" OR "-Keynes")', DATE_KEYS).query;
		expect(serializeFilterQuery(literal)).toBe('("OR" OR "-Keynes")');
	});

	it("keeps unparenthesized OR as a literal content term", () => {
		expect(parseFilterQueryResult("foo OR bar", DATE_KEYS).query.contentTerms).toEqual(["foo", "OR", "bar"]);
		expect(parseFilterQueryResult("(foo) OR bar", DATE_KEYS).query.contentTerms).toEqual(["(foo)", "OR", "bar"]);
		expect(parseFilterQueryResult("tag: -foo", DATE_KEYS).error).toBeUndefined();
	});

	it("rejects invalid boolean syntax without returning a partial query", () => {
		for (const text of [
			"-", "-(foo OR bar)", "-tag:a,b", "-file:a,b", "-due:<$TODAY",
			"(foo OR)", "(foo OR ", "(foo OR (bar OR baz))", "(foo OR )",
		]) {
			const result = parseFilterQueryResult(text, DATE_KEYS);
			expect(result.error, text).toBeTruthy();
			expect(result.query).toEqual(emptyFilterQuery());
		}
	});
});

describe("content term helpers (editor Content field)", () => {
	it("splits bare words into independent terms and binds quoted phrases", () => {
		expect(parseContentTerms('fix "big rocks" bug')).toEqual([
			"fix",
			"big rocks",
			"bug",
		]);
	});

	it("never interprets prefixes: everything is a content term", () => {
		expect(parseContentTerms("tag:home due:<$TODAY")).toEqual([
			"tag:home",
			"due:<$TODAY",
		]);
	});

	it("drops empty input and lone quotes", () => {
		expect(parseContentTerms("")).toEqual([]);
		expect(parseContentTerms('  "')).toEqual([]);
	});

	it("round-trips through the full query serialization", () => {
		const terms = parseContentTerms('fix "big rocks"');
		const queryText = serializeFilterQuery({
			...emptyFilterQuery(),
			contentTerms: terms,
		});
		expect(parseFilterQuery(queryText, DATE_KEYS).contentTerms).toEqual(terms);
		expect(serializeContentTerms(terms)).toBe('fix "big rocks"');
	});
});

describe("serializeFilterQuery", () => {
	it("serializes an empty query to an empty string", () => {
		expect(serializeFilterQuery(emptyFilterQuery())).toBe("");
	});

	it("quotes content terms with whitespace or a prefix-shaped colon", () => {
		expect(
			serializeFilterQuery({
				...emptyFilterQuery(),
				contentTerms: ["fix", "big rocks", "tag:home", "due:tomorrow", ":foo"],
			}),
		).toBe('fix "big rocks" "tag:home" "due:tomorrow" :foo');
	});

	it("serializes every token kind, files as one comma list", () => {
		expect(
			serializeFilterQuery({
				contentTerms: ["fix"],
				tagGroups: [["home", "errand"], ["work"]],
				filePaths: ["projects", "a b"],
				dateConditions: [
					{ property: "due", operator: "before", value: "$TODAY" },
					{ property: "scheduled", operator: "on-or-after", value: "2026-07-01" },
				],
			}),
		).toBe(
			'fix tag:home,errand tag:work file:projects,"a b" due:<$TODAY scheduled:>=2026-07-01',
		);
	});

	it("round-trips parse(serialize(query)) for a query of every kind", () => {
		const query: FilterQuery = {
			contentTerms: ["fix", "big rocks", "due:tomorrow", "https://x.test/a"],
			tagGroups: [["home", "errand"], ["work"]],
			filePaths: ["projects", "a b"],
			dateConditions: [
				{ property: "due", operator: "before", value: "$TODAY" },
				{ property: "done", operator: "on", value: "2026-07-01" },
			],
		};
		expect(parseFilterQuery(serializeFilterQuery(query), DATE_KEYS)).toEqual(
			query,
		);
	});

	it("round-trips serialize(parse(text)) to canonical text", () => {
		const canonical =
			'fix "big rocks" tag:home,errand file:projects due:<$TODAY';
		const typed = ' fix   "big rocks"  TAG:home,errand, file:projects Due:<today ';
		expect(serializeFilterQuery(parseFilterQuery(typed, DATE_KEYS))).toBe(
			canonical,
		);
	});
});

describe("taskMatchesFilterQuery", () => {
	const groceries = task({
		content: "Buy groceries for the week",
		path: "projects/home.md",
		tags: ["home", "errand"],
		properties: { due: parseDateOnly("2026-07-01")! },
	});

	function matches(text: string, candidate: FilterableTask): boolean {
		return taskMatchesFilterQuery(
			candidate,
			parseFilterQuery(text, DATE_KEYS),
			today,
		);
	}

	it("matches everything on an empty query", () => {
		expect(matches("", groceries)).toBe(true);
	});

	it("matches content terms case-insensitively and ANDs them", () => {
		expect(matches("GROCERIES buy", groceries)).toBe(true);
		expect(matches("groceries dentist", groceries)).toBe(false);
	});

	it("matches multi-word phrases in any order (#128)", () => {
		expect(matches('"for the week" "Buy groceries"', groceries)).toBe(true);
		expect(matches('"groceries for" "the weekend"', groceries)).toBe(false);
	});

	it("ORs tags within a group and requires exact tags", () => {
		expect(matches("tag:home,work", groceries)).toBe(true);
		expect(matches("tag:work,office", groceries)).toBe(false);
		expect(matches("tag:hom", groceries)).toBe(false);
	});

	it("ANDs tag groups across tokens", () => {
		expect(matches("tag:home tag:errand", groceries)).toBe(true);
		expect(matches("tag:home tag:work", groceries)).toBe(false);
	});

	it("matches file paths case-insensitively as substrings", () => {
		expect(matches("file:PROJECTS", groceries)).toBe(true);
		expect(matches("file:archive", groceries)).toBe(false);
	});

	it("ORs file entries: any listed path may match", () => {
		expect(matches("file:archive,projects", groceries)).toBe(true);
		expect(matches("file:archive file:projects", groceries)).toBe(true);
		expect(matches("file:archive,attic", groceries)).toBe(false);
	});

	it("applies date conditions with the SPEC 0028 missing-property rule", () => {
		expect(matches("due:<$TODAY", groceries)).toBe(true);
		expect(matches("due:>$TODAY", groceries)).toBe(false);
		const noDates = task({ content: "someday", tags: ["home"] });
		expect(matches("due:<$TODAY", noDates)).toBe(true);
	});

	it("ANDs across token kinds", () => {
		expect(
			matches("groceries tag:home file:projects due:<=$TODAY", groceries),
		).toBe(true);
		expect(
			matches("groceries tag:home file:projects due:>$TODAY", groceries),
		).toBe(false);
	});

	it("bad-date fallback over-filters instead of under-filtering", () => {
		// `due:tomorrow` becomes a content term that this task doesn't contain.
		expect(matches("due:tomorrow", groceries)).toBe(false);
	});

	describe("subtask matching", () => {
		const parent = task({
			content: "Plan the trip #travel",
			path: "projects/travel.md",
			tags: ["travel"],
			sourceChildren: [
				subtaskNode("Book flights #booking", [
					subtaskNode("Compare fares on kayak"),
				]),
				noteNode("remember the passport"),
			],
		});

		it("matches content terms found only on a subtask, at any depth", () => {
			expect(matches("flights", parent)).toBe(true);
			expect(matches("kayak", parent)).toBe(true);
			expect(matches("hotel", parent)).toBe(false);
		});

		it("matches content terms found only on a raw note row", () => {
			expect(matches("passport", parent)).toBe(true);
		});

		it("satisfies each token independently across parent and subtasks", () => {
			// "plan" is on the parent, "flights" only on a subtask.
			expect(matches("plan flights", parent)).toBe(true);
		});

		it("matches tag tokens against subtask tags", () => {
			expect(matches("tag:booking", parent)).toBe(true);
			expect(matches("tag:travel tag:booking", parent)).toBe(true);
			expect(matches("tag:lodging", parent)).toBe(false);
		});

		it("still matches without sourceChildren populated", () => {
			const flat = task({ content: "Plan the trip", tags: ["travel"] });
			expect(matches("plan", flat)).toBe(true);
			expect(matches("flights", flat)).toBe(false);
		});
	});
});
