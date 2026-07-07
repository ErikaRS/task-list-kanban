import { writable, type Readable, type Writable } from "svelte/store";
import { z } from "zod";
import { DEFAULT_DONE_STATUS_MARKERS, DEFAULT_IGNORED_STATUS_MARKERS, DEFAULT_CANCELLED_STATUS_MARKERS } from "../tasks/task";
import {
	type ColumnDefinition,
	createColumnId,
	migrateCollapsedColumns,
	migrateColumnDefinitions,
} from "../columns/definitions";
import { DEFAULT_GROUP_BUCKET_ID, type GroupSource } from "../tasks/task_grouping";
import { PropertySchemaOption } from "../../parsing/properties/property_schema";
import { ColumnOrderMode, type SortDirection } from "../../parsing/properties/comparators";
import type { ManualOrderStore } from "../tasks/manual_order";
// Runtime-safe despite the module pair: filter_state imports only types
// from this module.
import { savedFilterToQuery } from "../filters/filter_state";

export interface SavedGrouping {
	id: string;
	name: string;
	source: GroupSource;
}

export interface SavedView {
	id: string;
	name: string;
	query?: string;
	sort?: {
		mode: ColumnOrderMode;
		property?: string | null;
		direction: SortDirection;
	};
	group?: {
		source: GroupSource;
		direction: SortDirection;
	};
	flowDirection?: FlowDirection;
	columnWidth?: number;
}

export type SavedViewProperties = Omit<SavedView, "id" | "name">;

export enum VisibilityOption {
	Auto = "auto",
	NeverShow = "never",
	AlwaysShow = "always",
}

export enum ScopeOption {
	Folder = "folder",
	Everywhere = "everywhere",
	SelectedFolders = "selectedFolders",
}

export enum FlowDirection {
	LeftToRight = "ltr",
	RightToLeft = "rtl",
	TopToBottom = "ttb",
	BottomToTop = "btt",
}

export enum PropertyDisplayMode {
	None = "none",
	Pretty = "pretty",
	Debug = "debug",
}

export interface ContentValue {
	text: string;
}

export interface TagValue {
	tags: string[];
}

export interface FileValue {
	filepaths: string[];
}

export interface DateValue {
	conditions: DateFilterCondition[];
}

export interface SavedFilter {
	id: string;
	// Optional user-chosen display name (e.g. "overdue"); the saved list
	// falls back to the query text when absent.
	name?: string;
	// The unified filter query string (SPEC 0029). New saves write only
	// this; the per-type slots below are legacy shapes, still parsed so old
	// frontmatter validates and converted at read time by
	// savedFilterToQuery.
	query?: string;
	content?: ContentValue;
	tag?: TagValue;
	file?: FileValue;
	date?: DateValue;
}

export type DateFilterOperator =
	| "before"
	| "on-or-before"
	| "on"
	| "on-or-after"
	| "after";

export interface DateFilterCondition {
	property: string; // a date-typed key of the active schema, e.g. "scheduled"
	operator: DateFilterOperator;
	value: string; // "$TODAY" or "YYYY-MM-DD"
}

const contentValueSchema = z.object({
	text: z.string(),
});

const tagValueSchema = z.object({
	tags: z.array(z.string()),
});

const fileValueSchema = z.object({
	filepaths: z.array(z.string()),
});

const dateFilterConditionSchema = z.object({
	property: z.string(),
	operator: z.enum(["before", "on-or-before", "on", "on-or-after", "after"]),
	value: z.string(),
});

const dateValueSchema = z.object({
	conditions: z.array(dateFilterConditionSchema),
});

const savedFilterSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	query: z.string().optional(),
	content: contentValueSchema.optional(),
	tag: tagValueSchema.optional(),
	file: fileValueSchema.optional(),
	date: dateValueSchema.optional(),
});

const groupSourceSchema = z
	.union([
		z.object({ kind: z.literal("none") }),
		z.object({ kind: z.literal("file") }),
		z.object({
			kind: z.literal("tag-prefix"),
			prefix: z.string().optional(),
			includeTags: z.array(z.string()).optional(),
		}),
		z.object({
			kind: z.literal("property"),
			key: z.string(),
			collapsePastDates: z.boolean().optional(),
		}),
	])
	.catch({ kind: "none" as const });

