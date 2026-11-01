import { describe, expect, it } from "vitest";
import { renderTaskMarkdownSource } from "../../components/task_markdown";
import { PropertySchemaOption } from "../../../parsing/properties";
import { columnRuleSignature, getColumnHeaderSubtitle, getColumnWriteTags, migrateColumnDefinitions, type ColumnDefinition, type ColumnTag } from "../../columns/definitions";
import { archiveTransform, changeColumnTransform } from "../column_change";
import { parseTask } from "./task_test_helpers";
import { buildNewTaskLine } from "../task_line_builder";
import { createGroupAssigner, deriveGroupBuckets, taskBelongsToGroup } from "../task_grouping";
import { getColumnValidationError } from "../../settings/column_validation";

const textColumn = (id: string, literal: string): ColumnDefinition => ({ id: id as ColumnTag, label: literal, matchMode: "text", matchTags: [] });
const columns: ColumnDefinition[] = [textColumn("office", "@office"), textColumn("home", "@home"), textColumn("project", "[[Project A]]"),
	{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchStatus: "/", matchTags: [] },
	{ id: "later" as ColumnTag, label: "Later", matchMode: "tags", matchTags: ["later"] },
];
function move(line: string, from: string | undefined, to: string, keepColumnTag = false) {
	return changeColumnTransform(line, { fromColumn: from as ColumnTag | undefined, toColumn: to as ColumnTag, columnDefinitions: columns, propertySchemaOption: PropertySchemaOption.None, doneStatusMarker: "x", keepColumnTag });
}

