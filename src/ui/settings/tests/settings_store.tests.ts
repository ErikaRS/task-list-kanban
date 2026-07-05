import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import {
	createSettingsStore,
	defaultSettings,
	FlowDirection,
	parseSettingsOverrides,
	parseSettingsString,
	PropertyDisplayMode,
	ScopeOption,
	toSettingsString,
	type SavedFilter,
	type SavedView,
} from "../settings_store";
import { ColumnOrderMode } from "../../../parsing/properties/comparators";
import { migrateColumnDefinitions } from "../../columns/definitions";
import { DEFAULT_GROUP_BUCKET_ID } from "../../tasks/task_grouping";

function parseSettings(overrides: Record<string, unknown>) {
	return parseSettingsString(JSON.stringify(overrides));
}

function serializeSettings(overrides: Partial<typeof defaultSettings>) {
	return JSON.parse(toSettingsString({ ...defaultSettings, ...overrides }));
}

function roundtripSettings(overrides: Partial<typeof defaultSettings>) {
	return parseSettingsString(toSettingsString({ ...defaultSettings, ...overrides }));
}

describe("Settings dirty check", () => {
	it("detects no changes as clean", () => {
		const original = { ...defaultSettings };
		const current = { ...defaultSettings };
		expect(JSON.stringify(current)).toBe(JSON.stringify(original));
	});

	it.each([
		{ columns: migrateColumnDefinitions(["A", "B"]) },
		{ scopeFolders: ["projects/"] },
	])("detects changed settings as dirty for %o", (override) => {
		expect(JSON.stringify({ ...defaultSettings, ...override })).not.toBe(JSON.stringify(defaultSettings));
	});

	it("detects reversion to original as clean", () => {
		const snapshot = JSON.stringify(defaultSettings);
		const current = { ...defaultSettings, columnWidth: 500 };
		expect(JSON.stringify(current)).not.toBe(snapshot);
		current.columnWidth = 300;
		expect(JSON.stringify(current)).toBe(snapshot);
	});
});

describe("Sparse overrides parsing (SPEC 0030)", () => {
	it("keeps only explicitly-set fields as overrides", () => {
		expect(parseSettingsOverrides(JSON.stringify({ columnWidth: 400 }))).toEqual({
			columnWidth: 400,
		});
	});

	it("parses an empty or invalid payload to no overrides", () => {
		expect(parseSettingsOverrides("{}")).toEqual({});
		expect(parseSettingsOverrides("")).toEqual({});
	});

	it("does not resurrect retired keys", () => {
		expect(
			parseSettingsOverrides(
				JSON.stringify({ filtersExpanded: true, filtersSidebarWidth: 240 }),
			),
		).toEqual({});
	});

	it("sparse settings round-trip unchanged", () => {
		const sparse = { columnWidth: 450, flowDirection: "rtl" };
		const overrides = parseSettingsOverrides(JSON.stringify(sparse));
		expect(JSON.parse(toSettingsString(overrides))).toEqual(sparse);
	});

	it("legacy fully-materialized settings round-trip with every field intact", () => {
		const full = JSON.parse(toSettingsString(defaultSettings));
		const overrides = parseSettingsOverrides(JSON.stringify(full));
		delete full.savedFilters;
		expect(JSON.parse(toSettingsString(overrides))).toEqual(full);
	});

	it("persists the string-column migration without promoting other fields", () => {
		const overrides = parseSettingsOverrides(JSON.stringify({ columns: ["A", "B"] }));
		expect(Object.keys(overrides)).toEqual(["columns"]);
		expect(overrides.columns?.map((column) => column.label)).toEqual(["A", "B"]);
		expect(overrides.columns?.[0]?.matchMode).toBe("name");
	});

	it("persists the showProperties migration as a propertyDisplay override", () => {
		expect(parseSettingsOverrides(JSON.stringify({ showProperties: true }))).toEqual({
			propertyDisplay: PropertyDisplayMode.Debug,
		});
		expect(parseSettingsOverrides(JSON.stringify({ showProperties: false }))).toEqual({
			propertyDisplay: PropertyDisplayMode.None,
		});
	});

	it("migrates collapsed column labels against the overridden columns", () => {
		const overrides = parseSettingsOverrides(
			JSON.stringify({
				columns: ["Backlog", "Waiting"],
				collapsedColumns: ["backlog"],
			}),
		);
		expect(overrides.collapsedColumns).toEqual([overrides.columns?.[0]?.id]);
	});

	it("persists the flat manual-order migration in overrides", () => {
		const overrides = parseSettingsOverrides(
			JSON.stringify({ manualOrder: { "my-column": ["tasks.md::abc123"] } }),
		);
		expect(overrides).toEqual({
			manualOrder: {
				[DEFAULT_GROUP_BUCKET_ID]: { "my-column": ["tasks.md::abc123"] },
			},
		});
	});
});

