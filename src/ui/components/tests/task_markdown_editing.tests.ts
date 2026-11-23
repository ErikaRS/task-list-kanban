// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import moment from "moment";
import { tick } from "svelte";
import { writable } from "svelte/store";
import { MarkdownRenderer } from "obsidian";
import TaskComponent from "../task.svelte";
import TaskSourceRow from "../TaskSourceRow.svelte";
import MobileTaskEditor from "../MobileTaskEditor.svelte";
import { createTaskActions } from "../../tasks/actions";
import { updateMapsFromFile, type Metadata } from "../../tasks/tasks";
import type { Task } from "../../tasks/task";
import { TasksPluginSchema, PropertySchemaOption } from "../../../parsing/properties";

const platform = vi.hoisted(() => ({ isMobile: false }));
vi.mock("obsidian", () => ({
	moment, Platform: platform, Keymap: { isModEvent: () => false }, setIcon: vi.fn(),
	Component: class { unload() {} }, Modal: class {}, Menu: class {}, Notice: class {}, TFile: class {}, MarkdownView: class {},
	MarkdownRenderer: { render: vi.fn(async (_app, _source, container: HTMLElement) => { container.textContent = "Preview"; }) },
}));

let component: { $destroy(): void } | undefined;
beforeEach(() => {
	Object.defineProperty(HTMLElement.prototype, "empty", { configurable: true, value() { this.replaceChildren(); } });
});
afterEach(() => { component?.$destroy(); component = undefined; platform.isMobile = false; document.body.innerHTML = ""; vi.restoreAllMocks(); });

async function fixture(initial: string, nested = true) {
	let contents = initial;
	const file = { path: "tasks.md" };
	const tasks = new Map<string, Task>();
	const metadata = new Map<string, Metadata>();
	const vault = { read: vi.fn(async () => contents), modify: vi.fn(async (_file, next: string) => { contents = next; }) };
	async function reload() {
		tasks.clear(); metadata.clear();
		await updateMapsFromFile({ fileHandle: file as never, vault: vault as never, tasksByTaskId: tasks, metadataByTaskId: metadata,
			taskIdsByFileHandle: new Map(), columnDefinitionsStore: writable([]), columnPlacementTagTableStore: writable({}),
			consolidateTags: false, doneStatusMarkers: "xX", cancelledStatusMarkers: "-", ignoredStatusMarkers: "",
			excludedTaskTags: new Set(), propertySchema: new TasksPluginSchema(), treatNestedTasksAsSubtasks: nested });
		return [...tasks.values()][0]!;
	}
	const task = await reload();
	const actions = createTaskActions({ tasksByTaskId: tasks, metadataByTaskId: metadata, vault: vault as never, workspace: {} as never,
		getFilenameFilter: () => null, getExcludeFilter: () => null, getBoardFolderPath: () => null,
		getPlacementTagsForColumn: () => [], getColumnDefinitions: () => [], getDefaultTaskFile: () => null,
		getLastUsedTaskFile: () => null, setLastUsedTaskFile() {}, getPropertySchemaOption: () => PropertySchemaOption.TasksPlugin,
		getStatusMarkerOrder: () => "", getCurrentDate: () => new Date(2026, 10, 22, 12), getManualOrder: () => ({}), setManualOrder() {} });
	const host = document.createElement("div"); document.body.append(host);
	return { actions, task, reload, host, vault, nested, contents: () => contents, external: (text: string) => { contents = text; } };
}

