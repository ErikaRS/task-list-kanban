import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: [
			"build/**",
			"dist/**",
			"main.js",
			"src/**/tests/**",
			"test-vault/**",
			"worktrees/**",
			"esbuild.config.mjs",
			"eslint.config.mjs",
			"eslint.scanner.mjs",
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
