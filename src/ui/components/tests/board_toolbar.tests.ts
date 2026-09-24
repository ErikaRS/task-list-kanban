// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { tick } from "svelte";
import ToolbarFixture from "./fixtures/ToolbarFixture.svelte";
let component: ToolbarFixture;
afterEach(() => { component?.$destroy(); document.body.innerHTML = ""; });
it.each([
	[false, ["View", "Filter", "Open files", "Settings"]],
	[true, ["View", "Search", "Open files", "Settings", "Filter"]],
] as const)("preserves visual and focus order (mobile=%s)", async (mobile, expected) => {
	component = new ToolbarFixture({ target: document.body, props: { mobile } });
	await tick();
	const controls = Array.from(document.querySelectorAll<HTMLElement>("button, input"));
	expect(controls.map(node => node.getAttribute("aria-label") ?? node.textContent)).toEqual(expected);
	for (const control of controls) {
		control.focus();
		expect(document.activeElement).toBe(control);
	}
});
