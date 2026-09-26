import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [svelte({ preprocess: sveltePreprocess(), compilerOptions: { compatibility: { componentApi: 4 } } })],
	resolve: {
		conditions: ["browser"],
		alias: {
			// The real Obsidian package supplies types but no Node-loadable module.
			// Unit tests that need its bundled Moment value use this small shim;
			// individual suites can still replace it with richer vi.mock() factories.
			obsidian: "/src/tests/support/obsidian.ts",
			// Tests import modules as `src/...` (resolved via tsconfig baseUrl).
			// Vitest 4 no longer applies tsconfig `baseUrl` automatically, so map
			// the `src` root explicitly.
			src: "/src",
		},
	},
	test: {
		include: ["**/*.tests.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/worktrees/**"],
		setupFiles: ["./src/tests/support/setup.ts"],
	},
});
