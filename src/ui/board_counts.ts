import type { Task } from "./tasks/task";

type BoardCountTask = Pick<Task, "done" | "column">;

function isActiveBoardTask(task: BoardCountTask): boolean {
	return task.column !== "archived" && !task.done && task.column !== "done";
}

export function getBoardTaskCount(tasks: readonly BoardCountTask[]): number {
	return tasks.filter(isActiveBoardTask).length;
}
