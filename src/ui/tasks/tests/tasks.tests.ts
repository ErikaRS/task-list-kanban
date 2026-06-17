import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { NoneSchema } from "../../../parsing/properties/none_schema";
import { updateMapsFromFile } from "../tasks";
import {
	DEFAULT_CANCELLED_STATUS_MARKERS,
	DEFAULT_DONE_STATUS_MARKERS,
	DEFAULT_IGNORED_STATUS_MARKERS,
} from "../task";
import type { ColumnDefinition, ColumnPlacementTagTable } from "../../columns/columns";

const columns: ColumnDefinition[] = [
	{ id: "todo" as never, label: "Todo", matchMode: "name", matchTags: [] },
];

const placementTags: ColumnPlacementTagTable = {
	todo: ["todo"],
} as never;

describe("updateMapsFromFile", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("logs file-specific read or parse failures", async () => {
		const error = new Error("read failed");
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fileHandle = { path: "bad.md" };

		await updateMapsFromFile({
			fileHandle: fileHandle as never,
			tasksByTaskId: new Map(),
			metadataByTaskId: new Map(),
			taskIdsByFileHandle: new Map(),
			vault: {
				read: vi.fn(async () => {
					throw error;
				}),
			} as never,
			columnDefinitionsStore: writable(columns),
			columnPlacementTagTableStore: writable(placementTags),
			consolidateTags: false,
			doneStatusMarkers: DEFAULT_DONE_STATUS_MARKERS,
			cancelledStatusMarkers: DEFAULT_CANCELLED_STATUS_MARKERS,
			ignoredStatusMarkers: DEFAULT_IGNORED_STATUS_MARKERS,
			excludedTaskTags: new Set(),
			propertySchema: new NoneSchema(),
		});

		expect(consoleError).toHaveBeenCalledWith("Failed to update task cache for bad.md", error);
	});
});
