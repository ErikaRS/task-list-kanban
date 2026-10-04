import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createCollapsedColumnsStore, createColumnStores, resolveDefaultColumnName, type ColumnTag } from "../columns";
import { createSettingsStore, defaultSettings } from "../../settings/settings_store";
import { migrateColumnDefinitions } from "../definitions";

describe("resolveDefaultColumnName", () => {
	it("returns default 'Uncategorized' when no custom name is set", () => {
		expect(resolveDefaultColumnName("uncategorised", undefined, undefined)).toBe("Uncategorized");
	});

	it("returns default 'Done' when no custom name is set", () => {
		expect(resolveDefaultColumnName("done", undefined, undefined)).toBe("Done");
	});

	it("returns custom uncategorized name when set", () => {
		expect(resolveDefaultColumnName("uncategorised", "Backlog", undefined)).toBe("Backlog");
	});

	it("returns custom done name when set", () => {
		expect(resolveDefaultColumnName("done", undefined, "Complete")).toBe("Complete");
	});

	it("falls back to default when custom name is empty string", () => {
		expect(resolveDefaultColumnName("uncategorised", "", undefined)).toBe("Uncategorized");
		expect(resolveDefaultColumnName("done", undefined, "")).toBe("Done");
	});
});

describe("createCollapsedColumnsStore", () => {
	it("updates reactively when settings change", () => {
		const settingsStore = createSettingsStore();
		const store = createCollapsedColumnsStore(settingsStore);

		expect(get(store).size).toBe(0);

		settingsStore.set({ ...defaultSettings, collapsedColumns: ["today"] });
		expect(get(store).has("today")).toBe(true);

		settingsStore.set({ ...defaultSettings, collapsedColumns: [] });
		expect(get(store).size).toBe(0);
	});
});

describe("createColumnStores", () => {
	// Column ids are generated as `column-<label>`, so a column labelled like a
	// built-in section never collides with the reserved "done"/"uncategorised" keys.
	it("keeps user columns whose labels match the built-in sections", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: migrateColumnDefinitions(["Done(#ff0000)", "Uncategorised", "In Progress"]) });
		const { columnTagTable, columnColourTable, columnPlacementTagTable } = createColumnStores(settingsStore);

		expect(Object.values(get(columnTagTable))).toEqual(["Done", "Uncategorised", "In Progress"]);
		expect(Object.values(get(columnColourTable))).toEqual(["#ff0000"]);
		expect(Object.values(get(columnPlacementTagTable)).flat()).toEqual(["done", "uncategorised", "in-progress"]);
	});

	it("stores explicit match tags separately from labels", () => {
		const columnId = "col-a" as ColumnTag;
		const settingsStore = createSettingsStore();
		settingsStore.set({
			...defaultSettings,
			columns: [
				{ id: columnId, label: "Doing", matchMode: "tags", matchTags: ["status/now"] },
			],
		});
		const { columnTagTable, columnPlacementTagTable, columnMatchTagTable } = createColumnStores(settingsStore);

		expect(get(columnTagTable)[columnId]).toBe("Doing");
		expect(get(columnPlacementTagTable)[columnId]).toEqual(["status/now"]);
		expect(get(columnMatchTagTable)[columnId]).toEqual(["status/now"]);
	});

	it("stores status columns without placement tags and with a header status marker", () => {
		const columnId = "col-status" as ColumnTag;
		const settingsStore = createSettingsStore();
		settingsStore.set({
			...defaultSettings,
			columns: [
				{ id: columnId, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
			],
		});
		const { columnTagTable, columnPlacementTagTable, columnMatchTagTable, columnSubtitleTable } =
			createColumnStores(settingsStore);

		expect(get(columnTagTable)[columnId]).toBe("Doing");
		expect(get(columnPlacementTagTable)[columnId]).toEqual([]);
		expect(get(columnMatchTagTable)[columnId]).toEqual([]);
		expect(get(columnSubtitleTable)[columnId]).toEqual({ kind: "status", value: "/", label: "/" });
	});

	it("stores priority columns without placement tags and with a header priority subtitle", () => {
		const columnId = "col-priority" as ColumnTag;
		const settingsStore = createSettingsStore();
		settingsStore.set({
			...defaultSettings,
			columns: [
				{ id: columnId, label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
			],
		});
		const { columnTagTable, columnPlacementTagTable, columnMatchTagTable, columnSubtitleTable } =
			createColumnStores(settingsStore);

		expect(get(columnTagTable)[columnId]).toBe("High");
		expect(get(columnPlacementTagTable)[columnId]).toEqual([]);
		expect(get(columnMatchTagTable)[columnId]).toEqual([]);
		expect(get(columnSubtitleTable)[columnId]).toEqual({
			kind: "priority",
			value: "high",
			label: "High",
			icon: "⏫",
		});
	});
});
