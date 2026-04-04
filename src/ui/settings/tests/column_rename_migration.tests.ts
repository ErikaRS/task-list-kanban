import { describe, expect, it } from "vitest";
import { applyRenamedColumnTagUpdates, getRenamedNameModeColumns } from "../column_rename_migration";
import { defaultSettings, ScopeOption, type SettingValues } from "../settings_store";
import { migrateColumnDefinitions } from "../../columns/definitions";

describe("getRenamedNameModeColumns", () => {
	it("detects renamed name-mode columns by stable id", () => {
		const oldColumns = migrateColumnDefinitions(["Backlog", "Doing"]);
		const newColumns = oldColumns.map((column) =>
			column.label === "Doing" ? { ...column, label: "In Progress" } : column,
		);

		const renamed = getRenamedNameModeColumns(
			{ ...defaultSettings, columns: oldColumns },
			{ ...defaultSettings, columns: newColumns },
		);

		expect(renamed).toHaveLength(1);
		expect(renamed[0]?.oldColumn.label).toBe("Doing");
		expect(renamed[0]?.newColumn.label).toBe("In Progress");
	});
});

describe("applyRenamedColumnTagUpdates", () => {
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

		await applyRenamedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			renameChoices: { [newColumns[1]!.id]: true },
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

		await applyRenamedColumnTagUpdates({
			vault: vault as never,
			oldSettings: { ...defaultSettings, columns: oldColumns },
			newSettings: { ...defaultSettings, columns: newColumns },
			boardFolderPath: "projects",
			renameChoices: { [newColumns[1]!.id]: false },
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

		await applyRenamedColumnTagUpdates({
			vault: vault as never,
			oldSettings,
			newSettings,
			boardFolderPath: "projects",
			renameChoices: { [newColumns[0]!.id]: true },
		});

		expect(files.get(inScopeFile.path)).toBe("- [ ] Scoped #in-progress");
		expect(files.get(outOfScopeFile.path)).toBe("- [ ] Archived #doing");
	});
});
