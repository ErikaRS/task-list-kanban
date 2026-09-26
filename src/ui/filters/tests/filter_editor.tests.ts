// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import FilterEditor from "../filter_editor.svelte";
import { parseFilterQuery } from "../filter_query";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

let component: FilterEditor | undefined;
afterEach(() => {
	component?.$destroy();
	component = undefined;
	document.body.innerHTML = "";
});

async function mount(draftText: string) {
	const onChange = vi.fn();
	const onSearch = vi.fn();
	component = new FilterEditor({
		target: document.body,
		props: {
			query: parseFilterQuery(draftText, ["due"]),
			draftText,
			dateKeys: [{ key: "due", label: "Due" }],
			tagSuggestionItems: ["this-week", "travel"],
			fileSuggestionItems: ["projects/notes.md"],
			onChange,
			onSearch,
			onInvalidSearch: vi.fn(),
			onClear: vi.fn(),
			onApplySavedFilter: vi.fn(),
			onDeleteSavedFilter: vi.fn(),
			onSaveFilter: vi.fn(),
			onToggleSavedList: vi.fn(),
		},
	});
	await tick();
	return { onChange, onSearch };
}

function click(selector: string) {
	const node = document.querySelector<HTMLButtonElement>(selector)!;
	expect(node).toBeTruthy();
	node.click();
}

function input(selector: string, value: string) {
	const node = document.querySelector<HTMLInputElement>(selector)!;
	expect(node).toBeTruthy();
	node.value = value;
	node.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("clause editor", () => {
	it("shows mixed OR atoms in one row and a negated atom in another", async () => {
		await mount("(tag:reading OR file:essays) -Keynes");
		const clauses = document.querySelectorAll(".clause-row");
		expect(clauses).toHaveLength(2);
		expect(clauses[0]!.querySelectorAll(".atom-row")).toHaveLength(2);
		expect(clauses[0]!.textContent).toContain("OR");
		expect(clauses[1]!.querySelector<HTMLButtonElement>(".exclude-toggle")?.getAttribute("aria-checked")).toBe("true");
	});

	it("retains comma OR when editing an existing tag or file clause", async () => {
		const { onChange } = await mount("tag:home,errand file:projects,notes");
		input('input[aria-label="Tag"]', "work");
		await tick();
		expect(onChange).toHaveBeenLastCalledWith("tag:work,errand file:projects,notes");
		input('input[aria-label="File path"]', "archive");
		expect(onChange).toHaveBeenLastCalledWith("tag:work,errand file:archive,notes");
	});

	it("does not offer a second standalone positive file clause as AND", async () => {
		await mount("file:projects");
		click(".section-rows > .add-row-btn");
		await tick();
		const clauses = document.querySelectorAll(".clause-row");
		expect(clauses).toHaveLength(2);
		expect(clauses[1]!.querySelector<HTMLOptionElement>('option[value="file"]')?.disabled).toBe(true);
	});

	it("keeps a negative file atom from silently joining the positive file OR clause", async () => {
		await mount("file:projects -file:archive");
		const clauses = document.querySelectorAll(".clause-row");
		expect(clauses).toHaveLength(2);
		expect(clauses[1]!.querySelector<HTMLButtonElement>(".exclude-toggle")?.disabled).toBe(true);
	});

	it("keeps a group alternative from becoming a second standalone file choice", async () => {
		await mount("(file:essays OR tag:reading) file:projects");
		const first = document.querySelector(".clause-row")!;
		const removeReading = first.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove condition"]')[1]!;
		expect(removeReading.disabled).toBe(true);
	});

	it("keeps malformed bar drafts editable without showing an error", async () => {
		const { onSearch } = await mount("(foo OR )");
		expect(document.querySelectorAll(".clause-row")).toHaveLength(0);
		expect(document.querySelector<HTMLInputElement>('input[aria-label="Filter expression"]')?.value).toBe("(foo OR )");
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(document.querySelector<HTMLButtonElement>(".save-filter-btn")?.disabled).toBe(true);
		click(".editor-search-btn");
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it("keeps dates positive-only", async () => {
		await mount("due:<$TODAY");
		expect(document.querySelector(".clause-row .exclude-toggle")).toBeNull();
		expect(document.querySelector<HTMLSelectElement>('select[aria-label="Date comparison"]')?.value).toBe("before");
	});

	it("uses the styled suggestion list and accepts a tag without searching", async () => {
		const { onChange, onSearch } = await mount("tag:t");
		const tag = document.querySelector<HTMLInputElement>('input[aria-label="Tag"]')!;
		tag.focus();
		await tick();
		expect(document.querySelector("datalist")).toBeNull();
		expect(Array.from(document.querySelectorAll(".suggestion-label"), (node) => node.textContent)).toEqual(["this-week", "travel"]);
		tag.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		tag.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		await tick();
		expect(onChange).toHaveBeenLastCalledWith("tag:this-week");
		expect(onSearch).not.toHaveBeenCalled();
	});

	it("labels the boolean controls without extra words", async () => {
		await mount("tag:travel");
		expect(document.querySelector(".exclude-toggle")?.textContent).toBe("NOT");
		expect(document.querySelector(".exclude-toggle")?.getAttribute("role")).toBe("switch");
		expect(document.querySelector(".exclude-toggle")?.getAttribute("aria-checked")).toBe("false");
		expect(document.querySelector('[aria-label="Add OR"]')?.textContent).toBe("+ OR");
		expect(document.querySelector('[aria-label="Add AND"]')?.textContent).toBe("+ AND");
	});

	it("uses a chevron button style for the type selector and switches NOT on", async () => {
		const { onChange } = await mount("tag:travel");
		expect(document.querySelector(".atom-kind-control select.atom-kind")).toBeTruthy();
		expect(document.querySelector(".atom-kind-chevron")).toBeTruthy();
		click(".exclude-toggle");
		await tick();
		expect(document.querySelector(".exclude-toggle")?.getAttribute("aria-checked")).toBe("true");
		expect(onChange).toHaveBeenLastCalledWith("-tag:travel");
	});
});
