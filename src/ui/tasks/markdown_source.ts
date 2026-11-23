import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

/** Exact source for a Markdown block or list item. Offsets exclude its trailing EOL. */
export interface MarkdownSource {
	start: number;
	end: number;
	rowIndex: number;
	endRowIndex: number;
	raw: string;
	indentation: string;
	continuationPrefix: string;
	listPrefix: string;
	paragraphEndRow: number;
	children: MarkdownSource[];
	referenceDefinitions: string;
}

export function sourceLines(text: string): string[] {
	return text.split(/\r\n|\n|\r/);
}

function indentationColumns(value: string): number {
	return [...value].reduce((columns, char) => char === "\t" ? columns + 4 - columns % 4 : columns + 1, 0);
}

/** Only block/list structure is interpreted. Inline Obsidian syntax stays untouched. */
export function parseMarkdownSource(text: string): MarkdownSource[] {
	const lines = sourceLines(text);
	const starts = [0];
	for (const match of text.matchAll(/\r\n|\n|\r/g)) starts.push(match.index + match[0].length);
	// Mask YAML without moving source positions or interpreting task-like examples in it.
	let input = text;
	if (/^\uFEFF?---[ \t]*(?:\r?\n|\r)/.test(text)) {
		const close = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)[ \t]*$/.test(line));
		const end = close < 0 ? text.length : (starts[close + 1] ?? text.length);
		input = text.slice(0, end).replace(/[^\r\n]/g, " ") + text.slice(end);
	}
	const tree = fromMarkdown(input);
	const definitions: string[] = [];
	function findDefinitions(node: Nodes) {
		if (node.type === "definition" && node.position) {
			const prefix = lines[node.position.start.line - 1]?.match(/^[ \t]*/)?.[0] ?? "";
			const [first, ...rest] = sourceLines(text.slice(node.position.start.offset, node.position.end.offset));
			definitions.push([first, ...rest.map(line => removeContainerPrefix(line, prefix))].join("\n"));
		}
		if ("children" in node) node.children.forEach(findDefinitions);
	}
	findDefinitions(tree);
	const referenceDefinitions = definitions.join("\n\n");
	function collect(node: Nodes, containerPrefix = ""): MarkdownSource[] {
		if (node.type === "root" || node.type === "list") return node.children.flatMap(child => collect(child, containerPrefix));
		if (node.type === "definition") return [];
		const position = node.position;
		if (!position || position.end.offset === undefined) return [];
		const rowIndex = position.start.line - 1;
		const originalLine = lines[rowIndex] ?? "";
		const rawLine = rowIndex === 0 ? originalLine.replace(/^\uFEFF/, "") : originalLine;
		const indentation = node.type === "listItem" ? rawLine.match(/^[ \t]*/)?.[0] ?? "" : containerPrefix;
		const list = node.type === "listItem" ? rawLine.match(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/) : null;
		const start = (starts[rowIndex] ?? 0) + (rowIndex === 0 && originalLine.startsWith("\uFEFF") ? 1 : 0);
		const end = position.end.offset;
		const first = node.type === "listItem" ? node.children[0] : undefined;
		const continuationPrefix = list ? indentation + " ".repeat(indentationColumns(list[0]) - indentationColumns(indentation)) : indentation;
		return [{
			start, end, rowIndex, endRowIndex: position.end.line,
			raw: text.slice(start, end), indentation,
			listPrefix: list?.[0] ?? "",
			referenceDefinitions,
			continuationPrefix,
			paragraphEndRow: first?.position?.start.line === position.start.line ? first.position.end.line : rowIndex + 1,
			// Never descend into code, HTML, quotes or other non-list task containers.
			children: node.type === "listItem"
				? node.children.flatMap((child, index) => index === 0 && child.position?.start.line === position.start.line ? [] : collect(child, continuationPrefix))
				: [],
		}];
	}
	return collect(tree);
}

export function flattenMarkdownSource(items: MarkdownSource[]): MarkdownSource[] {
	return items.flatMap(item => [item, ...flattenMarkdownSource(item.children)]);
}

/** Remove only structural indentation. Lazy continuation and code indentation survive. */
export function removeContainerPrefix(line: string, prefix: string): string {
	if (line.startsWith(prefix)) return line.slice(prefix.length);
	// Tabs can supply multiple Markdown indentation columns.
	let columns = 0;
	let index = 0;
	const target = indentationColumns(prefix);
	while (index < line.length && /[ \t]/.test(line[index]!) && columns < target) {
		columns = line[index] === "\t" ? columns + 4 - columns % 4 : columns + 1;
		index++;
	}
	return columns >= target ? " ".repeat(columns - target) + line.slice(index) : line;
}

export function markdownBody(source: MarkdownSource): string {
	const [header = "", ...rest] = sourceLines(source.raw);
	const first = header.slice(source.listPrefix.length || source.indentation.length).replace(source.listPrefix ? /^\[[^[\]]*\][ \t]/ : /$^/, "");
	return [first, ...rest.map(line => removeContainerPrefix(line, source.continuationPrefix))].join("\n");
}

