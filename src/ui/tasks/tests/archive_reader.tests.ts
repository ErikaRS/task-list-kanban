import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { TFile, Vault } from "obsidian";
import { ArchivePageReader, ARCHIVE_CURSOR_LIMIT } from "../archive_reader";
import { getMarkerSettings } from "../tasks";
import { isTrackedTaskString } from "../task";
import { defaultSettings, type SettingValues } from "../../settings/settings_store";

function harness(source: Record<string, string>, settings: Partial<SettingValues> = {}) {
	const contents = new Map(Object.entries(source));
	const files = [...contents.keys()].map(path => ({ path }) as TFile);
	const listeners = new Map<string, (...args: any[]) => void>();
	const vault = {
		getMarkdownFiles: () => files,
		read: vi.fn(async (file: TFile) => contents.get(file.path)!),
		modify: vi.fn(async (file: TFile, content: string) => { contents.set(file.path, content); }),
		on: vi.fn((name: string, fn: (...args: any[]) => void) => { listeners.set(name, fn); return name; }),
		offref: vi.fn((name: string) => listeners.delete(name)),
	};
	const markers = getMarkerSettings({ ...defaultSettings, ...settings });
	const config = {
		context: { ...markers, columnDefinitions: [], columnPlacementTagTable: {} },
		excludedTaskTags: markers.excludedTaskTags,
		nested: markers.treatNestedTasksAsSubtasks,
		includes: (path: string) => path.startsWith("scope/") && path.endsWith(".md"),
	};
	const prepare = vi.fn((_file: TFile, content: string) => content);
	const reader = new ArchivePageReader(vault as unknown as Vault, () => config, prepare);
	return { reader, vault, contents, files, listeners, config, prepare };
}
const rows = (count: number) => Array.from({ length: count }, (_, i) => `- [x] Task ${i} #archived`).join("\n");
const settle = () => vi.runAllTimersAsync();