async function mountTask(h: Awaited<ReturnType<typeof fixture>>, task = h.task) {
	component?.$destroy();
	h.host.replaceChildren();
	component = new TaskComponent({ target: h.host, props: { task, app: {} as never, taskActions: h.actions,
		columnTagTableStore: writable({}), showFilepath: false, consolidateTags: false,
		displayColumn: "uncategorised", displaySecondaryId: "", treatNestedTasksAsSubtasks: h.nested } });
	await tick();
}
async function openDesktop(h: Awaited<ReturnType<typeof fixture>>, task = h.task) {
	await mountTask(h, task);
	h.host.querySelector(".content-preview")!.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", bubbles: true }));
	await tick();
	return h.host.querySelector("textarea")!;
}
function enter(textarea: HTMLTextAreaElement, value: string) {
	textarea.value = value; textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

it.each([false, true])("keeps checkbox children visible and usable during parent edits with nested mode %s", async (nested) => {
	const h = await fixture("- [ ] Parent\n  - Note\n  - [ ] Child", nested);
	const textarea = await openDesktop(h);
	expect(textarea.value).toBe("Parent");
	expect(h.host.querySelectorAll(".source-row-preview")).toHaveLength(2);
	let toggled!: Promise<void>;
	const toggle = h.actions.toggleSourceTaskStatus;
	vi.spyOn(h.actions, "toggleSourceTaskStatus").mockImplementation((...args) => toggled = toggle(...args));
	h.host.querySelector<HTMLButtonElement>('[aria-label="Advance subtask status"]')!.click();
	await toggled;
	enter(textarea, "Changed");
	let saved!: Promise<void>;
	const actual = h.actions.updateContent;
	vi.spyOn(h.actions, "updateContent").mockImplementation((...args) => saved = actual(...args));
	textarea.blur(); await saved; await tick();
	expect(h.contents()).toBe("- [ ] Changed\n  - Note\n  - [x] Child ✅ 2026-11-22");
});

it("keeps quoted Markdown checkboxes visible and inert without attaching task actions", async () => {
	const h = await fixture("- [ ] Parent\n\n  > - [ ] Quoted example");
	vi.mocked(MarkdownRenderer.render).mockImplementationOnce(async (_app, _source, container) => {
		container.innerHTML = '<blockquote><ul><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox"></li></ul></blockquote>';
	});
	component = new TaskSourceRow({ target: h.host, props: { app: {} as never, task: h.task, taskActions: h.actions, node: h.task.sourceChildren[0]! } });
	await tick();
	const checkbox = h.host.querySelector<HTMLInputElement>('input[type="checkbox"]');
	expect(checkbox).not.toBeNull();
	expect(checkbox?.disabled).toBe(true);
	expect(h.host.querySelector('[aria-label="Advance subtask status"]')).toBeNull();
});

it("saves and reopens a desktop Markdown body through the actual task and action components", async () => {
	const h = await fixture("- [/] Title<br />note #project ^id\n- [ ] Sibling");
	const textarea = await openDesktop(h);
	expect(textarea.value).toBe("Title #project ^id\nnote");
	expect(h.vault.modify).not.toHaveBeenCalled();
	enter(textarea, textarea.value + "  \nnext\n\nParagraph\n\n```md\n- [ ] example\n```");
	let saved!: Promise<void>;
	const actual = h.actions.updateContent;
	vi.spyOn(h.actions, "updateContent").mockImplementation((...args) => saved = actual(...args));
	textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
	await saved; await tick();
	expect(h.contents()).toBe("- [/] Title #project ^id\n  note  \n  next\n\n  Paragraph\n\n  ```md\n  - [ ] example\n  ```\n- [ ] Sibling");
	const reloaded = await h.reload();
	const reopened = await openDesktop(h, reloaded);
	expect(reopened.value).toBe("Title #project ^id\nnote  \nnext");
	expect(reloaded.sourceChildren.map(node => node.rawLine.trim())).toEqual(["Paragraph", "```md"]);
});

it("keeps a failed desktop draft, prevents duplicate saves, and rejects a stale body after a refresh", async () => {
	const h = await fixture("- [ ] Title\n  note");
	const textarea = await openDesktop(h);
	enter(textarea, "Title\nmy draft");
	let reject!: (error: Error) => void;
	let reachedWrite!: () => void;
	const writing = new Promise<void>(resolve => { reachedWrite = resolve; });
	h.vault.modify.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; reachedWrite(); }));
	let saved!: Promise<void>;
	const actual = h.actions.updateContent;
	const save = vi.spyOn(h.actions, "updateContent").mockImplementation((...args) => saved = actual(...args));
	textarea.dispatchEvent(new FocusEvent("blur")); textarea.dispatchEvent(new FocusEvent("blur"));
	expect(save).toHaveBeenCalledOnce();
	await writing;
	reject(new Error("Disk full")); await expect(saved).rejects.toThrow("Disk full"); await tick();
	expect(textarea.value).toBe("Title\nmy draft");
	expect(h.host.querySelector('[role="alert"]')?.textContent).toBe("Disk full");
	h.external("- [ ] Title\n  external edit"); await h.reload();
	textarea.dispatchEvent(new FocusEvent("blur"));
	await expect(saved).rejects.toThrow("Task changed"); await tick();
	expect(textarea.value).toBe("Title\nmy draft");
	expect(h.contents()).toBe("- [ ] Title\n  external edit");
});

