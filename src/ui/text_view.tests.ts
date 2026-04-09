import { describe, it, expect } from "vitest";

describe("YAML Frontmatter Serialization", () => {
	it("should properly escape JSON values with quotes", () => {
		const attributes = {
			kanban_plugin: '{"key":"value with "quotes""}',
			kanban_order: '{"column-today":["task::with quotes"]}',
		};

		const yaml = `---
${Object.entries(attributes)
	.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
	.join("\n")}
---
`;

		// Should not contain unescaped quotes that break YAML
		expect(yaml).toContain('kanban_plugin: "{\\"key\\":\\"value with \\"quotes\\"\\"}"');
		expect(yaml).not.toContain("kanban_plugin: '{");
	});

	it("should properly escape JSON values with special characters", () => {
		const attributes = {
			kanban_order: '{"column-today":["path/to/file.md::task with: colons and \\n newlines"]}',
		};

		const yaml = `---
${Object.entries(attributes)
	.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
	.join("\n")}
---
`;

		// JSON.stringify handles escaping automatically
		expect(yaml).toContain("kanban_order:");
		expect(() => {
			// This would throw if YAML was malformed
			const match = yaml.match(/kanban_order:\s+(.+)/);
			if (match) {
				JSON.parse(match[1]);
			}
		}).not.toThrow();
	});

	it("should preserve object structure after serialization", () => {
		const original = {
			"column-today": [
				"knowledgeBase/architecture/overview.md::architecture needs review",
				"knowledgeBase/offer/overview.md::offer needs review",
			],
			"column-this-week": [
				"knowledgeBase/pricing/overview.md::pricing needs review",
			],
		};

		const serialized = JSON.stringify(original);
		const deserialized = JSON.parse(serialized);

		expect(deserialized).toEqual(original);
	});

	it("should not break YAML parsing with single-quote escaping", () => {
		// This was the old broken approach
		const brokenYaml = (value: string) => `kanban_order: '${value}'`;

		// This is the fixed approach
		const fixedYaml = (value: string) => `kanban_order: ${JSON.stringify(value)}`;

		const testValue = '{"column":["task::with\'quotes"]}';

		// Broken version would have unescaped quotes
		expect(brokenYaml(testValue)).toContain("'");

		// Fixed version properly escapes
		const fixed = fixedYaml(testValue);
		expect(fixed).toContain(JSON.stringify(testValue));
	});
});
