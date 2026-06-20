import type { Brand } from "src/brand";
import { kebab } from "src/parsing/kebab/kebab";
import { formatPriorityColumnLabel } from "src/parsing/properties/display";
import { PropertySchemaOption } from "src/parsing/properties/property_schema";
import { getTasksPriorityOption } from "src/parsing/properties/tasks_schema";

export type ColumnTag = Brand<string, "ColumnTag">;
export type ColumnMatchMode = "name" | "tags" | "status" | "priority";
export type PriorityColumnSchema = PropertySchemaOption.TasksPlugin | PropertySchemaOption.Dataview;

export interface ParsedColumn {
	raw: string;
	label: string;
	color?: string;
}

export interface ColumnDefinition {
	id: ColumnTag;
	label: string;
	color?: string;
	matchMode: ColumnMatchMode;
	matchTags: string[];
	matchStatus?: string;
	matchPriority?: string;
	matchPropertySchema?: PriorityColumnSchema;
}

export type ColumnHeaderSubtitle =
	| { kind: "status"; value: string; label: string }
	| { kind: "priority"; value: string; label: string; icon?: string };

export const RESERVED_COLUMN_KEYS: ReadonlySet<string> = new Set<string>(["uncategorised", "done"]);

export function parseColumnSpec(columnSpec: string): ParsedColumn {
	const hashMatch = columnSpec.match(/^(.+?)\(#([0-9a-fA-F]{6})\)$/);
	const oxMatch = columnSpec.match(/^(.+?)\(0x([0-9a-fA-F]{6})\)$/);
	const match = hashMatch || oxMatch;

	if (match?.[1] && match?.[2]) {
		return {
			raw: columnSpec,
			label: match[1],
			color: `#${match[2]}`,
		};
	}

	return {
		raw: columnSpec,
		label: columnSpec,
	};
}

function sanitizeIdBase(label: string): string {
	const normalized = kebab(label).replace(/[^a-z0-9-]/g, "");
	return normalized.length > 0 ? normalized : "column";
}

export function createColumnId(label: string, usedIds: Set<string>): ColumnTag {
	const base = `column-${sanitizeIdBase(label)}`;
	let candidate = base;
	let suffix = 2;

	while (usedIds.has(candidate) || RESERVED_COLUMN_KEYS.has(candidate)) {
		candidate = `${base}-${suffix}`;
		suffix += 1;
	}

	usedIds.add(candidate);
	return candidate as ColumnTag;
}

export function normalizeMatchTags(tags: string[]): string[] {
	const normalized = tags
		.map((tag) => tag.trim().replace(/^#/, ""))
		.filter((tag) => tag.length > 0);

	return [...new Set(normalized)];
}

export function getNameModeWriteTag(column: ColumnDefinition): string {
	return kebab(column.label);
}

export function usesTagMatching(column: ColumnDefinition): boolean {
	return column.matchMode === "tags";
}

export function usesStatusMatching(column: ColumnDefinition): boolean {
	return column.matchMode === "status";
}

export function usesPriorityMatching(column: ColumnDefinition): boolean {
	return column.matchMode === "priority";
}

export function getColumnWriteTags(column: ColumnDefinition): string[] {
	return usesStatusMatching(column) || usesPriorityMatching(column)
		? []
		: usesTagMatching(column)
		? column.matchTags
		: [getNameModeWriteTag(column)];
}

export function columnRuleSignature(column: ColumnDefinition): string {
	return usesStatusMatching(column)
		? `status:${column.matchStatus ?? ""}`
		: usesPriorityMatching(column)
		? `priority:${getColumnPrioritySchema(column) ?? ""}:${normalizePriorityMatchValue(column.matchPriority, getColumnPrioritySchema(column)) ?? ""}`
		: usesTagMatching(column)
		? `tags:${[...getColumnWriteTags(column)].sort().join(",")}`
		: `name:${getNameModeWriteTag(column)}`;
}

export interface ColumnMatchContext {
	tags: Set<string>;
	status?: string;
	priority?: string;
	prioritySchema?: PriorityColumnSchema;
}

function normalizeColumnMatchContext(context: Set<string> | ColumnMatchContext): ColumnMatchContext {
	return context instanceof Set ? { tags: context } : context;
}

export function getColumnStatus(column: ColumnDefinition | undefined): string | undefined {
	return column && usesStatusMatching(column) ? column.matchStatus : undefined;
}

export function getColumnPriority(column: ColumnDefinition | undefined): string | undefined {
	return column && usesPriorityMatching(column) ? column.matchPriority : undefined;
}

export function getColumnPrioritySchema(column: ColumnDefinition | undefined): PriorityColumnSchema | undefined {
	return column && usesPriorityMatching(column)
		? column.matchPropertySchema ?? PropertySchemaOption.TasksPlugin
		: undefined;
}

export function getStatusColumnLabel(status: string | undefined): string {
	return status === " " ? "unchecked" : status ?? "";
}

export function getPriorityColumnLabel(priority: string | undefined): string {
	return formatPriorityColumnLabel(priority);
}

export function normalizePriorityMatchValue(
	priority: string | undefined,
	schema: PriorityColumnSchema | undefined,
): string | undefined {
	const trimmed = priority?.trim();
	if (!trimmed) {
		return undefined;
	}
	return schema === PropertySchemaOption.Dataview ? trimmed.toLowerCase() : trimmed;
}

export function matchesColumnDefinition(column: ColumnDefinition, context: Set<string> | ColumnMatchContext): boolean {
	const { tags: taskTags, status, priority, prioritySchema } = normalizeColumnMatchContext(context);

	if (usesStatusMatching(column)) {
		return !!column.matchStatus && status === column.matchStatus;
	}

	if (usesPriorityMatching(column)) {
		const columnPrioritySchema = getColumnPrioritySchema(column);
		return !!column.matchPriority
			&& normalizePriorityMatchValue(priority, prioritySchema) === normalizePriorityMatchValue(column.matchPriority, columnPrioritySchema)
			&& prioritySchema === columnPrioritySchema;
	}

	if (usesTagMatching(column)) {
		const explicitTags = getColumnWriteTags(column);
		return explicitTags.length > 0 && explicitTags.every((tag) => taskTags.has(tag));
	}

	const derivedTag = getNameModeWriteTag(column);
	for (const tag of taskTags) {
		if (kebab(tag) === derivedTag) {
			return true;
		}
	}

	return false;
}

export function getColumnMatchSpecificity(column: ColumnDefinition): number {
	return usesTagMatching(column) ? getColumnWriteTags(column).length : 1;
}

export function resolveMatchedColumnDefinition(
	columns: ColumnDefinition[],
	context: Set<string> | ColumnMatchContext,
): ColumnDefinition | undefined {
	let matchedColumn: ColumnDefinition | undefined;
	let matchedSpecificity = -1;

	for (const column of columns) {
		if (!matchesColumnDefinition(column, context)) {
			continue;
		}

		const specificity = getColumnMatchSpecificity(column);
		if (!matchedColumn || specificity > matchedSpecificity) {
			matchedColumn = column;
			matchedSpecificity = specificity;
		}
	}

	return matchedColumn;
}

export function isPlacementTag(column: ColumnDefinition, tag: string): boolean {
	if (usesStatusMatching(column) || usesPriorityMatching(column)) {
		return false;
	}
	if (usesTagMatching(column)) {
		return getColumnWriteTags(column).includes(tag);
	}
	return kebab(tag) === getNameModeWriteTag(column);
}

export function getColumnHeaderTags(column: ColumnDefinition): string[] {
	return usesTagMatching(column) ? column.matchTags : [];
}

export function getColumnHeaderSubtitle(column: ColumnDefinition): ColumnHeaderSubtitle | undefined {
	if (usesStatusMatching(column)) {
		return column.matchStatus
			? { kind: "status", value: column.matchStatus, label: getStatusColumnLabel(column.matchStatus) }
			: undefined;
	}
	if (usesPriorityMatching(column)) {
		const priority = getTasksPriorityOption(column.matchPriority);
		return column.matchPriority
			? {
				kind: "priority",
				value: column.matchPriority,
				label: priority?.label ?? getPriorityColumnLabel(column.matchPriority),
				icon: priority?.emoji,
			}
			: undefined;
	}
	return undefined;
}

export function migrateColumnDefinitions(
	columns: Array<string | Partial<ColumnDefinition> | null | undefined>,
): ColumnDefinition[] {
	const usedIds = new Set<string>();

	return columns.flatMap((column) => {
		if (typeof column === "string") {
			const parsed = parseColumnSpec(column);
			return [
				{
					id: createColumnId(parsed.label, usedIds),
					label: parsed.label,
					color: parsed.color,
					matchMode: "name",
					matchTags: [],
					matchStatus: undefined,
					matchPriority: undefined,
					matchPropertySchema: undefined,
				},
			];
		}

		if (!column || typeof column !== "object") {
			return [];
		}

		const label = typeof column.label === "string" ? column.label : "";
		const idCandidate = typeof column.id === "string" ? column.id : "";
		const id =
			idCandidate && !usedIds.has(idCandidate) && !RESERVED_COLUMN_KEYS.has(idCandidate)
				? (usedIds.add(idCandidate), idCandidate as ColumnTag)
				: createColumnId(label, usedIds);

		const matchMode: ColumnMatchMode =
			column.matchMode === "tags" || column.matchMode === "status" || column.matchMode === "priority"
				? column.matchMode
				: "name";
		const matchStatus = typeof column.matchStatus === "string" ? column.matchStatus : undefined;
		const matchPriority = typeof column.matchPriority === "string" ? column.matchPriority : undefined;
		const matchPropertySchema: PriorityColumnSchema | undefined =
			column.matchPropertySchema === PropertySchemaOption.Dataview ||
			column.matchPropertySchema === PropertySchemaOption.TasksPlugin
				? column.matchPropertySchema
				: matchMode === "priority"
				? PropertySchemaOption.TasksPlugin
				: undefined;

		return [
			{
				id,
				label,
				color: typeof column.color === "string" && column.color.length > 0 ? column.color : undefined,
				matchMode,
				matchTags: normalizeMatchTags(Array.isArray(column.matchTags) ? column.matchTags : []),
				matchStatus,
				matchPriority,
				matchPropertySchema,
			},
		];
	});
}

export function migrateCollapsedColumns(
	collapsedColumns: string[] | undefined,
	columns: ColumnDefinition[],
): string[] {
	if (!collapsedColumns || collapsedColumns.length === 0) {
		return [];
	}

	const placementTagToId = new Map<string, ColumnTag>();
	for (const column of columns) {
		placementTagToId.set(getNameModeWriteTag(column), column.id);
	}

	const migrated = new Set<string>();
	for (const value of collapsedColumns) {
		if (value === "done" || value === "uncategorised") {
			migrated.add(value);
			continue;
		}

		const matchedColumn = columns.find((column) => column.id === value);
		if (matchedColumn) {
			migrated.add(matchedColumn.id);
			continue;
		}

		const mappedId = placementTagToId.get(value);
		if (mappedId) {
			migrated.add(mappedId);
		}
	}

	return [...migrated];
}
