import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: [
			"build/**",
			"dist/**",
			"main.js",
			"src/**/tests/**",
			"src/test_support/**",
			"test-vault/**",
			"worktrees/**",
			"esbuild.config.mjs",
			"eslint.config.mjs",
			"svelte.config.js",
			"version-bump.mjs",
			"vite.config.ts",
		],
	},
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},
]);
