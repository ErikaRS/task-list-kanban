// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import CardActionModeSelector from "../CardActionModeSelector.svelte";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

let component: CardActionModeSelector;
afterEach(() => {
	component?.$destroy();
	document.body.innerHTML = "";
});

it("shows the current mode and chooses another from the menu", async () => {
	const onChange = vi.fn();
	component = new CardActionModeSelector({ target: document.body, props: { mode: "done", onChange } });
	const trigger = document.querySelector<HTMLButtonElement>(".card-action-mode-trigger")!;
	expect(trigger.getAttribute("aria-label")).toBe("Card action mode: Done");
	trigger.click();
	await tick();
	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	const advance = Array.from(document.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]"))
		.find((button) => button.textContent?.includes("Advance"))!;
	advance.click();
	await tick();
	expect(onChange).toHaveBeenCalledWith("advance");
	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	component.$set({ mode: "advance" });
	await tick();
	expect(trigger.getAttribute("aria-label")).toBe("Card action mode: Advance");
});

it("closes with Escape and returns focus to the trigger", async () => {
	component = new CardActionModeSelector({ target: document.body, props: { mode: "select" } });
	const trigger = document.querySelector<HTMLButtonElement>(".card-action-mode-trigger")!;
	trigger.click();
	await tick();
	// Opening renders the menu, then the handler's own tick moves focus into it.
	await tick();
	expect(document.activeElement?.getAttribute("role")).toBe("menuitemradio");
	document.querySelector("[role=menu]")!.dispatchEvent(new KeyboardEvent("keydown", {
		key: "Escape", bubbles: true,
	}));
	await tick();
	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	expect(document.activeElement).toBe(trigger);
});
