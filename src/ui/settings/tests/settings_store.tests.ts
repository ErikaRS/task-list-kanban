import { describe, expect, it } from "vitest";
import {
	parseSettingsString,
	toSettingsString,
	defaultSettings,
	FlowDirection,
	ScopeOption,
	ColumnOrderMode,
	type SavedFilter,
} from "../settings_store";
import { migrateColumnDefinitions } from "../../columns/definitions";

describe("Settings dirty check", () => {
	it("detects no changes as clean", () => {
		const original = { ...defaultSettings };
		const current = { ...defaultSettings };
		expect(JSON.stringify(current)).toBe(JSON.stringify(original));
	});

	it("detects column change as dirty", () => {
		const original = { ...defaultSettings };
		const current = { ...defaultSettings, columns: migrateColumnDefinitions(["A", "B"]) };
		expect(JSON.stringify(current)).not.toBe(JSON.stringify(original));
	});

	it("detects nested array change as dirty", () => {
		const original = { ...defaultSettings };
		const current = { ...defaultSettings, scopeFolders: ["projects/"] };
		expect(JSON.stringify(current)).not.toBe(JSON.stringify(original));
	});

	it("detects reversion to original as clean", () => {
		const snapshot = JSON.stringify(defaultSettings);
		const current = { ...defaultSettings, columnWidth: 500 };
		// Dirty after change
		expect(JSON.stringify(current)).not.toBe(snapshot);
		// Clean after revert
		current.columnWidth = 300;
		expect(JSON.stringify(current)).toBe(snapshot);
	});
});

describe("Invalid field resilience", () => {
	it("recovers from unrecognized scope value without losing columns", () => {
		const settingsJson = JSON.stringify({
			columns: ["ProjectA", "ProjectB"],
			scope: "file",
			showFilepath: false,
		});

		const parsed = parseSettingsString(settingsJson);
		expect(parsed.scope).toBe(ScopeOption.Folder);
		expect(parsed.columns.map(c => c.label)).toEqual(["ProjectA", "ProjectB"]);
		expect(parsed.showFilepath).toBe(false);
	});

	it("recovers from unrecognized scope value with structured columns", () => {
		const settingsJson = JSON.stringify({
			columns: [
				{ id: "col-a", label: "Alpha", matchMode: "name", matchTags: [] },
				{ id: "col-b", label: "Beta", color: "#FF0000", matchMode: "tags", matchTags: ["status/active"] },
			],
			scope: "nonexistent",
		});

		const parsed = parseSettingsString(settingsJson);
		expect(parsed.scope).toBe(ScopeOption.Folder);
		expect(parsed.columns).toHaveLength(2);
		expect(parsed.columns[0]!.label).toBe("Alpha");
		expect(parsed.columns[1]!.color).toBe("#FF0000");
		expect(parsed.columns[1]!.matchTags).toEqual(["status/active"]);
	});

	it("recovers from invalid columnWidth without losing other settings", () => {
		const settingsJson = JSON.stringify({
			columns: ["MyColumn"],
			scope: "folder",
			columnWidth: 9999,
		});

		const parsed = parseSettingsString(settingsJson);
		expect(parsed.columnWidth).toBe(300);
		expect(parsed.columns.map(c => c.label)).toEqual(["MyColumn"]);
	});

	it("columnOrderMode defaults to 'file' when absent from parsed JSON", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo"],
			scope: "folder",
		});

		const parsed = parseSettingsString(settingsJson);
		expect(parsed.columnOrderMode).toBe(ColumnOrderMode.File);
	});

	it("columnOrderMode 'manual' round-trips through parse/stringify/parse", () => {
		const settings = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Manual,
		};

		const serialized = toSettingsString(settings);
		const parsed = parseSettingsString(serialized);

		expect(parsed.columnOrderMode).toBe(ColumnOrderMode.Manual);
	});

	it("columnOrderMode falls back to 'file' on invalid value", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo"],
			scope: "folder",
			columnOrderMode: "invalid_order_mode",
		});

		const parsed = parseSettingsString(settingsJson);
		expect(parsed.columnOrderMode).toBe(ColumnOrderMode.File);
	});
});