describe("text columns", () => {
	it.each([
		["- [ ] Print forms @office", "office"], ["- [ ] Print forms @Office", undefined],
		["- [ ] Email bob@office.com", undefined], ["- [ ] Draft plan [[Project A]]", "project"],
		["- [/] Draft plan @home", "home"], ["- [ ] Fix sink @home @office", "office"],
	])("assigns %s", (line, expected) => {
		expect(parseTask(line, { columns }).column).toBe(expected);
	});
	it("uses the title literally in Text mode while Name mode keeps matching tags", () => {
		const text = textColumn("context", "office");
		const name: ColumnDefinition = { ...text, matchMode: "name" };
		expect(parseTask("- [ ] Work office", { columns: [text] }).column).toBe("context");
		expect(parseTask("- [ ] Work #office", { columns: [text] }).column).toBeUndefined();
		expect(parseTask("- [ ] Work office", { columns: [name] }).column).toBeUndefined();
		expect(parseTask("- [ ] Work #office", { columns: [name] }).column).toBe("context");
		const title = textColumn("project-title", " Project A ");
		expect(parseTask("- [ ] Draft Project A", { columns: [title] }).column).toBe("project-title");
		expect(parseTask("- [ ] Draft #project-a", { columns: [title] }).column).toBeUndefined();
	});
	it("uses a renamed title for matching, writes, and rule change detection", () => {
		const before = textColumn("context", "@office");
		const after = { ...before, label: "@work" };
		expect(columnRuleSignature(before)).not.toBe(columnRuleSignature(after));
		expect(parseTask("- [ ] Work @office", { columns: [after] }).column).toBeUndefined();
		expect(parseTask("- [ ] Work @work", { columns: [after] }).column).toBe("context");
		expect(changeColumnTransform("- [ ] Print @office forms", {
			fromColumn: before.id, toColumn: after.id,
			sourceColumnDefinitions: [before], columnDefinitions: [after],
			propertySchemaOption: PropertySchemaOption.None, doneStatusMarker: "x",
		})).toBe("- [ ] Print @work forms");
	});
	it("keeps differently cased column titles distinct", () => {
		const definitions = [textColumn("lower", "@office"), textColumn("upper", "@Office")];
		expect(parseTask("- [ ] Work @office", { columns: definitions }).column).toBe("lower");
		expect(parseTask("- [ ] Work @Office", { columns: definitions }).column).toBe("upper");
		expect(parseTask("- [ ] Work @OFFICE", { columns: definitions }).column).toBeUndefined();
	});
	it("does not let a later multi-tag rule outrank text", () => {
		const both: ColumnDefinition = { id: "both" as ColumnTag, label: "Both", matchMode: "tags", matchTags: ["a", "b"] };
		expect(parseTask("- [ ] Work @office #a #b", { columns: [...columns, both] }).column).toBe("office");
		expect(parseTask("- [ ] Work @office #a #b", { columns: [both, ...columns] }).column).toBe("both");
	});
	it("keeps the matched text visible in descriptions and source serialization", () => {
		const task = parseTask("- [ ] Work @office [[Project A]]", { columns });
		expect(task.content).toBe("Work @office [[Project A]]");
		expect(renderTaskMarkdownSource({ content: task.content, displayStatus: task.displayStatus }))
			.toBe("- [ ] Work @office [[Project A]]");
		expect(task.serialise()).toBe("- [ ] Work @office [[Project A]]");
		const done = parseTask("- [x] Work @office", { columns });
		expect(done.done).toBe(true);
		expect(done.column).toBeUndefined();
		expect(done.taggedColumn).toBe("office");
		expect(done.serialise()).toBe("- [x] Work @office");
	});
	it("migrates trimmed literals and exposes the rule and header", () => {
		const column = migrateColumnDefinitions([{ ...columns[0], label: " @Office " }])[0]!;
		expect(column.label).toBe(" @Office ");
		expect(columnRuleSignature(column)).toBe("text:@Office");
		expect(getColumnWriteTags(column)).toEqual([]);
		expect(getColumnHeaderSubtitle(column)?.label).toBe("Text: @Office");
	});
	it("validates missing, tag, multiline, and duplicate literals", () => {
		for (const literal of ["", "#office", "@office\n@home"]) {
			expect(getColumnValidationError([textColumn("one", literal)])).not.toBeNull();
		}
		expect(getColumnValidationError([textColumn("one", "@office"), textColumn("two", "@office")])).toContain("same text");
		expect(getColumnValidationError([textColumn("one", "@office"), textColumn("two", "@OFFICE")])).toBeNull();
	});
	it.each([
		["- [ ] Call Bob @phone about invoices", "phone", "office", "- [ ] Call Bob @office about invoices"],
		["- [ ] Print forms", undefined, "office", "- [ ] Print forms @office"],
		["- [ ] Print forms @office ^abc123", "office", "home", "- [ ] Print forms @home ^abc123"],
		["- [ ] Print forms @office #note", "office", "uncategorised", "- [ ] Print forms #note"],
		["- [ ] Print forms @office", "office", "doing", "- [/] Print forms"],
		["- [ ] Print forms @office", "office", "done", "- [x] Print forms @office"],
	])("moves %s to %s / %s", (line, from, to, expected) => {
		const definitions = [...columns, textColumn("phone", "@phone")];
		expect(changeColumnTransform(line, { fromColumn: from as ColumnTag, toColumn: to as ColumnTag, columnDefinitions: definitions, propertySchemaOption: PropertySchemaOption.None, doneStatusMarker: "x" })).toBe(expected);
	});
	it.each([false, true])("preserves inline text on completion with keep metadata=%s", (keep) => {
		expect(move("  * [/] Call  Bob @office about [[Project A]] @office #note ^abc123", "office", "done", keep))
			.toBe("  * [x] Call  Bob @office about [[Project A]] @office #note ^abc123");
	});
	it("keeps text on archive according to the keep metadata setting", () => {
		for (const keepColumnTag of [true, false]) {
			for (const archiveStatusMarker of [undefined, "a"]) {
				const result = archiveTransform("- [ ] Work @office", { fromColumn: "office" as ColumnTag, columnDefinitions: columns, doneStatusMarker: "x", wasDone: false, keepColumnTag, archiveStatusMarker });
				expect(result.includes("@office")).toBe(keepColumnTag);
				expect(result).toContain(archiveStatusMarker ? "[a]" : "#archived");
			}
		}
	});
	it("handles text/tag/status transitions and leaves stray literals on ordinary moves", () => {
		expect(move("- [ ] Work @office @home", "office", "later")).toBe("- [ ] Work @home #later");
		expect(move("- [ ] Work #later", "later", "home")).toBe("- [ ] Work @home");
		expect(move("- [/] Work", "doing", "home")).toBe("- [ ] Work @home");
		expect(move("- [ ] Work @home @office", "office", "uncategorised")).toBe("- [ ] Work");
		expect(move("- [ ] Work @home #later", "later", "doing")).toBe("- [/] Work @home");
	});
	it("creates with both column and lane literals before block ids, without duplicates", () => {
		const options = { content: "Work ^abc123", column: "office" as ColumnTag, columnDefinitions: columns, getPlacementTagsForColumn: () => [], propertySchemaOption: PropertySchemaOption.None };
		expect(buildNewTaskLine({ ...options, additionalText: ["[[Project A]]"] })).toBe("- [ ] Work [[Project A]] @office ^abc123");
		expect(buildNewTaskLine({ ...options, additionalText: ["@office"] })).toBe("- [ ] Work @office ^abc123");
	});
});

