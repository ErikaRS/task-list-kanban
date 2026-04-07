import { writable } from "svelte/store";
import { z } from "zod";
import { DEFAULT_DONE_STATUS_MARKERS, DEFAULT_IGNORED_STATUS_MARKERS, DEFAULT_CANCELLED_STATUS_MARKERS } from "../tasks/task";
import {
	type ColumnDefinition,
	createColumnId,
	migrateCollapsedColumns,
	migrateColumnDefinitions,
} from "../columns/definitions";

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

export enum ColumnOrderMode {
	File = "file",
	Manual = "manual",
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

const columnDefinitionSchema = z.object({
	id: z.string(),
	label: z.string(),
	color: z.string().optional(),
	matchMode: z.enum(["name", "tags"]).default("name"),
	matchTags: z.array(z.string()).default([]),
});

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
	savedFilters: z.array(savedFilterSchema).default([]).optional(),
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
	uncategorizedColumnName: z.string().default("Uncategorized").optional(),
	doneColumnName: z.string().default("Done").optional(),
	columnOrderMode: z.nativeEnum(ColumnOrderMode).catch(ColumnOrderMode.File).optional(),
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
	savedFilters?: SavedFilter[];
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
	uncategorizedColumnName?: string;
	doneColumnName?: string;
	columnOrderMode?: ColumnOrderMode;
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
	uncategorizedColumnName: "Uncategorized",
	doneColumnName: "Done",
	columnOrderMode: ColumnOrderMode.File,
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
		return {
			...defaultSettings,
			...partial,
			columns,
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
	}));
}
