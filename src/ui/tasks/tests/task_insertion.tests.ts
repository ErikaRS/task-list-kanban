import { describe, expect, it } from "vitest";
import { getNewTaskHeadingError, insertNewTask } from "../task_insertion";

const task = "- [ ] New task";
const insert = (text: string, heading = "", position: "top" | "bottom" = "bottom") =>
	insertNewTask(text, task, { newTaskHeading: heading, newTaskPosition: position });

describe("new task insertion", () => {
	it.each([
		["Intro", "", "top", `${task}\nIntro`],
		["Intro", "", "bottom", `Intro\n${task}`],
		["# Tasks\n\nOld\n\n# Next", "Tasks", "top", `# Tasks\n\n${task}\nOld\n\n# Next`],
		["# Tasks\n\nOld\n\n# Next", "Tasks", "bottom", `# Tasks\n\nOld\n${task}\n\n# Next`],
		["Intro", "Tasks", "top", `## Tasks\n${task}\n\nIntro`],
		["Intro", "Tasks", "bottom", `Intro\n\n## Tasks\n${task}`],
	] as const)("places a task in %j under %j at %s", (text, heading, position, expected) => {
		expect(insert(text, heading, position)).toBe(expected);
	});

	it.each(["", "\n", "\r\n"])("preserves terminal newline style %j and CRLF", (ending) => {
		const source = `---\r\ntitle: Test\r\n---\r\n# Body${ending}`;
		expect(insert(source, "", "top")).toBe(`---\r\ntitle: Test\r\n---\r\n${task}\r\n# Body${ending}`);
		expect(insert(source)).toBe(`---\r\ntitle: Test\r\n---\r\n# Body${ending || "\r\n"}${task}${ending}`);
	});

	it("keeps BOM and YAML before a new top section", () => {
		expect(insert("\uFEFF---\ntitle: X\n...\nBody\n", "Tasks", "top"))
			.toBe(`\uFEFF---\ntitle: X\n...\n## Tasks\n${task}\n\nBody\n`);
	});
	it.each(["top", "bottom"] as const)("rejects unclosed frontmatter at %s", (position) => {
		expect(() => insert("---\ntitle: X", "", position)).toThrow("frontmatter");
	});
	it("supports empty files and files containing only frontmatter", () => {
		expect(insert("")).toBe(task);
		expect(insert("\uFEFF", "Tasks")).toBe(`\uFEFF## Tasks\n${task}`);
		expect(insert("---\n---", "", "top")).toBe(`---\n---\n${task}`);
	});
	it("uses first exact ATX match at any level and includes subsections", () => {
		const source = "# tasks\nWrong case\n   ### Tasks ###  \nOld\n#### Child\nChild text\n\n## End\n# Tasks\nDuplicate";
		expect(insert(source, "Tasks")).toBe(source.replace("Child text\n", `Child text\n${task}\n`));
	});
	it.each(["# Tasks\n\n# End", "###### Tasks\n\n# End"])("inserts in empty sections", (source) => {
		expect(insert(source, "Tasks")).toBe(source.replace("\n\n", `\n${task}\n\n`));
	});
	it("ignores headings inside frontmatter, fences, blockquotes and indented code", () => {
		const source = "---\n# Tasks\n---\n```md\n# Tasks\n```\n~~~\n# Tasks\n~~~\n> # Tasks\n    # Tasks\n\t# Tasks\n# Tasks\nReal\n# End";
		expect(insert(source, "Tasks", "top")).toBe(source.replace("\nReal", `\n${task}\nReal`));
	});
	it("does not match Setext or rendered heading text", () => {
		expect(insert("Tasks\n=====\n# **Tasks**", "Tasks")).toBe(`Tasks\n=====\n# **Tasks**\n\n## Tasks\n${task}`);
	});
	it("separates tasks from preceding nested blocks and closed fences", () => {
		expect(insert("- [ ] Parent\n    note")).toBe(`- [ ] Parent\n    note\n\n${task}`);
		expect(insert("```\ncode\n```\n")).toBe(`\`\`\`\ncode\n\`\`\`\n\n${task}\n`);
	});
	it("rejects insertion into an unclosed fence but allows top placement before it", () => {
		expect(() => insert("```\ncode")).toThrow("code fence");
		expect(insert("```\ncode", "", "top")).toBe(`${task}\n\`\`\`\ncode`);
	});
	it("preserves unrelated whitespace and mixed line endings", () => {
		expect(insert("# Tasks\r\nOld  \n\n# End\r\n", "Tasks"))
			.toBe(`# Tasks\r\nOld  \n${task}\r\n\n# End\r\n`);
	});
	it("recomputes the insertion point for sequential creations", () => {
		const first = insert("Intro", "Tasks", "top");
		expect(insert(first, "Tasks", "top")).toBe(`## Tasks\n${task}\n${task}\n\nIntro`);
		expect(insertNewTask(first, "- [ ] Second", { newTaskHeading: "Tasks" }))
			.toBe(`## Tasks\n${task}\n\nIntro\n- [ ] Second`);
	});
	it("validates heading text", () => {
		expect(getNewTaskHeadingError(" Tasks ")).toBeNull();
		expect(getNewTaskHeadingError("  ")).toBeNull();
		expect(getNewTaskHeadingError("## Tasks")).toMatch("without #");
		expect(getNewTaskHeadingError("A\nB")).toMatch("single line");
	});
});