describe("BoardSettingsStore override tracking (SPEC 0030)", () => {
	it("starts with no overrides and resolved defaults", () => {
		const store = createSettingsStore();
		expect(store.getOverrides()).toEqual({});
		expect(get(store)).toEqual({ ...defaultSettings });
	});

	it("records only the changed field as an override on set", () => {
		const store = createSettingsStore();
		store.set({ ...get(store), columnWidth: 450 });
		expect(store.getOverrides()).toEqual({ columnWidth: 450 });
		expect(get(store).columnWidth).toBe(450);
	});

	it("records changes made by mutating the store's own object in place", () => {
		// Svelte's `$store.field = x` sugar mutates the subscribed object
		// before calling set() with that same object.
		const store = createSettingsStore();
		const value = get(store);
		value.columnWidth = 500;
		store.set(value);
		expect(store.getOverrides()).toEqual({ columnWidth: 500 });
	});

	it("accumulates overrides across updates", () => {
		const store = createSettingsStore();
		store.update((s) => ({ ...s, columnWidth: 450 }));
		store.update((s) => ({ ...s, flowDirection: FlowDirection.RightToLeft }));
		expect(store.getOverrides()).toEqual({
			columnWidth: 450,
			flowDirection: FlowDirection.RightToLeft,
		});
	});

	it("keeps an override when a later change lands back on the default", () => {
		const store = createSettingsStore();
		store.update((s) => ({ ...s, columnWidth: 450 }));
		store.update((s) => ({ ...s, columnWidth: defaultSettings.columnWidth! }));
		expect(store.getOverrides()).toEqual({ columnWidth: defaultSettings.columnWidth });
	});

	it("sheds an override when the key is deleted (writeBoardFilterState-style)", () => {
		const store = createSettingsStore();
		store.load({ lastContentFilter: "legacy", columnWidth: 450 });
		store.update((s) => {
			const next = { ...s, lastFilter: "migrated" };
			delete next.lastContentFilter;
			return next;
		});
		expect(store.getOverrides()).toEqual({ columnWidth: 450, lastFilter: "migrated" });
	});

	it("load replaces overrides wholesale and re-resolves against defaults", () => {
		const store = createSettingsStore();
		store.update((s) => ({ ...s, columnWidth: 450 }));
		store.load({ flowDirection: FlowDirection.RightToLeft });
		expect(store.getOverrides()).toEqual({ flowDirection: FlowDirection.RightToLeft });
		expect(get(store).columnWidth).toBe(defaultSettings.columnWidth);
		expect(get(store).flowDirection).toBe(FlowDirection.RightToLeft);
	});
});

