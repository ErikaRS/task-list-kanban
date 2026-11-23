// Shared by svelte-check and esbuild. CommonJS so Node does not have to
// reparse it (the package is not type: module).
const sveltePreprocess = require("svelte-preprocess");
const sass = require("sass");
const { fileURLToPath, pathToFileURL } = require("node:url");

// svelte-preprocess's built-in SCSS transformer uses Sass's deprecated legacy
// API. Override just that transformer, retaining its TypeScript preprocessing.
const scss = ({ content, filename }) => {
	const url = filename ? pathToFileURL(filename) : undefined;
	const result = sass.compileString(content, {
		url,
		loadPaths: [process.cwd(), "node_modules"],
		sourceMap: true,
	});
	return {
		code: result.css,
		map: JSON.stringify(result.sourceMap),
		dependencies: result.loadedUrls
			.filter((loaded) => loaded.protocol === "file:" && loaded.href !== url?.href)
			.map((loaded) => fileURLToPath(loaded)),
	};
};

// Prefix for the ids and scoping classes of component styles. Keep in sync with
// INJECTED_STYLE_PREFIX in src/ui/injected_styles.ts.
const CSS_HASH_PREFIX = "tlk-svelte-";

// Svelte injects each component's CSS as <style id={hash}> and skips injection
// when that id already exists. Its default hash uses only the filename, so when
// Obsidian reloads the plugin in place, the previous release's styles stay in
// <head> and block the new ones (#212). Hash the CSS too, so changed styles get
// a new id, and prefix with the plugin so other Svelte plugins cannot collide.
const cssHash = ({ hash, css, filename }) => `${CSS_HASH_PREFIX}${hash(`${filename ?? ""}\n${css}`)}`;

module.exports = {
	preprocess: sveltePreprocess({ scss }),
	compilerOptions: {
		compatibility: { componentApi: 4 },
		cssHash,
	},
};