const savedGroupingSchema = z.object({
	id: z.string(),
	name: z.string(),
	source: groupSourceSchema,
});

const savedViewSchema = z.object({
	id: z.string(),
	name: z.string(),
	query: z.string().optional(),
	sort: z.object({
		mode: z.nativeEnum(ColumnOrderMode).catch(ColumnOrderMode.FileOrder),
		property: z.string().nullable().optional(),
		direction: z.enum(["asc", "desc"]).catch("asc"),
	}).optional(),
	group: z.object({
		source: groupSourceSchema,
		direction: z.enum(["asc", "desc"]).catch("asc"),
	}).optional(),
	flowDirection: z.nativeEnum(FlowDirection).catch(FlowDirection.LeftToRight).optional(),
	columnWidth: z.number().min(200).max(600).catch(300).optional(),
});

const savedViewPropertiesSchema = savedViewSchema.omit({ id: true, name: true });

const columnDefinitionSchema = z.object({
	id: z.string(),
	label: z.string(),
	color: z.string().optional(),
	matchMode: z.enum(["name", "tags", "status", "priority"]).default("name"),
	matchTags: z.array(z.string()).default([]),
	matchStatus: z.string().optional(),
	matchPriority: z.string().optional(),
	matchPropertySchema: z.enum([PropertySchemaOption.TasksPlugin, PropertySchemaOption.Dataview]).optional(),
});

const manualOrderEntriesSchema = z.array(z.string());
const manualOrderCellSchema = z.record(z.string(), manualOrderEntriesSchema);
const manualOrderSchema = z.preprocess((value) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	const record = value as Record<string, unknown>;
	const hasFlatEntries = Object.values(record).some((entry) => Array.isArray(entry));
	if (hasFlatEntries) {
		const migrated: Record<string, unknown> = {};
		for (const [columnTag, entries] of Object.entries(record)) {
			if (Array.isArray(entries)) {
				migrated[columnTag] = entries;
			}
		}
		return { [DEFAULT_GROUP_BUCKET_ID]: migrated };
	}

	return value;
}, z.record(z.string(), manualOrderCellSchema));

