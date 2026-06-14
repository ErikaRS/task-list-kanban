import { describe, expect, it } from "vitest";
import { renderTaskMarkdownSource } from "../task_markdown";

describe("renderTaskMarkdownSource", () => {
	it("preserves a custom checkbox status in rendered markdown", () => {
		expect(
			renderTaskMarkdownSource({
				content: "In progress task",
				displayStatus: "/",
			}),
		).toBe("- [/] In progress task");
	});

	it("keeps continuation lines inside the rendered task item", () => {
		expect(
			renderTaskMarkdownSource({
				content: "First<br />Second",
				displayStatus: " ",
				blockLink: "abc123",
			}),
		).toBe("- [ ] First\n  Second ^abc123");
	});

	it("strips excluded tags before rendering", () => {
		expect(
			renderTaskMarkdownSource({
				content: "Something #status/active",
				displayStatus: "/",
				excludedTags: ["status/active"],
			}),
		).toBe("- [/] Something");
	});
});
