import { writable } from "svelte/store";

type DraggingData = {
	fromColumn: string | undefined;
	draggedTaskIds: string[];
};

export const isDraggingStore = writable<DraggingData | null>(null);
