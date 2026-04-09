import { writable } from "svelte/store";

type DraggingData = {
	fromColumn: string | undefined;
	draggedTaskIds: string[];
};

type ReorderingData = {
	taskId: string;
	fromColumn: string;
};

export const isDraggingStore = writable<DraggingData | null>(null);
export const isReorderingStore = writable<ReorderingData | null>(null);
