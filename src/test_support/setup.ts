// Obsidian provides activeWindow globally. Model it in Node-based Vitest runs
// so modules that select their timer host during initialization stay faithful
// to the plugin runtime.
(globalThis as typeof globalThis & { activeWindow?: Window }).activeWindow ??= globalThis as unknown as Window;
