// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { writable } from "svelte/store";
import type { App } from "obsidian";
import type { TaskActions } from "../../tasks/actions";
import type { ColumnTag } from "../../columns/columns";
import type { BoardMatrix } from "../board_matrix";
import { MOBILE_CREATION } from "../mobile_creation";
import BoardList from "../board_list.svelte";

vi.mock("obsidian", () => {
	class Stub {}
	return { setIcon: vi.fn(), Platform: { isMobile: false }, Modal: Stub, Menu: Stub, Notice: Stub, MarkdownRenderer: Stub, Component: Stub, TFile: Stub, setTooltip: vi.fn() };
});

let component: BoardList | undefined;
afterEach(() => { component?.$destroy(); component = undefined; document.body.innerHTML = ""; });

const doing = "doing" as ColumnTag;
const matrix: BoardMatrix = {
	primaryAxis: [{ id: doing, label: "Doing", kind: "column", collapsed: false }],
	secondaryAxis: [{ id: "__default__", label: "", kind: "group", collapsed: false, meta: { isDefault: true } }],
	cells: { doing: { __default__: { primaryId: doing, secondaryId: "__default__", tasks: [], isEmpty: true } } },
} as BoardMatrix;

function mount(mobileCreation: boolean) {
	const host = document.createElement("div");
	document.body.append(host);
	const empty = writable({});
	component = new BoardList({
		target: host,
		context: new Map([[MOBILE_CREATION, writable(null)]]),
		props: {
			app: {} as App,
			matrix,
			taskActions: { getTargetDestination: () => null } as unknown as TaskActions,
			columnTagTableStore: writable({ doing: "Doing" }),
			columnColourTableStore: empty,
			columnMatchTagTableStore: empty,
			columnSubtitleTableStore: empty,
			showFilepath: false,
			consolidateTags: false,
			onToggleCollapse: vi.fn(),
			onToggleGroupCollapse: vi.fn(),
			mobileCreation,
		},
	});
	return host;
}

// Desktop List (SPEC 0055) reuses the mobile list renderer but must keep the
// desktop inline composer rather than the floating action and sheet.
it("uses the inline add control on desktop and the floating action on mobile", () => {
	const desktop = mount(false);
	expect(desktop.querySelector('[aria-label="Add new task to Doing"]')).not.toBeNull();
	expect(desktop.querySelector(".mobile-create-task")).toBeNull();
	expect(desktop.querySelector(".has-mobile-create-task")).toBeNull();
	component?.$destroy();
	document.body.innerHTML = "";

	const mobile = mount(true);
	expect(mobile.querySelector(".mobile-create-task")).not.toBeNull();
	expect(mobile.querySelector('[aria-label="Add new task to Doing"]')).toBeNull();
});

// SPEC 0055: an inner header folds one cell; the same group stays open in
// other columns, and the board-wide group fold (Table's) is ignored in List.
it("folds a single cell from its inner header", async () => {
	const todo = "todo" as ColumnTag;
	const cell = (primaryId: ColumnTag, secondaryId: string) =>
		({ primaryId, secondaryId, tasks: [], isEmpty: true });
	const grouped = {
		primaryAxis: [
			{ id: doing, label: "Doing", kind: "column", collapsed: false },
			{ id: todo, label: "Todo", kind: "column", collapsed: false },
		],
		secondaryAxis: [{ id: "home", label: "Home", kind: "group", collapsed: true, meta: { source: { kind: "text", literals: [] } } }],
		cells: { doing: { home: cell(doing, "home") }, todo: { home: cell(todo, "home") } },
	} as unknown as BoardMatrix;
	const host = mount(false);
	const onToggleCellCollapse = vi.fn();
	component!.$set({ matrix: grouped, collapsedCells: [JSON.stringify(["home", todo])], onToggleCellCollapse, columnTagTableStore: writable({ doing: "Doing", todo: "Todo" }) });
	await tick();

	expect(host.querySelector('[aria-label="Add new task to Doing"]')).not.toBeNull();
	expect(host.querySelector('[aria-label="Add new task to Todo"]')).toBeNull();

	host.querySelector<HTMLButtonElement>('[aria-label="Expand Home in Todo"]')!.click();
	expect(onToggleCellCollapse).toHaveBeenCalledWith(todo, "home");
	host.querySelector<HTMLButtonElement>('[aria-label="Collapse Home in Doing"]')!.click();
	expect(onToggleCellCollapse).toHaveBeenLastCalledWith(doing, "home");
});