describe("text lanes", () => {
	const source = { kind: "text" as const, literals: ["[[Project A]]", "[[Project B]]"] };
	it("keeps empty lanes in list order and stable collapsed ids across reordering", () => {
		const buckets = deriveGroupBuckets([], source);
		expect(buckets.map((bucket) => bucket.label)).toEqual(["[[Project A]]", "[[Project B]]", "Unassigned"]);
		expect(buckets[0]?.id).toBe("text:[[Project A]]");
		expect(deriveGroupBuckets([], { ...source, literals: [...source.literals].reverse() })[1]?.id).toBe(buckets[0]?.id);
		expect(deriveGroupBuckets([], source, [], "", "", "desc").map((b) => b.id)).toEqual(buckets.map((b) => b.id).reverse());
	});
	it.each([
		["- [ ] Draft plan [[Project A]]", 0], ["- [ ] Review [[Project B]] and [[Project A]]", 0],
		["- [ ] Review [[project b]]", 2], ["- [ ] Buy milk", 2], ["- [x] Draft [[Project B]]", 1],
	])("assigns %s independently of visual order", (line, index) => {
		const buckets = deriveGroupBuckets([], source);
		const task = parseTask(line);
		expect(createGroupAssigner([...buckets].reverse(), source)(task)).toBe(buckets[index]?.id);
		expect(buckets.map((bucket) => taskBelongsToGroup(task, bucket))).toEqual(buckets.map((_, i) => i === index));
	});
	it("keeps differently cased lanes distinct in ids, assignment and membership", () => {
		const exactSource = { kind: "text" as const, literals: ["@office", "@Office"] };
		const buckets = deriveGroupBuckets([], exactSource);
		expect(buckets.map((bucket) => bucket.id)).toEqual(["text:@office", "text:@Office", "text-unassigned"]);
		for (const [literal, index] of [["@office", 0], ["@Office", 1], ["@OFFICE", 2]] as const) {
			const task = parseTask(`- [ ] Work ${literal}`);
			expect(createGroupAssigner(buckets, exactSource)(task)).toBe(buckets[index]?.id);
			expect(buckets.map((bucket) => taskBelongsToGroup(task, bucket))).toEqual(buckets.map((_, i) => i === index));
		}
	});
	it("matches the same root text for columns and lanes", () => {
		const task = parseTask("- [ ] Work @office", { columns });
		const office = { kind: "text" as const, literals: ["@office"] };
		expect(createGroupAssigner(deriveGroupBuckets([], office), office)(task)).toBe("text:@office");
	});
});

it("does not collide with the Unassigned id for a literal named __unassigned__", () => {
	const source = { kind: "text" as const, literals: ["__unassigned__"] };
	const buckets = deriveGroupBuckets([], source);
	expect(new Set(buckets.map((bucket) => bucket.id)).size).toBe(2);
});
