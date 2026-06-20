import { describe, expect, it } from "vitest";
import { applyChangedColumnTagUpdates, getChangedColumnMatchRules } from "../column_rename_migration";
import type { ColumnTag } from "../../columns/columns";
import { defaultSettings, ScopeOption, type SettingValues } from "../settings_store";
import { migrateColumnDefinitions } from "../../columns/definitions";
import { PropertySchemaOption } from "../../../parsing/properties";

describe("getChangedColumnMatchRules", () => {
	it("detects renamed name-mode columns by stable id", () => {
		const oldColumns = migrateColumnDefinitions(["Backlog", "Doing"]);
		const newColumns = oldColumns.map((column) =>
			column.label === "Doing" ? { ...column, label: "In Progress" } : column,
		);

		const renamed = getChangedColumnMatchRules(
			{ ...defaultSettings, columns: oldColumns },
			{ ...defaultSettings, columns: newColumns },
		);

		expect(renamed).toHaveLength(1);
		expect(renamed[0]?.oldColumn.label).toBe("Doing");
		expect(renamed[0]?.newColumn.label).toBe("In Progress");
	});

	it("detects a switch to explicit tag matching", () => {
		const oldColumns = migrateColumnDefinitions(["Doing"]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchMode: "tags" as const,
			matchTags: ["status/now"],
		}));

		const changed = getChangedColumnMatchRules(
			{ ...defaultSettings, columns: oldColumns },
			{ ...defaultSettings, columns: newColumns },
		);

		expect(changed).toHaveLength(1);
		expect(changed[0]?.newColumn.matchTags).toEqual(["status/now"]);
	});
});

