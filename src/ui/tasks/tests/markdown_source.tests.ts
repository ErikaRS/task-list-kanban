import { describe, expect, it } from "vitest";
import { editableMarkdownSource, flattenMarkdownSource, legacyBreaksToMarkdown, markdownBlock, markdownBody, parseMarkdownSource, replaceMarkdownBlock, replaceMarkdownBody } from "../markdown_source";

describe("Markdown item source", () => {
	it("bounds each list editor to its visible leading block and preserves exact CRLF offsets", () => {
		const source = parseMarkdownSource("- [ ] Parent\r\n  first paragraph\r\n\r\n  - Note\r\n    continuation\r\n    - [ ] Child\r\n\r\n  Later paragraph")[0]!;
		const parent = editableMarkdownSource(source);
		expect(parent.raw).toBe("- [ ] Parent\r\n  first paragraph");
		expect(parent.end).toBe(parent.raw.length);
		expect(markdownBody(parent)).toBe("Parent\nfirst paragraph");
		const note = editableMarkdownSource(source.children[0]!);
		expect(markdownBlock(note)).toBe("- Note\n  continuation");
		expect(note.children).toEqual([]);
	});

	it.each([
		["  - Note", "- [ ] Note", "  - [ ] Note"],
		["  - [/] Task", "- Note", "  - Note"],
		["  - Note", "Plain text", "  Plain text"],
		["  + Note", "2. Note", "  2. Note"],
	])("keeps a changed or removed marker literal when editing %s", (raw, draft, expected) => {
		const item = parseMarkdownSource("- [ ] Parent\n" + raw)[0]!.children[0]!;
		expect(replaceMarkdownBlock(editableMarkdownSource(item), draft)).toBe(expected);
	});
	it("keeps nested legacy breaks inside their Markdown list containers in a whole-card draft", () => {
		expect(legacyBreaksToMarkdown("Title\n- Note<br />second\n  - Child<br />more"))
			.toBe("Title\n- Note\n  second\n  - Child\n    more");
	});
	it("shares forward reference definitions with rendered fragments without creating empty note controls", () => {
		const item = parseMarkdownSource('- [ ] See [guide][ref]\n\n  [ref]: https://example.com/\n    "Guide"')[0]!;
		expect(item.children).toEqual([]);
		expect(item.referenceDefinitions).toBe('[ref]: https://example.com/\n  "Guide"');
		expect(markdownBody(item)).toBe('See [guide][ref]\n\n[ref]: https://example.com/\n  "Guide"');
	});
	it("retains BOM offsets and a list item whose first block is a fence", () => {
		const items = parseMarkdownSource("\uFEFF- [ ] Task\n  - ```md\n    - [ ] example\n    ```");
		expect(items[0]!.start).toBe(1);
		expect(items[0]!.listPrefix).toBe("- ");
		expect(items[0]!.children[0]!.children).toEqual([]);
		expect(items[0]!.children[0]!.paragraphEndRow).toBe(4);
	});
	it("keeps paragraphs, lazy continuation and nested blocks in the item without consuming its sibling", () => {
		const body = "Title  \nsoft\\\nnext\n\nParagraph\n\n- note\n  - [/] Child\n\n```md\n- [ ] Example\n```";
		const source = "* [!] " + body.split("\n").map((line, index) => index && line ? "  " + line : line).join("\n");
		const items = parseMarkdownSource(source + "\n\n- [ ] Sibling\n");
		expect(items[0]!.raw).toBe(source);
		expect(markdownBody(items[0]!)).toBe(body);
		expect(replaceMarkdownBody(items[0]!, body)).toBe(source);
		expect(flattenMarkdownSource(items).filter(item => item.listPrefix).map(item => item.rowIndex)).toEqual([0, 6, 7, 13]);
		const lazy = parseMarkdownSource("- [ ] Title\nlazy continuation\n\nOutside")[0]!;
		expect(markdownBody(lazy)).toBe("Title\nlazy continuation");
		expect(lazy.raw).toBe("- [ ] Title\nlazy continuation");
	});

	it("keeps code, quotes, HTML and frontmatter out of list-task discovery", () => {
		const text = "---\nexample: |\n  - [ ] YAML\n---\n\n```md\n- [ ] Fenced\n```\n\n    - [ ] Indented code\n\n> - [ ] Quote\n\n<div>\n- [ ] HTML\n</div>\n\n- [🟢] Actual";
		expect(flattenMarkdownSource(parseMarkdownSource(text)).filter(item => item.listPrefix).map(markdownBody)).toEqual(["Actual"]);
	});

	it("preserves relative code indentation and interprets mixed tab containers", () => {
		const item = parseMarkdownSource("  - [ ] Parent\n \t- [ ] Child\n\n      code")[0]!;
		expect(item.children[0]!.listPrefix).toBe(" \t- ");
		const body = markdownBody(item);
		expect(body).toContain("- [ ] Child");
		expect(replaceMarkdownBody(item, body)).toContain("  - [ ] Parent");
	});

	it("converts only legacy inline HTML breaks in an editing draft", () => {
		const text = "Title<br />note `literal<br />` \\<br /> <br>\n\n```html\n<br />\n```";
		expect(legacyBreaksToMarkdown(text)).toBe("Title\nnote `literal<br />` \\<br /> <br>\n\n```html\n<br />\n```");
		expect(legacyBreaksToMarkdown('[label](https://example.com/ "<br />")')).toBe('[label](https://example.com/ "<br />")');
	});
});