it("edits a nested marker without exposing or overwriting its sibling and descendant items", async () => {
	const h = await fixture("- [ ] Title\n  - Section\n    - Note<br />second\n      - [ ] Grandchild\n    - [ ] Child");
	await mountTask(h);
	h.host.querySelectorAll(".source-row-preview")[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await tick();
	const textarea = h.host.querySelector("textarea")!;
	expect(textarea.value).toBe("- Note\n  second");
	expect(h.host.querySelector(".content-preview")).not.toBeNull();
	expect(h.host.querySelectorAll('[aria-label="Advance subtask status"]')).toHaveLength(2);
	enter(textarea, "- [ ] Note\n  second");
	let saved!: Promise<void>;
	const actual = h.actions.updateSourceBlockRow;
	vi.spyOn(h.actions, "updateSourceBlockRow").mockImplementation((...args) => saved = actual(...args));
	textarea.blur(); await saved; await tick();
	expect(h.contents()).toBe("- [ ] Title\n  - Section\n    - [ ] Note\n      second\n      - [ ] Grandchild\n    - [ ] Child");
	const reloaded = await h.reload();
	await mountTask(h, reloaded);
	expect(h.host.querySelectorAll('[aria-label="Advance subtask status"]')).toHaveLength(3);
	h.host.querySelectorAll(".source-row-preview")[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
	await tick();
	const reopened = h.host.querySelector("textarea")!;
	expect(reopened.value).toBe("- [ ] Note\n  second");
	enter(reopened, "Note\nsecond");
	reopened.blur(); await saved; await tick();
	expect(h.contents()).toBe("- [ ] Title\n  - Section\n    Note\n    second\n      - [ ] Grandchild\n    - [ ] Child");
});

it("cancels a mobile item draft without migration, then saves an editable marker without changing its sibling", async () => {
	platform.isMobile = true;
	const initial = "- [ ] Title\n  - Note<br />second\n  - [ ] Child";
	const h = await fixture(initial, false);
	await mountTask(h);
	h.host.querySelector(".source-row-preview")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	await tick();
	expect(document.querySelectorAll("textarea")).toHaveLength(1);
	expect(document.querySelector("textarea")!.value).toBe("- Note\n  second");
	expect(h.host.querySelector('[aria-label="Advance subtask status"]')).not.toBeNull();
	Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Cancel")!.click();
	await tick();
	expect(document.querySelector("textarea")).toBeNull();
	expect(h.contents()).toBe(initial);
	expect(h.vault.modify).not.toHaveBeenCalled();
	h.host.querySelector(".source-row-preview")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	await tick();
	enter(document.querySelector("textarea")!, "- [ ] Note\n  second");
	let saved!: Promise<void>;
	const actual = h.actions.updateSourceBlockRow;
	vi.spyOn(h.actions, "updateSourceBlockRow").mockImplementation((...args) => saved = actual(...args));
	Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Save")!.click();
	await saved; await tick();
	expect(h.contents()).toBe("- [ ] Title\n  - [ ] Note\n    second\n  - [ ] Child");
	await mountTask(h, await h.reload());
	expect(h.host.querySelectorAll('[aria-label="Advance subtask status"]')).toHaveLength(2);
});

it("keeps subtask checkboxes independent of the text editor", async () => {
	const h = await fixture("- [ ] Title\n  - Section\n    - [ ] Child");
	const toggle = vi.spyOn(h.actions, "toggleSourceTaskStatus").mockResolvedValue(undefined);
	await mountTask(h);
	h.host.querySelector<HTMLButtonElement>('[aria-label="Advance subtask status"]')!.click();
	await tick();
	expect(toggle).toHaveBeenCalledExactlyOnceWith(h.task.id, 2);
	expect(h.host.querySelector("textarea")).toBeNull();
});

it("unwraps only the generated list wrapper and preserves link interaction in source rows", async () => {
	const h = await fixture("- [ ] Title\n  - Note");
	vi.mocked(MarkdownRenderer.render).mockImplementationOnce(async (_app, _source, container) => {
		container.innerHTML = '<ul style="padding-left:40px"><li style="padding-left:30px"><p>Note <a href="https://example.com/">link</a></p></li></ul>';
	});
	component = new TaskSourceRow({ target: h.host, props: { app: {} as never, task: h.task, taskActions: h.actions, node: h.task.sourceChildren[0]! } });
	await tick();
	const preview = h.host.querySelector(".source-row-preview")!;
	expect(preview.firstElementChild?.tagName).toBe("P");
	expect(preview.textContent).toBe("Note link");
	preview.querySelector("a")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	expect(h.host.querySelector("textarea")).toBeNull();
	preview.querySelector("p")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	await tick();
	expect(h.host.querySelector("textarea")!.value).toBe("- Note");
});

it("commits mobile text and date changes together in one write", async () => {
	const h = await fixture("- [ ] Title\n  note");
	component = new MobileTaskEditor({ target: h.host, props: { task: h.task, taskActions: h.actions, propertySchemaOption: PropertySchemaOption.TasksPlugin } });
	await tick();
	const textarea = document.querySelector("textarea")!;
	enter(textarea, "Changed  \nnew note");
	const due = document.querySelector<HTMLInputElement>('input[type="date"]')!;
	due.value = "2026-11-24"; due.dispatchEvent(new Event("change", { bubbles: true })); await tick();
	let saved!: Promise<void>;
	const actual = h.actions.updateContent;
	vi.spyOn(h.actions, "updateContent").mockImplementation((...args) => saved = actual(...args));
	Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Save")!.click();
	await saved; await tick();
	expect(h.contents()).toBe("- [ ] Changed 📅 2026-11-24  \n  new note");
	expect(h.vault.modify).toHaveBeenCalledOnce();
});

// SPEC 0057: embedded boards render source rows without task actions.
it("renders a source row read-only when it has no task actions", async () => {
	const h = await fixture("- [ ] Parent\n  - [x] Child");
	component = new TaskSourceRow({ target: h.host, props: { app: {} as never, task: h.task, node: h.task.sourceChildren[0]! } });
	await tick();
	expect(h.host.querySelector(".source-row-static-status")).not.toBeNull();
	expect(h.host.querySelector("button")).toBeNull();
	expect(h.host.querySelector(".source-row")?.getAttribute("draggable")).toBe("false");
	h.host.querySelector(".source-row-preview")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
	await tick();
	expect(h.host.querySelector("textarea")).toBeNull();
});
