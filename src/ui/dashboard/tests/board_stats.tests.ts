import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { createBoardStatsService } from "../board_stats";
import {
	defaultGlobalSettings,
	type GlobalSettings,
} from "../../settings/global_settings";
import { ScopeOption, type SettingValues } from "../../settings/settings_store";

interface HarnessFileSpec {
	path: string;
	content?: string;
	mtime?: number;
	/**
	 * Marks the file as a board; serialized as its `kanban_plugin` payload.
	 * A raw string stands in for hand-mangled frontmatter.
	 */
	boardSettings?: Partial<SettingValues> | string;
}

function makeFile(path: string, mtime: number): TFile {
	const lastSlash = path.lastIndexOf("/");
	return {
		path,
		basename: path.slice(lastSlash + 1).replace(/\.md$/, ""),
		stat: { ctime: mtime, mtime, size: 0 },
		// Obsidian reports the vault root's folder path as "/".
		parent: { path: lastSlash === -1 ? "/" : path.slice(0, lastSlash) },
	} as unknown as TFile;
}

// The pump is a pure microtask chain (the fake read resolves immediately),
// so one macrotask hop drains every queued board completely.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness(
	specs: HarnessFileSpec[],
	globalSettings: GlobalSettings = defaultGlobalSettings,
) {
	const filesByPath = new Map<
		string,
		{ file: TFile; content: string; payload: string | undefined }
	>();
	let currentGlobalSettings = globalSettings;

	function addFile(spec: HarnessFileSpec) {
		filesByPath.set(spec.path, {
			file: makeFile(spec.path, spec.mtime ?? 1_000),
			content: spec.content ?? "",
			payload:
				spec.boardSettings === undefined
					? undefined
					: typeof spec.boardSettings === "string"
						? spec.boardSettings
						: JSON.stringify(spec.boardSettings),
		});
	}

	for (const spec of specs) {
		addFile(spec);
	}

	const cachedRead = vi.fn(
		async (file: TFile) => filesByPath.get(file.path)?.content ?? "",
	);

	const service = createBoardStatsService({
		getMarkdownFiles: () => [...filesByPath.values()].map((entry) => entry.file),
		cachedRead,
		getBoardSettingsPayload: (file) => filesByPath.get(file.path)?.payload ?? "",
		getGlobalSettings: () => currentGlobalSettings,
	});

	return {
		service,
		cachedRead,
		counts: (path: string) => get(service.countsStore).get(path),
		async request(...paths: string[]) {
			service.requestCounts(paths);
			await settle();
		},
		setContent(path: string, content: string) {
			const entry = filesByPath.get(path);
			if (!entry) {
				throw new Error(`no such file: ${path}`);
			}
			entry.content = content;
			entry.file = makeFile(path, entry.file.stat.mtime + 1);
		},
		addFile,
		removeFile(path: string) {
			filesByPath.delete(path);
		},
		setGlobalSettings(next: GlobalSettings) {
			currentGlobalSettings = next;
		},
	};
}

