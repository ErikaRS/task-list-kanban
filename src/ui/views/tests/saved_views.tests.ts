import { describe, expect, it } from "vitest";
import { ColumnOrderMode } from "../../../parsing/properties/comparators";
import {
	defaultSettings,
	FlowDirection,
	type SavedView,
	type SettingValues,
} from "../../settings/settings_store";
import {
	applySavedViewProperties,
	captureSavedViewProperties,
	mergeLocalAndGlobalSavedViews,
	savedViewHasProperties,
	savedViewIsQueryOnly,
	savedViewPropertyLabels,
} from "../saved_views";

describe("saved view helpers", () => {
	it("captures nothing when no view settings are overrides", () => {
		const captured = captureSavedViewProperties(defaultSettings, {});

		expect(captured).toEqual({});
		expect(savedViewIsQueryOnly(captured)).toBe(false);
		expect(savedViewHasProperties(captured)).toBe(false);
	});

	it("captures explicit sort, group, flow, and width overrides", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.Property,
			sortProperty: "due",
			sortDirection: "desc",
			groupSource: { kind: "property", key: "priority", collapsePastDates: true },
			groupDirection: "asc",
			flowDirection: FlowDirection.BottomToTop,
			columnWidth: 420,
		};

		const captured = captureSavedViewProperties(
			settings,
			{
				columnOrderMode: settings.columnOrderMode,
				sortProperty: settings.sortProperty,
				sortDirection: settings.sortDirection,
				groupSource: settings.groupSource,
				groupDirection: settings.groupDirection,
				flowDirection: settings.flowDirection,
				columnWidth: settings.columnWidth,
			},
		);

		expect(captured).toEqual({
			sort: {
				mode: ColumnOrderMode.Property,
				property: "due",
				direction: "desc",
			},
			group: {
				source: {
					kind: "property",
					key: "priority",
					collapsePastDates: true,
				},
				direction: "asc",
			},
			flowDirection: FlowDirection.BottomToTop,
			columnWidth: 420,
		});
		expect(savedViewPropertyLabels(captured)).toEqual(["Sort", "Group", "Flow", "Width"]);
	});

	it("applies only the saved properties and leaves unrelated settings alone", () => {
		const settings: SettingValues = {
			...defaultSettings,
			columnOrderMode: ColumnOrderMode.TaskName,
			sortDirection: "desc",
			groupSource: { kind: "file" },
			groupDirection: "desc",
			flowDirection: FlowDirection.LeftToRight,
			columnWidth: 300,
			excludedTags: ["hidden"],
		};
		const savedView: SavedView = {
			id: "view-id",
			name: "Vertical projects",
			group: {
				source: { kind: "tag-prefix", prefix: "Project-" },
				direction: "asc",
			},
			flowDirection: FlowDirection.TopToBottom,
		};

		const applied = applySavedViewProperties(settings, savedView);

		expect(applied.columnOrderMode).toBe(ColumnOrderMode.TaskName);
		expect(applied.sortDirection).toBe("desc");
		expect(applied.groupSource).toEqual({ kind: "tag-prefix", prefix: "Project-" });
		expect(applied.groupDirection).toBe("asc");
		expect(applied.flowDirection).toBe(FlowDirection.TopToBottom);
		expect(applied.columnWidth).toBe(300);
		expect(applied.excludedTags).toEqual(["hidden"]);
	});

	it("merges board-local saved views before global saved views", () => {
		const local: SavedView[] = [{ id: "shared", name: "Local", query: "tag:local" }];
		const global: SavedView[] = [{ id: "shared", name: "Global", query: "tag:global" }];

		expect(mergeLocalAndGlobalSavedViews(local, global)).toEqual([
			{ id: "shared", name: "Local", query: "tag:local", isGlobal: false },
			{ id: "shared", name: "Global", query: "tag:global", isGlobal: true },
		]);
	});
});
