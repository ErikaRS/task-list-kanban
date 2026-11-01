// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import TextLiteralList from "../TextLiteralList.svelte";

let component: TextLiteralList;
afterEach(() => { component?.$destroy(); document.body.innerHTML = ""; });

it("adds trimmed literals, rejects invalid entries, reorders and removes lanes", async () => {
	const onChange = vi.fn((value: string[]) => component.$set({ value }));
	component = new TextLiteralList({ target: document.body, props: { value: ["@office"], onChange } });
	const input = document.querySelector("input")!;
	async function enter(value: string) {
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		await tick();
	}
	await enter(" @office ");
	expect(document.querySelector('[role="alert"]')?.textContent).toContain("already");
	await enter("#home");
	expect(document.querySelector('[role="alert"]')?.textContent).toContain("Tags");
	expect(onChange).not.toHaveBeenCalled();
	await enter(" [[Project A]] ");
	expect(onChange).toHaveBeenLastCalledWith(["@office", "[[Project A]]"]);
	expect(input.value).toBe("");
	document.querySelector<HTMLButtonElement>('[aria-label="Move [[Project A]] up"]')!.click();
	await tick();
	expect(onChange).toHaveBeenLastCalledWith(["[[Project A]]", "@office"]);
	expect(document.querySelector<HTMLButtonElement>('[aria-label="Move [[Project A]] up"]')!.disabled).toBe(true);
	document.querySelector<HTMLButtonElement>('[aria-label="Remove @office"]')!.click();
	await tick();
	expect(onChange).toHaveBeenLastCalledWith(["[[Project A]]"]);
});


it("accepts a lane with different case from an existing literal", async () => {
	const onChange = vi.fn();
	component = new TextLiteralList({ target: document.body, props: { value: ["@office"], onChange } });
	const input = document.querySelector("input")!;
	input.value = "@Office";
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await tick();
	input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await tick();
	expect(onChange).toHaveBeenCalledWith(["@office", "@Office"]);
	expect(document.querySelector('[role="alert"]')).toBeNull();
});
