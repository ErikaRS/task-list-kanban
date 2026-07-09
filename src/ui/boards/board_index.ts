import type { App, EventRef, TFile } from "obsidian";
import { writable, type Readable } from "svelte/store";
import type { TabsSettings } from "../settings/global_settings";

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

/**
 * The tabs actually shown for a board: all discovered boards alphabetically,
 * with the current board always included. A strip with fewer than two tabs
 * is noise, so it resolves to nothing.
 */
export function resolveTabEntries(
	boards: BoardIndexEntry[],
	tabs: TabsSettings | undefined,
	currentPath: string | null,
): BoardIndexEntry[] {
	if (!tabs?.enabled) {
		return [];
	}
	let entries = sortBoardEntries(boards);
	if (currentPath !== null && !entries.some((entry) => entry.path === currentPath)) {
		const current = boards.find((board) => board.path === currentPath);
		if (current) {
			entries = [...entries, current];
		}
	}
	return entries.length >= 2 ? entries : [];
}
