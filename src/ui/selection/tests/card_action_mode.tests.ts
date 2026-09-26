import { describe, expect, it, vi } from "vitest";
import type { ColumnTag } from "../../columns/columns";
import type { TaskActions } from "../../tasks/actions";
import { advanceCard, nextAdvanceDestination } from "../card_action_mode";

const idea = "column-idea" as ColumnTag;
const todo = "column-todo" as ColumnTag;
const working = "column-working" as ColumnTag;

describe("nextAdvanceDestination", () => {
	it("uses configured order, including Uncategorized and Done", () => {
		const columns = [idea, todo, working];
		expect(nextAdvanceDestination("uncategorised", columns)).toBe(idea);
		expect(nextAdvanceDestination(idea, columns)).toBe(todo);
		expect(nextAdvanceDestination(todo, columns)).toBe(working);
		expect(nextAdvanceDestination(working, columns)).toBe("done");
		expect(nextAdvanceDestination("done", columns)).toBe("archive");
	});

	it("moves directly from Uncategorized to Done without custom columns", () => {
		expect(nextAdvanceDestination("uncategorised", [])).toBe("done");
	});

	it("does not infer a destination for a removed column", () => {
		expect(nextAdvanceDestination(idea, [todo])).toBeNull();
	});
});

describe("advanceCard", () => {
	it("uses existing column moves and archive actions", async () => {
		const actions = {
			moveTasksToColumn: vi.fn().mockResolvedValue(undefined),
			archiveTasks: vi.fn().mockResolvedValue(undefined),
		} as unknown as TaskActions;
		await advanceCard("a", idea, [idea, todo], actions);
		await advanceCard("b", todo, [idea, todo], actions);
		await advanceCard("c", "done", [idea, todo], actions);
		expect(actions.moveTasksToColumn).toHaveBeenNthCalledWith(1, ["a"], todo);
		expect(actions.moveTasksToColumn).toHaveBeenNthCalledWith(2, ["b"], "done");
		expect(actions.archiveTasks).toHaveBeenCalledWith(["c"]);
	});
});
