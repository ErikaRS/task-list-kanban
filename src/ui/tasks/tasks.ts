import type { TFile, Vault } from "obsidian";
import { isTrackedTaskString, Task } from "./task";
import type { ColumnPlacementLookupTable, ColumnPlacementTagTable } from "../columns/columns";
import { get, type Readable } from "svelte/store";

export type Metadata = {
	rowIndex: number;
	fileHandle: TFile;
};

/**
 * mutates the supplied Maps
 */
export async function updateMapsFromFile({
	fileHandle,
	taskIdsByFileHandle,
	tasksByTaskId,
	metadataByTaskId,
	vault,
	columnPlacementLookupTableStore,
	columnPlacementTagTableStore,
	consolidateTags,
	doneStatusMarkers,
	cancelledStatusMarkers,
	ignoredStatusMarkers,
}: {
	fileHandle: TFile;
	tasksByTaskId: Map<string, Task>;
	metadataByTaskId: Map<string, Metadata>;
	taskIdsByFileHandle: Map<TFile, Set<string>>;
	vault: Vault;
	columnPlacementLookupTableStore: Readable<ColumnPlacementLookupTable>;
	columnPlacementTagTableStore: Readable<ColumnPlacementTagTable>;
	consolidateTags: boolean;
	doneStatusMarkers: string;
	cancelledStatusMarkers: string;
	ignoredStatusMarkers: string;
}) {
	try {
		const previousTaskIds =
			taskIdsByFileHandle.get(fileHandle) ?? new Set();
		const newTaskIds = new Set<string>();

		const contents = await vault.read(fileHandle);
		const rows = contents.split("\n");
		const columnPlacementLookupTable = get(columnPlacementLookupTableStore);
		const columnPlacementTagTable = get(columnPlacementTagTableStore);

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row) {
				continue;
			}

			if (isTrackedTaskString(row, ignoredStatusMarkers)) {
				const task = new Task(
					row,
					fileHandle,
					i,
					columnPlacementLookupTable,
					columnPlacementTagTable,
					consolidateTags,
					doneStatusMarkers,
					cancelledStatusMarkers,
					ignoredStatusMarkers
				);

				newTaskIds.add(task.id);
				tasksByTaskId.set(task.id, task);
				metadataByTaskId.set(task.id, { rowIndex: i, fileHandle });
				previousTaskIds.delete(task.id);
			}
		}

		for (const prevId of previousTaskIds) {
			tasksByTaskId.delete(prevId);
			metadataByTaskId.delete(prevId);
		}

		taskIdsByFileHandle.set(fileHandle, newTaskIds);
	} catch {
		//
	}
}
