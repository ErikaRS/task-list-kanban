// Embedded board controller (SPEC 0057): resolves a `task-list-kanban`
// block to a board, loads its snapshot, and turns it into render state.
// Obsidian-free so it can be tested with plain fakes; the Obsidian wiring
// (events, mounting) is in `embedded_board_child.ts`.
//
// The embed is the second board renderer. Which tasks show and where comes
// from `board_presentation.ts`, exactly as on the full board; this module
// only decides the embed's own inputs (block `view`/`filter`). It never
// writes: it has no vault, no task actions, and no settings store.
import type { BoardSnapshotCache } from "../boards/board_snapshot";
import {
	boardDateFilterKeys,
	presentBoard,
	resolveBoardFilter,
	type BoardPresentation,
} from "../board/board_presentation";
import { readBoardFilterState } from "../filters/filter_state";
import { millisUntilNextLocalMidnight } from "../filters/today_store";
import type { SavedView, SettingValues } from "../settings/settings_store";
import { applySavedViewProperties } from "../views/saved_views";
import { parseEmbedBlock, type EmbedBlockParams } from "./embed_block";

export interface EmbedHost {
	snapshots: BoardSnapshotCache;
	/** Resolves `board:` like a wikilink from the note, then as a vault path. */
	resolveBoardFile(reference: string, sourcePath: string): { path: string; basename: string } | null;
	/** True for a file with `kanban_plugin` frontmatter. */
	isBoardFile(path: string): boolean;
	getGlobalViews(): SavedView[];
	now(): Date;
}

export interface EmbedTimers {
	setTimeout(callback: () => void, delay: number): number;
	clearTimeout(id: number): void;
}

export type EmbedState =
	| { kind: "loading" }
	| { kind: "error"; title: string; messages: string[] }
	| {
			kind: "ready";
			boardName: string;
			boardPath: string;
			settings: SettingValues;
			presentation: BoardPresentation;
			/** The embed-only filter or view in effect, for the header chip. */
			overrideLabel?: string;
			warnings: string[];
			height: number;
		};

export interface EmbedInputs {
	settings: SettingValues;
	queryText: string;
	overrideLabel?: string;
}

/**
 * The embed's presentation inputs: the board's settings and persisted
 * filter, with a block `view` applied on top, then a block `filter`
 * replacing the query. Nothing here is ever written back.
 */
export function resolveEmbedInputs(
	settings: SettingValues,
	params: Pick<EmbedBlockParams, "view" | "filter">,
	globalViews: SavedView[],
): EmbedInputs | { error: string } {
	let next = settings;
	let queryText = readBoardFilterState(settings);
	const labels: string[] = [];
	if (params.view !== undefined) {
		const name = params.view.trim().toLowerCase();
		const view = [...(settings.savedViews ?? []), ...globalViews]
			.find((candidate) => candidate.name.trim().toLowerCase() === name);
		if (!view) {
			return { error: `No saved view named "${params.view}" on this board or in global views.` };
		}
		next = applySavedViewProperties(next, view);
		if (view.query !== undefined) queryText = view.query;
		labels.push(`View: ${view.name}`);
	}
	if (params.filter !== undefined) {
		const parsed = resolveBoardFilter(params.filter, boardDateFilterKeys(next));
		if (parsed.error) {
			return { error: `Filter: ${parsed.error}` };
		}
		queryText = params.filter;
		labels.push(`Filter: ${params.filter}`);
	}
	return {
		settings: next,
		queryText,
		...(labels.length > 0 ? { overrideLabel: labels.join(" · ") } : {}),
	};
}

export interface EmbeddedBoardController {
	/** Parses the block and loads the board. Call when the embed nears the viewport. */
	start(): void;
	stop(): void;
	/** A file's contents or metadata changed; refreshes only if it is in scope. */
	notifyFileChanged(path: string): void;
	/** Files were created, deleted, or renamed; scope may have changed. */
	notifyFilesChanged(): void;
	/** Something outside the vault changed (global settings). */
	notifySettingsChanged(): void;
	/** The resolved board path, once known (for opening it). */
	readonly boardPath: string | undefined;
}

export const EMBED_REFRESH_DEBOUNCE_MS = 300;