describe("SavedFilter persistence", () => {
	it("parses settings with savedFilters array", () => {
		const savedFilters: SavedFilter[] = [
			{
				id: "test-id-1",
				content: { text: "frontend" },
			},
			{
				id: "test-id-2",
				tag: { tags: ["bug", "urgent"] },
			},
		];

		const settingsJson = JSON.stringify({
			...defaultSettings,
			savedFilters,
		});

		const parsed = parseSettingsString(settingsJson);

		expect(parsed.savedFilters).toHaveLength(2);
		expect(parsed.savedFilters?.[0]?.content?.text).toBe("frontend");
		expect(parsed.savedFilters?.[1]?.tag?.tags).toEqual(["bug", "urgent"]);
	});

	it("serializes settings with savedFilters", () => {
		const savedFilters: SavedFilter[] = [
			{
				id: "test-id",
				content: { text: "test filter" },
			},
		];

		const settings = {
			...defaultSettings,
			savedFilters,
		};

		const serialized = toSettingsString(settings);
		const parsed = JSON.parse(serialized);

		expect(parsed.savedFilters).toHaveLength(1);
		expect(parsed.savedFilters[0].content.text).toBe("test filter");
	});

	it("handles empty savedFilters array", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			savedFilters: [],
		});

		const parsed = parseSettingsString(settingsJson);

		expect(parsed.savedFilters).toEqual([]);
	});

	it("defaults to empty array when savedFilters is missing", () => {
		const settingsJson = JSON.stringify(defaultSettings);
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.savedFilters).toEqual([]);
	});

	it("handles filter with both content and tag", () => {
		const filter: SavedFilter = {
			id: "combo-id",
			content: { text: "search term" },
			tag: { tags: ["frontend", "bug"] },
		};

		const settingsJson = JSON.stringify({
			...defaultSettings,
			savedFilters: [filter],
		});

		const parsed = parseSettingsString(settingsJson);

		expect(parsed.savedFilters?.[0]?.content?.text).toBe("search term");
		expect(parsed.savedFilters?.[0]?.tag?.tags).toEqual(["frontend", "bug"]);
	});

	it("parses settings with lastContentFilter", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			lastContentFilter: "test search",
		});

		const parsed = parseSettingsString(settingsJson);

		expect(parsed.lastContentFilter).toBe("test search");
	});

	it("parses settings with lastTagFilter", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			lastTagFilter: ["frontend", "bug"],
		});

		const parsed = parseSettingsString(settingsJson);

		expect(parsed.lastTagFilter).toEqual(["frontend", "bug"]);
	});

	it("serializes settings with last filter values", () => {
		const settings = {
			...defaultSettings,
			lastContentFilter: "search term",
			lastTagFilter: ["tag1", "tag2"],
		};

		const serialized = toSettingsString(settings);
		const parsed = JSON.parse(serialized);

		expect(parsed.lastContentFilter).toBe("search term");
		expect(parsed.lastTagFilter).toEqual(["tag1", "tag2"]);
	});

	it("handles missing last filter values", () => {
		const settingsJson = JSON.stringify(defaultSettings);
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.lastContentFilter).toBe("");
		expect(parsed.lastTagFilter).toEqual([]);
	});
});

