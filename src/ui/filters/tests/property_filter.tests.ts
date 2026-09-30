import { describe, expect, it } from "vitest";
import {
	parseFilterQuery,
	parseFilterQueryResult,
	serializeFilterQuery,
	taskMatchesFilterQuery,
	type FilterableTask,
} from "../filter_query";
import {
	collectPropertySuggestions,
	getFilterSuggestions,
	type FilterSuggestionContext,
} from "../filter_suggestions";
import { DataviewSchema, TasksPluginSchema } from "../../../parsing/properties";
import type { SourceBlockNode } from "../../tasks/source_block";

const DATE_KEYS = ["due", "scheduled", "start", "done", "created"];
const TODAY = new Date("2026-02-01");
const dataview = new DataviewSchema();
const tasksPlugin = new TasksPluginSchema();

function task(rawLine: string, schema: { parseProperties(line: string): FilterableTask["properties"] } = dataview, sourceChildren?: SourceBlockNode[]): FilterableTask {
	return {
		content: rawLine.replace(/^- \[.\] /, ""),
		path: "notes.md",
		tags: new Set(),
		properties: schema.parseProperties(rawLine),
		sourceChildren,
	};
}

function matches(query: string, rawLine: string, schema: Parameters<typeof task>[1] = dataview): boolean {
	const result = parseFilterQueryResult(query, DATE_KEYS);
	expect(result.error).toBeUndefined();
	return taskMatchesFilterQuery(task(rawLine, schema), result.query, TODAY);
}

function error(query: string): string | undefined {
	return parseFilterQueryResult(query, DATE_KEYS).error;
}

