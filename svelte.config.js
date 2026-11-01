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

module.exports = {
	preprocess: sveltePreprocess({ scss }),
	compilerOptions: {
		compatibility: { componentApi: 4 },
	},
};
