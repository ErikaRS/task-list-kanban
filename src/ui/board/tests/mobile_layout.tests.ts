import { describe, expect, it } from "vitest";
import type { BoardMatrix } from "../board_matrix";
import {
	deriveMobileHierarchyMode,
	formatMobileTaskCount,
	getMobileCellTaskCount,
	getPrimaryBucketTasks,
	getSecondaryBucketTasks,
	hasVisibleMobileGroupHeaders,
	shouldUseMobileBoardLayout,
} from "../mobile_layout";

const task = (id: string) => ({ id }) as any;

function matrix(options: { defaultGroup?: boolean } = {}): BoardMatrix {
	const defaultGroup = options.defaultGroup ?? false;
	return {
		// This is deliberately BTT order. Mobile must not reverse it again.
		primaryAxis: [
			{ id: "done", label: "Done", kind: "column", collapsed: false },
			{ id: "todo" as any, label: "Todo", kind: "column", collapsed: false },
		],
		secondaryAxis: [
			{ id: "project-a", label: "Project A", kind: "group", collapsed: false, meta: { isDefault: defaultGroup } },
			{ id: "project-b", label: "Project B", kind: "group", collapsed: false },
		],
		cells: {
			done: {
				"project-a": { primaryId: "done", secondaryId: "project-a", tasks: [task("done-a")], isEmpty: false },
				"project-b": { primaryId: "done", secondaryId: "project-b", tasks: [], isEmpty: true },
			},
			todo: {
				"project-a": { primaryId: "todo" as any, secondaryId: "project-a", tasks: [task("todo-a"), task("todo-a-2")], isEmpty: false },
				"project-b": { primaryId: "todo" as any, secondaryId: "project-b", tasks: [task("todo-b")], isEmpty: false },
			},
		},
	};
}

describe("mobile board hierarchy", () => {
	it("selects the mobile renderer only for mobile devices", () => {
		expect(shouldUseMobileBoardLayout(true)).toBe(true);
		expect(shouldUseMobileBoardLayout(false)).toBe(false);
	});

	it("uses group dominance only for vertical flow with a real grouping", () => {
		const grouped = matrix();
		expect(deriveMobileHierarchyMode(grouped, false)).toBe("column-dominant");
		expect(deriveMobileHierarchyMode(grouped, true)).toBe("group-dominant");
	});

	it("hides the default ungrouped bucket even in vertical flow", () => {
		const ungrouped = matrix({ defaultGroup: true });
		ungrouped.secondaryAxis.splice(1);
		delete ungrouped.cells.done!["project-b"];
		delete ungrouped.cells.todo!["project-b"];

		expect(hasVisibleMobileGroupHeaders(ungrouped)).toBe(false);
		expect(deriveMobileHierarchyMode(ungrouped, true)).toBe("column-dominant");
	});

	it("keeps a single explicit grouping bucket visible", () => {
		const grouped = matrix();
		grouped.secondaryAxis.splice(1);
		delete grouped.cells.done!["project-b"];
		delete grouped.cells.todo!["project-b"];

		expect(hasVisibleMobileGroupHeaders(grouped)).toBe(true);
		expect(deriveMobileHierarchyMode(grouped, true)).toBe("group-dominant");
	});

	it("preserves the matrix-provided primary order for BTT nested columns", () => {
		const grouped = matrix();
		expect(grouped.primaryAxis.map((bucket) => bucket.id)).toEqual(["done", "todo"]);
		expect(deriveMobileHierarchyMode(grouped, true)).toBe("group-dominant");
	});

	it("derives outer and cell counts from exact visible matrix buckets", () => {
		const grouped = matrix();
		expect(getPrimaryBucketTasks(grouped, "done")).toHaveLength(1);
		expect(getPrimaryBucketTasks(grouped, "todo" as any)).toHaveLength(3);
		expect(getSecondaryBucketTasks(grouped, "project-a")).toHaveLength(3);
		expect(getSecondaryBucketTasks(grouped, "project-b")).toHaveLength(1);
		expect(getMobileCellTaskCount(grouped, "done", "project-a")).toBe(1);
		expect(getMobileCellTaskCount(grouped, "todo" as any, "project-a")).toBe(2);
		expect(getMobileCellTaskCount(grouped, "done", "project-b")).toBe(0);
		expect(formatMobileTaskCount(1)).toBe("1 task");
		expect(formatMobileTaskCount(3)).toBe("3 tasks");
	});
});
