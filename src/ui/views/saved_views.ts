import { ColumnOrderMode } from "../../parsing/properties/comparators";
import {
	FlowDirection,
	type SavedView,
	type SavedViewProperties,
	type SettingValues,
} from "../settings/settings_store";
import type { GroupSource } from "../tasks/task_grouping";

export type { SavedViewProperties } from "../settings/settings_store";
export type SavedViewListEntry = SavedView & { isGlobal?: boolean };

function hasOwn<T extends object, K extends PropertyKey>(
	object: T,
	key: K,
): object is T & Record<K, unknown> {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneGroupSource(source: GroupSource): GroupSource {
	if (source.kind === "tag-prefix") {
		return {
			kind: "tag-prefix",
			prefix: source.prefix,
			includeTags: source.includeTags ? [...source.includeTags] : undefined,
		};
	}
	if (source.kind === "property") {
		return {
			kind: "property",
			key: source.key,
			collapsePastDates: source.collapsePastDates,
		};
	}
	return { ...source };
}

export function captureSavedViewProperties(
	settings: SettingValues,
	overrides: Partial<SettingValues>,
): SavedViewProperties {
	const properties: SavedViewProperties = {};

	// The applied filter query persists as the lastFilter override; an empty
	// string (filter cleared) is the unset state, not a capturable property.
	if (hasOwn(overrides, "lastFilter") && settings.lastFilter) {
		properties.query = settings.lastFilter;
	}

	if (
		hasOwn(overrides, "columnOrderMode") ||
		hasOwn(overrides, "sortProperty") ||
		hasOwn(overrides, "sortDirection")
	) {
		properties.sort = {
			mode: settings.columnOrderMode ?? ColumnOrderMode.FileOrder,
			property: settings.sortProperty ?? null,
			direction: settings.sortDirection ?? "asc",
		};
	}

	if (hasOwn(overrides, "groupSource") || hasOwn(overrides, "groupDirection")) {
		properties.group = {
			source: cloneGroupSource(settings.groupSource ?? { kind: "none" }),
			direction: settings.groupDirection ?? "asc",
		};
	}

	if (hasOwn(overrides, "flowDirection")) {
		properties.flowDirection = settings.flowDirection ?? FlowDirection.LeftToRight;
	}

	if (hasOwn(overrides, "columnWidth")) {
		properties.columnWidth = settings.columnWidth ?? 300;
	}

	return properties;
}

export function savedViewHasProperties(view: SavedViewProperties): boolean {
	return (
		view.query !== undefined ||
		view.sort !== undefined ||
		view.group !== undefined ||
		view.flowDirection !== undefined ||
		view.columnWidth !== undefined
	);
}

export function savedViewPropertyLabels(view: SavedViewProperties): string[] {
	const labels: string[] = [];
	if (view.query !== undefined) labels.push("Filter");
	if (view.sort !== undefined) labels.push("Sort");
	if (view.group !== undefined) labels.push("Group");
	if (view.flowDirection !== undefined) labels.push("Flow");
	if (view.columnWidth !== undefined) labels.push("Width");
	return labels;
}

export function savedViewIsQueryOnly(view: SavedViewProperties): boolean {
	return (
		view.query !== undefined &&
		view.sort === undefined &&
		view.group === undefined &&
		view.flowDirection === undefined &&
		view.columnWidth === undefined
	);
}

export function applySavedViewProperties(
	settings: SettingValues,
	view: SavedViewProperties,
): SettingValues {
	const next: SettingValues = { ...settings };
	if (view.sort) {
		next.columnOrderMode = view.sort.mode;
		next.sortProperty = view.sort.property ?? null;
		next.sortDirection = view.sort.direction;
	}
	if (view.group) {
		next.groupSource = cloneGroupSource(view.group.source);
		next.groupDirection = view.group.direction;
	}
	if (view.flowDirection !== undefined) {
		next.flowDirection = view.flowDirection;
	}
	if (view.columnWidth !== undefined) {
		next.columnWidth = view.columnWidth;
	}
	return next;
}

export function mergeLocalAndGlobalSavedViews(
	localViews: SavedView[] = [],
	globalViews: SavedView[] = [],
): SavedViewListEntry[] {
	return [
		...localViews.map((view) => ({ ...view, isGlobal: false })),
		...globalViews.map((view) => ({ ...view, isGlobal: true })),
	];
}
