import { describe, expect, it } from "vitest";
import {
	legacyFilterSettingsToQuery,
	readBoardFilterState,
	shouldApplyIncomingBoardFilterState,
	writeBoardFilterState,
} from "../filter_state";
import { parseFilterQuery } from "../filter_query";
import { defaultSettings } from "../../settings/settings_store";
import type { SettingValues } from "../../settings/settings_store";

const DATE_KEYS = ["due", "scheduled"];

function hydrateLikeMainComponent(settingsSequence: SettingValues[]) {
	let hydrated = false;
	let query = "";
	let lastPersistedQuery = "";

	for (const settings of settingsSequence) {
		const incoming = readBoardFilterState(settings);
		if (shouldApplyIncomingBoardFilterState(
			query,
			incoming,
			lastPersistedQuery,
			hydrated,
		)) {
			query = incoming;
			lastPersistedQuery = incoming;
			hydrated = true;
		}
	}

	return { query, lastPersistedQuery };
}

describe("legacy filter migration", () => {
	it("migrates a content filter to a content term", () => {
		expect(
			legacyFilterSettingsToQuery({
				...defaultSettings,
				lastContentFilter: "invoice",
			}),
		).toBe("invoice");
	});

	it("quotes a migrated content filter containing spaces", () => {
		expect(
			legacyFilterSettingsToQuery({
				...defaultSettings,
				lastContentFilter: "big rocks",
			}),
		).toBe('"big rocks"');
	});

	it("strips unexpressible quote characters during migration", () => {
		expect(
			legacyFilterSettingsToQuery({
				...defaultSettings,
				lastContentFilter: 'say "hi"',
			}),
		).toBe('"say hi"');
	});

	it("migrates a multi-tag filter to one comma OR-group", () => {
		const query = legacyFilterSettingsToQuery({
			...defaultSettings,
			lastTagFilter: ["work", "urgent"],
		});
		expect(query).toBe("tag:work,urgent");
		expect(parseFilterQuery(query, DATE_KEYS).tagGroups).toEqual([
			["work", "urgent"],
		]);
	});

	it("migrates the first file filter entry", () => {
		expect(
			legacyFilterSettingsToQuery({
				...defaultSettings,
				lastFileFilter: ["tasks/inbox.md", "ignored.md"],
			}),
		).toBe("file:tasks/inbox.md");
	});

	it("migrates date conditions", () => {
		expect(
			legacyFilterSettingsToQuery({
				...defaultSettings,
				lastDateFilter: [
					{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
					{ property: "due", operator: "on", value: "2026-07-01" },
				],
			}),
		).toBe("scheduled:<=$TODAY due:=2026-07-01");
	});

	it("migrates combined legacy fields into one equivalent query", () => {
		const query = legacyFilterSettingsToQuery({
			...defaultSettings,
			lastContentFilter: "fix",
			lastTagFilter: ["home", "errand"],
			lastFileFilter: ["projects"],
			lastDateFilter: [
				{ property: "due", operator: "before", value: "$TODAY" },
			],
		});
		expect(query).toBe("fix tag:home,errand file:projects due:<$TODAY");
		expect(parseFilterQuery(query, DATE_KEYS)).toEqual({
			contentTerms: ["fix"],
			tagGroups: [["home", "errand"]],
			filePaths: ["projects"],
			dateConditions: [
				{ property: "due", operator: "before", value: "$TODAY" },
			],
		});
	});

	it("migrates empty legacy fields to an empty query", () => {
		expect(legacyFilterSettingsToQuery(defaultSettings)).toBe("");
	});
});

describe("readBoardFilterState", () => {
	it("prefers lastFilter over legacy fields, even when empty", () => {
		const settings: SettingValues = {
			...defaultSettings,
			lastFilter: "tag:home",
			lastContentFilter: "legacy",
		};
		expect(readBoardFilterState(settings)).toBe("tag:home");
		expect(readBoardFilterState({ ...settings, lastFilter: "" })).toBe("");
	});

	it("falls back to legacy migration when lastFilter is absent", () => {
		expect(
			readBoardFilterState({
				...defaultSettings,
				lastContentFilter: "invoice",
			}),
		).toBe("invoice");
	});
});

describe("writeBoardFilterState", () => {
	it("writes lastFilter and drops legacy fields without mutating input", () => {
		const settings: SettingValues = {
			...defaultSettings,
			lastContentFilter: "old",
			lastTagFilter: ["old"],
			lastFileFilter: ["old.md"],
			lastDateFilter: [
				{ property: "due", operator: "before", value: "$TODAY" },
			],
		};

		const next = writeBoardFilterState(settings, "tag:home fix");

		expect(next).not.toBe(settings);
		expect(next.lastFilter).toBe("tag:home fix");
		expect(next).not.toHaveProperty("lastContentFilter");
		expect(next).not.toHaveProperty("lastTagFilter");
		expect(next).not.toHaveProperty("lastFileFilter");
		expect(next).not.toHaveProperty("lastDateFilter");
		expect(settings.lastContentFilter).toBe("old");
	});
});

describe("shouldApplyIncomingBoardFilterState", () => {
	it("always applies before hydration", () => {
		expect(shouldApplyIncomingBoardFilterState("typed", "incoming", "", false)).toBe(true);
	});

	it("does not apply after local edits diverge from persisted state", () => {
		expect(
			shouldApplyIncomingBoardFilterState("typed locally", "settings update", "", true),
		).toBe(false);
	});

	it("applies an external change while local state matches persisted state", () => {
		expect(
			shouldApplyIncomingBoardFilterState("tag:home", "tag:work", "tag:home", true),
		).toBe(true);
	});

	it("ignores an echo of the already-persisted state", () => {
		expect(
			shouldApplyIncomingBoardFilterState("tag:home", "tag:home", "tag:home", true),
		).toBe(false);
	});

	it("hydrates a persisted legacy filter arriving after default settings", () => {
		expect(
			hydrateLikeMainComponent([
				defaultSettings,
				{ ...defaultSettings, lastContentFilter: "invoice" },
			]),
		).toMatchObject({ query: "invoice" });
	});

	it("hydrates a persisted lastFilter query arriving after default settings", () => {
		expect(
			hydrateLikeMainComponent([
				defaultSettings,
				{ ...defaultSettings, lastFilter: 'fix tag:home,errand due:<$TODAY' },
			]),
		).toMatchObject({ query: "fix tag:home,errand due:<$TODAY" });
	});
});
