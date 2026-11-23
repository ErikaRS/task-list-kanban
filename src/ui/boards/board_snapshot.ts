// Board snapshot: a board's resolved settings and parsed tasks, read without
// a TextFileView, tasks store, or task actions (SPEC 0057).
//
// Two consumers share this so they cannot disagree on what a board contains:
// the dashboard's per-board counts (`board_stats.ts`) and, from SPEC 0057
// Phase 3, the read-only embedded board. The live board parses through the
// tasks store (`tasks/store.ts`) with the same `updateMapsFromFile`; any new
// input to that parser must be passed from both places.
import type { TFile } from "obsidian";
import { readable } from "svelte/store";
import {
	parseSettingsOverrides,
	resolveSettings,
	ScopeOption,
	type SettingValues,
} from "../settings/settings_store";
import {
	inheritedSettingsFromGlobalSettings,
	type GlobalSettings,
} from "../settings/global_settings";
import {
	getProtectedBoardFolderPath,
	resolveScopeFilter,
	shouldIncludeFilePath,
} from "../tasks/scope";
import { pathScopeMatchesLegacy, type PathScopeV2 } from "../tasks/path_scope";
import { createColumnData } from "../columns/columns";
import { getMarkerSettings, updateMapsFromFile, type Metadata } from "../tasks/tasks";
import type { Task } from "../tasks/task";

/**
 * What a snapshot needs from the app, narrowed so tests can fake it with
 * plain objects. Everything except `cachedRead` must stay free of file
 * reads: settings come from the metadata cache and mtimes from `TFile.stat`,
 * so resolving scope and the cache key costs stats, not I/O.
 */
export interface BoardSnapshotHost {
	getMarkdownFiles(): TFile[];
	cachedRead(file: TFile): Promise<string>;
	/** The board's `kanban_plugin` frontmatter payload (may be empty/invalid). */
	getBoardSettingsPayload(file: TFile): string;
	/** Canonical Selected-paths sidecar, if this board has one. */
	getBoardPathScope?(file: TFile): PathScopeV2 | undefined;
	getGlobalSettings(): GlobalSettings;
}

/** A board's resolved settings and the files its scope selects. No reads. */
export interface BoardScope {
	boardFile: TFile;
	settings: SettingValues;
	inScopeFiles: TFile[];
}

export interface BoardSnapshot extends BoardScope {
	tasks: Task[];
	/** Changes whenever the parsed tasks could change; see `boardParseKey`. */
	cacheKey: string;
}

// The resolved settings that can change which tasks a board parses: file
// selection (scope/excludes) and task parsing (columns, markers, schema,
// subtasks). Display-only settings — visibility, filters, sort, grouping,
// collapse — are deliberately absent: they are applied after parsing, so
// changing them must not force a re-parse.
export const PARSE_SETTING_KEYS = [
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
 * Resolves a board's settings the way a live KanbanView does — builtin
 * defaults ⊕ global defaults ⊕ the board's sparse overrides, with the
 * overrides read from cached frontmatter — plus Selected-paths scope, and
 * selects the in-scope files. Returns undefined when the board file is gone.
 */
export function resolveBoardScope(
	host: BoardSnapshotHost,
	boardPath: string,
	now: Date,
): BoardScope | undefined {
	const files = host.getMarkdownFiles();
	const boardFile = files.find((file) => file.path === boardPath);
	if (!boardFile) {
		return undefined;
	}

	let settings = resolveSettings(
		parseSettingsOverrides(host.getBoardSettingsPayload(boardFile)),
		inheritedSettingsFromGlobalSettings(host.getGlobalSettings()),
	);
	const candidatePathScope = host.getBoardPathScope?.(boardFile);
	const pathScope = candidatePathScope?.active && pathScopeMatchesLegacy(
		candidatePathScope,
		settings.scope,
		settings.scopeFolders ?? [],
	)
		? candidatePathScope
		: undefined;
	if (pathScope) {
		settings = { ...settings, scope: ScopeOption.SelectedPaths };
	}
	const boardFolder = boardFile.parent?.path ?? null;
	const scopeFilter = resolveScopeFilter(
		settings.scope,
		settings.scopeFolders,
		boardFolder,
		pathScope,
		now,
	);
	const excludePaths = settings.excludePaths ?? [];
	const excludeFilter = excludePaths.length > 0 ? excludePaths : null;
	const inScopeFiles = files.filter((file) =>
		shouldIncludeFilePath(
			file.path,
			scopeFilter,
			excludeFilter,
			getProtectedBoardFolderPath(settings.scope, boardFolder),
		),
	);

	return { boardFile, settings, inScopeFiles };
}

/**
 * Cheap to compute (no reads): any change that could alter the parsed
 * tasks — parse settings, scope, a file edit, a file add/remove — changes
 * the key, and an unchanged key means the previous parse is still valid.
 * `extra` lets a caller fold in inputs of its own (labels, the day).
 */
export function boardParseKey(
	settings: SettingValues,
	inScopeFiles: readonly TFile[],
	extra?: Record<string, unknown>,
): string {
	const relevantSettings: Partial<Record<keyof SettingValues, unknown>> = {};
	for (const key of PARSE_SETTING_KEYS) {
		relevantSettings[key] = settings[key];
	}
	const files = inScopeFiles
		.map((file) => [file.path, file.stat.mtime] as const)
		.sort((a, b) => a[0].localeCompare(b[0]));
	return JSON.stringify({ settings: relevantSettings, files, ...extra });
}

/** Parses every in-scope file through the live board's parser. */
export async function parseBoardTasks(
	host: Pick<BoardSnapshotHost, "cachedRead">,
	settings: SettingValues,
	inScopeFiles: readonly TFile[],
): Promise<Task[]> {
	const { columnPlacementTagTable } = createColumnData(settings.columns);
	const columnDefinitionsStore = readable(settings.columns);
	const columnPlacementTagTableStore = readable(columnPlacementTagTable);
	const markerSettings = getMarkerSettings(settings);
	const tasksByTaskId = new Map<string, Task>();
	const metadataByTaskId = new Map<string, Metadata>();
	const taskIdsByFileHandle = new Map<TFile, Set<string>>();

	for (const fileHandle of inScopeFiles) {
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

	return [...tasksByTaskId.values()];
}

/** Resolves scope and parses tasks in one step. */
export async function loadBoardSnapshot(
	host: BoardSnapshotHost,
	boardPath: string,
	now: Date,
): Promise<BoardSnapshot | undefined> {
	const scope = resolveBoardScope(host, boardPath, now);
	if (!scope) {
		return undefined;
	}
	const tasks = await parseBoardTasks(host, scope.settings, scope.inScopeFiles);
	return {
		...scope,
		tasks,
		cacheKey: boardParseKey(scope.settings, scope.inScopeFiles),
	};
}
