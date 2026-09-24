// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mobileVisibleBottom } from "../mobile_visible_area";

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});

it("uses the smaller Obsidian workspace edge when the keyboard shrinks only the workspace", () => {
	const workspace = document.createElement("div");
	workspace.className = "workspace-leaf-content";
	const board = document.createElement("div");
	workspace.append(board);
	document.body.append(workspace);
	vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 390, 560));
	expect(mobileVisibleBottom(board, window)).toBe(560);
});
