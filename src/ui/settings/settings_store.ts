import { writable } from "svelte/store";
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

export interface SavedGrouping {
	id: string;
	name: string;
	source: GroupSource;
}

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

export interface SavedFilter {
	id: string;
	content?: ContentValue;
	tag?: TagValue;
	file?: FileValue;
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

const savedFilterSchema = z.object({
	id: z.string(),
	content: contentValueSchema.optional(),
	tag: tagValueSchema.optional(),
	file: fileValueSchema.optional(),
});

const groupSourceSchema = z
	.union([
		z.object({ kind: z.literal("none") }),
		z.object({ kind: z.literal("file") }),
		z.object({ kind: z.literal("tag-prefix"), prefix: z.string().optional() }),
		z.object({ kind: z.literal("property"), key: z.string() }),
	])
	.catch({ kind: "none" as const });

const savedGroupingSchema = z.object({
	id: z.string(),
	name: z.string(),
	source: groupSourceSchema,
});

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
	lastContentFilter: z.string().optional(),
	lastTagFilter: z.array(z.string()).optional(),
	lastFileFilter: z.array(z.string()).optional(),
	filtersExpanded: z.boolean().default(true).optional(),
	filtersSidebarExpanded: z.boolean().default(true).optional(),
	filtersSidebarWidth: z.number().default(280).optional(),
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
	columnOrderMode: z.nativeEnum(ColumnOrderMode).catch(ColumnOrderMode.FileOrder).optional(),
	sortProperty: z.string().nullable().default(null).optional(),
	sortDirection: z.enum(["asc", "desc"]).catch("asc").optional(),
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
	lastContentFilter?: string;
	lastTagFilter?: string[];
	lastFileFilter?: string[];
	filtersExpanded?: boolean;
	filtersSidebarExpanded?: boolean;
	filtersSidebarWidth?: number;
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
	columnOrderMode?: ColumnOrderMode;
	sortProperty?: string | null;
	sortDirection?: SortDirection;
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
	lastContentFilter: "",
	lastTagFilter: [],
	lastFileFilter: [],
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
	columnOrderMode: ColumnOrderMode.FileOrder,
	sortProperty: null,
	sortDirection: "asc",
	manualOrder: {},
};

export const createSettingsStore = () =>
	writable<SettingValues>(defaultSettings);

export function parseSettingsString(str: string): SettingValues {
	try {
		const parsed = JSON.parse(str);
		const partial = settingsObject.partial().parse(parsed);
		const columns = migrateColumnDefinitions(
			(partial.columns ?? defaultSettings.columns) as Array<string | Partial<ColumnDefinition>>,
		);
		// Migrate the legacy `showProperties` boolean (a debug-only toggle) to the
		// `propertyDisplay` tri-state. `true` mapped to the JSON debug dump.
		const propertyDisplay =
			partial.propertyDisplay ??
			(typeof parsed?.showProperties === "boolean"
				? parsed.showProperties
					? PropertyDisplayMode.Debug
					: PropertyDisplayMode.None
				: defaultSettings.propertyDisplay);
		return {
			...defaultSettings,
			...partial,
			columns,
			propertyDisplay,
			collapsedColumns: migrateCollapsedColumns(partial.collapsedColumns, columns),
		};
	} catch {
		return defaultSettings;
	}
}

export function toSettingsString(settings: SettingValues): string {
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
