import { afterEach, expect, it, vi } from "vitest";
import moment from "moment";
import { type App, TFile } from "obsidian";
import { openCreateCardModal } from "../create_card_modal";
import {
	parseKanbanSettingsOverridesFromViewData,
	writeKanbanSettingsToViewData,
} from "../../kanban_frontmatter";
import { createPathScope, type PathScopeV2 } from "../path_scope";
import { ScopeOption, type SettingValues } from "../../settings/settings_store";

// Exercise the command's submission wiring without mocking its insertion,
// scope, template or settings helpers. The host modal does not render in Node.
interface ModalDriver {
	textAreaEl: HTMLTextAreaElement;
	submit(): Promise<void>;
	close: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted(() => ({ modal: null as ModalDriver | null }));
vi.mock("obsidian", () => ({
	moment,
	App: class {},
	Modal: class {
		constructor(public app: App) {}
		open() { state.modal = this as unknown as ModalDriver; }
		close = vi.fn();
	},
	Notice: class {},
	Setting: class {},
	TFile: class {},
}));

const BOARD_PATH = "boards/Board.md";
const TODAY_PATH = "daily/2026-11-01.md";
const TEMPLATE = "## Tasks\n- [ ] Existing task\n\n## Notes\n";
const INSERTED = "## Tasks\n- [ ] Review task\n- [ ] Existing task\n\n## Notes\n";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function setup({
	settings = {},
	pathScope,
	existingDailyNote = false,
}: {
	settings?: Partial<SettingValues>;
	pathScope?: PathScopeV2;
	existingDailyNote?: boolean;
} = {}) {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(2026, 10, 1, 23, 59));
	const files = new Map<string, TFile>();
	const contents = new Map<string, string>();
	const folders = new Set<string>();
	const addFile = (path: string, data: string) => {
		const file = Object.assign(new TFile(), { path, parent: { path: "boards" } });
		files.set(path, file);
		contents.set(path, data);
		return file;
	};
	addFile(BOARD_PATH, writeKanbanSettingsToViewData("# Board\n", {
		scope: ScopeOption.Everywhere,
		columns: [],
		defaultTaskFile: "$DAILY_NOTE",
		dailyNotePath: "daily/{{YYYY-MM-DD}}.md",
		newTaskHeading: "Tasks",
		newTaskPosition: "top",
		...settings,
	}, pathScope));
	addFile("Templates/Daily.md", TEMPLATE);
	if (existingDailyNote) addFile(TODAY_PATH, TEMPLATE);
	const vault = {
		getAbstractFileByPath: (path: string) => files.get(path) ?? (folders.has(path) ? { path } : null),
		getMarkdownFiles: () => [...files.values()],
		cachedRead: async (file: TFile) => contents.get(file.path)!,
		read: async (file: TFile) => contents.get(file.path)!,
		createFolder: async (path: string) => { folders.add(path); },
		create: vi.fn(async (path: string, data: string) => addFile(path, data)),
		modify: vi.fn(async (file: TFile, data: string) => { contents.set(file.path, data); }),
	};
	const app = {
		vault,
		internalPlugins: { getPluginById: () => ({
			enabled: true,
			instance: { options: { template: "Templates/Daily", folder: "daily", format: "YYYY-MM-DD" } },
		}) },
	} as unknown as App;
	await openCreateCardModal(app, [{ path: BOARD_PATH, name: "Board", folder: "boards" }],
		{ version: 1, boardDefaults: {} });
	const modal = state.modal!;
	modal.textAreaEl = { value: "Review task" } as HTMLTextAreaElement;
	return { vault, contents, modal, addFile };
}

it("creates a daily note with the task at the configured position in its initial write", async () => {
	const { vault, contents, modal } = await setup();
	await modal.submit();
	expect(vault.create).toHaveBeenCalledExactlyOnceWith(TODAY_PATH, INSERTED);
	expect(vault.modify.mock.calls.map(([file]) => file.path)).toEqual([BOARD_PATH]);
	expect(contents.get(TODAY_PATH)).toBe(INSERTED);
	expect(parseKanbanSettingsOverridesFromViewData(contents.get(BOARD_PATH)!).lastUsedTaskFile).toBe("$DAILY_NOTE");
	expect(modal.close).toHaveBeenCalledOnce();
});

it("uses insertion settings when the daily note already exists", async () => {
	const { vault, contents, modal } = await setup({ existingDailyNote: true });
	await modal.submit();
	expect(vault.create).not.toHaveBeenCalled();
	expect(contents.get(TODAY_PATH)).toBe(INSERTED);
});

it("inserts once into a note created by another writer", async () => {
	const { vault, contents, modal, addFile } = await setup();
	vault.create.mockImplementationOnce(async (path) => {
		addFile(path, TEMPLATE);
		throw new Error("File already exists.");
	});
	await modal.submit();
	expect(contents.get(TODAY_PATH)).toBe(INSERTED);
	expect(modal.close).toHaveBeenCalledOnce();
});

it("preserves board settings when inserting into the board file itself", async () => {
	const { vault, contents, modal } = await setup({ settings: { defaultTaskFile: BOARD_PATH } });
	await modal.submit();
	expect(vault.modify).toHaveBeenCalledOnce();
	const board = contents.get(BOARD_PATH)!;
	expect(board).toContain("## Tasks\n- [ ] Review task\n\n# Board\n");
	expect(parseKanbanSettingsOverridesFromViewData(board)).toMatchObject({
		defaultTaskFile: BOARD_PATH,
		lastUsedTaskFile: BOARD_PATH,
		newTaskHeading: "Tasks",
		newTaskPosition: "top",
	});
});

it("resolves the daily note and dated selected-path scope together after midnight", async () => {
	const { vault, contents, modal } = await setup({
		pathScope: createPathScope(["daily/{{YYYY-MM-DD}}.md"])!,
	});
	vi.setSystemTime(new Date(2026, 10, 2, 0, 1));
	await modal.submit();
	expect(vault.create).toHaveBeenCalledExactlyOnceWith("daily/2026-11-02.md", INSERTED);
	expect(contents.has(TODAY_PATH)).toBe(false);
	expect(modal.close).toHaveBeenCalledOnce();
});

it("does not create tomorrow's note when only today's literal path is in scope", async () => {
	const { vault, modal } = await setup({ pathScope: createPathScope([TODAY_PATH])! });
	vi.setSystemTime(new Date(2026, 10, 2, 0, 1));
	await modal.submit();
	expect(vault.create).not.toHaveBeenCalled();
	expect(vault.modify).not.toHaveBeenCalled();
	expect(modal.close).not.toHaveBeenCalled();
	expect(modal.textAreaEl.value).toBe("Review task");
});

it("keeps the draft when note creation fails", async () => {
	const { vault, contents, modal } = await setup();
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vault.create.mockRejectedValueOnce(new Error("Disk full"));
	await modal.submit();
	expect(contents.has(TODAY_PATH)).toBe(false);
	expect(vault.modify).not.toHaveBeenCalled();
	expect(modal.close).not.toHaveBeenCalled();
	expect(modal.textAreaEl.value).toBe("Review task");
});
