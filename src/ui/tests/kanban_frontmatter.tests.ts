import { describe, expect, it } from "vitest";
import matter from "gray-matter";
import {
	parseKanbanSettingsFromViewData,
	writeKanbanSettingsToViewData,
} from "../kanban_frontmatter";
import {
	defaultSettings,
	ScopeOption,
	type SettingValues,
} from "../settings/settings_store";

describe("kanban frontmatter helpers", () => {
	it("preserves unrelated structured frontmatter while updating kanban settings", () => {
		const settings: SettingValues = {
			...defaultSettings,
			scope: ScopeOption.Everywhere,
			lastContentFilter: "Bob's plan",
		};
		const input = [
			"---",
			"title: Bob's Board",
			"published: true",
			"tags:",
			"  - kanban",
			"nested:",
			"  owner: Erika",
			"kanban_plugin: '{}'",
			"---",
			"# Board",
			"",
			"- [ ] Keep body text",
			"",
		].join("\n");

		const output = writeKanbanSettingsToViewData(input, settings);
		const parsed = matter(output);

		expect(parsed.data.title).toBe("Bob's Board");
		expect(parsed.data.published).toBe(true);
		expect(parsed.data.tags).toEqual(["kanban"]);
		expect(parsed.data.nested).toEqual({ owner: "Erika" });
		expect(typeof parsed.data.kanban_plugin).toBe("string");
		expect(parseKanbanSettingsFromViewData(output).scope).toBe(ScopeOption.Everywhere);
		expect(parseKanbanSettingsFromViewData(output).lastContentFilter).toBe("Bob's plan");
		expect(parsed.content).toContain("- [ ] Keep body text");
	});

	it("accepts object-shaped kanban settings from older or hand-edited files", () => {
		const input = [
			"---",
			"kanban_plugin:",
			"  scope: everywhere",
			"---",
			"",
		].join("\n");

		expect(parseKanbanSettingsFromViewData(input).scope).toBe(ScopeOption.Everywhere);
	});
});
