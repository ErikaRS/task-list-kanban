// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import CardActionModeSelector from "../CardActionModeSelector.svelte";

vi.mock("obsidian", () => ({
	setIcon: vi.fn((element: HTMLElement, name: string) => element.dataset.icon = name),
}));

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
	expect(trigger.textContent?.trim()).toBe("");
	expect(trigger.querySelector(".icon")?.getAttribute("data-icon")).toBe("lucide-square");
	trigger.click();
	await tick();
	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	expect(Array.from(document.querySelectorAll("[role=menuitemradio] .icon:first-child"))
		.map((icon) => icon.getAttribute("data-icon"))).toEqual([
		"lucide-square", "lucide-arrow-right", "lucide-circle",
	]);
	const advance = Array.from(document.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]"))
		.find((button) => button.textContent?.includes("Advance"))!;
	advance.click();
	await tick();
	expect(onChange).toHaveBeenCalledWith("advance");
	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	component.$set({ mode: "advance" });
	await tick();
	expect(trigger.getAttribute("aria-label")).toBe("Card action mode: Advance");
	expect(trigger.querySelector(".icon")?.getAttribute("data-icon")).toBe("lucide-arrow-right");
});

it("closes with Escape and returns focus to the trigger", async () => {
	component = new CardActionModeSelector({ target: document.body, props: { mode: "select" } });
	const trigger = document.querySelector<HTMLButtonElement>(".card-action-mode-trigger")!;
	trigger.click();
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(document.activeElement?.getAttribute("role")).toBe("menuitemradio");
	document.querySelector("[role=menu]")!.dispatchEvent(new KeyboardEvent("keydown", {
		key: "Escape", bubbles: true,
	}));
	await tick();
	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	expect(document.activeElement).toBe(trigger);
});