describe("archive pages", () => {
	beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", globalThis); });
	afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

	it("uses the board's tag/status classification, scope, ignored markers and excluded tags", async () => {
		const source = "- [x] Tag #archived\n- [d] Status\n- [D] Both #archived\n- [x] Similar #archived-old\n- [-] Ignore #archived\n- [x] Exclude #skip #archived";
		const tag = harness({ "other.md": rows(5), "scope/a.md": source }, { ignoredStatusMarkers: "-" as never, excludedTaskTags: ["skip"] });
		expect(tag.vault.read).not.toHaveBeenCalled();
		tag.reader.open(() => true);
		await settle();
		expect(get(tag.reader.state).cards.map(c => c.task.content)).toEqual(["Tag #archived", "Both #archived"]);
		expect(isTrackedTaskString("- [x] Similar #archived-old")).toBe(true);
		const status = harness({ "scope/a.md": source }, { replaceArchiveTagWithStatus: true, archiveStatusMarkers: "dD" });
		status.reader.open(() => true);
		await settle();
		expect(get(status.reader.state).cards.map(c => c.task.content)).toEqual(["Status", "Both #archived"]);
		tag.reader.close(); status.reader.close();
	});

	it("replaces pages, resumes at the next cursor, and reconstructs evicted history within its bound", async () => {
		const h = harness({ "scope/a.md": rows(3301) });
		h.reader.open(() => true);
		await settle();
		expect(get(h.reader.state).cards).toHaveLength(50);
		for (let page = 2; page <= 67; page++) {
			h.reader.next(); await settle();
			expect(get(h.reader.state).cards[0]?.row).toBe((page - 1) * 50);
		}
		expect(get(h.reader.state).more).toBe(false);
		for (let page = 66; page >= 2; page--) { h.reader.previous(); await settle(); }
		expect(get(h.reader.state).cards[0]?.row).toBe(50);
		// Inspect bookkeeping only to enforce the retained-memory requirement.
		expect((h.reader as unknown as { cursors: Map<number, unknown> }).cursors.size).toBeLessThanOrEqual(ARCHIVE_CURSOR_LIMIT);
		h.reader.close();
		expect(get(h.reader.state).cards).toEqual([]);
		expect(h.listeners.size).toBe(0);
	});

	it("clears stale cards immediately and coalesces continuous mutations without starving refresh", async () => {
		const h = harness({ "scope/a.md": rows(70) });
		h.reader.open(() => true); await settle();
		h.reader.next(); await settle();
		h.contents.set("scope/a.md", "- [x] Newly archived #archived");
		for (const event of ["create", "modify", "delete", "rename"]) h.listeners.get(event)!(h.files[0], "scope/old.md");
		expect(get(h.reader.state).cards).toEqual([]);
		for (let i = 0; i < 5; i++) {
			await vi.advanceTimersByTimeAsync(30);
			h.listeners.get("modify")!(h.files[0]);
		}
		expect(h.vault.read.mock.calls.length).toBeGreaterThan(2);
		await settle();
		expect(get(h.reader.state)).toMatchObject({ page: 1, message: "Archive changed; showing the first page" });
		expect(get(h.reader.state).cards[0]?.task.content).toContain("Newly archived");
		h.reader.close();
	});

	it("cancels stale generations on filter/view changes and recovers from read errors", async () => {
		const h = harness({ "scope/a.md": rows(60), "scope/b.md": rows(1) });
		let finish: (text: string) => void = () => {};
		h.vault.read.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
		h.reader.open(() => true);
		await vi.advanceTimersByTimeAsync(1);
		h.reader.open(task => task.content.includes("Task 59"));
		await settle();
		finish(rows(60)); await settle();
		expect(get(h.reader.state).cards.map(card => card.row)).toEqual([59]);
		h.reader.refresh(); h.reader.cancel(); await settle();
		expect(get(h.reader.state).loading).toBe(false);
		h.vault.read.mockRejectedValueOnce(new Error("unreadable"));
		h.reader.refresh(); await settle();
		expect(get(h.reader.state).error).toContain("unreadable");
		h.reader.refresh(); await settle();
		expect(get(h.reader.state).cards).toHaveLength(1);
		h.reader.close();
	});

	it("restores only the verified row, preserving metadata, nested text and other archive-like tags", async () => {
		const source = "- [ ] Same #archived #archived-old ✅ 2026-01-01\n  note\n- [ ] Same #archived";
		const h = harness({ "scope/a.md": source });
		h.reader.open(() => true); await settle();
		const [first, second] = get(h.reader.state).cards;
		h.contents.set("scope/a.md", "changed\n" + source);
		await expect(h.reader.restore(first!)).rejects.toThrow("Task changed");
		expect(h.vault.modify).not.toHaveBeenCalled();
		h.contents.set("scope/a.md", source);
		await settle();
		await h.reader.restore(get(h.reader.state).cards[0]!);
		expect(h.contents.get("scope/a.md")).toBe("- [x] Same  #archived-old ✅ 2026-01-01\n  note\n- [ ] Same #archived");
		expect(h.prepare).toHaveBeenCalledOnce();
		expect(second?.row).toBe(2);
		await settle();
		expect(get(h.reader.state).cards).toHaveLength(1);
		h.reader.close();
	});

	it("restores archive statuses while preserving the tag and refuses an invalid Done marker", async () => {
		const h = harness({ "scope/a.md": "- [D] Task #archived" }, { replaceArchiveTagWithStatus: true, archiveStatusMarkers: "dD" });
		h.reader.open(() => true); await settle();
		const card = get(h.reader.state).cards[0]!;
		h.config.context.doneStatusMarkers = "]";
		await expect(h.reader.restore(card)).rejects.toThrow("valid Done marker");
		expect(h.vault.modify).not.toHaveBeenCalled();
		h.config.context.doneStatusMarkers = "xX";
		await h.reader.restore(card);
		expect(h.contents.get("scope/a.md")).toBe("- [x] Task #archived");
		h.reader.close();
	});

	it("keeps nested source ownership under archived and active roots, including intervening notes", async () => {
		const h = harness({ "scope/a.md": "- [x] Parent #archived\n  note\n    - [ ] Child\n- [ ] Active\n  - [x] Archived child #archived\n- [-] Ignored\n  - [x] Eligible #archived" },
			{ treatNestedTasksAsSubtasks: true, ignoredStatusMarkers: "-" as never });
		h.reader.open(() => true); await settle();
		expect(get(h.reader.state).cards.map(c => c.row)).toEqual([0, 6]);
		expect(get(h.reader.state).cards[0]?.task.sourceBlockLineCount).toBe(3);
		h.config.nested = false;
		h.reader.refresh(); await settle();
		expect(get(h.reader.state).cards.map(c => c.row)).toEqual([0, 4, 6]);
		h.reader.close();
	});
});
