import { dump, load } from "js-yaml";
import {
	parseSettingsOverrides,
	resolveSettings,
	toSettingsString,
	ScopeOption,
	type SettingValues,
} from "./settings/settings_store";

import {
	PATH_SCOPE_FRONTMATTER_KEY,
	parsePathScope,
	pathScopeMatchesLegacy,
	type PathScopeV2,
} from "./tasks/path_scope";

const KANBAN_PLUGIN_KEY = "kanban_plugin";
const FRONTMATTER_DELIMITER = "---";

export function parseKanbanSettingsFromViewData(data: string): SettingValues {
	return resolveSettings(parseKanbanSettingsOverridesFromViewData(data));
}

/**
 * The sparse overrides actually stored in the file's frontmatter — what the
 * board settings store loads, and the only shape that gets written back.
 */
export function parseKanbanSettingsOverridesFromViewData(
	data: string,
): Partial<SettingValues> {
	const parsed = parseFrontmatter(data);
	return parseSettingsOverrides(toSettingsPayload(parsed.data[KANBAN_PLUGIN_KEY]));
}

export function writeKanbanSettingsToViewData(
	data: string,
	settings: Partial<SettingValues>,
	pathScope?: PathScopeV2,
): string {
	const parsed = parseFrontmatter(data);
	// Always materialize the projection's folder list while a sidecar exists.
	// Sparse legacy overrides otherwise omit an empty `scopeFolders`, which
	// would make an inactive sidecar look stale when the board next opens.
	const legacySettings = pathScope
		? {
				...settings,
				scopeFolders: pathScope.compatibilityProjection.scopeFolders,
				...(pathScope.active ? { scope: ScopeOption.SelectedFolders } : {}),
			}
		: settings;
	const nextFrontmatter: Record<string, unknown> = {
		...parsed.data,
		[KANBAN_PLUGIN_KEY]: toSettingsString(legacySettings),
	};
	if (pathScope) {
		nextFrontmatter[PATH_SCOPE_FRONTMATTER_KEY] = pathScope;
	} else {
		delete nextFrontmatter[PATH_SCOPE_FRONTMATTER_KEY];
	}
	return stringifyFrontmatter(parsed.content, {
		...nextFrontmatter,
	});
}

/**
 * Returns canonical Selected-paths data only when its compatibility projection
 * still matches the legacy payload. A mismatch means an older plugin (or an
 * external edit) changed the legacy scope, which takes precedence.
 */
export function parseKanbanPathScopeFromViewData(data: string): PathScopeV2 | undefined {
	const parsed = parseFrontmatter(data);
	const pathScope = parsePathScope(parsed.data[PATH_SCOPE_FRONTMATTER_KEY]);
	if (!pathScope) return undefined;
	const legacy = parseLegacyScope(toSettingsPayload(parsed.data[KANBAN_PLUGIN_KEY]));
	return pathScopeMatchesLegacy(pathScope, legacy.scope, legacy.scopeFolders)
		? pathScope
		: undefined;
}

interface ParsedFrontmatter {
	data: Record<string, unknown>;
	content: string;
}

function parseFrontmatter(data: string): ParsedFrontmatter {
	if (!data.startsWith(FRONTMATTER_DELIMITER)) {
		return { data: {}, content: data };
	}

	if (data.charAt(FRONTMATTER_DELIMITER.length) === "-") {
		return { data: {}, content: data };
	}

	const startOfFrontmatter = data.indexOf("\n") + 1;
	if (startOfFrontmatter === 0) {
		return { data: {}, content: "" };
	}

	const endDelimiterStart = data.indexOf(`\n${FRONTMATTER_DELIMITER}`, startOfFrontmatter);
	const frontmatterEnd = endDelimiterStart === -1 ? data.length : endDelimiterStart;
	const rawFrontmatter = data.slice(startOfFrontmatter, frontmatterEnd);
	const parsed = rawFrontmatter.trim() === "" ? {} : load(rawFrontmatter);
	const frontmatter = isRecord(parsed) ? parsed : {};

	if (endDelimiterStart === -1) {
		return { data: frontmatter, content: "" };
	}

	let content = data.slice(endDelimiterStart + FRONTMATTER_DELIMITER.length + 1);
	if (content.startsWith("\r")) {
		content = content.slice(1);
	}
	if (content.startsWith("\n")) {
		content = content.slice(1);
	}

	return { data: frontmatter, content };
}

function stringifyFrontmatter(
	content: string,
	frontmatter: Record<string, unknown>,
): string {
	const rawFrontmatter = dump(frontmatter).trim();
	const prefix =
		rawFrontmatter === "{}"
			? ""
			: `${FRONTMATTER_DELIMITER}\n${rawFrontmatter}\n${FRONTMATTER_DELIMITER}\n`;

	return `${prefix}${ensureTrailingNewline(content)}`;
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value : `${value}\n`;
}

function parseLegacyScope(payload: string): {
	scope: unknown;
	scopeFolders: unknown;
} {
	try {
		const parsed = JSON.parse(payload);
		if (!isRecord(parsed)) return { scope: undefined, scopeFolders: undefined };
		return { scope: parsed.scope, scopeFolders: parsed.scopeFolders };
	} catch {
		return { scope: undefined, scopeFolders: undefined };
	}
}

/**
 * A raw frontmatter `kanban_plugin` value as the JSON string
 * `parseSettingsOverrides` expects. The value is a string when this module
 * wrote it, but hand-authored or template frontmatter can carry an object
 * (`kanban_plugin: {}`) — and the metadata cache (the dashboard's no-read
 * settings source) surfaces whichever shape the file has.
 */
export function toSettingsPayload(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value == null) {
		return "";
	}

	return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
