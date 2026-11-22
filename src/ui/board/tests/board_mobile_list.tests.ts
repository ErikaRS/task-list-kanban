// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import type { App } from "obsidian";
import type { TaskActions } from "../../tasks/actions";
import type { ColumnTag } from "../../columns/columns";
import type { BoardMatrix } from "../board_matrix";
import { MOBILE_CREATION } from "../mobile_creation";
import BoardMobileList from "../board_mobile_list.svelte";

vi.mock("obsidian", () => {
	class Stub {}
	return { setIcon: vi.fn(), Platform: { isMobile: false }, Modal: Stub, Menu: Stub, Notice: Stub, MarkdownRenderer: Stub, Component: Stub, TFile: Stub, setTooltip: vi.fn() };
});

let component: BoardMobileList | undefined;
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
	component = new BoardMobileList({
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