describe("Column width configuration", () => {
	it("defaults to 300px when columnWidth is missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.columnWidth).toBe(300);
	});

	it("parses valid columnWidth values", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columnWidth: 400,
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.columnWidth).toBe(400);
	});

	it("accepts minimum boundary value (200)", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columnWidth: 200,
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.columnWidth).toBe(200);
	});

	it("accepts maximum boundary value (600)", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columnWidth: 600,
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.columnWidth).toBe(600);
	});

	it("rejects values below minimum (199)", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columnWidth: 199,
		});

		// Invalid columnWidth falls back to default without affecting other fields
		expect(() => parseSettingsString(settingsJson)).not.toThrow();
		const parsed = parseSettingsString(settingsJson);
		expect(parsed.columnWidth).toBe(300); // Falls back to default
	});

	it("rejects values above maximum (601)", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columnWidth: 601,
		});

		// Invalid columnWidth falls back to default without affecting other fields
		expect(() => parseSettingsString(settingsJson)).not.toThrow();
		const parsed = parseSettingsString(settingsJson);
		expect(parsed.columnWidth).toBe(300); // Falls back to default
	});

	it("serializes columnWidth correctly", () => {
		const settings = {
			...defaultSettings,
			columnWidth: 450,
		};

		const serialized = toSettingsString(settings);
		const parsed = JSON.parse(serialized);

		expect(parsed.columnWidth).toBe(450);
	});

	it("roundtrips columnWidth through serialization", () => {
		const original = {
			...defaultSettings,
			columnWidth: 350,
		};

		const serialized = toSettingsString(original);
		const parsed = parseSettingsString(serialized);

		expect(parsed.columnWidth).toBe(350);
	});
});

describe("Flow direction configuration", () => {
	it("defaults to 'ltr' when flowDirection is missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.flowDirection).toBe(FlowDirection.LeftToRight);
	});

	it("parses 'ltr' flow direction", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			flowDirection: "ltr",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.flowDirection).toBe(FlowDirection.LeftToRight);
	});

	it("parses 'rtl' flow direction", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			flowDirection: "rtl",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.flowDirection).toBe(FlowDirection.RightToLeft);
	});

	it("parses 'ttb' flow direction", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			flowDirection: "ttb",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.flowDirection).toBe(FlowDirection.TopToBottom);
	});

	it("parses 'btt' flow direction", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			flowDirection: "btt",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.flowDirection).toBe(FlowDirection.BottomToTop);
	});

	it("rejects invalid flow direction values without losing other settings", () => {
		const customColumns = migrateColumnDefinitions(["Alpha", "Beta"]);
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columns: customColumns,
			flowDirection: "invalid",
		});

		// Invalid flowDirection falls back to default without affecting other fields
		expect(() => parseSettingsString(settingsJson)).not.toThrow();
		const parsed = parseSettingsString(settingsJson);
		expect(parsed.flowDirection).toBe(FlowDirection.LeftToRight);
		expect(parsed.columns.map(c => c.label)).toEqual(["Alpha", "Beta"]);
	});

	it("serializes flowDirection correctly", () => {
		const settings = {
			...defaultSettings,
			flowDirection: FlowDirection.RightToLeft,
		};

		const serialized = toSettingsString(settings);
		const parsed = JSON.parse(serialized);

		expect(parsed.flowDirection).toBe("rtl");
	});

	it("roundtrips flowDirection through serialization", () => {
		const original = {
			...defaultSettings,
			flowDirection: FlowDirection.TopToBottom,
		};

		const serialized = toSettingsString(original);
		const parsed = parseSettingsString(serialized);

		expect(parsed.flowDirection).toBe(FlowDirection.TopToBottom);
	});
});

describe("Default task file configuration", () => {
	it("defaults to empty string when defaultTaskFile is missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.defaultTaskFile).toBe("");
	});

	it("parses defaultTaskFile string", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			defaultTaskFile: "notes/tasks.md",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.defaultTaskFile).toBe("notes/tasks.md");
	});

	it("roundtrips defaultTaskFile through serialization", () => {
		const original = {
			...defaultSettings,
			defaultTaskFile: "folder/subfolder/tasks.md",
		};

		const serialized = toSettingsString(original);
		const parsed = parseSettingsString(serialized);

		expect(parsed.defaultTaskFile).toBe("folder/subfolder/tasks.md");
	});
});

