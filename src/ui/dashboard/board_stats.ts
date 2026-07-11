import type { TFile } from "obsidian";
import { readable, writable, type Readable } from "svelte/store";
import {
	parseSettingsOverrides,
	resolveSettings,
	type SettingValues,
} from "../settings/settings_store";
import {
	inheritedSettingsFromGlobalSettings,
	type GlobalSettings,
} from "../settings/global_settings";
import { resolveScopeFilter, shouldIncludeFilePath } from "../tasks/scope";
import { createColumnData } from "../columns/columns";
import { getMarkerSettings, updateMapsFromFile, type Metadata } from "../tasks/tasks";
import { getBoardTaskCount } from "../board_counts";
import type { Task } from "../tasks/task";

export interface BoardTaskCounts {
	open: number;
	done: number;
}

/**
 * What the stats service needs from the app, narrowed so tests can fake it
 * with plain objects. Everything except `cachedRead` must stay free of file
 * reads: settings come from the metadata cache and mtimes from `TFile.stat`,
 * so a cache-hit refresh costs stats, not I/O.
 */
export interface BoardStatsHost {
	getMarkdownFiles(): TFile[];
	cachedRead(file: TFile): Promise<string>;
	/** The board's `kanban_plugin` frontmatter payload (may be empty/invalid). */
	getBoardSettingsPayload(file: TFile): string;
	getGlobalSettings(): GlobalSettings;
}

export interface BoardStatsService {
	/**
	 * Board path → counts. Entries land one board at a time as the
	 * sequential compute publishes; a board with no entry yet is pending.
	 */
	countsStore: Readable<ReadonlyMap<string, BoardTaskCounts>>;
	/**
	 * Queues count computes for these boards (deduplicated against what is
	 * already queued). Cache hits publish without any file reads, so the
	 * dashboard re-requests every visible board on each refresh tick.
	 */
	requestCounts(paths: string[]): void;
	destroy(): void;
}

// The resolved settings that can change what a board counts: file selection
// (scope/excludes) and task parsing (columns, markers, schema, subtasks).
// Display-only settings — visibility toggles, persisted filters, sort — are
// deliberately absent: counts reflect what the board tracks, not what it
// currently shows.
const COUNT_SETTING_KEYS = [
	"columns",
	"scope",
	"scopeFolders",
	"excludePaths",
	"consolidateTags",
	"doneStatusMarkers",
	"cancelledStatusMarkers",
	"ignoredStatusMarkers",
	"excludedTaskTags",
	"propertySchema",
	"treatNestedTasksAsSubtasks",
] as const satisfies readonly (keyof SettingValues)[];

/**
 * Exact per-board open/done counts for the dashboard (SPEC 0033 Phase 3),
 * computed with each board's own resolved settings through the same parsing
 * pipeline a live board runs. One plugin-level instance: the cache and the
 * published counts survive panel close/reopen, and nothing computes unless
 * a panel requests it.
 */
