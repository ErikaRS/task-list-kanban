import { writable, type Readable } from "svelte/store";
import type { SettingValues } from "../settings/settings_store";
import { pathScopeHasDateTemplate } from "../tasks/path_scope";
import { RESERVED_COLUMN_KEYS } from "../columns/columns";
import { getMarkerSettings } from "../tasks/tasks";
import { getBoardTaskCount } from "../board_counts";
import type { Task } from "../tasks/task";
import { toCalendarDay } from "../filters/date_filter";
import {
	boardParseKey,
	parseBoardTasks,
	resolveBoardScope,
	type BoardSnapshotHost,
} from "../boards/board_snapshot";

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

/** What the stats service needs from the app; see `BoardSnapshotHost`. */
export type BoardStatsHost = BoardSnapshotHost;

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

// Counts reflect what the board tracks, not what it currently shows: the
// parse key (file selection and task parsing) plus the two default-column
// names that label the breakdown. Display-only settings stay out.
function countCacheKey(
	settings: SettingValues,
	inScopeFiles: Parameters<typeof boardParseKey>[1],
	dayKey: string | undefined,
): string {
	return boardParseKey(settings, inScopeFiles, {
		uncategorizedColumnName: settings.uncategorizedColumnName,
		doneColumnName: settings.doneColumnName,
		dayKey,
	});
}

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
	let midnightTimer: number | undefined;
	const dynamicScopePaths = new Set<string>();
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
		const scope = resolveBoardScope(host, path, now());
		if (!scope) {
			// Deleted since it was queued: drop the stale entry.
			cacheByPath.delete(path);
			publish(path, undefined);
			return;
		}
		const { settings, inScopeFiles } = scope;

		const producesAttention = hasDateDueProperty(settings);
		const today = getLocalCalendarDay(now());
		const key = countCacheKey(settings, inScopeFiles, producesAttention ? getLocalDayKey(today) : undefined);
		const cached = cacheByPath.get(path);
		if (cached && cached.key === key) {
			publish(path, cached.counts);
			return;
		}

		const tasks = await parseBoardTasks(host, settings, inScopeFiles);
		const counts = countBoardTasks(settings, tasks, producesAttention ? today : undefined);
		cacheByPath.set(path, { key, counts });
		publish(path, counts);
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

	function scheduleMidnightRefresh() {
		if (midnightTimer !== undefined) {
			timerHost.clearTimeout(midnightTimer);
			midnightTimer = undefined;
		}
		if (destroyed || dynamicScopePaths.size === 0) return;
		const current = now();
		const next = new Date(current);
		next.setHours(24, 0, 1, 0);
		midnightTimer = timerHost.setTimeout(() => {
			midnightTimer = undefined;
			for (const path of dynamicScopePaths) {
				cacheByPath.delete(path);
			}
			requestDynamicBoards();
		}, Math.max(1_000, next.getTime() - current.getTime()));
	}

	function requestDynamicBoards() {
		for (const path of dynamicScopePaths) {
			if (!queued.has(path)) {
				queued.add(path);
				queue.push(path);
			}
		}
		if (!pumping && queue.length > 0) {
			void pump();
		}
		scheduleMidnightRefresh();
	}

	return {
		countsStore: { subscribe: countsStore.subscribe },
		requestCounts(paths) {
			if (destroyed) {
				return;
			}
			for (const path of paths) {
				const boardFile = host.getMarkdownFiles().find((file) => file.path === path);
				if (boardFile && pathScopeHasDateTemplate(host.getBoardPathScope?.(boardFile))) {
					dynamicScopePaths.add(path);
				}
				if (queued.has(path)) {
					continue;
				}
				queued.add(path);
				queue.push(path);
			}
			if (!pumping && queue.length > 0) {
				void pump();
			}
			scheduleMidnightRefresh();
		},
		destroy() {
			destroyed = true;
			if (midnightTimer !== undefined) {
				timerHost.clearTimeout(midnightTimer);
			}
			queue.length = 0;
			queued.clear();
		},
	};
}

/**
 * Open/done/per-column counts for parsed board tasks. Pass `today` to also
 * count overdue and due-today open tasks.
 */
export function countBoardTasks(
	settings: SettingValues,
	tasks: readonly Task[],
	today?: Date,
): BoardTaskCounts {
	const attention: BoardAttentionCounts | undefined = today
		? { overdue: 0, dueToday: 0 }
		: undefined;

	// The same bucketing as deriveBoardMatrix: the done check comes first,
	// unchecked archived tasks land nowhere, and anything without a known
	// column is uncategorized.
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

interface TimerHost {
	setTimeout(callback: () => void, delay?: number): number;
	clearTimeout(id: number | undefined): void;
}
const timerHost: TimerHost = typeof window === "undefined"
	? activeWindow
	: window;
