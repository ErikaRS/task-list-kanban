import { describe, expect, it } from "vitest";
import { get, writable } from "svelte/store";
import { ColumnOrderMode } from "../../../parsing/properties/comparators";
import { PropertySchemaOption } from "../../../parsing/properties/property_schema";
import { migrateColumnDefinitions } from "../../columns/definitions";
import {
	FlowDirection,
	ScopeOption,
	createSettingsStore,
	defaultSettings,
} from "../settings_store";
import {
	createInheritedSettingsStore,
	type GlobalSettings,
	inheritedSettingsFromGlobalSettings,
	parseGlobalSettings,
	pickBoardDefaultSettings,
	setBoardDefault,
} from "../global_settings";

describe("global settings parsing", () => {
	it("defaults the global layout flow to left-to-right", () => {
		const parsed = parseGlobalSettings({});

		expect(parsed.defaultView).toEqual({
			flowDirection: FlowDirection.LeftToRight,
		});
		expect(inheritedSettingsFromGlobalSettings(parsed)).toEqual({
			flowDirection: FlowDirection.LeftToRight,
		});
	});

	it("keeps only Tier 1 board defaults", () => {
		const columns = migrateColumnDefinitions(["Inbox", "Doing"]);
		const parsed = parseGlobalSettings({
			version: 1,
			boardDefaults: {
				columns,
				scope: ScopeOption.Everywhere,
				propertySchema: PropertySchemaOption.TasksPlugin,
				columnWidth: 480,
				lastFilter: "tag:work",
				savedViews: [{ id: "local", name: "Local", query: "x" }],
			},
		});

		expect(parsed.boardDefaults).toEqual({
			columns,
			scope: ScopeOption.Everywhere,
			propertySchema: PropertySchemaOption.TasksPlugin,
		});
	});

	it("maps only layout default view properties into inherited board settings", () => {
		const parsed = parseGlobalSettings({
			version: 1,
			boardDefaults: {
				scope: ScopeOption.Everywhere,
			},
			defaultView: {
				query: "due:<$TODAY",
				sort: {
					mode: ColumnOrderMode.TaskName,
					property: null,
					direction: "desc",
				},
				group: {
					source: { kind: "file" },
					direction: "asc",
				},
				flowDirection: FlowDirection.TopToBottom,
				columnWidth: 420,
			},
		});
		const inherited = inheritedSettingsFromGlobalSettings(parsed);

		expect(parsed.defaultView).toEqual({
			flowDirection: FlowDirection.TopToBottom,
			columnWidth: 420,
		});
		expect(inherited).toEqual({
			scope: ScopeOption.Everywhere,
			flowDirection: FlowDirection.TopToBottom,
			columnWidth: 420,
		});
	});

	it("copies only inheritable board settings from a resolved board", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Now"]);
		const picked = pickBoardDefaultSettings({
			...defaultSettings,
			columns,
			scope: ScopeOption.Everywhere,
			columnWidth: 500,
			lastFilter: "tag:home",
			scopeFolders: ["projects"],
		});

		expect(picked.columns).toEqual(columns);
		expect(picked.scope).toBe(ScopeOption.Everywhere);
		expect(picked).not.toHaveProperty("columnWidth");
		expect(picked).not.toHaveProperty("lastFilter");
		expect(picked).not.toHaveProperty("scopeFolders");
	});

	it("parses global saved views without promoting board-local saved views", () => {
		const parsed = parseGlobalSettings({
			version: 1,
			boardDefaults: {
				savedViews: [{ id: "local", name: "Local", query: "tag:local" }],
			},
			globalViews: [
				{ id: "global", name: "Global", query: "due:<$TODAY" },
				{ id: "empty", name: "Empty" },
			],
		});

		expect(parsed.boardDefaults).not.toHaveProperty("savedViews");
		expect(parsed.globalViews).toEqual([
			{ id: "global", name: "Global", query: "due:<$TODAY" },
		]);
	});

	it("round-trips enabled board tabs and drops the disabled default", () => {
		expect(parseGlobalSettings({ version: 1, tabs: { enabled: true } }).tabs).toEqual({
			enabled: true,
		});
		expect(parseGlobalSettings({ version: 1, tabs: { enabled: false } }).tabs).toBeUndefined();
		expect(parseGlobalSettings({ version: 1, tabs: "yes" }).tabs).toBeUndefined();
		expect(parseGlobalSettings({ version: 1 }).tabs).toBeUndefined();
	});
});

describe("global settings inheritance", () => {
	it("updates board stores live without recording local overrides", () => {
		const globalSettings = writable<GlobalSettings>({
			version: 1 as const,
			boardDefaults: {
				scope: ScopeOption.Everywhere,
			},
			defaultView: {
				flowDirection: FlowDirection.RightToLeft,
				columnWidth: 360,
			},
		});
		const inheritedSettings = createInheritedSettingsStore(globalSettings);
		const boardStore = createSettingsStore(inheritedSettings);

		expect(get(boardStore).scope).toBe(ScopeOption.Everywhere);
		expect(get(boardStore).flowDirection).toBe(FlowDirection.RightToLeft);
		expect(get(boardStore).columnWidth).toBe(360);
		expect(boardStore.getOverrides()).toEqual({});

		globalSettings.update((settings) =>
			setBoardDefault(
				{
					...settings,
					defaultView: {
						...settings.defaultView,
						columnWidth: 420,
					},
				},
				"scope",
				ScopeOption.Folder,
			),
		);

		expect(get(boardStore).scope).toBe(ScopeOption.Folder);
		expect(get(boardStore).columnWidth).toBe(420);
		expect(boardStore.getOverrides()).toEqual({});
		boardStore.destroy();
	});

	it("lets board overrides win over later global changes", () => {
		const inheritedSettings = writable({ columnWidth: 360 });
		const boardStore = createSettingsStore(inheritedSettings);

		boardStore.update((settings) => ({ ...settings, columnWidth: 500 }));
		inheritedSettings.set({ columnWidth: 420 });

		expect(get(boardStore).columnWidth).toBe(500);
		expect(boardStore.getOverrides()).toEqual({ columnWidth: 500 });
		boardStore.destroy();
	});
});
