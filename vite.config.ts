import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.tests.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/worktrees/**"],
	},
});
