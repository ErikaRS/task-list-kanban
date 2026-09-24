// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import MobileEditorSheet from "../MobileEditorSheet.svelte";

let component: MobileEditorSheet;
let board: HTMLDivElement;
let trigger: HTMLButtonElement;

beforeEach(() => {
	board = document.createElement("div");
	board.className = "board-content";
	board.innerHTML = '<button>New</button><div class="board-main"></div>';
	document.body.append(board);
	trigger = board.querySelector("button")!;
	trigger.focus();
	// DOM emulation has no layout; only focusability tests need rendered rects.
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
});
afterEach(() => {
	component?.$destroy();
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

async function mount(props: Partial<ConstructorParameters<typeof MobileEditorSheet>[0]["props"]> = {}) {
	const onSave = vi.fn().mockResolvedValue(undefined);
	const onClose = vi.fn();
	component = new MobileEditorSheet({ target: board.querySelector(".board-main")!, props: { onSave, onClose, ...props } });
	await tick();
	return { onSave, onClose, textarea: document.querySelector("textarea")! };
}
function key(element: Element, value: string, options: KeyboardEventInit = {}) {
	element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options }));
}
function button(label: string) {
	return Array.from(document.querySelectorAll<HTMLButtonElement>(".tlk-mobile-editor-sheet button")).find(el => el.textContent === label)!;
}

describe("shared mobile editing sheet", () => {
	it("makes the sheet visible before focusing and locks the board before focus", async () => {
		const nativeFocus = HTMLTextAreaElement.prototype.focus;
		const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus").mockImplementation(function (this: HTMLTextAreaElement, options?: FocusOptions) {
			expect((this.closest(".tlk-mobile-editor-sheet") as HTMLElement).style.visibility).toBe("visible");
			expect(board.inert).toBe(true);
			expect(board.querySelector<HTMLElement>(".board-main")!.style.minHeight).not.toBe("");
			nativeFocus.call(this, options);
		});
		const { textarea } = await mount();
		expect(document.activeElement).toBe(textarea);
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
		expect((textarea.closest(".tlk-mobile-editor-sheet") as HTMLElement).style.visibility).toBe("visible");
		expect(board.inert).toBe(true);
		expect(document.querySelector(".tlk-mobile-editor-root")?.parentElement).toBe(document.body);
	});
	it("keeps the editor above the host workspace when it shrinks for the keyboard", async () => {
		const workspace = document.createElement("div");
		workspace.className = "workspace-leaf-content";
		board.replaceWith(workspace);
		workspace.append(board);
		let bottom = 700;
		vi.spyOn(workspace, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 390, bottom));
		await mount();
		const root = document.querySelector<HTMLElement>(".tlk-mobile-editor-root")!;
		expect(root.style.height).toBe("700px");
		bottom = 420;
		window.dispatchEvent(new Event("resize"));
		await vi.waitFor(() => expect(root.style.height).toBe("420px"));
	});
	it("does not save on blur or plain Enter, but saves on Ctrl+Enter", async () => {
		const { textarea, onSave } = await mount();
		textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
		key(textarea, "Enter");
		expect(onSave).not.toHaveBeenCalled();
		key(textarea, "Enter", { ctrlKey: true });
		await tick();
		expect(onSave).toHaveBeenCalledTimes(1);
	});
	it("prevents duplicate submits and cancellation during a pending write", async () => {
		let resolve!: () => void;
		const save = vi.fn(() => new Promise<void>(done => resolve = done));
		const { textarea, onClose } = await mount({ onSave: save });
		key(textarea, "Enter", { ctrlKey: true });
		key(textarea, "Enter", { ctrlKey: true });
		key(textarea, "Escape");
		await tick();
		expect(save).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
		resolve();
		await tick();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
	it("retains entered text and shows a recoverable save error", async () => {
		const save = vi.fn().mockRejectedValueOnce(new Error("Write failed")).mockResolvedValue(undefined);
		const { textarea, onClose } = await mount({ onSave: save });
		textarea.value = "Keep my draft";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		button("Save").click();
		await tick();
		await tick();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("Write failed");
		expect(textarea.value).toBe("Keep my draft");
		expect(onClose).not.toHaveBeenCalled();
		button("Save").click();
		await tick();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
	it("wraps Tab within the sheet and restores focus and board state on teardown", async () => {
		const remove = vi.spyOn(window, "removeEventListener");
		await mount();
		button("Save").focus();
		key(button("Save"), "Tab");
		expect(document.activeElement).toBe(button("Cancel"));
		key(button("Cancel"), "Tab", { shiftKey: true });
		expect(document.activeElement).toBe(button("Save"));
		component.$destroy();
		expect(document.activeElement).toBe(trigger);
		expect(board.inert).toBe(false);
		expect(board.querySelector<HTMLElement>(".board-main")!.style.minHeight).toBe("");
		expect(document.querySelector(".tlk-mobile-editor-root")).toBeNull();
		expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
	});
	it("does not close a replacement editor when an unmounted save finishes", async () => {
		let resolve!: () => void;
		const { textarea, onClose } = await mount({ onSave: () => new Promise<void>(done => resolve = done) });
		key(textarea, "Enter", { ctrlKey: true });
		component.$destroy();
		resolve();
		await tick();
		expect(onClose).not.toHaveBeenCalled();
	});
});
