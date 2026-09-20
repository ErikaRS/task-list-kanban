import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			// The real Obsidian package supplies types but no Node-loadable module.
			// Unit tests that need its bundled Moment value use this small shim;
			// individual suites can still replace it with richer vi.mock() factories.
			obsidian: fileURLToPath(new URL("./src/test_support/obsidian.ts", import.meta.url)),
			// Tests import modules as `src/...` (resolved via tsconfig baseUrl).
			// Vitest 4 no longer applies tsconfig `baseUrl` automatically, so map
			// the `src` root explicitly.
			src: fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		include: ["**/*.tests.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/worktrees/**"],
		setupFiles: ["./src/test_support/setup.ts"],
	},
});
