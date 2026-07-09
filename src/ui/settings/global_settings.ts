import { derived, writable, type Readable, type Writable } from "svelte/store";
import {
	parseSavedViewProperties,
	parseSettingsOverrides,
	FlowDirection,
	type SavedView,
	type SavedViewProperties,
	type SettingValues,
} from "./settings_store";
import { savedViewHasProperties } from "../views/saved_views";

export const GLOBAL_SETTINGS_VERSION = 1;

export interface GlobalSettings {
	version: typeof GLOBAL_SETTINGS_VERSION;
	boardDefaults: Partial<SettingValues>;
	defaultView?: GlobalDefaultViewProperties;
	globalViews?: SavedView[];
	tabs?: TabsSettings;
}

export interface TabsSettings {
	enabled: boolean;
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
	defaultView: {
		flowDirection: FlowDirection.LeftToRight,
	},
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
	const rawTabs = isRecord(data.tabs) ? data.tabs : undefined;

	const parsedBoardDefaults = pickBoardDefaultSettings(
		parseSettingsOverrides(JSON.stringify(rawBoardDefaults)),
	);
	const parsedDefaultView = pickGlobalDefaultViewProperties(
		parseSavedViewProperties(rawDefaultView),
	);
	parsedDefaultView.flowDirection = parsedDefaultView.flowDirection ?? FlowDirection.LeftToRight;
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
	const parsedTabs = parseTabsSettings(rawTabs);
	if (parsedTabs) {
		settings.tabs = parsedTabs;
	}
	return settings;
}

// Tabs settings persist only in their non-default state (enabled), so a
// default `data.json` stays free of the key.
function parseTabsSettings(raw: Record<string, unknown> | undefined): TabsSettings | undefined {
	if (!raw || raw.enabled !== true) {
		return undefined;
	}
	return { enabled: true };
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
		...(settings.tabs?.enabled ? { tabs: cloneJson(settings.tabs) } : {}),
	};
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
