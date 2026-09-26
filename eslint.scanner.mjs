// Approximates the Obsidian community directory scanner: the stock obsidianmd
// rules with none of this repo's ignores beyond tests and build output.
// Run with `npm run communitylint`.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: [
			"main.js",
			"node_modules/**",
			"src/**/tests/**",
			"test-vault/**",
			"worktrees/**",
			"*.mjs",
			"*.js",
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
