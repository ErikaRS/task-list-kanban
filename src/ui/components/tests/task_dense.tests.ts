// @vitest-environment happy-dom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { App } from "obsidian";
import type { TaskActions } from "../../tasks/actions";
import TaskComponent from "../task.svelte";
import { parseTask } from "../../tasks/tests/task_test_helpers";
import { TasksPluginSchema } from "../../../parsing/properties/tasks_schema";
import { PropertySchemaOption } from "../../../parsing/properties/property_schema";
import { PropertyDisplayMode } from "../../settings/settings_store";

vi.mock("obsidian", () => {
	class Component { load() {} unload() {} }
	class Menu {}
	return {
		Component, Menu, Modal: Menu, setIcon: vi.fn(), Platform: { isMobile: false },
		Keymap: { isModEvent: () => false },
		MarkdownRenderer: { render: async () => {} },
	};
});

beforeAll(() => {
	// Obsidian's DOM helper, used when re-rendering the card's markdown.
	(HTMLElement.prototype as unknown as { empty(): void }).empty = function (this: HTMLElement) {
		this.replaceChildren();
	};
});

let component: TaskComponent | undefined;
afterEach(() => { component?.$destroy(); component = undefined; document.body.innerHTML = ""; });

function mount(dense: boolean, line = "- [ ] Call the bank") {
	const host = document.createElement("div");
	document.body.append(host);
	const viewFile = vi.fn();
	component = new TaskComponent({ target: host, props: {
		app: {} as App,
		task: parseTask(line, { propertySchema: new TasksPluginSchema(), path: "notes/money.md" }),
		taskActions: { viewFile } as unknown as TaskActions,
		columnTagTableStore: writable({}),
		showFilepath: true,
		consolidateTags: false,
		propertySchemaOption: PropertySchemaOption.TasksPlugin,
		propertyDisplay: PropertyDisplayMode.Pretty,
		displayColumn: "uncategorised",
		displaySecondaryId: "__default__",
		dense,
	} });
	return { host, viewFile };
}

// SPEC 0055: dense list cards move "+ Date" and go to file onto the task line.
it("puts date and file actions on the task line and opens the date editor from there", async () => {
	const { host, viewFile } = mount(true);
	const line = host.querySelector(".task-line-row")!;
	const goToFile = line.querySelector<HTMLButtonElement>('[aria-label="Go to file notes/money.md"]');
	expect(goToFile).not.toBeNull();
	expect(host.querySelector(".task-footer")).toBeNull();
	expect(host.querySelector(".task-date-properties")?.classList.contains("dense-empty")).toBe(true);

	goToFile!.click();
	expect(viewFile).toHaveBeenCalledWith(expect.any(String), expect.any(MouseEvent));

	line.querySelector<HTMLButtonElement>('[aria-label="Edit task dates"]')!.click();
	await tick();
	expect(host.querySelector(".task-date-fields.edit-mode")).not.toBeNull();
	expect(host.querySelector(".task-date-properties")?.classList.contains("dense-empty")).toBe(false);
	expect(host.querySelector(".task")?.classList.contains("dense-toolbar-visible")).toBe(true);
});

it("keeps the Table card's footer and inline + Date", () => {
	const { host } = mount(false);
	expect(host.querySelector(".task-footer .go-to-file-button")).not.toBeNull();
	expect(host.querySelector(".add-date-button")).not.toBeNull();
	expect(host.querySelector(".task-line-row .go-to-file-action")).toBeNull();
});
