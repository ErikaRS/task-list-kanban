import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, preprocess, type CompileOptions, type PreprocessorGroup } from "svelte/compiler";
import { afterEach, describe, expect, it } from "vitest";
import { INJECTED_STYLE_PREFIX } from "../ui/injected_styles";

const require = createRequire(import.meta.url);
const config = require("../../svelte.config.js") as {
	preprocess: PreprocessorGroup;
	compilerOptions: CompileOptions;
};

describe("production Svelte preprocessing", () => {
	let directory: string | undefined;

	afterEach(() => {
		if (directory) rmSync(directory, { recursive: true, force: true });
		directory = undefined;
	});

	it("compiles TypeScript and nested SCSS while preserving relative imports, source maps, and watch dependencies", async () => {
		directory = mkdtempSync(join(tmpdir(), "kanban-preprocess-"));
		const filename = join(directory, "Component.svelte");
		const partial = join(directory, "_tokens.scss");
		writeFileSync(partial, "$spacing: 3px;");

		const result = await preprocess(`
			<script lang="ts">export let count: number = 1;</script>
			<div><span>{count}</span></div>
			<style lang="scss">
				@use "./tokens";
				div { span { padding: tokens.$spacing; } }
			</style>
		`, config.preprocess, { filename });

		expect(result.code).toContain("div span {");
		expect(result.code).toContain("padding: 3px;");
		expect(result.dependencies).toEqual([partial]);
		const map = JSON.parse(result.map!.toString());
		expect(map.sources).toContain("Component.svelte");
		expect(map.mappings).not.toBe("");
		expect(() => compile(result.code, { filename })).not.toThrow();
	});

	it("rejects invalid SCSS so broken styles still fail the build", async () => {
		await expect(preprocess(
			'<style lang="scss">div { color: $undefined; }</style>',
			config.preprocess,
			{ filename: join(tmpdir(), "Invalid.svelte") },
		)).rejects.toThrow("Undefined variable");
	});
});

// #212: Svelte skips injecting a <style> whose id already exists. The id must
// change with the CSS, or an in-place plugin update keeps the old styles.
describe("injected component styles", () => {
	const styleId = (css: string) => {
		const { js } = compile(`<div></div><style>${css}</style>`, {
			...config.compilerOptions,
			css: "injected",
			filename: "/src/ui/Component.svelte",
		});
		return js.code.match(new RegExp(`${INJECTED_STYLE_PREFIX}[a-z0-9]+`))?.[0];
	};

	it("gives changed CSS in the same file a new plugin-prefixed style id", () => {
		const before = styleId("div { color: red; }");
		expect(before).toBeDefined();
		expect(styleId("div { color: red; }")).toBe(before);
		expect(styleId("div { color: blue; }")).not.toBe(before);
	});
});
