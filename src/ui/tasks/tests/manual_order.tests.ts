import { describe, expect, it } from "vitest";
import { stableTaskKey, applyManualOrder, reorderAfterDrop, moveTaskUp, moveTaskDown, initializeColumnOrder } from "../manual_order";
import { Task, isTrackedTaskString } from "../task";
import type { ColumnDefinition, ColumnTag } from "src/ui/columns/columns";
import { kebab } from "src/parsing/kebab/kebab";

function createTestTask(content: string, path: string, rowIndex: number, blockLink?: string): Task {
	const columns: ColumnDefinition[] = [
		{
			id: kebab<ColumnTag>("column"),
			label: "column",
			matchMode: "name",
			matchTags: [],
		},
	];

	// Manually build the placement tag table
	const placementTags: Record<ColumnTag, string[]> = {
		[columns[0]!.id]: ["#column"],
	};

	const taskString = blockLink ? `- [ ] ${content} ^${blockLink}` : `- [ ] ${content}`;

	if (!isTrackedTaskString(taskString)) {
		throw new Error(`Invalid task string: ${taskString}`);
	}

	const task = new Task(
		taskString,
		{ path },
		rowIndex,
		columns,
		placementTags,
		false,
		"xX",
		"-",
		""
	);
	return task;
}

describe("stableTaskKey", () => {
	it("returns path::blockLink when blockLink is present", () => {
		const task = createTestTask("Something", "folder/file.md", 5, "abc123");
		const key = stableTaskKey(task);
		expect(key).toBe("folder/file.md::abc123");
	});

	it("returns path::content when blockLink is absent", () => {
		const task = createTestTask("Something", "folder/file.md", 5);
		const key = stableTaskKey(task);
		expect(key).toBe("folder/file.md::Something");
	});

	it("produces different keys for same content in different files", () => {
		const task1 = createTestTask("Something", "folder/a.md", 0);
		const task2 = createTestTask("Something", "folder/b.md", 0);
		expect(stableTaskKey(task1)).not.toBe(stableTaskKey(task2));
	});

	it("blockLink takes precedence over content", () => {
		const task = createTestTask("Something", "folder/file.md", 5, "xyz789");
		const key = stableTaskKey(task);
		expect(key).toContain("xyz789");
		expect(key).not.toContain("Something");
	});
});

describe("applyManualOrder", () => {
	it("returns tasks in file order when orderedKeys is empty", () => {
		const tasks = [
			createTestTask("Task A", "file2.md", 0),
			createTestTask("Task B", "file1.md", 0),
			createTestTask("Task C", "file1.md", 5),
		];

		const result = applyManualOrder(tasks, []);

		// Expected order: file1 then file2, within each file by rowIndex
		expect(result.length).toBe(3);
		expect(result[0]!.content).toBe("Task B"); // file1, rowIndex 0
		expect(result[1]!.content).toBe("Task C"); // file1, rowIndex 5
		expect(result[2]!.content).toBe("Task A"); // file2, rowIndex 0
	});

	it("sorts tasks present in orderedKeys by key position", () => {
		const tasks = [
			createTestTask("Task A", "file.md", 0),
			createTestTask("Task B", "file.md", 1),
			createTestTask("Task C", "file.md", 2),
		];

		const keyC = stableTaskKey(tasks[2]!);
		const keyA = stableTaskKey(tasks[0]!);
		const keyB = stableTaskKey(tasks[1]!);

		// Order: C, A, B
		const result = applyManualOrder(tasks, [keyC, keyA, keyB]);

		expect(result.length).toBe(3);
		expect(result[0]!.content).toBe("Task C");
		expect(result[1]!.content).toBe("Task A");
		expect(result[2]!.content).toBe("Task B");
	});

	it("appends unlisted tasks after listed tasks in file order", () => {
		const tasks = [
			createTestTask("Ordered", "file1.md", 0),
			createTestTask("Not ordered 1", "file2.md", 0),
			createTestTask("Not ordered 2", "file1.md", 5),
		];

		const orderedKey = stableTaskKey(tasks[0]!);
		const result = applyManualOrder(tasks, [orderedKey]);

		expect(result.length).toBe(3);
		expect(result[0]!.content).toBe("Ordered");
		// Next two should be in file order
		expect(result[1]!.content).toBe("Not ordered 2"); // file1, rowIndex 5
		expect(result[2]!.content).toBe("Not ordered 1"); // file2, rowIndex 0
	});

	it("ignores stale keys with no matching task", () => {
		const tasks = [
			createTestTask("Task A", "file.md", 0),
			createTestTask("Task B", "file.md", 1),
		];

		const keyA = stableTaskKey(tasks[0]!);
		const staleLKey = "file.md::Nonexistent";

		const result = applyManualOrder(tasks, [staleLKey, keyA]);

		expect(result.length).toBe(2);
		expect(result[0]!.content).toBe("Task A"); // stale key is skipped
		expect(result[1]!.content).toBe("Task B");
	});

	it("handles all tasks listed, none unlisted", () => {
		const tasks = [
			createTestTask("Task A", "file.md", 0),
			createTestTask("Task B", "file.md", 1),
		];

		const keyA = stableTaskKey(tasks[0]!);
		const keyB = stableTaskKey(tasks[1]!);

		const result = applyManualOrder(tasks, [keyB, keyA]);

		expect(result.length).toBe(2);
		expect(result[0]!.content).toBe("Task B");
		expect(result[1]!.content).toBe("Task A");
	});

	it("handles partial overlap: listed then unlisted in file order", () => {
		const tasks = [
			createTestTask("A", "file1.md", 0),
			createTestTask("B", "file2.md", 0),
			createTestTask("C", "file1.md", 5),
		];

		const keyA = stableTaskKey(tasks[0]!);
		// B and C are not in the ordered keys list

		const result = applyManualOrder(tasks, [keyA]);

		expect(result.length).toBe(3);
		expect(result[0]!.content).toBe("A");
		expect(result[1]!.content).toBe("C"); // file1, rowIndex 5
		expect(result[2]!.content).toBe("B"); // file2, rowIndex 0
	});

	it("preserves order stability across multiple calls with same input", () => {
		const tasks = [
			createTestTask("Task A", "file.md", 0),
			createTestTask("Task B", "file.md", 1),
			createTestTask("Task C", "file.md", 2),
		];

		const keys = [stableTaskKey(tasks[2]!), stableTaskKey(tasks[0]!)];

		const result1 = applyManualOrder(tasks, keys);
		const result2 = applyManualOrder(tasks, keys);

		expect(result1.map((t) => t.content)).toEqual(result2.map((t) => t.content));
	});
});

