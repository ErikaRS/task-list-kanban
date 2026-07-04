import { describe, expect, it } from "vitest";
import {
	readBoardFilterState,
	serializeBoardFilterState,
	shouldApplyIncomingBoardFilterState,
	writeBoardFilterState,
} from "../filter_state";
import { defaultSettings } from "../../settings/settings_store";
import type { DateFilterCondition, SettingValues } from "../../settings/settings_store";

function hydrateLikeMainComponent(settingsSequence: SettingValues[]) {
	let hydrated = false;
	let filterText = "";
	let selectedTags: string[] = [];
	let fileFilter = "";
	let dateConditions: DateFilterCondition[] = [];
	let lastPersistedFilterStateKey = "";

	for (const settings of settingsSequence) {
		const filterState = readBoardFilterState(settings);
		if (shouldApplyIncomingBoardFilterState(
			{
				contentText: filterText,
				tagValues: selectedTags,
				fileText: fileFilter,
				dateConditions,
			},
			filterState,
			lastPersistedFilterStateKey,
			hydrated,
		)) {
			filterText = filterState.contentText;
			selectedTags = filterState.tagValues;
			fileFilter = filterState.fileText;
			dateConditions = filterState.dateConditions;
			lastPersistedFilterStateKey = serializeBoardFilterState(filterState);
			hydrated = true;
		}
	}

	return {
		filterText,
		selectedTags,
		fileFilter,
		dateConditions,
		lastPersistedFilterStateKey,
	};
}

describe("board filter state", () => {
	it("reads persisted content, tag, file, and date filters from settings", () => {
		expect(readBoardFilterState({
			...defaultSettings,
			lastContentFilter: "invoice",
			lastTagFilter: ["work", "urgent"],
			lastFileFilter: ["tasks/inbox.md"],
			lastDateFilter: [
				{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
			],
		})).toEqual({
			contentText: "invoice",
			tagValues: ["work", "urgent"],
			fileText: "tasks/inbox.md",
			dateConditions: [
				{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
			],
		});
	});

	it("writes filter state without mutating the previous settings object", () => {
		const settings = {
			...defaultSettings,
			lastContentFilter: "old",
			lastTagFilter: ["old"],
			lastFileFilter: ["old.md"],
		};

		const next = writeBoardFilterState(settings, {
			contentText: "new",
			tagValues: ["tag"],
			fileText: "",
			dateConditions: [
				{ property: "due", operator: "before", value: "$TODAY" },
			],
		});

		expect(next).not.toBe(settings);
		expect(next.lastContentFilter).toBe("new");
		expect(next.lastTagFilter).toEqual(["tag"]);
		expect(next.lastFileFilter).toEqual([]);
		expect(next.lastDateFilter).toEqual([
			{ property: "due", operator: "before", value: "$TODAY" },
		]);
		expect(settings.lastContentFilter).toBe("old");
	});

	it("serializes equivalent filter states deterministically", () => {
		const state = {
			contentText: "new",
			tagValues: ["tag"],
			fileText: "tasks.md",
			dateConditions: [
				{ property: "due", operator: "before" as const, value: "$TODAY" },
			],
		};

		expect(serializeBoardFilterState(state)).toBe(serializeBoardFilterState({ ...state }));
	});

	it("serializes date conditions independently of stored key order", () => {
		const state = {
			contentText: "",
			tagValues: [],
			fileText: "",
			dateConditions: [
				{ property: "due", operator: "before" as const, value: "$TODAY" },
			],
		};
		const reordered = {
			...state,
			dateConditions: [
				{ value: "$TODAY", operator: "before" as const, property: "due" },
			],
		};

		expect(serializeBoardFilterState(state)).toBe(serializeBoardFilterState(reordered));
	});

	it("does not apply incoming settings after local filters diverge from persisted state", () => {
		const persistedState = {
			contentText: "",
			tagValues: [],
			fileText: "",
			dateConditions: [],
		};
		const localState = {
			contentText: "typed locally",
			tagValues: [],
			fileText: "",
			dateConditions: [],
		};
		const incomingState = {
			contentText: "settings update",
			tagValues: [],
			fileText: "",
			dateConditions: [],
		};

		expect(shouldApplyIncomingBoardFilterState(
			localState,
			incomingState,
			serializeBoardFilterState(persistedState),
			true,
		)).toBe(false);
	});

	it("hydrates a persisted content filter when board settings arrive after default settings", () => {
		const persistedSettings = {
			...defaultSettings,
			lastContentFilter: "invoice",
		};

		expect(hydrateLikeMainComponent([defaultSettings, persistedSettings])).toMatchObject({
			filterText: "invoice",
		});
	});

	it("hydrates a persisted tag filter when board settings arrive after default settings", () => {
		const persistedSettings = {
			...defaultSettings,
			lastTagFilter: ["work", "urgent"],
		};

		expect(hydrateLikeMainComponent([defaultSettings, persistedSettings])).toMatchObject({
			selectedTags: ["work", "urgent"],
		});
	});

	it("hydrates a persisted file filter when board settings arrive after default settings", () => {
		const persistedSettings = {
			...defaultSettings,
			lastFileFilter: ["tasks/inbox.md"],
		};

		expect(hydrateLikeMainComponent([defaultSettings, persistedSettings])).toMatchObject({
			fileFilter: "tasks/inbox.md",
		});
	});

	it("hydrates a persisted date filter when board settings arrive after default settings", () => {
		const persistedSettings: SettingValues = {
			...defaultSettings,
			lastDateFilter: [
				{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
			],
		};

		expect(hydrateLikeMainComponent([defaultSettings, persistedSettings])).toMatchObject({
			dateConditions: [
				{ property: "scheduled", operator: "on-or-before", value: "$TODAY" },
			],
		});
	});
});
