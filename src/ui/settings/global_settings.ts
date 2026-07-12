import { derived, writable, type Readable, type Writable } from "svelte/store";
import {
	defaultSettings,
	FlowDirection,
	parseSavedViewProperties,
	parseSettingsOverrides,
	type SavedView,
	type SavedViewProperties,
	type SettingValues,
} from "./settings_store";
import { savedViewHasProperties } from "../views/saved_views";
import {
	clampRailWidth,
	RAIL_MIN_WIDTH,
	type RailDock,
} from "../dashboard/board_rail_state";

export const GLOBAL_SETTINGS_VERSION = 1;

export interface GlobalSettings {
	version: typeof GLOBAL_SETTINGS_VERSION;
	boardDefaults: Partial<SettingValues>;
	defaultView?: GlobalDefaultViewProperties;
	globalViews?: SavedView[];
	boardList?: BoardListSettings;
	/**
	 * Board path → epoch ms of the last time a kanban view loaded it
	 * (SPEC 0033 Phase 3c). Usage state rather than a setting, but
	 * data.json is the plugin's only per-vault persistence. Neither the
	 * filesystem nor Obsidian records access times, so history starts empty
	 * on install and fills in as boards are opened.
	 */
	lastOpenedByPath?: Record<string, number>;
	/**
	 * Board rail (SPEC 0034). `width` is usage state like lastOpenedByPath —
	 * the rail's drag handle is the only control, absent = default (the
	 * button-column minimum). `dock` is a real plugin-wide setting chosen in
	 * the settings tab; absent = left. The width is left-dock state but kept
	 * while top-docked so switching back restores it.
	 */
	boardRail?: BoardRailSettings;
}

export interface BoardRailSettings {
	width?: number;
	dock?: RailDock;
}

// Dashboard curation (SPEC 0033, formerly the tabs settings). Every
// discovered board shows by default. `unpinnedPaths` moves boards under the
// dashboard's "Other boards" zippy; `boardPaths` fixes an explicit order for
// the boards it lists — boards absent from it (e.g. created later) follow
// alphabetically. A stray legacy `tabs` key in data.json is ignored (the
// tab strip never shipped in a release).
export interface BoardListSettings {
	boardPaths?: string[];
	unpinnedPaths?: string[];
}

export type GlobalDefaultViewProperties = Pick<SavedViewProperties, "flowDirection" | "columnWidth">;

export interface GlobalSettingsStore extends Writable<GlobalSettings> {
	get(): GlobalSettings;
}

export const BOARD_DEFAULT_SETTING_KEYS = [
	"columns",
	"uncategorizedColumnName",
	"doneColumnName",
	"uncategorizedVisibility",
	"doneVisibility",
	"doneStatusMarkers",
	"cancelledStatusMarkers",
	"ignoredStatusMarkers",
	"statusMarkerOrder",
	"propertySchema",
	"treatNestedTasksAsSubtasks",
	"scope",
	"excludePaths",
	"excludedTags",
	"excludedTaskTags",
	"showFilepath",
	"consolidateTags",
	"propertyDisplay",
] as const satisfies readonly (keyof SettingValues)[];

export const defaultGlobalSettings: GlobalSettings = {
	version: GLOBAL_SETTINGS_VERSION,
	boardDefaults: {},
};

export function createGlobalSettingsStore(
	initial: GlobalSettings = defaultGlobalSettings,
): GlobalSettingsStore {
	let current = cloneGlobalSettings(initial);
	const inner = writable<GlobalSettings>(current);

	return {
		subscribe: inner.subscribe,
		set: (next) => {
			current = cloneGlobalSettings(next);
			inner.set(current);
		},
		update: (updater) => {
			const next = updater(cloneGlobalSettings(current));
			current = cloneGlobalSettings(next);
			inner.set(current);
		},
		get: () => cloneGlobalSettings(current),
	};
}

export function createInheritedSettingsStore(
	globalSettingsStore: Readable<GlobalSettings>,
): Readable<Partial<SettingValues>> {
	return derived(globalSettingsStore, inheritedSettingsFromGlobalSettings);
}

