import { derived, writable, type Readable, type Writable } from "svelte/store";
import {
	parseSavedViewProperties,
	parseSettingsOverrides,
	FlowDirection,
	type SavedView,
	type SavedViewProperties,
	type SettingValues,
} from "./settings_store";

export const GLOBAL_SETTINGS_VERSION = 1;

export interface GlobalSettings {
	version: typeof GLOBAL_SETTINGS_VERSION;
	boardDefaults: Partial<SettingValues>;
	defaultView?: GlobalDefaultViewProperties;
	globalViews?: SavedView[];
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

const boardDefaultSettingKeySet = new Set<keyof SettingValues>(BOARD_DEFAULT_SETTING_KEYS);

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

	const parsedBoardDefaults = pickBoardDefaultSettings(
		parseSettingsOverrides(JSON.stringify(rawBoardDefaults)),
	);
	const parsedDefaultView = pickGlobalDefaultViewProperties(
		parseSavedViewProperties(rawDefaultView),
	);
	parsedDefaultView.flowDirection = parsedDefaultView.flowDirection ?? FlowDirection.LeftToRight;
	const parsedGlobalViews = rawGlobalViews
		? (parseSettingsOverrides(JSON.stringify({ savedViews: rawGlobalViews })).savedViews ?? [])
			.filter(savedViewHasViewProperties)
		: undefined;

	const settings: GlobalSettings = {
		version: GLOBAL_SETTINGS_VERSION,
		boardDefaults: parsedBoardDefaults,
	};
	if (savedViewPropertiesHaveValues(parsedDefaultView)) {
		settings.defaultView = parsedDefaultView;
	}
	if (parsedGlobalViews && parsedGlobalViews.length > 0) {
		settings.globalViews = parsedGlobalViews;
	}
	return settings;
}

export function serializeGlobalSettings(settings: GlobalSettings): GlobalSettings {
	return cloneGlobalSettings(parseGlobalSettings(settings));
}

export function inheritedSettingsFromGlobalSettings(
	settings: GlobalSettings,
): Partial<SettingValues> {
	return {
		...pickBoardDefaultSettings(settings.boardDefaults),
		...globalDefaultViewToSettings(settings.defaultView),
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

function globalDefaultViewToSettings(
	view: GlobalDefaultViewProperties | undefined,
): Partial<SettingValues> {
	if (!view) {
		return {};
	}

	const settings: Partial<SettingValues> = {};
	if (view.flowDirection !== undefined) {
		settings.flowDirection = view.flowDirection;
	}
	if (view.columnWidth !== undefined) {
		settings.columnWidth = view.columnWidth;
	}
	return settings;
}

export function pickBoardDefaultSettings(
	settings: Partial<SettingValues>,
): Partial<SettingValues> {
	const picked: Partial<SettingValues> = {};
	const pickedRecord = picked as Record<string, unknown>;
	const settingsRecord = settings as Record<string, unknown>;
	for (const key of Object.keys(settingsRecord) as Array<keyof SettingValues>) {
		if (!boardDefaultSettingKeySet.has(key)) {
			continue;
		}
		const value = settingsRecord[key];
		if (value === undefined) {
			continue;
		}
		pickedRecord[key] = cloneJson(value);
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

function savedViewPropertiesHaveValues(view: SavedViewProperties): boolean {
	return Object.keys(view).length > 0;
}

function savedViewHasViewProperties(view: SavedView): boolean {
	return (
		view.query !== undefined ||
		view.sort !== undefined ||
		view.group !== undefined ||
		view.flowDirection !== undefined ||
		view.columnWidth !== undefined
	);
}

function cloneGlobalSettings(settings: GlobalSettings): GlobalSettings {
	return {
		version: GLOBAL_SETTINGS_VERSION,
		boardDefaults: pickBoardDefaultSettings(settings.boardDefaults ?? {}),
		...(settings.defaultView && savedViewPropertiesHaveValues(settings.defaultView)
			? { defaultView: cloneJson(settings.defaultView) }
			: {}),
		...(settings.globalViews && settings.globalViews.length > 0
			? { globalViews: cloneJson(settings.globalViews) }
			: {}),
	};
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