export function createBoardStatsService(host: BoardStatsHost): BoardStatsService {
	const countsStore = writable<ReadonlyMap<string, BoardTaskCounts>>(new Map());
	const cacheByPath = new Map<string, { key: string; counts: BoardTaskCounts }>();
	const queue: string[] = [];
	const queued = new Set<string>();
	let pumping = false;
	let destroyed = false;

	function publish(path: string, counts: BoardTaskCounts | undefined) {
		countsStore.update((current) => {
			const existing = current.get(path);
			if (counts === undefined) {
				if (existing === undefined) {
					return current;
				}
				const next = new Map(current);
				next.delete(path);
				return next;
			}
			if (existing?.open === counts.open && existing?.done === counts.done) {
				return current;
			}
			return new Map(current).set(path, counts);
		});
	}

	async function computeBoard(path: string): Promise<void> {
		const files = host.getMarkdownFiles();
		const boardFile = files.find((file) => file.path === path);
		if (!boardFile) {
			// Deleted since it was queued: drop the stale entry.
			cacheByPath.delete(path);
			publish(path, undefined);
			return;
		}

		// The same three settings layers a live KanbanView resolves —
		// builtin defaults ⊕ global defaults ⊕ the board's sparse overrides
		// — with the overrides read from cached frontmatter, not the file.
		const settings = resolveSettings(
			parseSettingsOverrides(host.getBoardSettingsPayload(boardFile)),
			inheritedSettingsFromGlobalSettings(host.getGlobalSettings()),
		);
		const boardFolder = boardFile.parent?.path ?? null;
		const scopeFilter = resolveScopeFilter(
			settings.scope,
			settings.scopeFolders,
			boardFolder,
		);
		const excludePaths = settings.excludePaths ?? [];
		const excludeFilter = excludePaths.length > 0 ? excludePaths : null;
		const inScope = files.filter((file) =>
			shouldIncludeFilePath(file.path, scopeFilter, excludeFilter, boardFolder),
		);

		const key = buildCacheKey(settings, inScope);
		const cached = cacheByPath.get(path);
		if (cached && cached.key === key) {
			publish(path, cached.counts);
			return;
		}

		const counts = await countTasks(settings, inScope);
		cacheByPath.set(path, { key, counts });
		publish(path, counts);
	}

	async function countTasks(
		settings: SettingValues,
		inScope: TFile[],
	): Promise<BoardTaskCounts> {
		const { columnPlacementTagTable } = createColumnData(settings.columns);
		const columnDefinitionsStore = readable(settings.columns);
		const columnPlacementTagTableStore = readable(columnPlacementTagTable);
		const markerSettings = getMarkerSettings(settings);
		const tasksByTaskId = new Map<string, Task>();
		const metadataByTaskId = new Map<string, Metadata>();
		const taskIdsByFileHandle = new Map<TFile, Set<string>>();

		for (const fileHandle of inScope) {
			await updateMapsFromFile({
				fileHandle,
				tasksByTaskId,
				metadataByTaskId,
				taskIdsByFileHandle,
				vault: { read: (file) => host.cachedRead(file) },
				columnDefinitionsStore,
				columnPlacementTagTableStore,
				...markerSettings,
			});
		}

		const tasks = [...tasksByTaskId.values()];
		return {
			// The board-corner rule: not done, not archived, not in done.
			open: getBoardTaskCount(tasks),
			// The done bucket in main.svelte's groupByColumnTag; unchecked
			// archived tasks land in neither count.
			done: tasks.filter((task) => task.done || task.column === "done").length,
		};
	}

	// One board at a time bounds concurrent IO; each result publishes as it
	// lands so cards fill in progressively.
	async function pump(): Promise<void> {
		pumping = true;
		try {
			while (queue.length > 0 && !destroyed) {
				const path = queue.shift() as string;
				queued.delete(path);
				try {
					await computeBoard(path);
				} catch (error) {
					console.error(`Failed to compute board stats for ${path}`, error);
				}
			}
		} finally {
			pumping = false;
		}
	}

	return {
		countsStore: { subscribe: countsStore.subscribe },
		requestCounts(paths) {
			if (destroyed) {
				return;
			}
			for (const path of paths) {
				if (queued.has(path)) {
					continue;
				}
				queued.add(path);
				queue.push(path);
			}
			if (!pumping && queue.length > 0) {
				void pump();
			}
		},
		destroy() {
			destroyed = true;
			queue.length = 0;
			queued.clear();
		},
	};
}

// Cheap to compute (no reads): any change that could alter counts —
// settings, scope, a file edit, a file add/remove — changes the key, and an
// unchanged key skips all parsing.
function buildCacheKey(settings: SettingValues, inScope: TFile[]): string {
	const relevantSettings: Partial<Record<keyof SettingValues, unknown>> = {};
	for (const key of COUNT_SETTING_KEYS) {
		relevantSettings[key] = settings[key];
	}
	const files = inScope
		.map((file) => [file.path, file.stat.mtime] as const)
		.sort((a, b) => a[0].localeCompare(b[0]));
	return JSON.stringify({ settings: relevantSettings, files });
}