describe("property filter parsing", () => {
	it("parses equality, any-of, presence and comparisons", () => {
		expect(parseFilterQuery("project::website", DATE_KEYS).clauses).toEqual([
			{ atoms: [{ kind: "property", key: "project", match: { type: "any-of", values: ["website"] }, negative: false }] },
		]);
		expect(parseFilterQuery("project::website,blog", DATE_KEYS).clauses?.[0]?.atoms[0]).toMatchObject({
			match: { type: "any-of", values: ["website", "blog"] },
		});
		expect(parseFilterQuery("-owner::*", DATE_KEYS).clauses?.[0]?.atoms[0]).toMatchObject({
			key: "owner", match: { type: "present" }, negative: true,
		});
		expect(parseFilterQuery("estimate::<=3", DATE_KEYS).clauses?.[0]?.atoms[0]).toMatchObject({
			match: { type: "compare", operator: "on-or-before", value: "3" },
		});
		expect(parseFilterQuery("due::*", DATE_KEYS).clauses?.[0]?.atoms[0]).toMatchObject({
			key: "due", match: { type: "present" },
		});
	});

	it("keeps quoted values together", () => {
		expect(parseFilterQuery('project::"big launch",blog', DATE_KEYS).clauses?.[0]?.atoms[0]).toMatchObject({
			match: { type: "any-of", values: ["big launch", "blog"] },
		});
		expect(parseFilterQuery('project::"a,b"', DATE_KEYS).clauses?.[0]?.atoms[0]).toMatchObject({
			match: { type: "any-of", values: ["a,b"] },
		});
	});

	it("allows property atoms inside OR groups", () => {
		expect(parseFilterQuery("(priority::high OR tag:urgent) -status::-", DATE_KEYS).clauses).toEqual([
			{
				atoms: [
					{ kind: "property", key: "priority", match: { type: "any-of", values: ["high"] }, negative: false },
					{ kind: "tag", value: "urgent", negative: false },
				],
				explicit: true,
			},
			{ atoms: [{ kind: "property", key: "status", match: { type: "any-of", values: ["-"] }, negative: true }] },
		]);
	});

	it("leaves single-colon and quoted tokens as content", () => {
		expect(parseFilterQuery("note:x", DATE_KEYS)).toMatchObject({ contentTerms: ["note:x"] });
		expect(parseFilterQuery('"project::x"', DATE_KEYS)).toMatchObject({ contentTerms: ["project::x"] });
	});

	it("reports invalid property terms", () => {
		expect(error("project::")).toMatch(/Add a value/);
		expect(error("-project::a,b")).toMatch(/individually/);
		expect(error("due::2026-01-01")).toMatch(/Compare dates/);
		expect(error("status::>x")).toMatch(/Status can't be compared/);
		expect(error("priority::>urgent")).toMatch(/Compare priority/);
		expect(error("project::>web")).toMatch(/Only numbers/);
	});

	it("round-trips through serialization", () => {
		for (const text of [
			"project::website",
			"project::website,blog",
			"-owner::*",
			"estimate::<=3",
			'project::"big launch"',
			"(priority::>=high OR tag:urgent) -status::-",
			'project::"*"',
		]) {
			const query = parseFilterQuery(text, DATE_KEYS);
			expect(serializeFilterQuery(query)).toBe(text);
			expect(parseFilterQuery(serializeFilterQuery(query), DATE_KEYS)).toEqual(query);
		}
	});
});

describe("property filter matching", () => {
	const line = "- [ ] Draft landing page [project:: Website] [owner:: sam] [estimate:: 3]";

	it("matches whole values ignoring case", () => {
		expect(matches("project::website", line)).toBe(true);
		expect(matches("project::web", line)).toBe(false);
		expect(matches("PROJECT::WEBSITE", line)).toBe(true);
		expect(matches("project::blog,website", line)).toBe(true);
	});

	it("checks presence and absence", () => {
		expect(matches("owner::*", line)).toBe(true);
		expect(matches("-owner::*", line)).toBe(false);
		expect(matches("-reviewer::*", line)).toBe(true);
	});

	it("treats a missing property as not matching a value", () => {
		expect(matches("reviewer::sam", line)).toBe(false);
		expect(matches("-reviewer::sam", line)).toBe(true);
		expect(matches("-project::blog", line)).toBe(true);
	});

	it("compares numbers", () => {
		expect(matches("estimate::<=3", line)).toBe(true);
		expect(matches("estimate::<3", line)).toBe(false);
		expect(matches("estimate::3", line)).toBe(true);
		expect(matches("owner::>1", line)).toBe(false);
	});

	it("matches the checkbox status", () => {
		expect(matches("status::todo", "- [ ] open")).toBe(true);
		expect(matches("status::/", "- [/] doing")).toBe(true);
		expect(matches("status::x", "- [/] doing")).toBe(false);
		expect(matches("-status::-", "- [-] cancelled")).toBe(false);
	});

	it("orders Tasks plugin priorities, with a missing priority as none", () => {
		expect(matches("priority::high", "- [ ] a ⏫", tasksPlugin)).toBe(true);
		expect(matches("priority::>=high", "- [ ] a 🔺", tasksPlugin)).toBe(true);
		expect(matches("priority::>=high", "- [ ] a 🔼", tasksPlugin)).toBe(false);
		expect(matches("priority::none", "- [ ] a", tasksPlugin)).toBe(true);
		expect(matches("priority::<medium", "- [ ] a", tasksPlugin)).toBe(true);
		expect(matches("priority::>low", "- [ ] a", tasksPlugin)).toBe(true);
		expect(matches("priority::*", "- [ ] a", tasksPlugin)).toBe(false);
	});

	it("matches Dataview priorities by name", () => {
		expect(matches("priority::high", "- [ ] a [priority:: High]")).toBe(true);
		expect(matches("priority::>medium", "- [ ] a [priority:: high]")).toBe(true);
		expect(matches("priority::urgent", "- [ ] a [priority:: urgent]")).toBe(true);
		expect(matches("priority::>low", "- [ ] a [priority:: urgent]")).toBe(false);
	});

	it("reads only the card's own line, not nested children", () => {
		const child: SourceBlockNode = {
			kind: "task",
			taskVisibility: "visible",
			rowIndex: 1,
			rawLine: "\t- [ ] child [project:: website]",
			indentation: "\t",
			status: " ",
			content: "child [project:: website]",
			sourceChildren: [],
		};
		const parent = task("- [ ] parent", dataview, [child]);
		const query = parseFilterQuery("project::website", DATE_KEYS);
		expect(taskMatchesFilterQuery(parent, query, TODAY)).toBe(false);
	});
});

describe("property suggestions", () => {
	const tasks = [
		task("- [ ] a [project:: website] [estimate:: 3] [due:: 2026-01-01]"),
		task("- [/] b [project:: blog] [priority:: high]"),
	];
	const collected = collectPropertySuggestions(tasks, dataview.knownKeys());
	const context: FilterSuggestionContext = {
		tags: [],
		filePaths: [],
		dateKeys: [{ key: "due", label: "Due" }],
		savedFilterNames: [],
		propertyKeys: collected.keys,
		propertyValues: collected.values,
	};

	function suggest(marked: string) {
		const caret = marked.indexOf("|");
		return getFilterSuggestions(marked.replace("|", ""), caret, context);
	}

	it("collects non-date keys and their values", () => {
		const keys = collected.keys.map((key) => key.key);
		expect(keys).toContain("project");
		expect(keys).toContain("estimate");
		expect(keys).toContain("status");
		expect(keys).not.toContain("due");
		expect(collected.values.get("project")).toEqual(["blog", "website"]);
		expect(collected.values.get("status")).toEqual(["/", "todo"]);
		expect(collected.values.get("priority")).toEqual(["highest", "high", "medium", "none", "low", "lowest"]);
	});

	it("offers key:: prefixes for bare words", () => {
		expect(suggest("proj|").map((s) => s.insert)).toContain("project::");
	});

	it("offers values after key::", () => {
		expect(suggest("project::w|").map((s) => s.insert)).toEqual(["website"]);
		expect(suggest("-project::|").map((s) => s.insert)).toEqual(["blog", "website"]);
		expect(suggest("project::blog,|").map((s) => s.insert)).toEqual(["website"]);
		expect(suggest("estimate::<|")).toEqual([]);
	});
});
