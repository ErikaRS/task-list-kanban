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
import { createColumnData, RESERVED_COLUMN_KEYS } from "../columns/columns";
import { getMarkerSettings, updateMapsFromFile, type Metadata } from "../tasks/tasks";
import { getBoardTaskCount } from "../board_counts";
import type { Task } from "../tasks/task";
import { toCalendarDay } from "../filters/date_filter";

export interface BoardColumnCount {
	label: string;
	count: number;
}

export interface BoardAttentionCounts {
	overdue: number;
	dueToday: number;
}

export interface BoardTaskCounts {
	open: number;
	done: number;
	attention?: BoardAttentionCounts;
	/**
	 * Open counts per column in the board's own layout order:
	 * uncategorized first (only when non-zero, like the board's auto
	 * visibility), the board's columns (zero counts included), done last.
	 */
	columns: BoardColumnCount[];
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

export interface BoardStatsOptions {
	now?: () => Date;
}

// The resolved settings that can change what a board counts: file selection
// (scope/excludes), task parsing (columns, markers, schema, subtasks), and
// the two default-column names (they feed the breakdown's labels).
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
	"uncategorizedColumnName",
	"doneColumnName",
] as const satisfies readonly (keyof SettingValues)[];

/**
 * Exact per-board open/done counts for the dashboard (SPEC 0033 Phase 3),
 * computed with each board's own resolved settings through the same parsing
 * pipeline a live board runs. One plugin-level instance: the cache and the
 * published counts survive panel close/reopen, and nothing computes unless
 * a panel requests it.
 */
export function createBoardStatsService(
	host: BoardStatsHost,
	options: BoardStatsOptions = {},
): BoardStatsService {
	const countsStore = writable<ReadonlyMap<string, BoardTaskCounts>>(new Map());
	const cacheByPath = new Map<string, { key: string; counts: BoardTaskCounts }>();
	const queue: string[] = [];
	const queued = new Set<string>();
	let pumping = false;
	let destroyed = false;
	const now = options.now ?? (() => new Date());

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
			if (existing && countsEqual(existing, counts)) {
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

		const producesAttention = hasDateDueProperty(settings);
		const today = getLocalCalendarDay(now());
		const key = buildCacheKey(settings, inScope, producesAttention ? getLocalDayKey(today) : undefined);
		const cached = cacheByPath.get(path);
		if (cached && cached.key === key) {
			publish(path, cached.counts);
			return;
		}

		const counts = await countTasks(settings, inScope, producesAttention ? today : undefined);
		cacheByPath.set(path, { key, counts });
		publish(path, counts);
	}

	async function countTasks(
		settings: SettingValues,
		inScope: TFile[],
		today?: Date,
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
		const attention: BoardAttentionCounts | undefined = today
			? { overdue: 0, dueToday: 0 }
			: undefined;

		// The same bucketing as main.svelte's groupByColumnTag: the done
		// check comes first, unchecked archived tasks land nowhere, and
		// anything without a known column is uncategorized.
		const countsByColumnId = new Map<string, number>(
			settings.columns
				.filter((column) => !RESERVED_COLUMN_KEYS.has(column.id))
				.map((column) => [column.id, 0]),
		);
		let uncategorized = 0;
		let done = 0;
		for (const task of tasks) {
			if (task.done || task.column === "done") {
				done += 1;
			} else if (task.column === "archived") {
				// ignored
			} else if (task.column !== undefined && countsByColumnId.has(task.column)) {
				countsByColumnId.set(task.column, (countsByColumnId.get(task.column) ?? 0) + 1);
				countAttention(task, today, attention);
			} else {
				uncategorized += 1;
				countAttention(task, today, attention);
			}
		}

		const columns: BoardColumnCount[] = [
			// Non-zero only, like the board's auto uncategorized visibility;
			// real columns list at zero so the breakdown mirrors the layout.
			...(uncategorized > 0
				? [
						{
							label: settings.uncategorizedColumnName || "Uncategorized",
							count: uncategorized,
						},
					]
				: []),
			...settings.columns
				.filter((column) => !RESERVED_COLUMN_KEYS.has(column.id))
				.map((column) => ({
					label: column.label,
					count: countsByColumnId.get(column.id) ?? 0,
				})),
			{ label: settings.doneColumnName || "Done", count: done },
		];

		return {
			// The board-corner rule: not done, not archived, not in done.
			open: getBoardTaskCount(tasks),
			done,
			...(attention ? { attention } : {}),
			columns,
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

function countsEqual(a: BoardTaskCounts, b: BoardTaskCounts): boolean {
	return (
		a.open === b.open &&
		a.done === b.done &&
		attentionEqual(a.attention, b.attention) &&
		a.columns.length === b.columns.length &&
		a.columns.every(
			(column, index) =>
				column.label === b.columns[index]?.label &&
				column.count === b.columns[index]?.count,
		)
	);
}

function attentionEqual(
	a: BoardAttentionCounts | undefined,
	b: BoardAttentionCounts | undefined,
): boolean {
	return (
		a === b ||
		(a !== undefined &&
			b !== undefined &&
			a.overdue === b.overdue &&
			a.dueToday === b.dueToday)
	);
}

function countAttention(
	task: Task,
	today: Date | undefined,
	attention: BoardAttentionCounts | undefined,
): void {
	if (!today || !attention) {
		return;
	}
	const due = task.properties.get("due")?.value;
	if (!(due instanceof Date)) {
		return;
	}
	const dueDay = toCalendarDay(due).getTime();
	const todayTime = today.getTime();
	if (dueDay < todayTime) {
		attention.overdue += 1;
	} else if (dueDay === todayTime) {
		attention.dueToday += 1;
	}
}

function hasDateDueProperty(settings: SettingValues): boolean {
	const schema = getMarkerSettings(settings).propertySchema;
	return schema.knownKeys().some((key) => key.key === "due" && key.type === "date");
}

function getLocalCalendarDay(date: Date): Date {
	return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function getLocalDayKey(day: Date): string {
	return day.toISOString().slice(0, 10);
}

// Cheap to compute (no reads): any change that could alter counts —
// settings, scope, a file edit, a file add/remove — changes the key, and an
// unchanged key skips all parsing.
function buildCacheKey(
	settings: SettingValues,
	inScope: TFile[],
	dayKey: string | undefined,
): string {
	const relevantSettings: Partial<Record<keyof SettingValues, unknown>> = {};
	for (const key of COUNT_SETTING_KEYS) {
		relevantSettings[key] = settings[key];
	}
	const files = inScope
		.map((file) => [file.path, file.stat.mtime] as const)
		.sort((a, b) => a[0].localeCompare(b[0]));
	return JSON.stringify({ settings: relevantSettings, files, dayKey });
}
