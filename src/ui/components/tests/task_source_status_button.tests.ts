// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { TaskActions } from "../../tasks/actions";
import type { SourceTaskNode } from "../../tasks/source_block";
import type { Task } from "../../tasks/task";
import TaskSourceStatusButton from "../TaskSourceStatusButton.svelte";

const notices = vi.hoisted(() => [] as string[]);
vi.mock("obsidian", () => ({ setIcon: vi.fn(), Notice: class { constructor(message: string) { notices.push(message); } } }));

let component: TaskSourceStatusButton | undefined;
afterEach(() => { component?.$destroy(); component = undefined; document.body.innerHTML = ""; notices.length = 0; });

// SPEC 0058: a failed subtask status write must be visible, not a silent no-op.
it("cycles the subtask and reports a failed write", async () => {
	const toggleSourceTaskStatus = vi.fn().mockRejectedValue(new Error("Task changed in the source file."));
	const host = document.createElement("div");
	document.body.append(host);
	component = new TaskSourceStatusButton({ target: host, props: {
		task: { id: "t1", isSourceTaskStatusDone: () => false } as unknown as Task,
		taskActions: { toggleSourceTaskStatus } as unknown as TaskActions,
		node: { rowIndex: 3, status: " ", taskVisibility: "visible" } as SourceTaskNode,
	} });

	host.querySelector("button")!.click();
	// The rejection settles, then the component's catch handler runs.
	await toggleSourceTaskStatus.mock.results[0]!.value.catch(() => {});
	await Promise.resolve();
	expect(notices).toEqual(["Could not change subtask status: Task changed in the source file."]);
	expect(toggleSourceTaskStatus).toHaveBeenCalledWith("t1", 3);
});
