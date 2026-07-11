import type { BoardIndexEntry } from "../boards/board_index";

export interface BoardCard {
	path: string;
	name: string;
	/** Parent folder path; "" for vault-root boards (no folder line shown). */
	folder: string;
	/** Epoch ms; undefined when the file cannot be found (e.g. mid-delete). */
	lastModified: number | undefined;
	/**
	 * Epoch ms of the last time a kanban view loaded this board; undefined
	 * for boards never opened since the plugin started recording
	 * (SPEC 0033 Phase 3c).
	 */
	lastOpened: number | undefined;
}

export type BoardStatLookup = (path: string) => { mtime: number } | null;

export function buildBoardCards(
	entries: BoardIndexEntry[],
	getStat: BoardStatLookup,
	lastOpenedByPath: Readonly<Record<string, number>> = {},
): BoardCard[] {
	return entries.map((entry) => ({
		path: entry.path,
		name: entry.name,
		folder: normalizeCardFolder(entry.folder),
		lastModified: getStat(entry.path)?.mtime,
		lastOpened: lastOpenedByPath[entry.path],
	}));
}

// Obsidian reports the vault root folder's path as "/"; the index may also
// carry "" when the parent is missing. Both mean "no folder line".
function normalizeCardFolder(folder: string): string {
	return folder === "/" ? "" : folder;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatLastModified(mtime: number, now: number): string {
	const elapsed = now - mtime;
	if (elapsed < MINUTE_MS) {
		return "just now";
	}
	if (elapsed < HOUR_MS) {
		return pluralAgo(Math.floor(elapsed / MINUTE_MS), "minute");
	}
	if (elapsed < DAY_MS) {
		return pluralAgo(Math.floor(elapsed / HOUR_MS), "hour");
	}
	if (elapsed < 7 * DAY_MS) {
		return pluralAgo(Math.floor(elapsed / DAY_MS), "day");
	}
	return new Date(mtime).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function pluralAgo(count: number, unit: string): string {
	return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}