describe("createBoardStatsService", () => {
	it("counts open and done with the board's own bucket rules", async () => {
		const harness = createHarness([
			{
				path: "Board.md",
				boardSettings: {},
				content: [
					"- [ ] open task",
					"- [x] done by marker",
					"- [ ] done by tag #done",
					"- [-] cancelled stays open",
					"- [ ] archived counts in neither #archived",
				].join("\n"),
			},
		]);

		await harness.request("Board.md");

		expect(harness.counts("Board.md")).toEqual({ open: 2, done: 2 });
	});

	it("does not track excluded task tags or ignored status markers", async () => {
		const harness = createHarness([
			{
				path: "Board.md",
				boardSettings: {
					excludedTaskTags: ["secret"],
					ignoredStatusMarkers: "~",
				},
				content: [
					"- [ ] tracked",
					"- [ ] untracked by tag #secret",
					"- [~] untracked by marker",
				].join("\n"),
			},
		]);

		await harness.request("Board.md");

		expect(harness.counts("Board.md")).toEqual({ open: 1, done: 0 });
	});

	it("counts only root tasks in nested-subtasks mode", async () => {
		const nested = "- [ ] parent\n  - [ ] child";
		const flat = createHarness([
			{ path: "Board.md", boardSettings: {}, content: nested },
		]);
		const subtasks = createHarness([
			{
				path: "Board.md",
				boardSettings: { treatNestedTasksAsSubtasks: true },
				content: nested,
			},
		]);

		await flat.request("Board.md");
		await subtasks.request("Board.md");

		expect(flat.counts("Board.md")).toEqual({ open: 2, done: 0 });
		expect(subtasks.counts("Board.md")).toEqual({ open: 1, done: 0 });
	});

	it("applies global defaults to untouched boards and lets board overrides win", async () => {
		const harness = createHarness(
			[
				{
					path: "a/Untouched.md",
					boardSettings: {},
					content: "- [y] done via inherited marker\n- [ ] open",
				},
				{
					path: "b/Override.md",
					boardSettings: { doneStatusMarkers: "x" },
					content: "- [y] open here despite the global default",
				},
			],
			{ ...defaultGlobalSettings, boardDefaults: { doneStatusMarkers: "y" } },
		);

		await harness.request("a/Untouched.md", "b/Override.md");

		expect(harness.counts("a/Untouched.md")).toEqual({ open: 1, done: 1 });
		expect(harness.counts("b/Override.md")).toEqual({ open: 1, done: 0 });
	});

	it("falls back to defaults when the board's settings payload is malformed", async () => {
		const harness = createHarness([
			{
				path: "Board.md",
				boardSettings: "{not json",
				content: "- [x] still counted as done",
			},
		]);

		await harness.request("Board.md");

		expect(harness.counts("Board.md")).toEqual({ open: 0, done: 1 });
	});

	it("selects in-scope files via the board's scope and excludes", async () => {
		const harness = createHarness([
			{
				path: "boards/Board.md",
				boardSettings: { excludePaths: ["boards/junk"] },
				content: "- [ ] board task",
			},
			{ path: "boards/notes.md", content: "- [ ] in-scope note task" },
			{ path: "boards/junk/skip.md", content: "- [ ] excluded task" },
			{ path: "elsewhere/other.md", content: "- [ ] out of scope" },
		]);

		await harness.request("boards/Board.md");

		expect(harness.counts("boards/Board.md")).toEqual({ open: 2, done: 0 });
	});

	it("skips all reads on an unchanged board and recomputes on any invalidator", async () => {
		const harness = createHarness([
			{ path: "Board.md", boardSettings: {}, content: "- [ ] one" },
			{ path: "notes.md", content: "- [ ] two" },
		]);

		await harness.request("Board.md");
		expect(harness.cachedRead).toHaveBeenCalledTimes(2);

		// Unchanged: the cache key matches, no reads.
		await harness.request("Board.md");
		expect(harness.cachedRead).toHaveBeenCalledTimes(2);

		// File edit (mtime bump) invalidates.
		harness.setContent("notes.md", "- [ ] two\n- [x] three");
		await harness.request("Board.md");
		expect(harness.cachedRead).toHaveBeenCalledTimes(4);
		expect(harness.counts("Board.md")).toEqual({ open: 2, done: 1 });

		// Count-relevant global settings invalidate.
		harness.setGlobalSettings({
			...defaultGlobalSettings,
			boardDefaults: { doneStatusMarkers: "xy" },
		});
		await harness.request("Board.md");
		expect(harness.cachedRead).toHaveBeenCalledTimes(6);

		// A file appearing in scope invalidates…
		harness.addFile({ path: "new.md", content: "- [ ] four" });
		await harness.request("Board.md");
		expect(harness.cachedRead).toHaveBeenCalledTimes(9);
		expect(harness.counts("Board.md")).toEqual({ open: 3, done: 1 });

		// …and so does one disappearing.
		harness.removeFile("new.md");
		await harness.request("Board.md");
		expect(harness.cachedRead).toHaveBeenCalledTimes(11);
		expect(harness.counts("Board.md")).toEqual({ open: 2, done: 1 });
	});

	it("counts a shared file per board with each board's own settings", async () => {
		const harness = createHarness([
			{
				path: "A.md",
				boardSettings: { scope: ScopeOption.Everywhere, doneStatusMarkers: "x" },
			},
			{
				path: "B.md",
				boardSettings: { scope: ScopeOption.Everywhere, doneStatusMarkers: "xy" },
			},
			{ path: "notes.md", content: "- [y] maybe done\n- [ ] open" },
		]);

		await harness.request("A.md", "B.md");

		expect(harness.counts("A.md")).toEqual({ open: 2, done: 0 });
		expect(harness.counts("B.md")).toEqual({ open: 1, done: 1 });
	});

	it("drops the published entry when the board file disappears", async () => {
		const harness = createHarness([
			{ path: "Board.md", boardSettings: {}, content: "- [ ] task" },
		]);

		await harness.request("Board.md");
		expect(harness.counts("Board.md")).toEqual({ open: 1, done: 0 });

		harness.removeFile("Board.md");
		await harness.request("Board.md");
		expect(harness.counts("Board.md")).toBeUndefined();
	});

	it("publishes counts progressively, one board at a time", async () => {
		const harness = createHarness([
			{ path: "a/A.md", boardSettings: {}, content: "- [ ] a" },
			{ path: "b/B.md", boardSettings: {}, content: "- [x] b" },
		]);
		const emissions: Array<[boolean, boolean]> = [];
		const unsubscribe = harness.service.countsStore.subscribe((map) => {
			emissions.push([map.has("a/A.md"), map.has("b/B.md")]);
		});

		await harness.request("a/A.md", "b/B.md");
		unsubscribe();

		// The first board's counts land before the second computes.
		expect(emissions).toContainEqual([true, false]);
		expect(emissions.at(-1)).toEqual([true, true]);
	});

	it("stops computing after destroy", async () => {
		const harness = createHarness([
			{ path: "Board.md", boardSettings: {}, content: "- [ ] task" },
		]);

		harness.service.destroy();
		await harness.request("Board.md");

		expect(harness.cachedRead).not.toHaveBeenCalled();
		expect(harness.counts("Board.md")).toBeUndefined();
	});
});
