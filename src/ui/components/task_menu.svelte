<script lang="ts">
	import { Menu } from "obsidian";
	import { type ColumnTag, type ColumnTagTable, resolveDefaultColumnName } from "../columns/columns";
	import type { Task } from "../tasks/task";
	import type { TaskActions } from "../tasks/actions";
	import IconButton from "./icon_button.svelte";
	import { stableTaskKey, moveTaskUp, moveTaskDown } from "../tasks/manual_order";
	import type { Readable } from "svelte/store";

	export let task: Task;
	export let taskActions: TaskActions;
	export let columnTagTableStore: Readable<ColumnTagTable>;
	export let doneColumnName: string | undefined = undefined;
	export let isManualMode: boolean = false;
	export let manualOrder: string[] = [];
	export let onReorder: (newOrder: string[]) => void = () => {};

	$: isDefaultColumn = task.column === 'uncategorised' || task.done;

	function showMenu(e: MouseEvent) {
		const menu = new Menu();

		const target = e.target as HTMLButtonElement | undefined;
		if (!target) {
			return;
		}

		const boundingRect = target.getBoundingClientRect();
		const y = boundingRect.top + boundingRect.height / 2;
		const x = boundingRect.left + boundingRect.width / 2;

		menu.addItem((i) => {
			i.setTitle(`Go to file`).onClick(() =>
				taskActions.viewFile(task.id),
			);
		});

		if (isManualMode && !isDefaultColumn) {
			menu.addSeparator();

			const taskKey = stableTaskKey(task);
			const currentIndex = manualOrder.indexOf(taskKey);
			const canMoveUp = currentIndex > 0;
			const canMoveDown = currentIndex >= 0 && currentIndex < manualOrder.length - 1;

			menu.addItem((i) => {
				i.setTitle(`Move up`).onClick(() => {
					const newOrder = moveTaskUp(manualOrder, taskKey);
					onReorder(newOrder);
				});
				if (!canMoveUp) {
					i.setDisabled(true);
				}
			});

			menu.addItem((i) => {
				i.setTitle(`Move down`).onClick(() => {
					const newOrder = moveTaskDown(manualOrder, taskKey);
					onReorder(newOrder);
				});
				if (!canMoveDown) {
					i.setDisabled(true);
				}
			});
		}

		menu.addSeparator();

		for (const [tag, label] of Object.entries($columnTagTableStore)) {
			menu.addItem((i) => {
				i.setTitle(`Move to ${label}`).onClick(() =>
					taskActions.changeColumn(task.id, tag as ColumnTag),
				);
				if (task.column === tag) {
					i.setDisabled(true);
				}
			});
		}

		menu.addItem((i) => {
			i.setTitle(`Move to ${resolveDefaultColumnName("done", undefined, doneColumnName)}`).onClick(() =>
				taskActions.markDone(task.id),
			);
			if (task.done) {
				i.setDisabled(true);
			}
		});

		menu.addSeparator();

		menu.addItem((i) => {
			i.setTitle(`Duplicate task`).onClick(() =>
				taskActions.duplicateTask(task.id),
			);
		});

		menu.addItem((i) => {
			if (task.isCancelled) {
				i.setTitle(`Restore task`).onClick(() =>
					taskActions.restoreTasks([task.id]),
				);
			} else {
				i.setTitle(`Cancel task`).onClick(() =>
					taskActions.cancelTasks([task.id]),
				);
			}
		});

		menu.addItem((i) => {
			i.setTitle(`Archive task`).onClick(() =>
				taskActions.archiveTasks([task.id]),
			);
		});

		menu.addItem((i) => {
			i.setTitle(`Delete task`).onClick(() =>
				taskActions.deleteTask(task.id),
			);
		});

		menu.showAtPosition({ x, y });
	}
</script>

<IconButton icon="lucide-more-vertical" on:click={showMenu} />
