import { writable } from "svelte/store";

type DraggingData = {
	fromColumn: string | undefined;
	fromSecondaryId: string;
	draggedTaskIds: string[];
};

export const isDraggingStore = writable<DraggingData | null>(null);
