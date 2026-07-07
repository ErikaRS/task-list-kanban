import { ColumnOrderMode } from "../../parsing/properties/comparators";
import {
	FlowDirection,
	type SavedView,
	type SavedViewProperties,
	type SettingValues,
} from "../settings/settings_store";

export type { SavedViewProperties } from "../settings/settings_store";
export type SavedViewListEntry = SavedView & { isGlobal?: boolean };

/**
 * The properties a view can carry, with their UI badge labels. The single
 * source of truth for "which fields make up a view": the predicates and
 * label helpers below derive from it, so a new view property only needs an
 * entry here plus capture/apply handling.
 */
const SAVED_VIEW_PROPERTIES = [
	{ key: "query", label: "Filter" },
	{ key: "sort", label: "Sort" },
	{ key: "group", label: "Group" },
	{ key: "flowDirection", label: "Flow" },
	{ key: "columnWidth", label: "Width" },
] as const satisfies ReadonlyArray<{ key: keyof SavedViewProperties; label: string }>;

function hasOwn<T extends object, K extends PropertyKey>(
	object: T,
	key: K,
): object is T & Record<K, unknown> {
	return Object.prototype.hasOwnProperty.call(object, key);
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
			source: structuredClone(settings.groupSource ?? { kind: "none" }),
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
	return SAVED_VIEW_PROPERTIES.some(({ key }) => view[key] !== undefined);
}

export function savedViewPropertyLabels(view: SavedViewProperties): string[] {
	return SAVED_VIEW_PROPERTIES.filter(({ key }) => view[key] !== undefined).map(
		({ label }) => label,
	);
}

export function savedViewIsQueryOnly(view: SavedViewProperties): boolean {
	return (
		view.query !== undefined &&
		SAVED_VIEW_PROPERTIES.every(
			({ key }) => key === "query" || view[key] === undefined,
		)
	);
}

export function defaultSavedViewName(properties: SavedViewProperties): string {
	const labels = savedViewPropertyLabels(properties);
	return labels.length > 0 ? labels.join(" + ") : "View";
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
		next.groupSource = structuredClone(view.group.source);
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
