import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createCollapsedColumnsStore, createColumnStores, resolveDefaultColumnName } from "../columns";
import { createSettingsStore, defaultSettings } from "../../settings/settings_store";

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
	it("returns empty set when collapsedColumns is not set", () => {
		const settingsStore = createSettingsStore();
		const store = createCollapsedColumnsStore(settingsStore);

		expect(get(store).size).toBe(0);
	});

	it("returns empty set when collapsedColumns is empty array", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, collapsedColumns: [] });
		const store = createCollapsedColumnsStore(settingsStore);

		expect(get(store).size).toBe(0);
	});

	it("returns set containing the collapsed column tags", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({
			...defaultSettings,
			collapsedColumns: ["backlog", "waiting"],
		});
		const store = createCollapsedColumnsStore(settingsStore);

		const collapsed = get(store);
		expect(collapsed.has("backlog")).toBe(true);
		expect(collapsed.has("waiting")).toBe(true);
		expect(collapsed.size).toBe(2);
	});

	it("updates reactively when settings change", () => {
		const settingsStore = createSettingsStore();
		const store = createCollapsedColumnsStore(settingsStore);

		expect(get(store).size).toBe(0);

		settingsStore.set({ ...defaultSettings, collapsedColumns: ["today"] });
		expect(get(store).has("today")).toBe(true);

		settingsStore.set({ ...defaultSettings, collapsedColumns: [] });
		expect(get(store).size).toBe(0);
	});

	it("does not include tags that are not in the collapsed list", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({
			...defaultSettings,
			collapsedColumns: ["backlog"],
		});
		const store = createCollapsedColumnsStore(settingsStore);

		expect(get(store).has("today")).toBe(false);
	});

	it("handles default columns (done, uncategorised) as collapsible", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({
			...defaultSettings,
			collapsedColumns: ["done", "uncategorised"],
		});
		const store = createCollapsedColumnsStore(settingsStore);

		expect(get(store).has("done")).toBe(true);
		expect(get(store).has("uncategorised")).toBe(true);
	});
});

describe("createColumnStores reserved key filtering", () => {
	it("excludes user column named 'Done' (kebab-cases to reserved 'done')", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: ["Backlog", "Done", "Review"] });
		const { columnTagTable } = createColumnStores(settingsStore);

		const table = get(columnTagTable);
		expect(table).not.toHaveProperty("done");
		expect(table).toHaveProperty("backlog");
		expect(table).toHaveProperty("review");
	});

	it("excludes user column named 'Uncategorised' (kebab-cases to reserved 'uncategorised')", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: ["Uncategorised", "Todo"] });
		const { columnTagTable } = createColumnStores(settingsStore);

		const table = get(columnTagTable);
		expect(table).not.toHaveProperty("uncategorised");
		expect(table).toHaveProperty("todo");
	});

	it("excludes exact lowercase match 'done' from user columns", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: ["done", "Todo"] });
		const { columnTagTable } = createColumnStores(settingsStore);

		const table = get(columnTagTable);
		expect(table).not.toHaveProperty("done");
		expect(table).toHaveProperty("todo");
	});

	it("allows 'DONE' because it kebab-cases to 'd-o-n-e', not 'done'", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: ["DONE", "Todo"] });
		const { columnTagTable } = createColumnStores(settingsStore);

		const table = get(columnTagTable);
		// "DONE" → "d-o-n-e" (each uppercase letter gets a dash prefix)
		expect(table).toHaveProperty("d-o-n-e");
		expect(table).toHaveProperty("todo");
	});

	it("also excludes reserved keys from columnColourTable", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: ["Done(#ff0000)", "Review(#00ff00)"] });
		const { columnColourTable } = createColumnStores(settingsStore);

		const table = get(columnColourTable);
		expect(table).not.toHaveProperty("done");
		expect(table).toHaveProperty("review");
		expect(table["review" as keyof typeof table]).toBe("#00ff00");
	});

	it("allows normal columns through unchanged", () => {
		const settingsStore = createSettingsStore();
		settingsStore.set({ ...defaultSettings, columns: ["Backlog", "In Progress", "Review"] });
		const { columnTagTable } = createColumnStores(settingsStore);

		const table = get(columnTagTable);
		expect(Object.keys(table)).toHaveLength(3);
		expect(table).toHaveProperty("backlog");
		expect(table).toHaveProperty("in-progress");
		expect(table).toHaveProperty("review");
	});
});
