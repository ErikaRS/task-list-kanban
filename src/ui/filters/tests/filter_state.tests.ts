import { describe, expect, it } from "vitest";
import {
	readBoardFilterState,
	serializeBoardFilterState,
	shouldApplyIncomingBoardFilterState,
	writeBoardFilterState,
} from "../filter_state";
import { defaultSettings } from "../../settings/settings_store";
import type { SettingValues } from "../../settings/settings_store";

function hydrateLikeMainComponent(settingsSequence: SettingValues[]) {
	let hydrated = false;
	let filterText = "";
	let selectedTags: string[] = [];
	let fileFilter = "";
	let lastPersistedFilterStateKey = "";

	for (const settings of settingsSequence) {
		const filterState = readBoardFilterState(settings);
		if (shouldApplyIncomingBoardFilterState(
			{
				contentText: filterText,
				tagValues: selectedTags,
				fileText: fileFilter,
			},
			filterState,
			lastPersistedFilterStateKey,
			hydrated,
		)) {
			filterText = filterState.contentText;
			selectedTags = filterState.tagValues;
			fileFilter = filterState.fileText;
			lastPersistedFilterStateKey = serializeBoardFilterState(filterState);
			hydrated = true;
		}
	}

	return {
		filterText,
		selectedTags,
		fileFilter,
		lastPersistedFilterStateKey,
	};
}

describe("board filter state", () => {
	it("reads persisted content, tag, and file filters from settings", () => {
		expect(readBoardFilterState({
			...defaultSettings,
			lastContentFilter: "invoice",
			lastTagFilter: ["work", "urgent"],
			lastFileFilter: ["tasks/inbox.md"],
		})).toEqual({
			contentText: "invoice",
			tagValues: ["work", "urgent"],
			fileText: "tasks/inbox.md",
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
		});

		expect(next).not.toBe(settings);
		expect(next.lastContentFilter).toBe("new");
		expect(next.lastTagFilter).toEqual(["tag"]);
		expect(next.lastFileFilter).toEqual([]);
		expect(settings.lastContentFilter).toBe("old");
	});

	it("serializes equivalent filter states deterministically", () => {
		const state = {
			contentText: "new",
			tagValues: ["tag"],
			fileText: "tasks.md",
		};

		expect(serializeBoardFilterState(state)).toBe(serializeBoardFilterState({ ...state }));
	});

	it("does not apply incoming settings after local filters diverge from persisted state", () => {
		const persistedState = {
			contentText: "",
			tagValues: [],
			fileText: "",
		};
		const localState = {
			contentText: "typed locally",
			tagValues: [],
			fileText: "",
		};
		const incomingState = {
			contentText: "settings update",
			tagValues: [],
			fileText: "",
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
});
