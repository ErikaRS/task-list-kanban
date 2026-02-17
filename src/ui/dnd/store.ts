import { writable } from "svelte/store";

type DraggingData = {
	fromColumn: string | undefined;
	draggedTaskIds: Set<string>;
};

export const isDraggingStore = writable<DraggingData | null>(null);
