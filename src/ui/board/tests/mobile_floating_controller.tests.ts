// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mobileFloatingAction } from "../mobile_floating_action";

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("shares listeners, observations and geometry reads, and cleans up after the last button", () => {
	const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
	const Observer = vi.fn(class { observe = observe; unobserve = unobserve; disconnect = disconnect; });
	vi.stubGlobal("ResizeObserver", Observer);
	let next = 0;
	const frames = new Map<number, FrameRequestCallback>();
	vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++next, callback); return next; });
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
	const viewport = document.createElement("div");
	viewport.className = "columns";
	viewport.innerHTML = '<div class="mobile-board-list"><section class="mobile-outer-section"><header class="mobile-outer-header"></header><div class="mobile-cell"><div class="tasks-wrapper"><button></button></div></div><div class="mobile-cell"><div class="tasks-wrapper"><button></button></div></div></section></div>';
	document.body.append(viewport);
	const viewportRect = vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 360, 700));
	const header = viewport.querySelector<HTMLElement>("header")!;
	const headerRect = vi.spyOn(header, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 360, 44));
	viewport.querySelectorAll<HTMLElement>(".tasks-wrapper").forEach((section, index) => {
		vi.spyOn(section, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 44 + index * 120, 360, 120));
	});
	const buttons = viewport.querySelectorAll<HTMLButtonElement>("button");
	const add = vi.spyOn(viewport, "addEventListener");
	const remove = vi.spyOn(viewport, "removeEventListener");
	const first = mobileFloatingAction(buttons[0]!);
	const second = mobileFloatingAction(buttons[1]!);
	viewport.dispatchEvent(new Event("scroll"));
	viewport.dispatchEvent(new Event("scroll"));
	expect(Observer).toHaveBeenCalledTimes(1);
	expect(add.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1);
	expect(frames.size).toBe(1);
	const pending = Array.from(frames.values()); frames.clear(); pending.forEach(callback => callback(0));
	expect(viewportRect).toHaveBeenCalledTimes(1);
	expect(headerRect).toHaveBeenCalledTimes(1);
	expect(buttons[0]!.style.top).toBe("60px");
	expect(buttons[1]!.style.top).toBe("60px");
	first.destroy?.();
	expect(unobserve).not.toHaveBeenCalledWith(header);
	expect(disconnect).not.toHaveBeenCalled();
	second.destroy?.();
	expect(disconnect).toHaveBeenCalledTimes(1);
	expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
	expect(frames.size).toBe(0);
});

it("registers a button after its nested board is attached", async () => {
	const observe = vi.fn();
	vi.stubGlobal("ResizeObserver", class { observe = observe; unobserve = vi.fn(); disconnect = vi.fn(); });
	const viewport = document.createElement("div");
	viewport.className = "columns";
	const section = document.createElement("div");
	section.className = "tasks-wrapper";
	const button = document.createElement("button");
	section.append(button);
	const action = mobileFloatingAction(button);
	viewport.append(section);
	document.body.append(viewport);
	await Promise.resolve();
	expect(observe).toHaveBeenCalledWith(section);
	action.destroy?.();
});