/** Match a row's visible leading block, leaving separately rendered descendants out of its editor. */
export function editableMarkdownSource(source: MarkdownSource): MarkdownSource {
	if (!source.listPrefix) return source;
	const lineCount = source.paragraphEndRow - source.rowIndex;
	const breaks = Array.from(source.raw.matchAll(/\r\n|\n|\r/g));
	const raw = source.raw.slice(0, breaks[lineCount - 1]?.index ?? source.raw.length);
	return { ...source, raw, end: source.start + raw.length, endRowIndex: source.paragraphEndRow, children: [] };
}

/** Nested rows expose their own list/checkbox marker as ordinary Markdown. */
export function markdownBlock(source: MarkdownSource): string {
	return sourceLines(source.raw).map(line => removeContainerPrefix(line, source.indentation)).join("\n");
}

export function replaceMarkdownBlock(source: MarkdownSource, content: string): string {
	validateMarkdownBody(content);
	return source.indentation + indentMarkdownBody(content, source.indentation);
}

export function validateMarkdownBody(content: string): void {
	if (!sourceLines(content)[0]?.trim()) throw new Error("Enter task text on the first line.");
}

export function indentMarkdownBody(content: string, prefix: string): string {
	return sourceLines(content).map((line, index) => index === 0 || !line ? line : prefix + line).join("\n");
}

export function replaceMarkdownBody(source: MarkdownSource, content: string): string {
	validateMarkdownBody(content);
	const first = sourceLines(source.raw)[0] ?? "";
	const marker = first.slice(source.listPrefix.length).match(/^\[[^[\]]*\][ \t]/)?.[0] ?? "";
	return (source.listPrefix || source.indentation) + marker + indentMarkdownBody(content, source.continuationPrefix);
}

/** The first paragraph is rendered with its item header; later blocks have their own controls. */
export function paragraphContinuation(source: MarkdownSource): string {
	return sourceLines(source.raw).slice(1, source.paragraphEndRow - source.rowIndex)
		.map(line => removeContainerPrefix(line, source.continuationPrefix)).join("\n");
}

/** Migrate the old codec only when opening a text draft, never during indexing or writes of other fields. */
export function legacyBreaksToMarkdown(content: string, headerTokens: readonly string[] = [], nestedTokens?: (header: string) => readonly string[]): string {
	const edits: Array<{ start: number; end: number; replacement: string }> = [];
	const protectedSpans: Array<{ start: number; end: number }> = [];
	const headerEnd = (start: number) => content.indexOf("\n", start) < 0 ? content.length : content.indexOf("\n", start);
	const headers = new Map<number, readonly string[]>([[0, headerTokens]]);
	function visit(node: Nodes, continuationPrefix = "") {
		if ((node.type === "inlineCode" || node.type === "code" || node.type === "link") && node.position) {
			protectedSpans.push({ start: node.position.start.offset!, end: node.position.end.offset! });
		}
		if (node.type === "listItem" && node.position) {
			const offset = node.position.start.offset!;
			const start = content.lastIndexOf("\n", offset - 1) + 1;
			const header = content.slice(start, headerEnd(start));
			const list = header.match(/^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+/);
			if (list) continuationPrefix = list[1]! + " ".repeat(indentationColumns(list[0]) - indentationColumns(list[1]!));
			if (nestedTokens && start > 0 && /^[ \t]*[-*+]\s\[[^[\]]*\]\s/.test(header)) headers.set(start, nestedTokens(header));
		}
		if (node.type === "html" && node.value === "<br />" && node.position) {
			edits.push({ start: node.position.start.offset!, end: node.position.end.offset!, replacement: "\n" + continuationPrefix });
		}
		if ("children" in node) node.children.forEach(child => visit(child, continuationPrefix));
	}
	visit(fromMarkdown(content));
	for (const [headerStart, tokens] of headers) {
		const endOfHeader = headerEnd(headerStart);
		const firstBreak = edits.find(edit => edit.replacement.startsWith("\n") && edit.start >= headerStart && edit.start < endOfHeader);
		if (!firstBreak) continue;
		const moved: string[] = [];
		for (const token of new Set(tokens.filter(Boolean))) {
			const start = content.indexOf(token, firstBreak.start);
			const end = start + token.length;
			if (start < 0 || end > endOfHeader || protectedSpans.some(span => start < span.end && end > span.start)
				|| edits.some(edit => start < edit.end && end > edit.start)) continue;
			moved.push(token);
			edits.push({ start: content[start - 1] === " " ? start - 1 : start, end, replacement: "" });
		}
		if (moved.length) firstBreak.replacement = " " + moved.join(" ") + firstBreak.replacement;
	}
	for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.replacement + content.slice(edit.end);
	return content;
}
