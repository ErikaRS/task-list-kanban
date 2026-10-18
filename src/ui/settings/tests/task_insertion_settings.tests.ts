import { describe, expect, it } from "vitest";
import { get, writable } from "svelte/store";
import { createSettingsStore, parseSettingsOverrides, parseSettingsString, toSettingsString } from "../settings_store";
import { inheritedSettingsFromGlobalSettings, parseGlobalSettings } from "../global_settings";

describe("new task placement settings", () => {
	it("preserves legacy defaults and sparse settings", () => {
		expect(parseSettingsString("{}")).toMatchObject({ newTaskHeading: "", newTaskPosition: "bottom" });
		expect(parseSettingsOverrides("{}")).toEqual({});
	});
	it("trims headings and round trips the shared pair", () => {
		const settings = parseSettingsOverrides('{"newTaskHeading":" Tasks ","newTaskPosition":"top"}');
		expect(parseSettingsOverrides(toSettingsString(settings))).toEqual({ newTaskHeading: "Tasks", newTaskPosition: "top" });
		expect(parseSettingsOverrides('{"newTaskHeading":"  "}')).toEqual({ newTaskHeading: "" });
	});
	it("rejects invalid placement fields without discarding other settings", () => {
		expect(parseSettingsOverrides(JSON.stringify({ newTaskHeading: "# Tasks", newTaskPosition: "middle", defaultTaskFile: "tasks.md" })))
			.toEqual({ newTaskHeading: "", newTaskPosition: "bottom", defaultTaskFile: "tasks.md" });
		expect(parseSettingsOverrides(JSON.stringify({ newTaskHeading: "A\nB" })).newTaskHeading).toBe("");
	});
	it("inherits, pins, reloads and resets placement while keeping the destination board-local", () => {
		const global = parseGlobalSettings({ boardDefaults: { newTaskHeading: "Tasks", newTaskPosition: "top", defaultTaskFile: "global.md" } });
		expect(global.boardDefaults).toEqual({ newTaskHeading: "Tasks", newTaskPosition: "top" });
		const inherited = writable(inheritedSettingsFromGlobalSettings(global));
		const board = createSettingsStore(inherited);
		expect(get(board)).toMatchObject({ newTaskHeading: "Tasks", newTaskPosition: "top", defaultTaskFile: "" });
		board.pinOverrides(["newTaskHeading", "newTaskPosition"]);
		inherited.set({ newTaskHeading: "Inbox", newTaskPosition: "bottom" });
		expect(get(board)).toMatchObject({ newTaskHeading: "Tasks", newTaskPosition: "top" });
		const reopened = createSettingsStore(inherited);
		reopened.load(parseSettingsOverrides(toSettingsString(board.getOverrides())));
		expect(get(reopened)).toMatchObject({ newTaskHeading: "Tasks", newTaskPosition: "top" });
		reopened.clearOverrides(["newTaskHeading", "newTaskPosition"]);
		expect(get(reopened)).toMatchObject({ newTaskHeading: "Inbox", newTaskPosition: "bottom" });
		board.destroy(); reopened.destroy();
	});
});
