export interface TextLiteralMatch {
	start: number;
	end: number;
}

export function validateTextLiteral(literal: string, existing: string[] = []): string | null {
	if (/[\r\n]/u.test(literal)) return "Text cannot contain a line break.";
	const trimmed = literal.trim();
	if (!trimmed) return "Text cannot be empty.";
	if (trimmed.startsWith("#")) return "Use Tags for text beginning with #.";
	if (existing.some((value) => value.trim() === trimmed)) {
		return "This text is already in the list.";
	}
	return null;
}

export function createTextLiteralMatcher(literal: string): (content: string) => TextLiteralMatch[] {
	const trimmed = literal.trim();
	if (!trimmed) return () => [];
	const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	// The negative lookbehind also allows the start of content, where there
	// is no preceding character. Continuation characters cannot end a token.
	const boundaryExpression = new RegExp(`(?<![^\\s(\\["'])${escaped}(?![\\p{L}\\p{N}_/@-])`, "gu");
	return (content) => Array.from(content.matchAll(boundaryExpression), (match) => ({
		start: match.index,
		end: match.index + match[0].length,
	}));
}

export function findTextLiteralMatches(content: string, literal: string): TextLiteralMatch[] {
	return createTextLiteralMatcher(literal)(content);
}

/** Keep checkbox markers and list indentation outside the editable content. */
function editContent(line: string, edit: (content: string) => string): string {
	const prefix = line.match(/^(\s*[-*+]\s+\[[^[\]]*\]\s)/u)?.[0] ?? "";
	return prefix + edit(line.slice(prefix.length));
}

export function addTextLiteral(line: string, literal: string): string {
	if (!literal.trim()) return line;
	return editContent(line, (content) => {
		if (findTextLiteralMatches(content, literal).length) return content;
		const block = content.match(/(\s\^[a-zA-Z0-9-]+\s*)$/u);
		const trimmedContent = content.trimEnd();
		return block?.index !== undefined
			? `${content.slice(0, block.index).trimEnd()} ${literal.trim()}${block[0]}`
			: `${trimmedContent}${trimmedContent ? " " : ""}${literal.trim()}`;
	});
}

export function removeTextLiteral(line: string, literal: string): string {
	return replaceTextLiteral(line, literal, null);
}

export function replaceTextLiteral(line: string, oldLiteral: string, newLiteral: string | null): string {
	return editContent(line, (content) => {
		const matches = findTextLiteralMatches(content, oldLiteral);
		if (!matches.length) return newLiteral ? addTextLiteral(content, newLiteral) : content;
		let next = content;
		for (let i = matches.length - 1; i >= 0; i -= 1) {
			const { start, end } = matches[i]!;
			if (i === 0 && newLiteral) {
				next = next.slice(0, start) + newLiteral.trim() + next.slice(end);
			} else if (/\s/u.test(next[end] ?? "")) {
				next = next.slice(0, start) + next.slice(end + 1);
			} else if (/\s/u.test(next[start - 1] ?? "")) {
				next = next.slice(0, start - 1) + next.slice(end);
			} else {
				next = next.slice(0, start) + next.slice(end);
			}
		}
		return next;
	});
}
