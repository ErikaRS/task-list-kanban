import type { Brand } from "src/brand";
import { kebab } from "src/parsing/kebab/kebab";

export type ColumnTag = Brand<string, "ColumnTag">;
export type ColumnMatchMode = "name" | "tags";

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
}

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
	return tags
		.map((tag) => tag.trim().replace(/^#/, ""))
		.filter((tag) => tag.length > 0);
}

export function getColumnPlacementTag(column: ColumnDefinition): string {
	if (column.matchMode === "tags" && column.matchTags.length > 0) {
		return column.matchTags[0]!;
	}

	return kebab(column.label);
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

		return [
			{
				id,
				label,
				color: typeof column.color === "string" && column.color.length > 0 ? column.color : undefined,
				matchMode: column.matchMode === "tags" ? "tags" : "name",
				matchTags: normalizeMatchTags(Array.isArray(column.matchTags) ? column.matchTags : []),
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
		placementTagToId.set(getColumnPlacementTag(column), column.id);
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
