import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { createBoardSnapshotCache, type BoardSnapshotHost } from "../../boards/board_snapshot";
import { defaultGlobalSettings } from "../../settings/global_settings";
import type { SettingValues } from "../../settings/settings_store";
import {
	createEmbeddedBoardController,
	EMBED_REFRESH_DEBOUNCE_MS,
	type EmbedState,
} from "../embedded_board_controller";

function makeFile(path: string, mtime: number): TFile {
	const lastSlash = path.lastIndexOf("/");
	return {
		path,
		basename: path.slice(lastSlash + 1).replace(/\.md$/, ""),
		stat: { ctime: mtime, mtime, size: 0 },
		parent: { path: lastSlash === -1 ? "/" : path.slice(0, lastSlash) },
	} as unknown as TFile;
}

function harness(specs: Array<{ path: string; content?: string; board?: Partial<SettingValues> }>) {
	const files = new Map(specs.map((spec) => [spec.path, {
		file: makeFile(spec.path, 1),
		content: spec.content ?? "",
		payload: spec.board ? JSON.stringify(spec.board) : undefined,
	}]));
	const cachedRead = vi.fn(async (file: TFile) => files.get(file.path)?.content ?? "");
	const snapshotHost: BoardSnapshotHost = {
		getMarkdownFiles: () => [...files.values()].map((entry) => entry.file),
		cachedRead,
		getBoardSettingsPayload: (file) => files.get(file.path)?.payload ?? "",
		getGlobalSettings: () => defaultGlobalSettings,
	};
	const states: EmbedState[] = [];
	function mount(source: string, sourcePath = "notes/Embed.md") {
		const controller = createEmbeddedBoardController({
			source,
			sourcePath,
			host: {
				snapshots: createBoardSnapshotCache(snapshotHost),
				resolveBoardFile: (reference) => files.get(reference)?.file
					?? [...files.values()].find((entry) => entry.file.basename === reference)?.file
					?? null,
				isBoardFile: (path) => files.get(path)?.payload !== undefined,
				getGlobalViews: () => [],
				now: () => new Date(2026, 10, 23, 9),
			},
			timers: {
				setTimeout: (callback, delay) => setTimeout(callback, delay) as unknown as number,
				clearTimeout: (id) => clearTimeout(id),
			},
			onState: (state) => states.push(state),
		});
		controller.start();
		return controller;
	}
	return {
		mount,
		states,
		cachedRead,
		last: () => states.at(-1)!,
		edit(path: string, content: string) {
			const entry = files.get(path)!;
			entry.content = content;
			entry.file = makeFile(path, entry.file.stat.mtime + 1);
		},
	};
}

function cellTasks(state: EmbedState, columnId: string): string[] {
	if (state.kind !== "ready") throw new Error(`expected ready, got ${state.kind}`);
	return Object.values(state.presentation.matrix.cells[columnId] ?? {})
		.flatMap((cell) => cell.tasks.map((task) => task.content.trim()));
}

// Settles the async load without firing the debounce or midnight timers.
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const board = {
	path: "boards/Work.md",
	board: { columns: ["Todo", "Doing"] as never, lastFilter: "#urgent" },
};

describe("createEmbeddedBoardController", () => {
	it("renders the board's persisted filter, or the block's filter instead", async () => {
		const h = harness([
			board,
			{ path: "boards/tasks.md", content: "- [ ] Ship #todo #urgent\n- [ ] Plan #doing #later" },
		]);
		h.mount("board: Work");
		await flush();
		expect(cellTasks(h.last(), "column-todo")).toEqual(["Ship #urgent"]);
		expect(cellTasks(h.last(), "column-doing")).toEqual([]);
		expect(h.last()).toMatchObject({ kind: "ready", boardName: "Work" });

		h.mount("board: boards/Work.md\nfilter: #later");
		await flush();
		expect(cellTasks(h.last(), "column-doing")).toEqual(["Plan #later"]);
		expect(h.last()).toMatchObject({ overrideLabel: "Filter: #later" });
	});

	it("refreshes for changes in the board's scope and ignores the rest", async () => {
		const h = harness([
			board,
			{ path: "boards/tasks.md", content: "- [ ] Ship #todo #urgent" },
			{ path: "elsewhere/other.md", content: "- [ ] Not in scope #urgent" },
		]);
		const controller = h.mount("board: Work");
		await flush();
		const readyStates = () => h.states.filter((state) => state.kind === "ready").length;
		expect(readyStates()).toBe(1);

		h.edit("elsewhere/other.md", "- [ ] Still not in scope #urgent");
		controller.notifyFileChanged("elsewhere/other.md");
		await vi.advanceTimersByTimeAsync(EMBED_REFRESH_DEBOUNCE_MS);
		expect(readyStates()).toBe(1);

		h.edit("boards/tasks.md", "- [ ] Ship #todo #urgent\n- [ ] Fix #todo #urgent");
		controller.notifyFileChanged("boards/tasks.md");
		controller.notifyFileChanged("boards/tasks.md");
		await vi.advanceTimersByTimeAsync(EMBED_REFRESH_DEBOUNCE_MS);
		expect(readyStates()).toBe(2);
		expect(cellTasks(h.last(), "column-todo")).toEqual(["Ship #urgent", "Fix #urgent"]);
	});

	it("explains blocks it can't render", async () => {
		const h = harness([board, { path: "notes/Plain.md" }]);
		const titles: Record<string, string> = {};
		for (const [source, sourcePath] of [
			["board: Missing", undefined],
			["board: notes/Plain.md", undefined],
			["board: Work", "boards/Work.md"],
			["board: Work\nview: Nope", undefined],
			["board: Work\nfilter: (a OR", undefined],
			["height: 10", undefined],
		] as const) {
			const controller = h.mount(source, sourcePath);
			await flush();
			controller.stop();
			const state = h.last();
			titles[source] = state.kind === "error" ? state.title : state.kind;
		}
		expect(titles).toEqual({
			"board: Missing": "Board not found: Missing",
			"board: notes/Plain.md": "Not a kanban board: notes/Plain.md",
			"board: Work": "A board can't embed itself.",
			"board: Work\nview: Nope": 'No saved view named "Nope" on this board or in global views.',
			"board: Work\nfilter: (a OR": "Filter: Close the OR group with ).",
			"height: 10": "This task-list-kanban block has errors.",
		});
	});
});
