import type { App, EventRef, TFile } from "obsidian";
import { writable, type Readable } from "svelte/store";
import type { BoardListSettings } from "../settings/global_settings";

const KANBAN_PLUGIN_KEY = "kanban_plugin";

export interface BoardIndexEntry {
	path: string;
	name: string;
	folder: string;
}

export interface BoardIndex {
	store: Readable<BoardIndexEntry[]>;
	destroy(): void;
}

/**
 * Discovers every kanban board in the vault from cached frontmatter — no
 * file reads. The store only emits when the discovered list actually
 * changes, so open boards don't re-render on unrelated vault activity.
 */
export function createBoardIndex(
	app: App,
	registerEvent: (eventRef: EventRef) => void,
): BoardIndex {
	const store = writable<BoardIndexEntry[]>([]);
	let lastSerialized = JSON.stringify([]);
	let recomputeTimer: ReturnType<typeof setTimeout> | undefined;

	const recompute = () => {
		const entries = sortBoardEntries(
			app.vault
				.getMarkdownFiles()
				.filter((file) => isBoardFile(app, file))
				.map((file) => ({
					path: file.path,
					name: file.basename,
					folder: file.parent?.path ?? "",
				})),
		);
		const serialized = JSON.stringify(entries);
		if (serialized !== lastSerialized) {
			lastSerialized = serialized;
			store.set(entries);
		}
	};

	const scheduleRecompute = () => {
		if (recomputeTimer) {
			clearTimeout(recomputeTimer);
		}
		recomputeTimer = setTimeout(() => {
			recomputeTimer = undefined;
			recompute();
		}, 250);
	};

	registerEvent(app.metadataCache.on("changed", scheduleRecompute));
	registerEvent(app.metadataCache.on("deleted", scheduleRecompute));
	// Fires once the initial vault scan completes, which may be after
	// plugin load — the immediate compute below can see an empty cache.
	registerEvent(app.metadataCache.on("resolved", scheduleRecompute));
	registerEvent(app.vault.on("rename", scheduleRecompute));

	recompute();

	return {
		store: { subscribe: store.subscribe },
		destroy: () => {
			if (recomputeTimer) {
				clearTimeout(recomputeTimer);
			}
		},
	};
}

/**
 * Rewrites a pinned board path after a vault rename. Handles both the file
 * itself and paths under a renamed folder (folder renames fire one event
 * for the folder, not one per child).
 */
export function rewriteBoardPath(path: string, oldPath: string, newPath: string): string {
	if (path === oldPath) {
		return newPath;
	}
	if (path.startsWith(`${oldPath}/`)) {
		return `${newPath}${path.slice(oldPath.length)}`;
	}
	return path;
}

function isBoardFile(app: App, file: TFile): boolean {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	return !!frontmatter && KANBAN_PLUGIN_KEY in frontmatter;
}

export function sortBoardEntries(entries: BoardIndexEntry[]): BoardIndexEntry[] {
	return [...entries].sort(
		(a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
			a.path.localeCompare(b.path),
	);
}

export interface ResolvedBoardList {
	shown: BoardIndexEntry[];
	hidden: BoardIndexEntry[];
}

/**
 * The dashboard's sectioned board list. Every discovered board shows by
 * default: explicitly ordered boards (`boardPaths`) come first, the rest
 * follow alphabetically — so newly created boards appear without any
 * configuration. `unpinnedPaths` boards move to the hidden section (the
 * "Other boards" zippy, alphabetical) — hidden, not inaccessible.
 */
export function resolveBoardList(
	boards: BoardIndexEntry[],
	boardList: BoardListSettings | undefined,
): ResolvedBoardList {
	const orderedPaths = boardList?.boardPaths ?? [];
	const orderedPathSet = new Set(orderedPaths);
	const unpinnedPaths = new Set(boardList?.unpinnedPaths ?? []);
	const boardsByPath = new Map(boards.map((board) => [board.path, board]));

	const ordered = orderedPaths
		.filter((path) => !unpinnedPaths.has(path))
		.map((path) => boardsByPath.get(path))
		.filter((board): board is BoardIndexEntry => board !== undefined);
	const rest = sortBoardEntries(
		boards.filter(
			(board) => !orderedPathSet.has(board.path) && !unpinnedPaths.has(board.path),
		),
	);
	const hidden = sortBoardEntries(
		boards.filter((board) => unpinnedPaths.has(board.path)),
	);

	return { shown: [...ordered, ...rest], hidden };
}

/**
 * Board-list path lists after a vault rename, or null when nothing changed
 * (so callers can skip the settings write).
 */
export function rewriteBoardListPaths(
	boardList: BoardListSettings | undefined,
	oldPath: string,
	newPath: string,
): BoardListSettings | null {
	const boardPaths = boardList?.boardPaths ?? [];
	const unpinnedPaths = boardList?.unpinnedPaths ?? [];
	const rewrittenBoardPaths = boardPaths.map((path) =>
		rewriteBoardPath(path, oldPath, newPath),
	);
	const rewrittenUnpinnedPaths = unpinnedPaths.map((path) =>
		rewriteBoardPath(path, oldPath, newPath),
	);
	if (
		rewrittenBoardPaths.every((path, index) => path === boardPaths[index]) &&
		rewrittenUnpinnedPaths.every((path, index) => path === unpinnedPaths[index])
	) {
		return null;
	}
	return {
		...(rewrittenBoardPaths.length > 0 ? { boardPaths: rewrittenBoardPaths } : {}),
		...(rewrittenUnpinnedPaths.length > 0
			? { unpinnedPaths: rewrittenUnpinnedPaths }
			: {}),
	};
}

/**
 * Last-opened timestamps after a vault rename (file or ancestor folder), or
 * null when nothing changed (so callers can skip the settings write). A
 * rename collision keeps the later timestamp.
 */
export function rewriteLastOpenedPaths(
	lastOpenedByPath: Record<string, number> | undefined,
	oldPath: string,
	newPath: string,
): Record<string, number> | null {
	if (!lastOpenedByPath) {
		return null;
	}
	let changed = false;
	const rewritten: Record<string, number> = {};
	for (const [path, openedAt] of Object.entries(lastOpenedByPath)) {
		const nextPath = rewriteBoardPath(path, oldPath, newPath);
		changed ||= nextPath !== path;
		rewritten[nextPath] = Math.max(rewritten[nextPath] ?? 0, openedAt);
	}
	return changed ? rewritten : null;
}

/**
 * A path list with `draggedPath` moved before/after `targetPath` — the
 * dashboard card equivalent of the column editor's reorder.
 */
export function movePathRelativeTo(
	paths: string[],
	draggedPath: string,
	targetPath: string,
	position: "before" | "after",
): string[] {
	if (draggedPath === targetPath) {
		return paths;
	}
	const draggedIndex = paths.indexOf(draggedPath);
	const targetIndex = paths.indexOf(targetPath);
	if (draggedIndex < 0 || targetIndex < 0) {
		return paths;
	}
	const next = [...paths];
	next.splice(draggedIndex, 1);
	const baseTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
	next.splice(position === "after" ? baseTargetIndex + 1 : baseTargetIndex, 0, draggedPath);
	return next;
}
