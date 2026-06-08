import { describe, expect, it } from "vitest";
import {
	arrayMove,
	buildOrderEntries,
	collectPresentManualOrderKeys,
	computeDisplayOrder,
	computeDropPlan,
	computePinnedIds,
	ensureRowBlockLink,
	generateBlockLinkId,
	manualOrderKey,
	pruneEntries,
	removeEntry,
	taskKey,
	type OrderableTask,
} from "../manual_order";

/** Builds an OrderableTask. File order is implied by argument order in tests. */
function task(
	id: string,
	blockLink: string | undefined = undefined,
	path = "file.md",
	rowIndex = 0
): OrderableTask {
	return { id, blockLink, path, rowIndex };
}

const keyOf = (t: OrderableTask) => manualOrderKey(t.path, t.blockLink!);

describe("taskKey", () => {
	it("returns null for a task without a block link", () => {
		expect(taskKey(task("a"))).toBeNull();
	});

	it("combines path and block link", () => {
		expect(taskKey(task("a", "abc", "notes.md"))).toBe("notes.md::abc");
	});
});

describe("computeDisplayOrder", () => {
	it("returns file order when nothing is pinned", () => {
		const tasks = [task("a"), task("b"), task("c")];
		expect(computeDisplayOrder(tasks, undefined)).toEqual(tasks);
		expect(computeDisplayOrder(tasks, [])).toEqual(tasks);
	});

	it("places pinned tasks first in stored order, then the file-order tail", () => {
		const a = task("a", "la");
		const b = task("b", "lb");
		const c = task("c");
		const d = task("d", "ld");
		const tasks = [a, b, c, d];

		const result = computeDisplayOrder(tasks, [keyOf(d), keyOf(a)]);
		expect(result.map((t) => t.id)).toEqual(["d", "a", "b", "c"]);
	});

	it("keeps the unpinned tail in file order (prefix invariant)", () => {
		const a = task("a", "la");
		const b = task("b");
		const c = task("c");
		const tasks = [a, b, c];
		// Only `a` is pinned; b and c stay in file order behind it.
		expect(computeDisplayOrder(tasks, [keyOf(a)]).map((t) => t.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("skips stale entries with no matching task", () => {
		const a = task("a", "la");
		const tasks = [a];
		const result = computeDisplayOrder(tasks, ["file.md::gone", keyOf(a)]);
		expect(result.map((t) => t.id)).toEqual(["a"]);
	});

	it("a newly added task lands in the tail, never above a pin (PI3)", () => {
		const a = task("a", "la");
		const b = task("b", "lb");
		const fresh = task("z"); // newly added, unpinned, no block link
		const tasks = [a, fresh, b];
		const result = computeDisplayOrder(tasks, [keyOf(b), keyOf(a)]);
		expect(result.map((t) => t.id)).toEqual(["b", "a", "z"]);
	});
});

describe("computePinnedIds", () => {
	it("is empty when there are no entries", () => {
		expect(computePinnedIds([task("a", "la")], undefined).size).toBe(0);
	});

	it("treats a block link without a store entry as unpinned", () => {
		const a = task("a", "leftover");
		// Block link present, but not referenced by any entry → not pinned.
		expect(computePinnedIds([a], []).has("a")).toBe(false);
	});

	it("marks only tasks referenced by present entries", () => {
		const a = task("a", "la");
		const b = task("b", "lb");
		const pinned = computePinnedIds([a, b], [keyOf(a)]);
		expect(pinned.has("a")).toBe(true);
		expect(pinned.has("b")).toBe(false);
	});
});

describe("arrayMove", () => {
	it("moves an item forward", () => {
		expect(arrayMove(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
	});

	it("moves an item backward", () => {
		expect(arrayMove(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
	});

	it("clamps an out-of-range target to the end", () => {
		expect(arrayMove(["a", "b"], 0, 5)).toEqual(["b", "a"]);
	});
});

describe("computeDropPlan", () => {
	it("dropping at the top pins only the dropped task (P1)", () => {
		const tasks = [task("a"), task("b"), task("c")];
		const plan = computeDropPlan(tasks, "c", 0);
		expect(plan.prefixTasks.map((t) => t.id)).toEqual(["c"]);
		expect(plan.tasksNeedingBlockLink.map((t) => t.id)).toEqual(["c"]);
	});

	it("dropping at index n pins the dropped task plus everything above (P2)", () => {
		const tasks = [task("a"), task("b"), task("c"), task("d")];
		const plan = computeDropPlan(tasks, "d", 2);
		// d lands at index 2: prefix is [a, b, d].
		expect(plan.prefixTasks.map((t) => t.id)).toEqual(["a", "b", "d"]);
		expect(plan.tasksNeedingBlockLink.map((t) => t.id)).toEqual(["a", "b", "d"]);
	});

	it("reuses existing block links in the prefix (P4/P5)", () => {
		const tasks = [task("a", "la"), task("b"), task("c")];
		const plan = computeDropPlan(tasks, "c", 2);
		expect(plan.prefixTasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
		// `a` already has a block link, so it is not rewritten.
		expect(plan.tasksNeedingBlockLink.map((t) => t.id)).toEqual(["b", "c"]);
	});

	it("returns an empty plan when the dragged task is absent", () => {
		const plan = computeDropPlan([task("a")], "missing", 0);
		expect(plan.prefixTasks).toEqual([]);
	});
});

describe("buildOrderEntries", () => {
	it("builds keys from resolved block links", () => {
		const a = task("a", "la");
		const b = task("b");
		const entries = buildOrderEntries([a, b], (t) =>
			t.blockLink ? t.blockLink : "assigned"
		);
		expect(entries).toEqual(["file.md::la", "file.md::assigned"]);
	});
});

describe("pruneEntries", () => {
	it("drops entries with no present task", () => {
		const a = task("a", "la");
		const entries = [manualOrderKey("file.md", "la"), manualOrderKey("file.md", "gone")];
		expect(pruneEntries(entries, [a])).toEqual([manualOrderKey("file.md", "la")]);
	});

	it("returns the same reference when nothing is stale", () => {
		const a = task("a", "la");
		const entries = [keyOf(a)];
		expect(pruneEntries(entries, [a])).toBe(entries);
	});
});

describe("removeEntry", () => {
	it("removes a single key (unpin)", () => {
		const entries = ["file.md::la", "file.md::lb"];
		expect(removeEntry(entries, "file.md::la")).toEqual(["file.md::lb"]);
	});

	it("returns the same reference when the key is absent", () => {
		const entries = ["file.md::la"];
		expect(removeEntry(entries, "file.md::nope")).toBe(entries);
	});
});

describe("collectPresentManualOrderKeys", () => {
	it("collects present keys from the full task set by group and primary column", () => {
		const present = collectPresentManualOrderKeys([
			{ done: false, column: "todo", path: "a.md", blockLink: "aa", group: "g1" },
			{ done: true, column: "todo", path: "b.md", blockLink: "bb", group: "g1" },
			{ done: false, column: undefined, path: "c.md", blockLink: "cc", group: "g2" },
			{ done: false, column: "archived", path: "d.md", blockLink: "dd", group: "g2" },
			{ done: false, column: "todo", path: "e.md", blockLink: undefined, group: "g1" },
		], (task) => task.group);

		expect(present["g1"]?.["todo"]).toEqual(new Set(["a.md::aa"]));
		expect(present["g1"]?.["done"]).toEqual(new Set(["b.md::bb"]));
		expect(present["g2"]?.["uncategorised"]).toEqual(new Set(["c.md::cc"]));
		expect(present["g2"]?.["archived"]).toBeUndefined();
	});
});

describe("generateBlockLinkId", () => {
	it("avoids ids already present in the file", () => {
		const existing = new Set<string>();
		const id = generateBlockLinkId(existing);
		expect(id).toMatch(/^[a-z0-9]+$/);
		expect(existing.has(id)).toBe(false);
	});
});

describe("ensureRowBlockLink", () => {
	it("reuses a block link already present on disk", () => {
		const existing = new Set<string>();
		const result = ensureRowBlockLink("- [ ] Task #todo ^already", existing);

		expect(result).toEqual({
			row: "- [ ] Task #todo ^already",
			blockLink: "already",
			changed: false,
		});
		expect(existing.has("already")).toBe(true);
	});

	it("appends a new block link only when the row has none", () => {
		const existing = new Set<string>();
		const result = ensureRowBlockLink("- [ ] Task #todo   ", existing);

		expect(result.row).toMatch(/^- \[ \] Task #todo \^[a-z0-9]+$/);
		expect(result.blockLink).toMatch(/^[a-z0-9]+$/);
		expect(result.changed).toBe(true);
		expect(existing.has(result.blockLink)).toBe(true);
	});
});
