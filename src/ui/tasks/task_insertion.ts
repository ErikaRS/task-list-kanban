export interface TaskInsertionSettings {
	newTaskHeading?: string;
	newTaskPosition?: "top" | "bottom";
}

export function getNewTaskHeadingError(value: string): string | null {
	if (/[\r\n]/.test(value)) return "Heading must be a single line.";
	if (/^#/.test(value.trim())) return "Enter heading text without # marks.";
	return null;
}

/** Insert a root task without reserializing existing Markdown. */
export function insertNewTask(contents: string, taskLine: string, settings: TaskInsertionSettings = {}): string {
	const heading = (settings.newTaskHeading ?? "").trim();
	const error = getNewTaskHeadingError(settings.newTaskHeading ?? "");
	if (error) throw new Error(error);
	const top = settings.newTaskPosition === "top";
	const bom = contents.startsWith("\uFEFF") ? "\uFEFF" : "";
	const source = contents.slice(bom.length);
	const eol = source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
	const lines: Array<{ text: string; start: number }> = [];
	const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) && match[0]) {
		lines.push({ text: match[1]!, start: match.index });
	}
	let body = 0;
	if (/^---[ \t]*$/.test(lines[0]?.text ?? "")) {
		const close = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)[ \t]*$/.test(line.text));
		if (close < 0) throw new Error("Cannot add task: YAML frontmatter has no closing delimiter.");
		body = close + 1;
	}

	const headings: Array<{ index: number; level: number; text: string }> = [];
	const insideFence = new Set<number>();
	let fence: { char: string; length: number } | null = null;
	for (let i = body; i < lines.length; i++) {
		const text = lines[i]!.text;
		if (fence) {
			insideFence.add(i);
			const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(text);
			if (close && close[1]![0] === fence.char && close[1]!.length >= fence.length) fence = null;
			continue;
		}
		const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
		if (open && !(open[1]![0] === "`" && open[2]!.includes("`"))) {
			fence = { char: open[1]![0]!, length: open[1]!.length };
			continue;
		}
		const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(text);
		if (atx) headings.push({ index: i, level: atx[1]!.length, text: (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim() });
	}
	if (fence) insideFence.add(lines.length);

	let index = top ? body : lines.length;
	let block = taskLine;
	let newSection = false;
	if (heading) {
		const target = headings.find((item) => item.text === heading);
		if (target) {
			const end = headings.find((item) => item.index > target.index && item.level <= target.level)?.index ?? lines.length;
			index = top ? target.index + 1 : end;
			if (top) {
				while (index < end && !lines[index]!.text.trim()) index++;
			} else {
				while (index > target.index + 1 && !lines[index - 1]!.text.trim()) index--;
			}
		} else {
			block = `## ${heading}${eol}${taskLine}`;
			newSection = true;
		}
	}
	if (insideFence.has(index)) throw new Error("Cannot add task inside an unclosed code fence. Close the code fence first.");
	const offset = lines[index]?.start ?? source.length;
	const before = source.slice(0, offset);
	const after = source.slice(offset);
	const previous = lines[index - 1]?.text ?? "";
	let prefix = before && !/[\r\n]$/.test(before) ? eol : "";
	// Blank separation prevents indented content from absorbing a root task.
	if (previous.trim() && ((newSection && index > body) || /^(?: {4}|\t)|^ {0,3}(?:`{3,}|~{3,})/.test(previous))) prefix += eol;
	let suffix = after ? eol : source.match(/(?:\r\n|\n|\r)$/)?.[0] ?? "";
	if (newSection && after && lines[index]?.text.trim()) suffix += eol;
	return bom + before + prefix + block + suffix + after;
}