// Fields with strict validation (enums, ranges) use .catch() so that a single
// invalid value degrades gracefully instead of failing the entire settings parse.
// Without .catch(), an unrecognized scope like "file" would cause ALL settings
// (columns, colors, etc.) to be silently replaced with defaults.
const settingsObject = z.object({
	columns: z.array(z.union([z.string(), columnDefinitionSchema])),
	scope: z.nativeEnum(ScopeOption).catch(ScopeOption.Folder),
	showFilepath: z.boolean().default(true).optional(),
	consolidateTags: z.boolean().default(false).optional(),
	uncategorizedVisibility: z
		.nativeEnum(VisibilityOption)
		.catch(VisibilityOption.Auto)
		.optional(),
	doneVisibility: z
		.nativeEnum(VisibilityOption)
		.catch(VisibilityOption.AlwaysShow)
		.optional(),
	doneStatusMarkers: z.string().default(DEFAULT_DONE_STATUS_MARKERS).optional(),
	cancelledStatusMarkers: z.string().default(DEFAULT_CANCELLED_STATUS_MARKERS).optional(),
	ignoredStatusMarkers: z.string().default(DEFAULT_IGNORED_STATUS_MARKERS).optional(),
	statusMarkerOrder: z.string().default("").optional(),
	savedFilters: z.array(savedFilterSchema).default([]).optional(),
	savedGroupings: z.array(savedGroupingSchema).default([]).optional(),
	savedViews: z.array(savedViewSchema).default([]).optional(),
	// The unified filter query string (SPEC 0029). The four last*Filter
	// fields below are its legacy predecessors: still parsed so old
	// frontmatter validates (and migrates at read time), never written.
	lastFilter: z.string().optional(),
	lastContentFilter: z.string().optional(),
	lastTagFilter: z.array(z.string()).optional(),
	lastFileFilter: z.array(z.string()).optional(),
	lastDateFilter: z.array(dateFilterConditionSchema).catch([]).optional(),
	// The retired sidebar's filtersExpanded / filtersSidebarExpanded /
	// filtersSidebarWidth fields are gone entirely: the schema strips
	// unknown keys, so old frontmatter still validates, and dropping them
	// here keeps them out of every future write.
	columnWidth: z.number().min(200).max(600).catch(300).optional(),
	flowDirection: z.nativeEnum(FlowDirection).catch(FlowDirection.LeftToRight).optional(),
	collapsedColumns: z.array(z.string()).default([]).optional(),
	defaultTaskFile: z.string().default("").optional(),
	lastUsedTaskFile: z.string().default("").optional(),
	scopeFolders: z.array(z.string()).default([]).optional(),
	excludePaths: z.array(z.string()).default([]).optional(),
	excludedTags: z.array(z.string()).default([]).optional(),
	excludedTaskTags: z.array(z.string()).default([]).optional(),
	uncategorizedColumnName: z.string().default("Uncategorized").optional(),
	doneColumnName: z.string().default("Done").optional(),
	groupSource: groupSourceSchema.default({ kind: "none" }).optional(),
	propertySchema: z.nativeEnum(PropertySchemaOption).catch(PropertySchemaOption.None).optional(),
	propertyDisplay: z.nativeEnum(PropertyDisplayMode).catch(PropertyDisplayMode.None).optional(),
	treatNestedTasksAsSubtasks: z.boolean().default(false).optional(),
	columnOrderMode: z.nativeEnum(ColumnOrderMode).catch(ColumnOrderMode.FileOrder).optional(),
	sortProperty: z.string().nullable().default(null).optional(),
	sortDirection: z.enum(["asc", "desc"]).catch("asc").optional(),
	groupDirection: z.enum(["asc", "desc"]).catch("asc").optional(),
	// Cell-local manual ordering: group bucket id -> column id -> `path::blockLink`.
	// Stored alongside display settings in the board's frontmatter (the plugin has
	// no separate data file), but kept as its own field so it is never conflated
	// with display configuration. Legacy column-local records are migrated under
	// the default group bucket id at parse time.
	manualOrder: manualOrderSchema.default({}).optional(),
});

export interface SettingValues {
	columns: ColumnDefinition[];
	scope: ScopeOption;
	showFilepath?: boolean;
	consolidateTags?: boolean;
	uncategorizedVisibility?: VisibilityOption;
	doneVisibility?: VisibilityOption;
	doneStatusMarkers?: string;
	cancelledStatusMarkers?: string;
	ignoredStatusMarkers?: string;
	statusMarkerOrder?: string;
	savedFilters?: SavedFilter[];
	savedGroupings?: SavedGrouping[];
	savedViews?: SavedView[];
	lastFilter?: string;
	lastContentFilter?: string;
	lastTagFilter?: string[];
	lastFileFilter?: string[];
	lastDateFilter?: DateFilterCondition[];
	columnWidth?: number;
	flowDirection?: FlowDirection;
	collapsedColumns?: string[];
	defaultTaskFile?: string;
	lastUsedTaskFile?: string;
	scopeFolders?: string[];
	excludePaths?: string[];
	excludedTags?: string[];
	excludedTaskTags?: string[];
	uncategorizedColumnName?: string;
	doneColumnName?: string;
	groupSource?: GroupSource;
	propertySchema?: PropertySchemaOption;
	propertyDisplay?: PropertyDisplayMode;
	treatNestedTasksAsSubtasks?: boolean;
	columnOrderMode?: ColumnOrderMode;
	sortProperty?: string | null;
	sortDirection?: SortDirection;
	groupDirection?: SortDirection;
	manualOrder?: ManualOrderStore;
}