describe("Invalid field resilience", () => {
	it("recovers from unrecognized scope value without losing columns", () => {
		const parsed = parseSettings({
			columns: ["ProjectA", "ProjectB"],
			scope: "file",
			showFilepath: false,
		});
		expect(parsed.scope).toBe(ScopeOption.Folder);
		expect(parsed.columns.map((column) => column.label)).toEqual(["ProjectA", "ProjectB"]);
		expect(parsed.showFilepath).toBe(false);
	});

	it("recovers from unrecognized scope value with structured columns", () => {
		const parsed = parseSettings({
			columns: [
				{ id: "col-a", label: "Alpha", matchMode: "name", matchTags: [] },
				{ id: "col-b", label: "Beta", color: "#FF0000", matchMode: "tags", matchTags: ["status/active"] },
			],
			scope: "nonexistent",
		});
		expect(parsed.scope).toBe(ScopeOption.Folder);
		expect(parsed.columns).toHaveLength(2);
		expect(parsed.columns[0]?.label).toBe("Alpha");
		expect(parsed.columns[1]?.color).toBe("#FF0000");
		expect(parsed.columns[1]?.matchTags).toEqual(["status/active"]);
	});

	it("parses status-mode structured columns", () => {
		const parsed = parseSettings({
			columns: [
				{ id: "col-status", label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
			],
		});

		expect(parsed.columns[0]?.matchMode).toBe("status");
		expect(parsed.columns[0]?.matchStatus).toBe("/");
	});

	it("parses priority-mode structured columns", () => {
		const parsed = parseSettings({
			columns: [
				{ id: "col-priority", label: "High", matchMode: "priority", matchTags: [], matchPriority: "high" },
			],
		});

		expect(parsed.columns[0]?.matchMode).toBe("priority");
		expect(parsed.columns[0]?.matchPriority).toBe("high");
		expect(parsed.columns[0]?.matchPropertySchema).toBe("tasks");
	});

	it("preserves explicit priority column property schemas", () => {
		const parsed = parseSettings({
			columns: [
				{
					id: "col-priority",
					label: "High",
					matchMode: "priority",
					matchTags: [],
					matchPriority: "high",
					matchPropertySchema: "dataview",
				},
			],
		});

		expect(parsed.columns[0]?.matchPropertySchema).toBe("dataview");
	});

	it("recovers from invalid columnWidth without losing other settings", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			scope: "folder",
			columnWidth: 9999,
		});
		expect(parsed.columnWidth).toBe(300);
		expect(parsed.columns.map((column) => column.label)).toEqual(["MyColumn"]);
	});

	it("recovers from invalid groupSource without losing other settings", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			groupSource: { kind: "unknown", key: "priority" },
			showFilepath: false,
		});

		expect(parsed.groupSource).toEqual({ kind: "none" });
		expect(parsed.columns.map((column) => column.label)).toEqual(["MyColumn"]);
		expect(parsed.showFilepath).toBe(false);
	});

	it("parses last date filter conditions", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			lastDateFilter: [
				{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
				{ property: "due", operator: "before", value: "2026-07-01" },
			],
		});

		expect(parsed.lastDateFilter).toEqual([
			{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
			{ property: "due", operator: "before", value: "2026-07-01" },
		]);
	});

	it("recovers from an invalid date filter without losing other settings", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			lastDateFilter: [
				{ property: "scheduled", operator: "sometime-around", value: "$TODAY" },
			],
			showFilepath: false,
		});

		expect(parsed.lastDateFilter).toEqual([]);
		expect(parsed.columns.map((column) => column.label)).toEqual(["MyColumn"]);
		expect(parsed.showFilepath).toBe(false);
	});

	it("parses property groupSource", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			groupSource: { kind: "property", key: "priority" },
		});

		expect(parsed.groupSource).toEqual({ kind: "property", key: "priority" });
	});

	it("parses tag groupSource include tags", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			groupSource: {
				kind: "tag-prefix",
				prefix: "Project-",
				includeTags: ["Project-Beta", "Project-Alpha"],
			},
		});

		expect(parsed.groupSource).toEqual({
			kind: "tag-prefix",
			prefix: "Project-",
			includeTags: ["Project-Beta", "Project-Alpha"],
		});
	});

	it("migrates saved tag groupings with include tags in order", () => {
		const parsed = roundtripSettings({
			savedGroupings: [{
				id: "projects",
				name: "Projects",
				source: {
					kind: "tag-prefix",
					prefix: "Project-",
					includeTags: ["Project-Beta", "Project-Alpha"],
				},
			}],
		});

		expect(parsed.savedViews?.[0]).toEqual({
			id: "group:projects",
			name: "Projects",
			group: {
				source: {
					kind: "tag-prefix",
					prefix: "Project-",
					includeTags: ["Project-Beta", "Project-Alpha"],
				},
				direction: "asc",
			},
		});
	});

	it("parses group direction and recovers invalid values", () => {
		expect(parseSettings({ columns: ["MyColumn"], groupDirection: "desc" }).groupDirection).toBe("desc");
		expect(parseSettings({ columns: ["MyColumn"], groupDirection: "sideways" }).groupDirection).toBe("asc");
	});

	it("parses task-name column ordering", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			columnOrderMode: "task-name",
		});

		expect(parsed.columnOrderMode).toBe(ColumnOrderMode.TaskName);
	});

	it("parses status marker order", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			statusMarkerOrder: "/ x",
		});

		expect(parsed.statusMarkerOrder).toBe("/ x");
	});

	it("migrates legacy flat manual order under the default group bucket", () => {
		const parsed = parseSettings({
			columns: ["MyColumn"],
			manualOrder: {
				"my-column": ["tasks.md::abc123"],
			},
		});

		expect(parsed.manualOrder).toEqual({
			[DEFAULT_GROUP_BUCKET_ID]: {
				"my-column": ["tasks.md::abc123"],
			},
		});
	});
});

