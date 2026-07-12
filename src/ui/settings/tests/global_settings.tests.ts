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
	it("treats an absent default view as no layout defaults", () => {
		const parsed = parseGlobalSettings({});

		expect(parsed.defaultView).toBeUndefined();
		expect(inheritedSettingsFromGlobalSettings(parsed)).toEqual({});
	});

	it("keeps non-builtin layout defaults and drops an emptied default view", () => {
		const withFlow = parseGlobalSettings({
			version: 1,
			defaultView: { flowDirection: FlowDirection.TopToBottom },
		});
		expect(withFlow.defaultView).toEqual({
			flowDirection: FlowDirection.TopToBottom,
		});

		// "No default view" is representable (the previous parser force-set
		// flow back to left-to-right).
		const cleared = parseGlobalSettings({ version: 1, defaultView: {} });
		expect(cleared.defaultView).toBeUndefined();
		expect(inheritedSettingsFromGlobalSettings(cleared)).toEqual({});
	});

	it("normalizes layout defaults equal to the builtins to no default", () => {
		// An explicit LTR flow or 300px width is indistinguishable from the
		// builtin defaults, so neither is stored (also sheds the LTR that
		// earlier builds pinned into data.json).
		const parsed = parseGlobalSettings({
			version: 1,
			defaultView: {
				flowDirection: FlowDirection.LeftToRight,
				columnWidth: defaultSettings.columnWidth,
			},
		});
		expect(parsed.defaultView).toBeUndefined();

		const mixed = parseGlobalSettings({
			version: 1,
			defaultView: {
				flowDirection: FlowDirection.LeftToRight,
				columnWidth: 420,
			},
		});
		expect(mixed.defaultView).toEqual({ columnWidth: 420 });
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

	it("round-trips the board list and drops the empty default", () => {
		expect(
			parseGlobalSettings({
				version: 1,
				boardList: { boardPaths: ["Home.md"], unpinnedPaths: ["archive/Old.md"] },
			}).boardList,
		).toEqual({ boardPaths: ["Home.md"], unpinnedPaths: ["archive/Old.md"] });
		expect(parseGlobalSettings({ version: 1, boardList: {} }).boardList).toBeUndefined();
		expect(parseGlobalSettings({ version: 1, boardList: "yes" }).boardList).toBeUndefined();
		expect(parseGlobalSettings({ version: 1 }).boardList).toBeUndefined();
	});

	it("normalizes board order and unpinned paths", () => {
		const parsed = parseGlobalSettings({
			version: 1,
			boardList: {
				boardPaths: [" projects/Work.md ", "", "Home.md", "projects/Work.md", 7],
				unpinnedPaths: ["archive/Old.md", "archive/Old.md", " "],
			},
		});
		expect(parsed.boardList).toEqual({
			boardPaths: ["projects/Work.md", "Home.md"],
			unpinnedPaths: ["archive/Old.md"],
		});
	});

	it("round-trips last-opened stamps and drops junk entries", () => {
		const parsed = parseGlobalSettings({
			version: 1,
			lastOpenedByPath: {
				"projects/Work.md": 1_750_000_000_000,
				" Home.md ": 1_760_000_000_000,
				"": 1,
				"junk/NaN.md": Number.NaN,
				"junk/Negative.md": -5,
				"junk/String.md": "yesterday",
			},
		});
		expect(parsed.lastOpenedByPath).toEqual({
			"projects/Work.md": 1_750_000_000_000,
			"Home.md": 1_760_000_000_000,
		});

		expect(
			parseGlobalSettings({ version: 1, lastOpenedByPath: {} }).lastOpenedByPath,
		).toBeUndefined();
		expect(parseGlobalSettings({ version: 1 }).lastOpenedByPath).toBeUndefined();
	});

	it("round-trips a non-default rail width and clamps out-of-range values", () => {
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 180 } }).boardRail,
		).toEqual({ width: 180 });
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 9999 } }).boardRail,
		).toEqual({ width: 320 });
	});

	it("drops the rail key at the default width and on junk", () => {
		// The default (minimum) width needs no key — including a width that
		// clamps down to it.
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 44 } }).boardRail,
		).toBeUndefined();
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 10 } }).boardRail,
		).toBeUndefined();
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: "wide" } }).boardRail,
		).toBeUndefined();
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: Number.NaN } }).boardRail,
		).toBeUndefined();
		expect(parseGlobalSettings({ version: 1, boardRail: {} }).boardRail).toBeUndefined();
		expect(
			parseGlobalSettings({ version: 1, boardRail: "wide" }).boardRail,
		).toBeUndefined();
		expect(parseGlobalSettings({ version: 1 }).boardRail).toBeUndefined();
	});

	it("round-trips the top dock and drops the default or junk dock", () => {
		expect(
			parseGlobalSettings({ version: 1, boardRail: { dock: "top" } }).boardRail,
		).toEqual({ dock: "top" });
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 180, dock: "top" } })
				.boardRail,
		).toEqual({ width: 180, dock: "top" });

		// "left" is the default dock, so it (and junk) sheds the field; each
		// field survives the other going back to its default.
		expect(
			parseGlobalSettings({ version: 1, boardRail: { dock: "left" } }).boardRail,
		).toBeUndefined();
		expect(
			parseGlobalSettings({ version: 1, boardRail: { dock: "sideways" } }).boardRail,
		).toBeUndefined();
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 44, dock: "top" } })
				.boardRail,
		).toEqual({ dock: "top" });
		expect(
			parseGlobalSettings({ version: 1, boardRail: { width: 180, dock: "left" } })
				.boardRail,
		).toEqual({ width: 180 });
	});

	it("ignores a stray legacy tabs key", () => {
		// The tab strip (SPEC 0032) never shipped in a release, so its `tabs`
		// key is dropped rather than migrated (SPEC 0033 Phase 2).
		const parsed = parseGlobalSettings({
			version: 1,
			tabs: { enabled: true, boardPaths: ["Home.md"] },
		});
		expect(parsed.boardList).toBeUndefined();
		expect(parsed).not.toHaveProperty("tabs");
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