export const defaultSettings: SettingValues = {
	columns: createDefaultColumns(["Later", "Soonish", "Next week", "This week", "Today", "Pending"]),
	scope: ScopeOption.Folder,
	showFilepath: true,
	consolidateTags: false,
	uncategorizedVisibility: VisibilityOption.Auto,
	doneVisibility: VisibilityOption.AlwaysShow,
	doneStatusMarkers: DEFAULT_DONE_STATUS_MARKERS,
	cancelledStatusMarkers: DEFAULT_CANCELLED_STATUS_MARKERS,
	ignoredStatusMarkers: DEFAULT_IGNORED_STATUS_MARKERS,
	statusMarkerOrder: "",
	savedFilters: [],
	savedViews: [],
	columnWidth: 300,
	flowDirection: FlowDirection.LeftToRight,
	collapsedColumns: [],
	defaultTaskFile: "",
	lastUsedTaskFile: "",
	scopeFolders: [],
	excludePaths: [],
	excludedTags: [],
	excludedTaskTags: [],
	uncategorizedColumnName: "Uncategorized",
	doneColumnName: "Done",
	groupSource: { kind: "none" },
	propertySchema: PropertySchemaOption.None,
	propertyDisplay: PropertyDisplayMode.None,
	treatNestedTasksAsSubtasks: false,
	columnOrderMode: ColumnOrderMode.FileOrder,
	sortProperty: null,
	sortDirection: "asc",
	groupDirection: "asc",
	manualOrder: {},
};

/**
 * The board settings store keeps two layers (SPEC 0030 Part A):
 * - `overrides` — the sparse set of explicitly-set fields; the only thing
 *   that gets persisted to frontmatter.
 * - the resolved values (`defaultSettings ⊕ overrides`) — what subscribers
 *   read; identical in shape to the old single-layer store.
 *
 * `set`/`update` stay the mutation API for every consumer: a field becomes
 * an override when a write changes its value, and sheds its override when a
 * write deletes the key (e.g. writeBoardFilterState dropping legacy filter
 * fields). Loading parsed frontmatter goes through `load`, which replaces
 * the overrides wholesale instead of diffing.
 */
export interface BoardSettingsStore extends Writable<SettingValues> {
	/** Replaces state from parsed frontmatter (not a user mutation). */
	load(overrides: Partial<SettingValues>): void;
	/** The sparse overrides layer — what gets written to frontmatter. */
	getOverrides(): Partial<SettingValues>;
	/** Releases subscriptions owned by this store. */
	destroy(): void;
}

export const createSettingsStore = (
	inheritedSettingsStore?: Readable<Partial<SettingValues>>,
): BoardSettingsStore => {
	let overrides: Partial<SettingValues> = {};
	let inheritedSettings: Partial<SettingValues> = {};
	// Per-key JSON snapshot of the last resolved value. Diffing must compare
	// against serialized snapshots rather than the previous object: Svelte's
	// `$store.field = x` sugar mutates the store's current object in place
	// before calling set(), so by set-time the "old" object already holds
	// the new values.
	let snapshot = new Map<string, string | undefined>();

	const resolve = (): SettingValues => ({ ...defaultSettings, ...inheritedSettings, ...overrides });

	const takeSnapshot = (resolved: SettingValues) => {
		snapshot = new Map(
			Object.entries(resolved).map(([key, value]) => [key, JSON.stringify(value)]),
		);
	};

	const initial = resolve();
	takeSnapshot(initial);
	const inner = writable<SettingValues>(initial);

	const commit = () => {
		const resolved = resolve();
		takeSnapshot(resolved);
		inner.set(resolved);
	};

	const unsubscribeInherited = inheritedSettingsStore?.subscribe((nextInheritedSettings) => {
		inheritedSettings = { ...nextInheritedSettings };
		commit();
	});

	const set = (next: SettingValues) => {
		const record = next as unknown as Record<string, unknown>;
		const overridesRecord = overrides as Record<string, unknown>;
		for (const key of new Set([...Object.keys(record), ...snapshot.keys()])) {
			const nextJson = JSON.stringify(record[key]);
			if (nextJson === snapshot.get(key)) {
				continue;
			}
			if (nextJson === undefined) {
				delete overridesRecord[key];
			} else {
				// Deep copy so a caller mutating its object after set() can't
				// silently edit the overrides layer.
				overridesRecord[key] = JSON.parse(nextJson);
			}
		}
		commit();
	};

	return {
		subscribe: inner.subscribe,
		set,
		update: (updater) => set(updater(resolve())),
		load: (nextOverrides) => {
			overrides = { ...nextOverrides };
			commit();
		},
		getOverrides: () => ({ ...overrides }),
		destroy: () => unsubscribeInherited?.(),
	};
};

