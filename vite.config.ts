import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			// Tests import modules as `src/...` (resolved via tsconfig baseUrl).
			// Vitest 4 no longer applies tsconfig `baseUrl` automatically, so map
			// the `src` root explicitly.
			src: fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		include: ["**/*.tests.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/worktrees/**"],
	},
});