export function parseGlobalSettings(data: unknown): GlobalSettings {
	if (!isRecord(data)) {
		return cloneGlobalSettings(defaultGlobalSettings);
	}

	const rawBoardDefaults = isRecord(data.boardDefaults) ? data.boardDefaults : {};
	const rawDefaultView = isRecord(data.defaultView) ? data.defaultView : undefined;
	const rawGlobalViews = Array.isArray(data.globalViews) ? data.globalViews : undefined;
	const rawBoardList = isRecord(data.boardList) ? data.boardList : undefined;
	const rawLastOpened = isRecord(data.lastOpenedByPath)
		? data.lastOpenedByPath
		: undefined;
	const rawBoardRail = isRecord(data.boardRail) ? data.boardRail : undefined;

	const parsedBoardDefaults = pickBoardDefaultSettings(
		parseSettingsOverrides(JSON.stringify(rawBoardDefaults)),
	);
	// An absent default view means "boards use the builtin layout defaults".
	// Explicit values equal to the builtin defaults (left-to-right flow,
	// 300px width) are indistinguishable from that, so they normalize to no
	// stored default (this also sheds the forced LTR that earlier builds
	// pinned into data.json).
	const parsedDefaultView = pickGlobalDefaultViewProperties(
		parseSavedViewProperties(rawDefaultView),
	);
	if (parsedDefaultView.flowDirection === FlowDirection.LeftToRight) {
		delete parsedDefaultView.flowDirection;
	}
	if (parsedDefaultView.columnWidth === defaultSettings.columnWidth) {
		delete parsedDefaultView.columnWidth;
	}
	const parsedGlobalViews = rawGlobalViews
		? (parseSettingsOverrides(JSON.stringify({ savedViews: rawGlobalViews })).savedViews ?? [])
			.filter(savedViewHasProperties)
		: undefined;

	const settings: GlobalSettings = {
		version: GLOBAL_SETTINGS_VERSION,
		boardDefaults: parsedBoardDefaults,
	};
	if (savedViewHasProperties(parsedDefaultView)) {
		settings.defaultView = parsedDefaultView;
	}
	if (parsedGlobalViews && parsedGlobalViews.length > 0) {
		settings.globalViews = parsedGlobalViews;
	}
	const parsedBoardList = parseBoardListSettings(rawBoardList);
	if (parsedBoardList) {
		settings.boardList = parsedBoardList;
	}
	const parsedLastOpened = parseLastOpenedByPath(rawLastOpened);
	if (parsedLastOpened) {
		settings.lastOpenedByPath = parsedLastOpened;
	}
	const parsedBoardRail = parseBoardRailSettings(rawBoardRail);
	if (parsedBoardRail) {
		settings.boardRail = parsedBoardRail;
	}
	return settings;
}

// Only non-default state persists: junk resets each field to its default,
// out-of-range widths clamp, a width equal to the default — including one
// that clamps down to it — sheds the field, and only an explicit "top" dock
// is stored ("left" is the default). An all-default rail sheds the key.
function parseBoardRailSettings(
	raw: Record<string, unknown> | undefined,
): BoardRailSettings | undefined {
	if (!raw) {
		return undefined;
	}
	const parsed: BoardRailSettings = {};
	if (typeof raw.width === "number" && Number.isFinite(raw.width)) {
		const width = clampRailWidth(raw.width);
		if (width !== RAIL_MIN_WIDTH) {
			parsed.width = width;
		}
	}
	if (raw.dock === "top") {
		parsed.dock = "top";
	}
	return Object.keys(parsed).length > 0 ? parsed : undefined;
}

// Like the board list, an empty map stays out of data.json entirely.
function parseLastOpenedByPath(
	raw: Record<string, unknown> | undefined,
): Record<string, number> | undefined {
	if (!raw) {
		return undefined;
	}
	const parsed: Record<string, number> = {};
	for (const [path, value] of Object.entries(raw)) {
		const trimmed = path.trim();
		if (trimmed === "" || typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
			continue;
		}
		parsed[trimmed] = value;
	}
	return Object.keys(parsed).length > 0 ? parsed : undefined;
}

