import {
	getColumnPriority,
	getColumnPrioritySchema,
	getColumnWriteTags,
	usesPriorityMatching,
	usesStatusMatching,
	type ColumnDefinition,
} from "../columns/definitions";
import type { ColumnTag, DefaultColumns } from "../columns/columns";
import {
	getPropertyWriteAdapter,
	type PropertySchemaOption,
} from "../../parsing/properties";

export type ColumnChangeOptions = {
	fromColumn: ColumnTag | undefined;
	toColumn: ColumnTag | DefaultColumns;
	columnDefinitions: ColumnDefinition[];
	propertySchemaOption: PropertySchemaOption;
	doneStatusMarker: string;
	wasDone?: boolean;
	addCompletionDate?: string;
};

/**
 * Changes only the source fragments that encode a task's column.  In
 * particular, it never parses and rebuilds the task body, so inline tags,
 * spacing, list bullets, indentation, and block links survive unchanged.
 */
export function changeColumnTransform(rawLine: string, options: ColumnChangeOptions): string {
	const source = options.fromColumn
		? options.columnDefinitions.find((column) => column.id === options.fromColumn)
		: undefined;
	const destination = isCustomColumn(options.toColumn)
		? options.columnDefinitions.find((column) => column.id === options.toColumn)
		: undefined;

	let next = rawLine;
	if (options.wasDone && options.toColumn !== "done") {
		next = replaceStatusMarker(next, " ");
	}

	if (source && usesPriorityMatching(source)) {
		next = getPropertyWriteAdapter(getColumnPrioritySchema(source) ?? options.propertySchemaOption)
			?.removePriority(next) ?? next;
	}

	if (source && usesStatusMatching(source)) {
		next = replaceStatusMarker(next, " ");
	}

	const sourceTags = options.toColumn === "uncategorised"
		? getAllPlacementTags(options.columnDefinitions)
		: source
		? getColumnWriteTags(source)
		: [];
	const destinationTags = destination
		? getColumnWriteTags(destination)
		: isCustomColumn(options.toColumn)
		? [options.toColumn]
		: [];
	next = replacePlacementTags(next, sourceTags, destinationTags);

	if (destination && usesStatusMatching(destination)) {
		next = replaceStatusMarker(next, destination.matchStatus ?? " ");
	}

	if (destination && usesPriorityMatching(destination)) {
		const priority = getColumnPriority(destination);
		if (priority) {
			next = getPropertyWriteAdapter(getColumnPrioritySchema(destination) ?? options.propertySchemaOption)
				?.upsertPriority(next, priority) ?? next;
		}
	}

	if (options.toColumn === "done") {
		next = replaceStatusMarker(next, options.doneStatusMarker);
		if (options.addCompletionDate) {
			next = getPropertyWriteAdapter(options.propertySchemaOption)
				?.addCompletionDateIfMissing(next, options.addCompletionDate) ?? next;
		}
	}

	return next;
}

function isCustomColumn(column: ColumnTag | DefaultColumns): column is ColumnTag {
	return column !== "done" && column !== "uncategorised";
}

function getAllPlacementTags(columns: ColumnDefinition[]): string[] {
	return [...new Set(columns.flatMap(getColumnWriteTags))];
}

function replaceStatusMarker(rawLine: string, marker: string): string {
	return rawLine.replace(/^(\s*[-*+]\s+\[)[^\[\]]*(\]\s)/u, `$1${marker}$2`);
}

function replacePlacementTags(rawLine: string, oldTags: string[], newTags: string[]): string {
	const removableTags = oldTags.filter((tag) => !newTags.includes(tag));
	const missingTags = newTags.filter((tag) => !hasTag(rawLine, tag));
	if (removableTags.length === 0 && missingTags.length === 0) return rawLine;

	const matches = findTagMatches(rawLine, removableTags);
	if (matches.length === 0) {
		return missingTags.length > 0 ? appendBeforeBlockLink(rawLine, missingTags) : rawLine;
	}

	let next = rawLine;
	for (let index = matches.length - 1; index >= 0; index -= 1) {
		const match = matches[index]!;
		if (index === 0 && missingTags.length > 0) {
			next = `${next.slice(0, match.start)}${formatTags(missingTags)}${next.slice(match.end)}`;
			continue;
		}
		next = removeTagAt(next, match.start, match.end);
	}
	return next;
}

function findTagMatches(rawLine: string, tags: string[]): Array<{ start: number; end: number }> {
	if (tags.length === 0) return [];
	const alternatives = tags.map(escapeRegExp).join("|");
	const expression = new RegExp(`(?<![\\p{L}\\p{N}_/-])#(?:${alternatives})(?![-_/\\p{L}\\p{N}])`, "gu");
	return Array.from(rawLine.matchAll(expression), (match) => ({
		start: match.index!,
		end: match.index! + match[0].length,
	}));
}

function hasTag(rawLine: string, tag: string): boolean {
	return findTagMatches(rawLine, [tag]).length > 0;
}

function removeTagAt(rawLine: string, start: number, end: number): string {
	if (/\s/u.test(rawLine[end] ?? "")) {
		return `${rawLine.slice(0, start)}${rawLine.slice(end + 1)}`;
	}
	if (/\s/u.test(rawLine[start - 1] ?? "")) {
		return `${rawLine.slice(0, start - 1)}${rawLine.slice(end)}`;
	}
	return `${rawLine.slice(0, start)}${rawLine.slice(end)}`;
}

function appendBeforeBlockLink(rawLine: string, tags: string[]): string {
	const blockLink = rawLine.match(/(\s\^[a-zA-Z0-9-]+\s*)$/u);
	if (!blockLink?.index) return `${rawLine.trimEnd()} ${formatTags(tags)}`;
	return `${rawLine.slice(0, blockLink.index).trimEnd()} ${formatTags(tags)}${blockLink[0]}`;
}

function formatTags(tags: string[]): string {
	return tags.map((tag) => `#${tag}`).join(" ");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
