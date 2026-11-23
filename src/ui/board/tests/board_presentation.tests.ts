import { describe, expect, it } from "vitest";
import {
	boardTaskCountLabel,
	presentBoard,
	resolveBoardFilter,
} from "../board_presentation";
import { defaultSettings, VisibilityOption, type SettingValues } from "../../settings/settings_store";
import { createNameModeColumns, parseTask } from "../../tasks/tests/task_test_helpers";
import type { Task } from "../../tasks/task";

const today = new Date(Date.UTC(2026, 10, 23));
const columns = createNameModeColumns(["Doing"]);

function task(line: string, rowIndex: number): Task {
	return parseTask(line, { columns, rowIndex, path: "tasks.md" });
}

function settings(overrides: Partial<SettingValues> = {}): SettingValues {
	return { ...defaultSettings, columns, ...overrides };
}

function primaryIds(tasks: Task[], overrides: Partial<SettingValues>, queryText = "") {
	return presentBoard({
		tasks,
		settings: settings(overrides),
		filter: resolveBoardFilter(queryText, []),
		today,
	}).matrix.primaryAxis.map((bucket) => bucket.id);
}

describe("presentBoard", () => {
	const doing = task("- [ ] Write #doing #urgent", 0);
	const loose = task("- [ ] Loose idea", 1);
	const shipped = task("- [x] Shipped #doing", 2);
	const all = [doing, loose, shipped];

	it("shows nothing for a query that fails to parse", () => {
		const filter = resolveBoardFilter("(foo OR", []);
		expect(filter.error).toBeTruthy();
		expect(filter.isFiltered).toBe(true);

		const presentation = presentBoard({ tasks: all, settings: settings(), filter, today });
		expect(presentation.filteredTasks).toEqual([]);
	});

	it("decides auto column visibility from the filtered tasks", () => {
		const auto = { uncategorizedVisibility: VisibilityOption.Auto, doneVisibility: VisibilityOption.Auto };

		expect(primaryIds(all, auto)).toEqual(["uncategorised", "doing", "done"]);
		// The filter hides the only uncategorized and done cards, so their
		// auto-visible columns go with them.
		expect(primaryIds(all, auto, "#urgent")).toEqual(["doing"]);
	});

	it("uses the saved collapsed columns unless the caller supplies its own", () => {
		const collapsed = settings({ collapsedColumns: ["doing"] });
		const filter = resolveBoardFilter("", []);
		const collapsedIds = (collapsedColumns?: string[]) =>
			presentBoard({ tasks: all, settings: collapsed, filter, collapsedColumns, today })
				.matrix.primaryAxis.filter((bucket) => bucket.collapsed)
				.map((bucket) => bucket.id);

		expect(collapsedIds()).toEqual(["doing"]);
		expect(collapsedIds(["done"])).toEqual(["done"]);
	});
});

describe("boardTaskCountLabel", () => {
	const open = task("- [ ] Open #doing", 0);
	const done = task("- [x] Done", 1);

	it("counts only open tasks against the unfiltered total", () => {
		expect(boardTaskCountLabel([open, done], [open, done], false, false)).toBe("Total: 1 tasks");
		expect(boardTaskCountLabel([open, done], [], true, false)).toBe("0 of 1 tasks");
	});

	it("marks the count as active-only when the archive column shows", () => {
		expect(boardTaskCountLabel([open], [open], false, true)).toBe("Total: 1 tasks (active)");
	});
});