describe("Saved view persistence", () => {
	const savedFilters: SavedFilter[] = [
		{ id: "test-id-1", content: { text: "frontend" } },
		{ id: "test-id-2", tag: { tags: ["bug", "urgent"] } },
	];
	const savedViews: SavedView[] = [
		{
			id: "view-id",
			name: "Planning",
			query: "tag:planning",
			flowDirection: FlowDirection.TopToBottom,
			columnWidth: 360,
		},
	];

	it("migrates legacy savedFilters to query-only savedViews", () => {
		const parsed = parseSettings({ ...defaultSettings, savedFilters });
		expect(parsed.savedFilters).toEqual([]);
		expect(parsed.savedViews).toEqual([
			{ id: "filter:test-id-1", name: "frontend", query: "frontend" },
			{ id: "filter:test-id-2", name: "tag:bug,urgent", query: "tag:bug,urgent" },
		]);
	});

	it("serializes settings with savedViews", () => {
		const serialized = serializeSettings({ savedViews });
		expect(serialized.savedViews).toEqual(savedViews);
	});

	it.each([
		[{ ...defaultSettings, savedViews: [] }, []],
		[defaultSettings, []],
	])("parses empty or missing saved views for %o", (settings, expected) => {
		expect(parseSettingsString(JSON.stringify(settings)).savedViews).toEqual(expected);
	});

	it("migrates a named date filter", () => {
		const savedFilter: SavedFilter = {
			id: "date-id",
			name: "overdue",
			date: {
				conditions: [
					{ property: "due", operator: "before", value: "$TODAY" },
					{ property: "scheduled", operator: "on-or-before", value: "2026-07-01" },
				],
			},
		};

		const parsed = parseSettings({ ...defaultSettings, savedFilters: [savedFilter] });
		expect(parsed.savedViews?.[0]).toEqual({
			id: "filter:date-id",
			name: "overdue",
			query: "due:<$TODAY scheduled:<=2026-07-01",
		});
	});

	it("migrates a date filter without a name", () => {
		const savedFilter: SavedFilter = {
			id: "date-id",
			date: {
				conditions: [{ property: "due", operator: "before", value: "$TODAY" }],
			},
		};

		const parsed = parseSettings({ ...defaultSettings, savedFilters: [savedFilter] });
		expect(parsed.savedViews?.[0]).toEqual({
			id: "filter:date-id",
			name: "due:<$TODAY",
			query: "due:<$TODAY",
		});
	});

	it("migrates a unified query-based saved filter", () => {
		const savedFilter: SavedFilter = {
			id: "query-id",
			name: "home projects",
			query: 'fix tag:home,errand file:projects due:<$TODAY',
		};

		const parsed = parseSettings({ ...defaultSettings, savedFilters: [savedFilter] });
		expect(parsed.savedViews?.[0]).toEqual({
			id: "filter:query-id",
			name: "home projects",
			query: 'fix tag:home,errand file:projects due:<$TODAY',
		});
	});

	it("migrates a filter with both content and tag", () => {
		const filter: SavedFilter = {
			id: "combo-id",
			content: { text: "search term" },
			tag: { tags: ["frontend", "bug"] },
		};
		const parsed = parseSettings({ ...defaultSettings, savedFilters: [filter] });
		expect(parsed.savedViews?.[0]).toEqual({
			id: "filter:combo-id",
			name: "\"search term\" tag:frontend,bug",
			query: "\"search term\" tag:frontend,bug",
		});
	});

	it("migrates legacy savedGroupings to group-only savedViews", () => {
		const parsed = parseSettings({
			...defaultSettings,
			savedGroupings: [
				{
					id: "projects",
					name: "Projects",
					source: { kind: "tag-prefix", prefix: "Project-" },
				},
			],
		});
		expect(parsed.savedViews?.[0]).toEqual({
			id: "group:projects",
			name: "Projects",
			group: {
				source: { kind: "tag-prefix", prefix: "Project-" },
				direction: "asc",
			},
		});
		expect(parsed.savedGroupings).toBeUndefined();
	});

	it("combines existing savedViews with migrated legacy saves without duplicates", () => {
		const overrides = parseSettingsOverrides(
			JSON.stringify({
				savedViews: [{ id: "filter:test-id-1", name: "Existing", query: "home" }],
				savedFilters,
			}),
		);
		expect(overrides.savedViews).toEqual([
			{ id: "filter:test-id-1", name: "Existing", query: "home" },
			{ id: "filter:test-id-2", name: "tag:bug,urgent", query: "tag:bug,urgent" },
		]);
	});

	it("parses settings with last filter values", () => {
		const parsed = parseSettings({
			...defaultSettings,
			lastContentFilter: "test search",
			lastTagFilter: ["frontend", "bug"],
		});
		expect(parsed.lastContentFilter).toBe("test search");
		expect(parsed.lastTagFilter).toEqual(["frontend", "bug"]);
	});

	it("serializes settings with last filter values", () => {
		const serialized = serializeSettings({
			lastContentFilter: "search term",
			lastTagFilter: ["tag1", "tag2"],
		});
		expect(serialized.lastContentFilter).toBe("search term");
		expect(serialized.lastTagFilter).toEqual(["tag1", "tag2"]);
	});

	it("leaves absent filter fields undefined so migration can detect them", () => {
		const parsed = parseSettingsString(JSON.stringify(defaultSettings));
		expect(parsed.lastFilter).toBeUndefined();
		expect(parsed.lastContentFilter).toBeUndefined();
		expect(parsed.lastTagFilter).toBeUndefined();
	});

	it("parses the unified lastFilter query string", () => {
		const parsed = parseSettings({ lastFilter: "fix tag:home due:<$TODAY" });
		expect(parsed.lastFilter).toBe("fix tag:home due:<$TODAY");
	});
});

