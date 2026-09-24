// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mobileKeyboardBoardLayout } from "../mobile_editor_layout";

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

describe("mobile board keyboard layout", () => {
	it("keeps the board height until the keyboard viewport recovers", async () => {
		const viewport = new EventTarget() as EventTarget & { height: number };
		viewport.height = 800;
		const previousViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
		Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
		try {
			const main = document.createElement("div");
			main.innerHTML = '<div class="board-main"><input /></div>';
			document.body.append(main);
			const board = main.querySelector<HTMLElement>(".board-main")!;
			vi.spyOn(board, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 360, 640));
			const action = mobileKeyboardBoardLayout(main, true);
			const input = main.querySelector("input")!;
			input.focus();
			expect(board.style.minHeight).toBe("640px");
			viewport.height = 360;
			input.blur();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(board.style.minHeight).toBe("640px");
			viewport.height = 800;
			viewport.dispatchEvent(new Event("resize"));
			expect(board.style.minHeight).toBe("");
			action.destroy?.();
		} finally {
			if (previousViewport) Object.defineProperty(window, "visualViewport", previousViewport);
			else Reflect.deleteProperty(window, "visualViewport");
		}
	});
});