describe("applyChangedColumnTagUpdates", () => {
	it("retags tasks for renamed columns when enabled", async () => {
		const oldColumns = migrateColumnDefinitions(["Backlog", "Doing"]);
		const newColumns = oldColumns.map((column) =>
			column.label === "Doing" ? { ...column, label: "In Progress" } : column,
		);
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A #doing\n- [ ] Task B #backlog";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[1]!.id]: true },
		});

		expect(contents).toBe("- [ ] Task A #in-progress\n- [ ] Task B #backlog");
	});

	it("leaves tasks unchanged when the rename checkbox is off", async () => {
		const oldColumns = migrateColumnDefinitions(["Backlog", "Doing"]);
		const newColumns = oldColumns.map((column) =>
			column.label === "Doing" ? { ...column, label: "In Progress" } : column,
		);
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A #doing";
		let modifyCalls = 0;

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				modifyCalls += 1;
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[1]!.id]: false },
		});

		expect(contents).toBe("- [ ] Task A #doing");
		expect(modifyCalls).toBe(0);
	});

	it("uses the old scope when deciding which files to retag", async () => {
		const oldColumns = migrateColumnDefinitions(["Doing"]);
		const newColumns = oldColumns.map((column) => ({ ...column, label: "In Progress" }));
		const inScopeFile = { path: "projects/tasks.md" };
		const outOfScopeFile = { path: "archive/tasks.md" };
		const files = new Map<string, string>([
			[inScopeFile.path, "- [ ] Scoped #doing"],
			[outOfScopeFile.path, "- [ ] Archived #doing"],
		]);

		const vault = {
			getMarkdownFiles: () => [inScopeFile, outOfScopeFile],
			read: async (file: { path: string }) => files.get(file.path) ?? "",
			modify: async (file: { path: string }, nextContents: string) => {
				files.set(file.path, nextContents);
			},
		} as const;

		const oldSettings: SettingValues = {
			...defaultSettings,
			scope: ScopeOption.Folder,
			columns: oldColumns,
		};
		const newSettings: SettingValues = {
			...defaultSettings,
			scope: ScopeOption.Everywhere,
			columns: newColumns,
		};

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings,
			newSettings,
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(files.get(inScopeFile.path)).toBe("- [ ] Scoped #in-progress");
		expect(files.get(outOfScopeFile.path)).toBe("- [ ] Archived #doing");
	});

	it("replaces a derived tag with an explicit tag when enabled", async () => {
		const oldColumns = migrateColumnDefinitions(["Doing"]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchMode: "tags" as const,
			matchTags: ["status/now"],
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A #doing";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [ ] Task A #status/now");
	});

	it("replaces a derived tag with a status marker when enabled", async () => {
		const oldColumns = migrateColumnDefinitions(["Doing"]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchMode: "status" as const,
			matchTags: [],
			matchStatus: "/",
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A #doing #project";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [/] Task A #project");
	});

	it("replaces a status marker with a derived tag when enabled", async () => {
		const oldColumns = migrateColumnDefinitions([
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
		]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchMode: "name" as const,
			matchStatus: undefined,
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [/] Task A #project";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [ ] Task A #project #doing");
	});

	it("updates matching tasks when a status marker rule changes", async () => {
		const oldColumns = migrateColumnDefinitions([
			{ id: "doing" as ColumnTag, label: "Doing", matchMode: "status", matchTags: [], matchStatus: "/" },
		]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchStatus: "!",
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [/] Task A #project";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [!] Task A #project");
	});

	it("updates matching tasks when a Tasks priority rule changes", async () => {
		const oldColumns = migrateColumnDefinitions([
			{ id: "priority" as ColumnTag, label: "Priority", matchMode: "priority", matchTags: [], matchPriority: "high" },
		]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchPriority: "low",
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A ⏫ #project";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, propertySchema: PropertySchemaOption.TasksPlugin, columns: oldColumns },
			newSettings: { ...defaultSettings, propertySchema: PropertySchemaOption.TasksPlugin, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [ ] Task A #project 🔽");
	});

	it("updates matching tasks when a Dataview priority rule changes", async () => {
		const oldColumns = migrateColumnDefinitions([
			{
				id: "priority" as ColumnTag,
				label: "Priority",
				matchMode: "priority",
				matchTags: [],
				matchPriority: "High",
				matchPropertySchema: PropertySchemaOption.Dataview,
			},
		]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchPriority: "low",
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A [priority:: HIGH] #project";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, propertySchema: PropertySchemaOption.Dataview, columns: oldColumns },
			newSettings: { ...defaultSettings, propertySchema: PropertySchemaOption.Dataview, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [ ] Task A #project [priority:: low]");
	});

	it("updates a Tasks priority column while Dataview properties are active", async () => {
		const oldColumns = migrateColumnDefinitions([
			{
				id: "priority" as ColumnTag,
				label: "Priority",
				matchMode: "priority",
				matchTags: [],
				matchPriority: "highest",
				matchPropertySchema: PropertySchemaOption.TasksPlugin,
			},
		]);
		const newColumns = oldColumns.map((column) => ({
			...column,
			matchPriority: "high",
		}));
		const file = { path: "projects/tasks.md" };
		let contents = "- [ ] Task A 🔺 #later";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, propertySchema: PropertySchemaOption.Dataview, columns: oldColumns },
			newSettings: { ...defaultSettings, propertySchema: PropertySchemaOption.Dataview, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [ ] Task A #later ⏫");
	});

	it("retags completed tasks when a column rule changes", async () => {
		const oldColumns = migrateColumnDefinitions(["Doing"]);
		const newColumns = oldColumns.map((column) => ({ ...column, label: "In Progress" }));
		const file = { path: "projects/tasks.md" };
		let contents = "- [x] Task A #doing";

		const vault = {
			getMarkdownFiles: () => [file],
			read: async () => contents,
			modify: async (_file: unknown, nextContents: string) => {
				contents = nextContents;
			},
		} as const;

		await applyChangedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			updateChoices: { [newColumns[0]!.id]: true },
		});

		expect(contents).toBe("- [x] Task A");
	});
});