function migrateLegacySavedViews(
	savedFilters: SavedFilter[] | undefined,
	savedGroupings: SavedGrouping[] | undefined,
): SavedView[] {
	return [
		...(savedFilters ?? [])
			.map((filter): SavedView | undefined => {
				const query = savedFilterToQuery(filter);
				if (query === "") {
					return undefined;
				}
				return {
					id: `filter:${filter.id}`,
					name: filter.name ?? query,
					query,
				};
			})
			.filter((view): view is SavedView => view !== undefined),
		...(savedGroupings ?? []).map((group): SavedView => ({
			id: `group:${group.id}`,
			name: group.name,
			group: {
				source: group.source,
				direction: "asc",
			},
		})),
	];
}

/**
 * Parses frontmatter JSON into the sparse overrides layer: only fields
 * present in the input appear in the result. Parse-time migrations
 * (string columns, collapsed-column labels, legacy showProperties) apply
 * here so the migrated shapes get persisted, without promoting untouched
 * fields into overrides.
 */
export function parseSettingsOverrides(str: string): Partial<SettingValues> {
	try {
		const parsed = JSON.parse(str);
		const partial = settingsObject.partial().parse(parsed);
		const {
			columns: rawColumns,
			collapsedColumns: rawCollapsed,
			savedFilters: rawSavedFilters,
			savedGroupings: rawSavedGroupings,
			savedViews: rawSavedViews,
			...rest
		} = partial;
		const overrides = { ...rest } as Partial<SettingValues>;
		const migratedViews = migrateLegacySavedViews(rawSavedFilters, rawSavedGroupings);
		if (rawSavedViews !== undefined || migratedViews.length > 0) {
			const existingIds = new Set((rawSavedViews ?? []).map((view) => view.id));
			overrides.savedViews = [
				...(rawSavedViews ?? []),
				...migratedViews.filter((view) => !existingIds.has(view.id)),
			];
		}
		if (rawColumns !== undefined) {
			overrides.columns = migrateColumnDefinitions(
				rawColumns as Array<string | Partial<ColumnDefinition>>,
			);
		}
		// Migrate the legacy `showProperties` boolean (a debug-only toggle) to the
		// `propertyDisplay` tri-state. `true` mapped to the JSON debug dump. The
		// migrated value is recorded as an override so the retired key's intent
		// survives once sparse writes drop it.
		if (partial.propertyDisplay === undefined && typeof parsed?.showProperties === "boolean") {
			overrides.propertyDisplay = parsed.showProperties
				? PropertyDisplayMode.Debug
				: PropertyDisplayMode.None;
		}
		if (rawCollapsed !== undefined) {
			overrides.collapsedColumns = migrateCollapsedColumns(
				rawCollapsed,
				overrides.columns ?? defaultSettings.columns,
			);
		}
		return overrides;
	} catch {
		return {};
	}
}

export function resolveSettings(
	overrides: Partial<SettingValues>,
	inheritedSettings: Partial<SettingValues> = {},
): SettingValues {
	return { ...defaultSettings, ...inheritedSettings, ...overrides };
}

export function parseSettingsString(str: string): SettingValues {
	return resolveSettings(parseSettingsOverrides(str));
}

export function parseSavedViewProperties(value: unknown): SavedViewProperties {
	const parsed = savedViewPropertiesSchema.safeParse(value ?? {});
	return parsed.success ? parsed.data : {};
}

export function toSettingsString(settings: Partial<SettingValues>): string {
	return JSON.stringify(settings);
}

function createDefaultColumns(labels: string[]): ColumnDefinition[] {
	const usedIds = new Set<string>();
	return labels.map((label) => ({
		id: createColumnId(label, usedIds),
		label,
		matchMode: "name",
		matchTags: [],
		matchStatus: undefined,
		matchPriority: undefined,
		matchPropertySchema: undefined,
	}));
}
