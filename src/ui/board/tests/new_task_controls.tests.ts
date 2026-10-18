// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { TFile } from "obsidian";
import type { TaskActions } from "../../tasks/actions";
import type { ColumnTag, ColumnTagTable } from "../../columns/columns";
import NewTaskControls from "../NewTaskControls.svelte";
import { PropertySchemaOption } from "../../../parsing/properties";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
let component: NewTaskControls;
afterEach(() => { component?.$destroy(); document.body.innerHTML = ""; });

it("retains desktop text and dates after a failed write and prevents duplicate saves", async () => {
	let rejectWrite!: (error: Error) => void;
	const createTask = vi.fn()
		.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectWrite = reject; }))
		.mockResolvedValue(undefined);
	const file = { path: "tasks.md" } as TFile;
	const host = document.createElement("div");
	document.body.append(host);
	component = new NewTaskControls({ target: host, props: {
		taskActions: { createTask } as unknown as TaskActions,
		column: "doing" as ColumnTag, columnTitle: "Doing",
		columnTagTableStore: writable({ doing: "Doing" } as ColumnTagTable),
		fileGroupTargetFile: file, propertySchemaOption: PropertySchemaOption.TasksPlugin,
	} });
	(host.querySelector('[aria-label="Add new task to Doing"]') as HTMLElement).click();
	await tick();
	const textarea = host.querySelector("textarea")!;
	textarea.value = "Keep my draft";
	const date = host.querySelector<HTMLInputElement>('input[type="date"]')!;
	date.value = "2026-10-20";
	date.dispatchEvent(new Event("change", { bubbles: true }));
	await tick();
	const input = host.querySelector(".new-task-input")!;
	input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	expect(createTask).toHaveBeenCalledTimes(1);
	rejectWrite(new Error("Disk unavailable"));
	await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe("Disk unavailable"));
	expect(textarea.value).toBe("Keep my draft");
	expect(date.value).toBe("2026-10-20");
	input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
	await vi.waitFor(() => expect(host.querySelector("textarea")).toBeNull());
	expect(createTask).toHaveBeenCalledTimes(2);
	expect(createTask.mock.calls[1]).toEqual([file, "Keep my draft", "doing", [], expect.objectContaining({ due: "2026-10-20" }), null]);
});
