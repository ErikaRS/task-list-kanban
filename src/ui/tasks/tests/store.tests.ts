import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable, type Writable } from "svelte/store";
import { TFile } from "obsidian";
import { createTasksStore } from "../store";
import { defaultSettings, type SettingValues } from "../../settings/settings_store";
import type { ColumnDefinition, ColumnPlacementTagTable } from "../../columns/columns";

vi.mock("obsidian", () => {
	class TFile {
		path: string;
		constructor(path: string) {
			this.path = path;
		}
	}

	return {
		TFile,
	};
});

const columns: ColumnDefinition[] = [
	{ id: "todo" as never, label: "Todo", matchMode: "name", matchTags: [] },
];

const placementTags: ColumnPlacementTagTable = {
	todo: ["todo"],
} as never;

describe("createTasksStore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("window", {
			setTimeout: globalThis.setTimeout,
			clearTimeout: globalThis.clearTimeout,
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("reinitializes from the current vault files and publishes an empty scope immediately", async () => {
		const firstFile = createFile("first.md");
		const secondFile = createFile("second.md");
		const vault = createVault(
			[firstFile],
			new Map([
				["first.md", "- [ ] First #todo"],
				["second.md", "- [ ] Second #todo"],
			]),
		);
		let includeFilter: string[] | null = null;
		const { initialise, snapshots } = createStoreHarness(vault, () => includeFilter);

		initialise();
		await settleStoreUpdates();
		expect(snapshots.at(-1)?.map((task) => task.content)).toEqual(["First"]);

		vault.files = [firstFile, secondFile];
		initialise();
		await settleStoreUpdates();
		expect(snapshots.at(-1)?.map((task) => task.content)).toEqual(["First", "Second"]);

		includeFilter = [];
		initialise();
		expect(snapshots.at(-1)).toEqual([]);
	});

	it("publishes task removal after a tracked file is deleted", async () => {
		const file = createFile("tasks.md");
		const vault = createVault(
			[file],
			new Map([["tasks.md", "- [ ] Keep me fresh #todo"]]),
		);
		const { initialise, snapshots } = createStoreHarness(vault, () => null);

		initialise();
		await settleStoreUpdates();
		expect(snapshots.at(-1)?.map((task) => task.content)).toEqual(["Keep me fresh"]);

		vault.emit("delete", file);
		await settleStoreUpdates();
		expect(snapshots.at(-1)).toEqual([]);
	});
});

function createFile(path: string): TFile {
	return new (TFile as unknown as { new(path: string): TFile })(path);
}

function createStoreHarness(
	vault: ReturnType<typeof createVault>,
	getFilenameFilter: () => string[] | null,
) {
	const settingsStore: Writable<SettingValues> = writable({
		...defaultSettings,
		columns,
	});
	const { tasksStore, initialise } = createTasksStore(
		vault as never,
		{} as never,
		() => undefined,
		writable(columns),
		writable(placementTags),
		getFilenameFilter,
		() => null,
		() => null,
		settingsStore,
		() => undefined,
	);
	const snapshots: Array<Array<{ content: string }>> = [];
	tasksStore.subscribe((tasks) => {
		snapshots.push(tasks.map((task) => ({ content: task.content })));
	});

	return { initialise, snapshots };
}

function createVault(files: TFile[], contents: Map<string, string>) {
	let currentFiles = files;
	const handlers = new Map<string, Array<(file: TFile) => void>>();
	return {
		get files() {
			return currentFiles;
		},
		set files(next: TFile[]) {
			currentFiles = next;
		},
		getMarkdownFiles: vi.fn(() => currentFiles),
		read: vi.fn(async (file: TFile) => contents.get(file.path) ?? ""),
		on: vi.fn((eventName: string, handler: (file: TFile) => void) => {
			const eventHandlers = handlers.get(eventName) ?? [];
			eventHandlers.push(handler);
			handlers.set(eventName, eventHandlers);
			return {};
		}),
		emit(eventName: string, file: TFile) {
			for (const handler of handlers.get(eventName) ?? []) {
				handler(file);
			}
		},
	};
}

async function settleStoreUpdates() {
	await Promise.resolve();
	await vi.runOnlyPendingTimersAsync();
}