describe("Property display configuration", () => {
	it("defaults to None", () => {
		expect(parseSettings({}).propertyDisplay).toBe(PropertyDisplayMode.None);
	});

	it("parses an explicit display mode", () => {
		expect(parseSettings({ propertyDisplay: "pretty" }).propertyDisplay).toBe(
			PropertyDisplayMode.Pretty
		);
	});

	it("migrates the legacy showProperties=true to Debug", () => {
		expect(parseSettings({ showProperties: true }).propertyDisplay).toBe(
			PropertyDisplayMode.Debug
		);
	});

	it("migrates the legacy showProperties=false to None", () => {
		expect(parseSettings({ showProperties: false }).propertyDisplay).toBe(
			PropertyDisplayMode.None
		);
	});

	it("prefers an explicit propertyDisplay over legacy showProperties", () => {
		expect(
			parseSettings({ showProperties: true, propertyDisplay: "pretty" }).propertyDisplay
		).toBe(PropertyDisplayMode.Pretty);
	});
});

describe("Nested subtask display configuration", () => {
	it("defaults to off", () => {
		expect(parseSettings({}).treatNestedTasksAsSubtasks).toBe(false);
	});

	it("parses and serializes the setting", () => {
		expect(parseSettings({ treatNestedTasksAsSubtasks: true }).treatNestedTasksAsSubtasks).toBe(true);
		expect(serializeSettings({ treatNestedTasksAsSubtasks: true }).treatNestedTasksAsSubtasks).toBe(true);
	});
});

