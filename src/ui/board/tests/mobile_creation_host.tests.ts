// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { TFile } from "obsidian";
import type { ColumnTag } from "../../columns/columns";
import type { TaskActions } from "../../tasks/actions";
import { PropertySchemaOption } from "../../../parsing/properties";
import MobileCreationHost from "../MobileCreationHost.svelte";
import { captureMobileCreation, type MobileCreationSession } from "../mobile_creation";

let component: MobileCreationHost;
let board: HTMLDivElement;
beforeEach(() => {
	board = document.createElement("div");
	board.className = "board-content";
	board.innerHTML = '<div class="board-main"></div>';
	document.body.append(board);
});
afterEach(() => { component?.$destroy(); document.body.innerHTML = ""; });
function context() {
	const pickFileForNewTask = vi.fn();
	const createTask = vi.fn().mockResolvedValue(undefined);
	const session = writable<MobileCreationSession | null>(captureMobileCreation({
		column: "this-week" as ColumnTag, context: "This Week / Home",
		file: { path: "tasks.md" } as TFile, fixedFile: false,
		additionalTags: ["home"], propertySchemaOption: PropertySchemaOption.TasksPlugin,
		taskActions: { createTask, pickFileForNewTask } as unknown as TaskActions,
	}));
	component = new MobileCreationHost({ target: board.querySelector(".board-main")!, props: { session } });
	return { session, createTask, pickFileForNewTask };
}
function chooseFile(path: string, picker: ReturnType<typeof vi.fn>) {
	(document.querySelector(".tlk-editor-file") as HTMLButtonElement).click();
	const callback = picker.mock.lastCall?.[2] as (file: TFile) => void;
	callback({ path } as TFile);
}

describe("mobile creation host", () => {
	it("preserves text and dates when the file changes immutably", async () => {
		const { createTask, pickFileForNewTask } = context();
		await tick();
		const textarea = document.querySelector("textarea")!;
		textarea.value = "A draft";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		const date = document.querySelector<HTMLInputElement>('input[type="date"]')!;
		date.value = "2026-09-26";
		date.dispatchEvent(new Event("change", { bubbles: true }));
		await tick();
		chooseFile("other.md", pickFileForNewTask);
		await tick();
		expect(textarea.value).toBe("A draft");
		expect(date.value).toBe("2026-09-26");
		(document.querySelector(".tlk-editor-actions button") as HTMLButtonElement).click();
		await tick();
		expect(createTask).toHaveBeenCalledWith({ path: "other.md" }, "A draft", "this-week", ["home"], expect.objectContaining({ due: "2026-09-26" }));
		await vi.waitFor(() => expect(document.querySelector(".tlk-mobile-editor-root")).toBeNull());
	});
	it("ignores old picker callbacks after a new session starts", async () => {
		const { session, pickFileForNewTask } = context();
		await tick();
		(document.querySelector(".tlk-editor-file") as HTMLButtonElement).click();
		const oldCallback = pickFileForNewTask.mock.lastCall?.[2] as (file: TFile) => void;
		session.update(current => captureMobileCreation({ ...current!, file: { path: "new-session.md" } as TFile }));
		await tick();
		oldCallback({ path: "stale.md" } as TFile);
		await tick();
		expect(document.querySelector(".tlk-editor-file")?.textContent).toBe("new-session.md");
	});
	it("cancels without writing", async () => {
		const { createTask } = context();
		await tick();
		(document.querySelector(".tlk-editor-heading button") as HTMLButtonElement).click();
		await tick();
		expect(createTask).not.toHaveBeenCalled();
		expect(document.querySelector(".tlk-mobile-editor-root")).toBeNull();
	});
});
