// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import ViewEditor from "../view_editor.svelte";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));

let component: ViewEditor | undefined;
afterEach(() => { component?.$destroy(); component = undefined; document.body.innerHTML = ""; });

function mount(props: { layout: "table" | "list"; isMobile: boolean; onSetLayout?: (layout: "table" | "list") => void }) {
	const host = document.createElement("div");
	document.body.append(host);
	const noop = vi.fn();
	component = new ViewEditor({ target: host, props: {
		sortSelectValue: "", onSortChange: noop, onToggleSortDirection: noop,
		groupSelectValue: "", onGroupChange: noop, onToggleGroupDirection: noop,
		onSetCollapsePastDates: noop, onSetTagGroupInputMode: noop,
		onUpdateTagGroupPrefix: noop, onUpdateTagGroupIncludeTags: noop,
		onSetFlowDirection: noop, onSetColumnWidth: noop,
		onSaveCurrentView: noop, onApplySavedView: noop, onDeleteSavedView: noop, onToggleSavedViewList: noop,
		...props,
	} });
	return {
		layoutGroup: () => host.querySelector('[role="group"][aria-label="Board layout"]'),
		cardWidth: () => host.querySelector('input[aria-label="Card width"]'),
		button: (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-label="Board layout"] button'))
			.find((button) => button.textContent?.trim() === label)!,
	};
}

// SPEC 0055: Card width only applies to Table, and mobile has no layout choice.
it("offers Layout on desktop, hides Card width for List, and switches layouts", async () => {
	const onSetLayout = vi.fn();
	const view = mount({ layout: "table", isMobile: false, onSetLayout });
	expect(view.layoutGroup()).not.toBeNull();
	expect(view.cardWidth()).not.toBeNull();
	expect(view.button("Table").getAttribute("aria-pressed")).toBe("true");

	view.button("List").click();
	expect(onSetLayout).toHaveBeenCalledWith("list");

	component!.$set({ layout: "list" });
	await tick();
	expect(view.cardWidth()).toBeNull();
	expect(view.button("List").getAttribute("aria-pressed")).toBe("true");
});

it("shows neither Layout nor Card width on mobile, whatever the stored layout", () => {
	const view = mount({ layout: "table", isMobile: true });
	expect(view.layoutGroup()).toBeNull();
	expect(view.cardWidth()).toBeNull();
});
