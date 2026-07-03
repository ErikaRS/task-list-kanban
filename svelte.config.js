// Used by svelte-check (the build's component type-check step). The esbuild
// bundle configures its own preprocessing in esbuild.config.mjs; keep the
// compiler compatibility settings in sync with it. CommonJS so Node does not
// have to reparse it (the package is not type: module).
const sveltePreprocess = require("svelte-preprocess");

module.exports = {
	preprocess: sveltePreprocess(),
	compilerOptions: {
		compatibility: { componentApi: 4 },
	},
};