describe("Column width configuration", () => {
	it.each([
		[{ columns: ["Todo", "In Progress", "Done"] }, 300],
		[{ ...defaultSettings, columnWidth: 400 }, 400],
		[{ ...defaultSettings, columnWidth: 200 }, 200],
		[{ ...defaultSettings, columnWidth: 600 }, 600],
		[{ ...defaultSettings, columnWidth: 199 }, 300],
		[{ ...defaultSettings, columnWidth: 601 }, 300],
	])("parses column width from %o", (settingsJson, expectedWidth) => {
		expect(() => parseSettingsString(JSON.stringify(settingsJson))).not.toThrow();
		expect(parseSettingsString(JSON.stringify(settingsJson)).columnWidth).toBe(expectedWidth);
	});

	it("serializes columnWidth correctly", () => {
		expect(serializeSettings({ columnWidth: 450 }).columnWidth).toBe(450);
	});

	it("roundtrips columnWidth through serialization", () => {
		expect(roundtripSettings({ columnWidth: 350 }).columnWidth).toBe(350);
	});
});

describe("Flow direction configuration", () => {
	it.each([
		[{ columns: ["Todo", "In Progress", "Done"] }, FlowDirection.LeftToRight],
		[{ ...defaultSettings, flowDirection: "ltr" }, FlowDirection.LeftToRight],
		[{ ...defaultSettings, flowDirection: "rtl" }, FlowDirection.RightToLeft],
		[{ ...defaultSettings, flowDirection: "ttb" }, FlowDirection.TopToBottom],
		[{ ...defaultSettings, flowDirection: "btt" }, FlowDirection.BottomToTop],
	])("parses flow direction from %o", (settingsJson, expectedDirection) => {
		expect(parseSettingsString(JSON.stringify(settingsJson)).flowDirection).toBe(expectedDirection);
	});

	it("rejects invalid flow direction values without losing other settings", () => {
		const customColumns = migrateColumnDefinitions(["Alpha", "Beta"]);
		const parsed = parseSettings({
			...defaultSettings,
			columns: customColumns,
			flowDirection: "invalid",
		});
		expect(parsed.flowDirection).toBe(FlowDirection.LeftToRight);
		expect(parsed.columns.map((column) => column.label)).toEqual(["Alpha", "Beta"]);
	});

	it("serializes flowDirection correctly", () => {
		expect(serializeSettings({ flowDirection: FlowDirection.RightToLeft }).flowDirection).toBe("rtl");
	});

	it("roundtrips flowDirection through serialization", () => {
		expect(roundtripSettings({ flowDirection: FlowDirection.TopToBottom }).flowDirection).toBe(FlowDirection.TopToBottom);
	});
});

describe("Default task file configuration", () => {
	it.each([
		[{ columns: ["Todo", "In Progress", "Done"] }, ""],
		[{ ...defaultSettings, defaultTaskFile: "notes/tasks.md" }, "notes/tasks.md"],
	])("parses defaultTaskFile from %o", (settingsJson, expected) => {
		expect(parseSettingsString(JSON.stringify(settingsJson)).defaultTaskFile).toBe(expected);
	});

	it("roundtrips defaultTaskFile through serialization", () => {
		expect(roundtripSettings({ defaultTaskFile: "folder/subfolder/tasks.md" }).defaultTaskFile).toBe("folder/subfolder/tasks.md");
	});
});

