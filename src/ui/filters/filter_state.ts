import type { SettingValues } from "../settings/settings_store";
import { emptyFilterQuery, serializeFilterQuery } from "./filter_query";

/**
 * Composes the SPEC 0029 query string equivalent to the four legacy
 * per-type filter fields. A legacy multi-tag selection becomes a single
 * comma OR-group (`tag:home,errand`), preserving its "any of" semantics.
 */
export function legacyFilterSettingsToQuery(settings: SettingValues): string {
	const query = emptyFilterQuery();

	// `"` is the query syntax's quoting character and not expressible as
	// content; stripping it keeps the migrated query round-trippable.
	const contentText = settings.lastContentFilter?.replace(/"/g, "").trim();
	if (contentText) {
		query.contentTerms.push(contentText);
	}

	const tags = (settings.lastTagFilter ?? []).filter((tag) => tag !== "");
	if (tags.length > 0) {
		query.tagGroups.push(tags);
	}

	// The legacy UI only ever read the first entry of lastFileFilter.
	const filePath = settings.lastFileFilter?.[0]?.replace(/"/g, "").trim();
	if (filePath) {
		query.filePaths.push(filePath);
	}

	query.dateConditions = (settings.lastDateFilter ?? []).map((condition) => ({
		...condition,
	}));

	return serializeFilterQuery(query);
}

/**
 * The board's persisted filter is the query string. A present `lastFilter`
 * always wins (even when empty); otherwise the legacy fields migrate at
 * read time.
 */
export function readBoardFilterState(settings: SettingValues): string {
	if (settings.lastFilter !== undefined) {
		return settings.lastFilter;
	}
	return legacyFilterSettingsToQuery(settings);
}

/**
 * Writes the query string and drops the legacy per-type fields, so a
 * board's frontmatter converges on `lastFilter` the first time its filter
 * changes after upgrade.
 */
export function writeBoardFilterState(
	settings: SettingValues,
	query: string,
): SettingValues {
	const next = { ...settings, lastFilter: query };
	delete next.lastContentFilter;
	delete next.lastTagFilter;
	delete next.lastFileFilter;
	delete next.lastDateFilter;
	return next;
}

/**
 * External-edit sync: incoming persisted state applies only while the
 * local query is unchanged from the last persisted one, so typing is never
 * clobbered by an echo of an older save.
 */
export function shouldApplyIncomingBoardFilterState(
	currentQuery: string,
	incomingQuery: string,
	lastPersistedQuery: string,
	hydrated: boolean,
): boolean {
	if (!hydrated) {
		return true;
	}
	return currentQuery === lastPersistedQuery && incomingQuery !== lastPersistedQuery;
}