// Board-list settings persist only in a non-default state ("everything
// shown, alphabetical" needs no key), so a default `data.json` stays free
// of the key.
function parseBoardListSettings(
	raw: Record<string, unknown> | undefined,
): BoardListSettings | undefined {
	if (!raw) {
		return undefined;
	}
	const boardPaths = normalizeBoardPaths(
		Array.isArray(raw.boardPaths) ? raw.boardPaths : [],
	);
	const unpinnedPaths = normalizeBoardPaths(
		Array.isArray(raw.unpinnedPaths) ? raw.unpinnedPaths : [],
	);
	if (boardPaths.length === 0 && unpinnedPaths.length === 0) {
		return undefined;
	}
	return {
		...(boardPaths.length > 0 ? { boardPaths } : {}),
		...(unpinnedPaths.length > 0 ? { unpinnedPaths } : {}),
	};
}

export function normalizeBoardPaths(paths: unknown[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const path of paths) {
		if (typeof path !== "string") {
			continue;
		}
		const trimmed = path.trim();
		if (trimmed === "" || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		normalized.push(trimmed);
	}
	return normalized;
}

export function serializeGlobalSettings(settings: GlobalSettings): GlobalSettings {
	return cloneGlobalSettings(parseGlobalSettings(settings));
}

export function inheritedSettingsFromGlobalSettings(
	settings: GlobalSettings,
): Partial<SettingValues> {
	return {
		...pickBoardDefaultSettings(settings.boardDefaults),
		...pickGlobalDefaultViewProperties(settings.defaultView ?? {}),
	};
}

export function pickGlobalDefaultViewProperties(
	view: SavedViewProperties,
): GlobalDefaultViewProperties {
	const picked: GlobalDefaultViewProperties = {};
	if (view.flowDirection !== undefined) {
		picked.flowDirection = view.flowDirection;
	}
	if (view.columnWidth !== undefined) {
		picked.columnWidth = view.columnWidth;
	}
	return picked;
}

export function pickBoardDefaultSettings(
	settings: Partial<SettingValues>,
): Partial<SettingValues> {
	const picked: Partial<SettingValues> = {};
	// The generic keeps each key's value type correlated with its slot, so
	// the copy needs no casts.
	const copy = <K extends (typeof BOARD_DEFAULT_SETTING_KEYS)[number]>(key: K) => {
		const value = settings[key];
		if (value !== undefined) {
			picked[key] = cloneJson(value);
		}
	};
	for (const key of BOARD_DEFAULT_SETTING_KEYS) {
		copy(key);
	}
	return picked;
}

export function setBoardDefault<K extends (typeof BOARD_DEFAULT_SETTING_KEYS)[number]>(
	settings: GlobalSettings,
	key: K,
	value: SettingValues[K],
): GlobalSettings {
	return {
		...settings,
		boardDefaults: {
			...settings.boardDefaults,
			[key]: cloneJson(value),
		},
	};
}

function cloneGlobalSettings(settings: GlobalSettings): GlobalSettings {
	return {
		version: GLOBAL_SETTINGS_VERSION,
		boardDefaults: pickBoardDefaultSettings(settings.boardDefaults ?? {}),
		...(settings.defaultView && savedViewHasProperties(settings.defaultView)
			? { defaultView: cloneJson(settings.defaultView) }
			: {}),
		...(settings.globalViews && settings.globalViews.length > 0
			? { globalViews: cloneJson(settings.globalViews) }
			: {}),
		...(settings.boardList &&
		((settings.boardList.boardPaths?.length ?? 0) > 0 ||
			(settings.boardList.unpinnedPaths?.length ?? 0) > 0)
			? { boardList: cloneJson(settings.boardList) }
			: {}),
		...(settings.lastOpenedByPath &&
		Object.keys(settings.lastOpenedByPath).length > 0
			? { lastOpenedByPath: cloneJson(settings.lastOpenedByPath) }
			: {}),
		...(settings.boardRail &&
		(settings.boardRail.width !== undefined ||
			settings.boardRail.dock !== undefined)
			? { boardRail: cloneJson(settings.boardRail) }
			: {}),
	};
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