describe("Last-used task file configuration", () => {
	it.each([
		[{ columns: ["Todo", "In Progress", "Done"] }, ""],
		[{ ...defaultSettings, lastUsedTaskFile: "notes/tasks.md" }, "notes/tasks.md"],
	])("parses lastUsedTaskFile from %o", (settingsJson, expected) => {
		expect(parseSettingsString(JSON.stringify(settingsJson)).lastUsedTaskFile).toBe(expected);
	});

	it("roundtrips lastUsedTaskFile through serialization", () => {
		expect(roundtripSettings({ lastUsedTaskFile: "folder/subfolder/tasks.md" }).lastUsedTaskFile).toBe("folder/subfolder/tasks.md");
	});

	it("preserves both defaultTaskFile and lastUsedTaskFile independently", () => {
		const parsed = parseSettings({
			...defaultSettings,
			defaultTaskFile: "default.md",
			lastUsedTaskFile: "recent.md",
		});
		expect(parsed.defaultTaskFile).toBe("default.md");
		expect(parsed.lastUsedTaskFile).toBe("recent.md");
	});
});

describe("Default column name configuration", () => {
	it.each([
		[{ columns: ["Todo", "In Progress", "Done"] }, "uncategorizedColumnName", "Uncategorized"],
		[{ columns: ["Todo", "In Progress", "Done"] }, "doneColumnName", "Done"],
		[{ ...defaultSettings, uncategorizedColumnName: "Backlog" }, "uncategorizedColumnName", "Backlog"],
		[{ ...defaultSettings, doneColumnName: "Complete" }, "doneColumnName", "Complete"],
		[{ ...defaultSettings, uncategorizedColumnName: "", doneColumnName: "" }, "uncategorizedColumnName", ""],
		[{ ...defaultSettings, uncategorizedColumnName: "", doneColumnName: "" }, "doneColumnName", ""],
	])("parses column names from %o", (settingsJson, key, expected) => {
		expect(parseSettingsString(JSON.stringify(settingsJson))[key as "uncategorizedColumnName" | "doneColumnName"]).toBe(expected);
	});

	it("roundtrips custom column names through serialization", () => {
		const parsed = roundtripSettings({
			uncategorizedColumnName: "Inbox",
			doneColumnName: "Finished",
		});
		expect(parsed.uncategorizedColumnName).toBe("Inbox");
		expect(parsed.doneColumnName).toBe("Finished");
	});
});

describe("Collapsed columns configuration", () => {
	it.each([
		[{ columns: ["Todo", "In Progress", "Done"] }, []],
		[{ ...defaultSettings, collapsedColumns: [] }, []],
	])("defaults collapsed columns from %o", (settingsJson, expected) => {
		expect(parseSettingsString(JSON.stringify(settingsJson)).collapsedColumns).toEqual(expected);
	});

	it("parses collapsedColumns array", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Waiting"]);
		const parsed = parseSettings({
			...defaultSettings,
			columns,
			collapsedColumns: ["backlog", "waiting"],
		});
		expect(parsed.collapsedColumns).toEqual(columns.map((column) => column.id));
	});

	it("serializes collapsedColumns correctly", () => {
		expect(serializeSettings({ collapsedColumns: ["today", "in-progress"] }).collapsedColumns).toEqual(["today", "in-progress"]);
	});

	it("roundtrips collapsedColumns through serialization", () => {
		const collapsedColumns = defaultSettings.columns
			.filter((column) => ["Later", "Today"].includes(column.label))
			.map((column) => column.id);
		expect(roundtripSettings({ collapsedColumns }).collapsedColumns).toEqual(collapsedColumns);
	});
});
