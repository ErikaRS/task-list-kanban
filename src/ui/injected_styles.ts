// Prefix of the <style> ids and scoping classes the Svelte compiler emits for
// this plugin. Keep in sync with CSS_HASH_PREFIX in svelte.config.js.
export const INJECTED_STYLE_PREFIX = "tlk-svelte-";

/**
 * Remove the component styles Svelte injected into a document. Svelte never
 * removes them itself, so without this every in-place plugin reload would leave
 * the previous version's styles behind (#212).
 */
export function removeInjectedStyles(doc: Document): void {
	doc.head
		?.querySelectorAll(`style[id^="${INJECTED_STYLE_PREFIX}"]`)
		.forEach((style) => style.remove());
}
