import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
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
		const parsed = readFrontmatter(output);

		expect(parsed.title).toBe("Bob's Board");
		expect(parsed.published).toBe(true);
		expect(parsed.tags).toEqual(["kanban"]);
		expect(parsed.nested).toEqual({ owner: "Erika" });
		expect(typeof parsed.kanban_plugin).toBe("string");
		expect(parseKanbanSettingsFromViewData(output).scope).toBe(ScopeOption.Everywhere);
		expect(parseKanbanSettingsFromViewData(output).lastContentFilter).toBe("Bob's plan");
		expect(output).toContain("- [ ] Keep body text");
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

function readFrontmatter(data: string): Record<string, unknown> {
	const closingDelimiter = data.indexOf("\n---", 4);
	if (closingDelimiter === -1) {
		return {};
	}

	const parsed = load(data.slice(4, closingDelimiter));
	if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>;
	}

	return {};
}