describe("Last-used task file configuration", () => {
	it("defaults to empty string when lastUsedTaskFile is missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.lastUsedTaskFile).toBe("");
	});

	it("parses lastUsedTaskFile string", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			lastUsedTaskFile: "notes/tasks.md",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.lastUsedTaskFile).toBe("notes/tasks.md");
	});

	it("roundtrips lastUsedTaskFile through serialization", () => {
		const original = {
			...defaultSettings,
			lastUsedTaskFile: "folder/subfolder/tasks.md",
		};

		const serialized = toSettingsString(original);
		const parsed = parseSettingsString(serialized);

		expect(parsed.lastUsedTaskFile).toBe("folder/subfolder/tasks.md");
	});

	it("preserves both defaultTaskFile and lastUsedTaskFile independently", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			defaultTaskFile: "default.md",
			lastUsedTaskFile: "recent.md",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.defaultTaskFile).toBe("default.md");
		expect(parsed.lastUsedTaskFile).toBe("recent.md");
	});
});

describe("Default column name configuration", () => {
	it("defaults uncategorizedColumnName to 'Uncategorized' when missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.uncategorizedColumnName).toBe("Uncategorized");
	});

	it("defaults doneColumnName to 'Done' when missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.doneColumnName).toBe("Done");
	});

	it("parses custom uncategorizedColumnName", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			uncategorizedColumnName: "Backlog",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.uncategorizedColumnName).toBe("Backlog");
	});

	it("parses custom doneColumnName", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			doneColumnName: "Complete",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.doneColumnName).toBe("Complete");
	});

	it("roundtrips custom column names through serialization", () => {
		const original = {
			...defaultSettings,
			uncategorizedColumnName: "Inbox",
			doneColumnName: "Finished",
		};

		const serialized = toSettingsString(original);
		const parsed = parseSettingsString(serialized);

		expect(parsed.uncategorizedColumnName).toBe("Inbox");
		expect(parsed.doneColumnName).toBe("Finished");
	});

	it("preserves empty string for column names", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			uncategorizedColumnName: "",
			doneColumnName: "",
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.uncategorizedColumnName).toBe("");
		expect(parsed.doneColumnName).toBe("");
	});
});

describe("Collapsed columns configuration", () => {
	it("defaults to empty array when collapsedColumns is missing", () => {
		const settingsJson = JSON.stringify({
			columns: ["Todo", "In Progress", "Done"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.collapsedColumns).toEqual([]);
	});

	it("parses collapsedColumns array", () => {
		const columns = migrateColumnDefinitions(["Backlog", "Waiting"]);
		const settingsJson = JSON.stringify({
			...defaultSettings,
			columns,
			collapsedColumns: ["backlog", "waiting"],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.collapsedColumns).toEqual(columns.map((column) => column.id));
	});

	it("parses empty collapsedColumns array", () => {
		const settingsJson = JSON.stringify({
			...defaultSettings,
			collapsedColumns: [],
		});
		const parsed = parseSettingsString(settingsJson);

		expect(parsed.collapsedColumns).toEqual([]);
	});

	it("serializes collapsedColumns correctly", () => {
		const settings = {
			...defaultSettings,
			collapsedColumns: ["today", "in-progress"],
		};

		const serialized = toSettingsString(settings);
		const parsed = JSON.parse(serialized);

		expect(parsed.collapsedColumns).toEqual(["today", "in-progress"]);
	});

	it("roundtrips collapsedColumns through serialization", () => {
		const collapsedColumns = defaultSettings.columns
			.filter((column) => ["Later", "Today"].includes(column.label))
			.map((column) => column.id);
		const original = {
			...defaultSettings,
			collapsedColumns,
		};

		const serialized = toSettingsString(original);
		const parsed = parseSettingsString(serialized);

		expect(parsed.collapsedColumns).toEqual(collapsedColumns);
	});
});
