import { writable } from "svelte/store";

type DraggingData = {
	fromColumn: string | undefined;
	fromSecondaryId: string;
	draggedTaskIds: string[];
	taskSecondaryIds: Record<string, string>;
};

export const isDraggingStore = writable<DraggingData | null>(null);

type SubtaskDraggingData = {
	taskId: string;
	draggedRowIndex: number;
	draggedIndentation: string;
};

export const subtaskDraggingStore = writable<SubtaskDraggingData | null>(null);
