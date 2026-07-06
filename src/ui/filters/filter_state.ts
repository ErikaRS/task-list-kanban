import type { SavedFilter, SettingValues } from "../settings/settings_store";
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
 * A saved filter as the UI consumes it: the stored entry with its query
 * already resolved through savedFilterToQuery.
 */
export interface SavedFilterEntry {
	id: string;
	name?: string;
	query: string;
	isGlobal?: boolean;
}

/**
 * The query string a saved filter applies. New-style entries carry it
 * directly; legacy slot-based entries (content/tag/file/date) convert at
 * read time with the same rules as legacyFilterSettingsToQuery — a
 * multi-tag slot becomes one comma OR-group, preserving its "any of"
 * semantics. Entries are never rewritten in frontmatter; they stay in
 * legacy form until deleted.
 */
export function savedFilterToQuery(filter: SavedFilter): string {
	if (filter.query !== undefined) {
		return filter.query;
	}

	const query = emptyFilterQuery();

	const contentText = filter.content?.text.replace(/"/g, "").trim();
	if (contentText) {
		query.contentTerms.push(contentText);
	}

	const tags = (filter.tag?.tags ?? []).filter((tag) => tag !== "");
	if (tags.length > 0) {
		query.tagGroups.push(tags);
	}

	// The legacy UI only ever saved and read a single file path.
	const filePath = filter.file?.filepaths[0]?.replace(/"/g, "").trim();
	if (filePath) {
		query.filePaths.push(filePath);
	}

	query.dateConditions = (filter.date?.conditions ?? []).map((condition) => ({
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