describe("reorderAfterDrop", () => {
	it("moves task from position 0 to position 2 (between b and c)", () => {
		const order = ["key-a", "key-b", "key-c"];
		const result = reorderAfterDrop(order, "key-a", 2);

		// dropIndex 2 means "insert at position 2 in the full array"
		// Since "key-a" is being removed, the adjusted index is 1 (2-1)
		// Result: [b, a, c]
		expect(result).toEqual(["key-b", "key-a", "key-c"]);
	});

	it("moves task to the beginning (dropIndex 0)", () => {
		const order = ["key-a", "key-b", "key-c"];
		const result = reorderAfterDrop(order, "key-c", 0);

		expect(result).toEqual(["key-c", "key-a", "key-b"]);
	});

	it("moves task to the end (dropIndex = length)", () => {
		const order = ["key-a", "key-b", "key-c"];
		const result = reorderAfterDrop(order, "key-a", 3);

		expect(result).toEqual(["key-b", "key-c", "key-a"]);
	});

	it("handles adjacent moves without duplication", () => {
		const order = ["key-a", "key-b", "key-c"];
		const result = reorderAfterDrop(order, "key-b", 0);

		expect(result).toEqual(["key-b", "key-a", "key-c"]);
		expect(result.length).toBe(3); // No duplication
	});

	it("adds a task not yet in the order at drop index", () => {
		const order = ["key-a", "key-b", "key-c"];
		const result = reorderAfterDrop(order, "key-x", 1);

		// key-x is not in the order; it is inserted at index 1
		expect(result).toEqual(["key-a", "key-x", "key-b", "key-c"]);
	});

	it("adds a task to an empty order", () => {
		const result = reorderAfterDrop([], "key-a", 0);

		expect(result).toEqual(["key-a"]);
	});

	it("handles empty order array", () => {
		const result = reorderAfterDrop([], "key-a", 0);

		expect(result).toEqual(["key-a"]);
	});

	it("single element", () => {
		const order = ["key-a"];
		const result = reorderAfterDrop(order, "key-a", 1);

		expect(result).toEqual(["key-a"]);
	});
});

describe("moveTaskUp", () => {
	it("swaps with the previous task", () => {
		const order = ["a", "b", "c"];
		expect(moveTaskUp(order, "b")).toEqual(["b", "a", "c"]);
	});

	it("is a no-op when task is already at the top", () => {
		expect(moveTaskUp(["a", "b"], "a")).toEqual(["a", "b"]);
	});

	it("is a no-op when task is not in the order", () => {
		expect(moveTaskUp(["a", "b"], "x")).toEqual(["a", "b"]);
	});

	it("moves the last element up one", () => {
		expect(moveTaskUp(["a", "b", "c"], "c")).toEqual(["a", "c", "b"]);
	});
});

describe("moveTaskDown", () => {
	it("swaps with the next task", () => {
		const order = ["a", "b", "c"];
		expect(moveTaskDown(order, "b")).toEqual(["a", "c", "b"]);
	});

	it("is a no-op when task is already at the bottom", () => {
		expect(moveTaskDown(["a", "b"], "b")).toEqual(["a", "b"]);
	});

	it("is a no-op when task is not in the order", () => {
		expect(moveTaskDown(["a", "b"], "x")).toEqual(["a", "b"]);
	});

	it("moves the first element down one", () => {
		expect(moveTaskDown(["a", "b", "c"], "a")).toEqual(["b", "a", "c"]);
	});
});

describe("initializeColumnOrder", () => {
	it("initializes with file order when no existing order", () => {
		const tasks = [
			createTestTask("B", "file2.md", 0),
			createTestTask("A", "file1.md", 5),
		];
		const result = initializeColumnOrder(tasks, []);
		expect(result[0]).toBe(stableTaskKey(tasks[1]!)); // file1 before file2
		expect(result[1]).toBe(stableTaskKey(tasks[0]!));
	});

	it("returns existing order unchanged when already populated", () => {
		const tasks = [
			createTestTask("A", "file.md", 0),
			createTestTask("B", "file.md", 1),
		];
		const existingOrder = [stableTaskKey(tasks[1]!), stableTaskKey(tasks[0]!)]; // B before A
		const result = initializeColumnOrder(tasks, existingOrder);
		expect(result).toEqual(existingOrder); // Not re-initialized
	});

	it("returns empty array when no tasks and no existing order", () => {
		expect(initializeColumnOrder([], [])).toEqual([]);
	});
});

