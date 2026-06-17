import { describe, expect, it } from "vitest";
import {
	readBoardFilterState,
	serializeBoardFilterState,
	writeBoardFilterState,
} from "../filter_state";
import { defaultSettings } from "../../settings/settings_store";

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
});