export function createEmbeddedBoardController(options: {
	source: string;
	sourcePath: string;
	host: EmbedHost;
	timers: EmbedTimers;
	onState: (state: EmbedState) => void;
}): EmbeddedBoardController {
	const { host, timers, onState, sourcePath } = options;
	let params: EmbedBlockParams | undefined;
	let warnings: string[] = [];
	let boardPath: string | undefined;
	let started = false;
	let stopped = false;
	let debounceTimer: number | undefined;
	let midnightTimer: number | undefined;
	let lastRenderKey: string | undefined;
	let relevantPaths = new Set<string>();
	let generation = 0;

	function error(title: string, messages: string[] = []) {
		lastRenderKey = undefined;
		onState({ kind: "error", title, messages });
	}

	function resolveBoard(): boolean {
		if (!params) return false;
		const file = host.resolveBoardFile(params.board, sourcePath);
		if (!file) {
			boardPath = undefined;
			error(`Board not found: ${params.board}`, [
				"Check the board: line. Use the board's vault path or its link text, as you would in a [[link]].",
			]);
			return false;
		}
		if (file.path === sourcePath) {
			boardPath = undefined;
			error("A board can't embed itself.", ["Move this block to another note."]);
			return false;
		}
		if (!host.isBoardFile(file.path)) {
			boardPath = undefined;
			error(`Not a kanban board: ${file.path}`, [
				"Point board: at a note opened as a Task List Kanban board.",
			]);
			return false;
		}
		boardPath = file.path;
		return true;
	}

	async function refresh() {
		if (stopped || !params) return;
		if (!resolveBoard() || !boardPath) {
			relevantPaths = new Set();
			return;
		}
		const path = boardPath;
		const run = ++generation;
		const now = host.now();
		let snapshot;
		try {
			snapshot = await host.snapshots.load(path, now);
		} catch (err) {
			if (run === generation && !stopped) {
				error("Couldn't load this board.", [err instanceof Error ? err.message : String(err)]);
			}
			return;
		}
		if (run !== generation || stopped) return;
		if (!snapshot) {
			error(`Board not found: ${params.board}`);
			return;
		}
		relevantPaths = new Set([path, ...snapshot.inScopeFiles.map((file) => file.path)]);

		const globalViews = params.view !== undefined ? host.getGlobalViews() : [];
		// The board's calendar day (UTC midnight of the local date), from the
		// injected clock rather than `getToday()` so tests control it.
		const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
		const renderKey = JSON.stringify({
			parse: snapshot.cacheKey,
			settings: snapshot.settings,
			params,
			globalViews,
			today: today.toISOString(),
		});
		if (renderKey === lastRenderKey) return;

		const inputs = resolveEmbedInputs(snapshot.settings, params, globalViews);
		if ("error" in inputs) {
			error(inputs.error);
			lastRenderKey = renderKey;
			return;
		}
		const presentation = presentBoard({
			tasks: snapshot.tasks,
			settings: inputs.settings,
			filter: resolveBoardFilter(inputs.queryText, boardDateFilterKeys(inputs.settings)),
			today,
		});
		lastRenderKey = renderKey;
		const boardName = path.split("/").pop()!.replace(/\.md$/i, "");
		onState({
			kind: "ready",
			boardName,
			boardPath: path,
			settings: inputs.settings,
			presentation,
			...(inputs.overrideLabel ? { overrideLabel: inputs.overrideLabel } : {}),
			warnings,
			height: params.height,
		});
	}

	function scheduleRefresh() {
		if (!started || stopped) return;
		if (debounceTimer !== undefined) timers.clearTimeout(debounceTimer);
		debounceTimer = timers.setTimeout(() => {
			debounceTimer = undefined;
			void refresh();
		}, EMBED_REFRESH_DEBOUNCE_MS);
	}

	// Date filters, date grouping, and dated path scopes roll over at midnight.
	function scheduleMidnight() {
		if (stopped) return;
		midnightTimer = timers.setTimeout(() => {
			midnightTimer = undefined;
			void refresh();
			scheduleMidnight();
		}, millisUntilNextLocalMidnight(host.now()));
	}

	return {
		get boardPath() {
			return boardPath;
		},
		start() {
			if (started || stopped) return;
			started = true;
			const parsed = parseEmbedBlock(options.source);
			warnings = parsed.issues
				.filter((issue) => issue.severity === "warning")
				.map((issue) => (issue.line > 0 ? `Line ${issue.line}: ${issue.message}` : issue.message));
			if (!parsed.params) {
				error("This task-list-kanban block has errors.", parsed.issues
					.filter((issue) => issue.severity === "error")
					.map((issue) => (issue.line > 0 ? `Line ${issue.line}: ${issue.message}` : issue.message)));
				return;
			}
			params = parsed.params;
			onState({ kind: "loading" });
			void refresh();
			scheduleMidnight();
		},
		stop() {
			stopped = true;
			if (debounceTimer !== undefined) timers.clearTimeout(debounceTimer);
			if (midnightTimer !== undefined) timers.clearTimeout(midnightTimer);
		},
		notifyFileChanged(path) {
			// Before the first load every change is relevant; afterwards only
			// the board and files in its scope are.
			if (relevantPaths.has(path) || (params !== undefined && boardPath === undefined)) {
				scheduleRefresh();
			}
		},
		notifyFilesChanged() {
			scheduleRefresh();
		},
		notifySettingsChanged() {
			scheduleRefresh();
		},
	};
}
