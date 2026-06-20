import sha256 from "crypto-js/sha256";
import type { Brand } from "src/brand";
import type {
	ColumnPlacementTagTable,
	ColumnDefinition,
	ColumnTag,
	DefaultColumns,
} from "../columns/columns";
import { getTagsFromContent, isValidTag } from "src/parsing/tags/tags";
import {
	getColumnPriority,
	getColumnPrioritySchema,
	getColumnStatus,
	isPlacementTag,
	type PriorityColumnSchema,
	resolveMatchedColumnDefinition,
	usesPriorityMatching,
	usesStatusMatching,
} from "../columns/definitions";
import { PropertySchemaOption, type PropertySchema, type TaskPropertyMap } from "../../parsing/properties/property_schema";
import { NoneSchema } from "../../parsing/properties/none_schema";
import { getPropertyWriteAdapter } from "../../parsing/properties/write";
import { getTasksPriorityValueFromWeight } from "../../parsing/properties/tasks_schema";
import { getSchemaImpl } from "../../parsing/properties";
import { getOrderedStatusMarkers } from "../../parsing/properties/comparators";

/**
 * A string containing characters that mark tasks as completed.
 * Each character represents a valid checkbox status that indicates completion.
 */
export type DoneStatusMarkers = Brand<string, "DoneStatusMarkers">;

/**
 * Default characters that mark a task as done in checkbox notation.
 * 
 * - 'x': Standard lowercase completion marker (e.g., `- [x] Task`)
 * - 'X': Standard uppercase completion marker (e.g., `- [X] Task`)
 * 
 * These characters are recognized as "done" status when parsing task checkboxes.
 * Users can customize this via settings to include additional Unicode characters
 * like emoji (✓, ✅, 👍) or other symbols.
 * 
 * @example
 * ```typescript
 * // These would all be considered "done" with default markers:
 * "- [x] Completed task"
 * "- [X] Another completed task"
 * 
 * // These would NOT be considered done:
 * "- [ ] Incomplete task"
 * "- [?] Unknown status"
 * ```
 */
export const DEFAULT_DONE_STATUS_MARKERS: DoneStatusMarkers = "xX" as DoneStatusMarkers;

/**
 * A string containing characters that mark tasks as non-tasks (ignored).
 * Each character represents a checkbox status that should be completely ignored by the kanban.
 */
export type IgnoredStatusMarkers = Brand<string, "IgnoredStatusMarkers">;

/**
 * Default characters that mark a task as ignored/non-task in checkbox notation.
 * 
 * By default, no tasks are ignored (empty string). Users can customize this via 
 * settings to include characters like '-', '~', or emoji that should be ignored.
 * 
 * These characters are recognized as "ignored" status when parsing task checkboxes.
 * Tasks with these markers are not processed as kanban tasks at all.
 * 
 * @example
 * ```typescript
 * // With default settings, all these would be processed normally:
 * "- [ ] Regular task"
 * "- [x] Completed task" 
 * "- [-] This would also be processed"
 * 
 * // If configured with ignored markers like "-~":
 * "- [-] Cancelled task"    // ignored
 * "- [~] Irrelevant task"   // ignored
 * "- [ ] Regular task"      // processed normally
 * ```
 */
export const DEFAULT_IGNORED_STATUS_MARKERS: IgnoredStatusMarkers = "" as IgnoredStatusMarkers;

/**
 * A string containing characters that mark tasks as cancelled.
 * Each character represents a checkbox status that indicates a cancelled task.
 */
export type CancelledStatusMarkers = Brand<string, "CancelledStatusMarkers">;

/**
 * Default character that marks a task as cancelled in checkbox notation.
 * 
 * - '-': Standard cancellation marker (e.g., `- [-] Cancelled task`)
 */
export const DEFAULT_CANCELLED_STATUS_MARKERS: CancelledStatusMarkers = "-" as CancelledStatusMarkers;

/**
 * Common validation logic for status marker strings.
 * 
 * Valid markers must:
 * - Be single Unicode code points (properly handles emoji and accented characters)
 * - Not contain whitespace, newlines, or control characters
 * - Not contain duplicates
 * 
 * @param markers - The string to validate
 * @returns Array of validation errors, empty if valid
 */
function validateStatusMarkers(markers: string): string[] {
	const errors: string[] = [];
	const chars = Array.from(markers);
	const seen = new Set<string>();

	for (let i = 0; i < chars.length; i++) {
		const char = chars[i];
		if (!char) continue;

		// Check for duplicates
		if (seen.has(char)) {
			errors.push(`Duplicate marker '${char}' at position ${i + 1}`);
			continue;
		}
		seen.add(char);

		// Check for whitespace
		if (/\s/.test(char)) {
			errors.push(`Marker at position ${i + 1} is whitespace`);
		}

		// Check for control characters
		if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) {
			errors.push(`Marker at position ${i + 1} is a control character`);
		}
	}

	return errors;
}

/**
 * Validates a status markers string with configurable empty-string handling.
 *
 * @param markers - The string to validate
 * @param label - Human-readable label for error messages (e.g., "Done", "Cancelled")
 * @param allowEmpty - Whether an empty string is valid
 * @returns Array of validation errors, empty if valid
 */
function validateTypedStatusMarkers(markers: string, label: string, allowEmpty: boolean): string[] {
	if (!markers || markers.length === 0) {
		return allowEmpty ? [] : [`${label} status markers cannot be empty`];
	}
	return validateStatusMarkers(markers);
}

export function validateDoneStatusMarkers(markers: string): string[] {
	return validateTypedStatusMarkers(markers, "Done", false);
}

export function createDoneStatusMarkers(markers: string): DoneStatusMarkers {
	const errors = validateDoneStatusMarkers(markers);
	if (errors.length > 0) {
		throw new Error(`Invalid done status markers: ${errors.join(', ')}`);
	}
	return markers as DoneStatusMarkers;
}

export function validateIgnoredStatusMarkers(markers: string): string[] {
	return validateTypedStatusMarkers(markers, "Ignored", true);
}

export function createIgnoredStatusMarkers(markers: string): IgnoredStatusMarkers {
	const errors = validateIgnoredStatusMarkers(markers);
	if (errors.length > 0) {
		throw new Error(`Invalid ignored status markers: ${errors.join(', ')}`);
	}
	return markers as IgnoredStatusMarkers;
}

export function validateCancelledStatusMarkers(markers: string): string[] {
	return validateTypedStatusMarkers(markers, "Cancelled", false);
}

export function validateStatusMarkerOrder(markers: string): string[] {
	const errors: string[] = [];
	const chars = Array.from(markers);
	const seen = new Set<string>();

	for (let i = 0; i < chars.length; i++) {
		const char = chars[i]!;
		if (char !== " " && /\s/.test(char)) {
			errors.push(`Marker at position ${i + 1} is whitespace`);
		}
		if (seen.has(char)) {
			errors.push(`Duplicate marker '${char}' at position ${i + 1}`);
		}
		seen.add(char);
	}

	return errors;
}

export function createCancelledStatusMarkers(markers: string): CancelledStatusMarkers {
	const errors = validateCancelledStatusMarkers(markers);
	if (errors.length > 0) {
		throw new Error(`Invalid cancelled status markers: ${errors.join(', ')}`);
	}
	return markers as CancelledStatusMarkers;
}

/**
 * Common helper to check if a checkbox status matches any of the provided markers.
 * Properly handles multi-codepoint Unicode characters using Array.from.
 */
function isStatusMatch(statusContent: string | undefined, markers: string): boolean {
	if (!statusContent || !markers) return false;

	// Convert to arrays of Unicode code points to handle multi-codepoint chars
	const contentChars = Array.from(statusContent);
	const markersChars = Array.from(markers);

	// Valid checkbox content must be exactly one code point
	// Note: This will work correctly for most emoji and Unicode characters
	// though it may not handle complex grapheme clusters perfectly
	if (contentChars.length !== 1) {
		return false;
	}

	const singleChar = contentChars[0];
	if (!singleChar) return false;

	// Check if the checkbox content matches any of the provided markers
	return markersChars.includes(singleChar);
}


export interface TaskParseContext {
	columnDefinitions: ColumnDefinition[];
	columnWriteDefinitions?: ColumnDefinition[];
	columnPlacementTagTable: ColumnPlacementTagTable;
	consolidateTags: boolean;
	doneStatusMarkers: string;
	cancelledStatusMarkers: string;
	ignoredStatusMarkers: string;
	propertySchema: PropertySchema;
}

export class Task {
	readonly properties: TaskPropertyMap;

	constructor(
		rawContent: TaskString,
		fileHandle: { path: string },
		readonly rowIndex: number,
		context: TaskParseContext,
	) {
		const [, blockLink] = rawContent.match(blockLinkRegexp) ?? [];
		this.blockLink = blockLink;

		const match = (
			blockLink ? rawContent.replace(blockLinkRegexp, "") : rawContent
		).match(taskStringRegex);

		if (!match) {
			throw new Error(
				"Attempted to create a task from invalid raw content"
			);
		}

		const [, indentation, status, content] = match;
		if (!content) {
			throw new Error("Content not found in raw content");
		}

		const tags = getTagsFromContent(content);

		this._id = sha256(content + fileHandle.path + rowIndex).toString();
		this.content = content;
		this._displayStatus = status || " ";
		this._done = isStatusMatch(this._displayStatus, context.doneStatusMarkers);
		this._path = fileHandle.path;
		this._indentation = indentation || "";
		this.properties = context.propertySchema.parseProperties(rawContent);
		this.propertySchemaOption = context.propertySchema.id;
		const priorityMatches = getTaskPriorityMatchValues(rawContent);
		const matchedColumn = resolveMatchedColumnDefinition(context.columnDefinitions, {
			tags,
			status: this._displayStatus,
			priority: getTaskPriorityMatchValue(this.propertySchemaOption, this.properties),
			prioritySchema: this.propertySchemaOption === PropertySchemaOption.TasksPlugin
				? PropertySchemaOption.TasksPlugin
				: this.propertySchemaOption === PropertySchemaOption.Dataview
				? PropertySchemaOption.Dataview
				: undefined,
			priorities: priorityMatches,
		});

		for (const tag of tags) {
			if (tag === "done") {
				if (!this._column) {
					this._column = "done" as DefaultColumns;
				}
				tags.delete(tag);
				if (!context.consolidateTags) {
					this.content = this.stripTagFromContent(this.content, tag);
				}
				continue;
			}

			if (matchedColumn && isPlacementTag(matchedColumn, tag)) {
				if (!this._column) {
					this._column = matchedColumn.id;
				}
				tags.delete(tag);
				if (!context.consolidateTags) {
					this.content = this.stripTagFromContent(this.content, tag);
				}
			}
			if (context.consolidateTags) {
				this.content = this.stripTagFromContent(this.content, tag);
			}
		}

		if (matchedColumn && usesStatusMatching(matchedColumn) && !this._column) {
			this._column = matchedColumn.id;
		}
		if (matchedColumn && usesPriorityMatching(matchedColumn) && !this._column) {
			this._column = matchedColumn.id;
		}

		this._tags = tags;
		this.blockLink = blockLink;
		this.consolidateTags = context.consolidateTags;
		this.sourceColumnDefinitions = context.columnDefinitions;
		this.columnDefinitions = context.columnWriteDefinitions ?? context.columnDefinitions;
		this.columnPlacementTagTable = context.columnPlacementTagTable;
		this.doneStatusMarkers = context.doneStatusMarkers;
		this.cancelledStatusMarkers = context.cancelledStatusMarkers;
		this.ignoredStatusMarkers = context.ignoredStatusMarkers;

		if (this._done) {
			this._column = undefined;
		}
	}

	private _id: string;
	get id() {
		return this._id;
	}

	content: string;
	private consolidateTags: boolean;
	private sourceColumnDefinitions: ColumnDefinition[];
	private columnDefinitions: ColumnDefinition[];
	private columnPlacementTagTable: ColumnPlacementTagTable;
	private doneStatusMarkers: string;
	private cancelledStatusMarkers: string;
	private ignoredStatusMarkers: string;
	private propertySchemaOption: PropertySchemaOption;

	private _done: boolean;
	get done(): boolean {
		return this._done;
	}
	set done(done: true) {
		this._done = done;
		this._column = undefined;
		this._displayStatus = Array.from(this.doneStatusMarkers)[0] ?? "x";
	}

	get isCancelled(): boolean {
		return isStatusMatch(this._displayStatus, this.cancelledStatusMarkers);
	}

	undone() {
		this._done = false;
		this._displayStatus = " ";
	}

	cycleStatus(statusMarkerOrder: string): boolean {
		if (this.done) {
			this.undone();
			return false;
		}

		const orderedMarkers = getOrderedStatusMarkers(statusMarkerOrder);
		const currentIndex = orderedMarkers.indexOf(this._displayStatus);
		const nextMarker = currentIndex >= 0 ? orderedMarkers[currentIndex + 1] : undefined;

		if (!nextMarker) {
			this.done = true;
			return true;
		}

		if (isStatusMatch(nextMarker, this.doneStatusMarkers)) {
			this.done = true;
			return true;
		}

		this._done = false;
		this._displayStatus = nextMarker;
		return false;
	}

	private _displayStatus: string;
	get displayStatus(): string {
		return this._displayStatus;
	}

	private _deleted: boolean = false;

	private readonly _path: string;
	get path() {
		return this._path;
	}

	private readonly _indentation: string;
	get indentation() {
		return this._indentation;
	}

	private _column: ColumnTag | DefaultColumns | "archived" | undefined;
	get column(): ColumnTag | DefaultColumns | "archived" | undefined {
		return this._column;
	}
	set column(column: ColumnTag | DefaultColumns) {
		if (column === "done") {
			this.done = true;
			return;
		}
		const wasDone = this._done;
		if (column === "uncategorised") {
			this.moveToUncategorised();
			if (wasDone) {
				this._displayStatus = " ";
			}
			return;
		}

		this._done = false;
		if (wasDone) {
			this._displayStatus = " ";
		}
		this.moveToColumn(column);
	}

	readonly blockLink: string | undefined;
	private _tags: Set<string>;
	get tags(): ReadonlySet<string> {
		return this._tags;
	}

	private getPlacementTagsForColumn(column: ColumnTag): string[] {
		return (this.columnPlacementTagTable[column] ?? []).filter((tag) => isValidTag(tag));
	}

	private getCurrentPlacementTags(): string[] {
		if (!this.column || this.column === "archived" || this.column === "done" || this.column === "uncategorised") {
			return [];
		}

		return this.getPlacementTagsForColumn(this.column as ColumnTag);
	}

	private getColumnDefinition(
		column: ColumnTag | undefined,
		definitions: ColumnDefinition[] = this.columnDefinitions,
	): ColumnDefinition | undefined {
		if (!column) return undefined;
		return definitions.find((definition) => definition.id === column);
	}

	private moveToColumn(column: ColumnTag) {
		const sourceColumn = this.getColumnDefinition(
			this._column && this._column !== "archived" && this._column !== "done" && this._column !== "uncategorised"
				? this._column
				: undefined,
			this.sourceColumnDefinitions,
		);
		const destinationColumn = this.getColumnDefinition(column);

		if (sourceColumn && usesStatusMatching(sourceColumn)) {
			this._displayStatus = " ";
		}
		const sourcePrioritySchema = getColumnPrioritySchema(sourceColumn);
		if (sourceColumn && sourcePrioritySchema) {
			this.removePriorityPlacement(sourcePrioritySchema);
		}
		const destinationStatus = destinationColumn ? getColumnStatus(destinationColumn) : undefined;
		if (destinationStatus) {
			this._displayStatus = destinationStatus;
		}
		const destinationPriority = getColumnPriority(destinationColumn);
		if (destinationPriority && destinationColumn) {
			this.writePriorityPlacement(destinationPriority, getColumnPrioritySchema(destinationColumn));
		}

		this._column = column;
	}

	private moveToUncategorised() {
		const sourceColumn = this.getColumnDefinition(
			this._column && this._column !== "archived" && this._column !== "done" && this._column !== "uncategorised"
				? this._column
				: undefined,
			this.sourceColumnDefinitions,
		);
		if (sourceColumn && usesStatusMatching(sourceColumn)) {
			this._displayStatus = " ";
		}
		const sourcePrioritySchema = getColumnPrioritySchema(sourceColumn);
		if (sourceColumn && sourcePrioritySchema) {
			this.removePriorityPlacement(sourcePrioritySchema);
		}
		this._column = undefined;
		this._done = false;
	}

	private stripTagFromContent(value: string, tag: string): string {
		const escapedTag = escapeRegExp(tag);
		return value
			.replace(new RegExp(`(^|\\s)#${escapedTag}(?=$|\\s|[^-_\/\\p{L}\\p{N}])`, "gu"), "$1")
			.replace(/[ \t]{2,}/g, " ")
			.trim();
	}

	replaceTag(oldTag: string | null, newTag: string | null) {
		if (oldTag) {
			this._tags.delete(oldTag);
			this.content = this.stripTagFromContent(this.content, oldTag);
		}
		if (newTag) {
			this._tags.add(newTag);
			const contentTags = Array.from(getTagsFromContent(this.content)).map((tag) => tag.toLowerCase());
			if (!this.consolidateTags && !contentTags.includes(newTag.toLowerCase())) {
				this.content = `${this.content.trim()} #${newTag}`.trim();
			}
		}
	}

	private stripPlacementTags(value: string, placementTags: string[]): string {
		return placementTags.reduce((nextValue, tag) => this.stripTagFromContent(nextValue, tag), value);
	}

	private transformContentWithPropertyWriter(transform: (rawLine: string) => string) {
		const rawLine = `- [ ] ${this.content.trim()}`;
		const transformed = transform(rawLine);
		const match = transformed.match(taskStringRegex);
		if (match?.[3]) {
			this.content = match[3];
		}
	}

	private removePriorityPlacement(schema: PriorityColumnSchema | undefined = getPriorityColumnContextSchema(this.propertySchemaOption)) {
		if (!schema) return;
		const adapter = getPropertyWriteAdapter(schema);
		if (!adapter) return;
		this.transformContentWithPropertyWriter((rawLine) => adapter.removePriority(rawLine));
	}

	private writePriorityPlacement(priority: string, schema: PriorityColumnSchema | undefined = getPriorityColumnContextSchema(this.propertySchemaOption)) {
		if (!schema) return;
		const adapter = getPropertyWriteAdapter(schema);
		if (!adapter) return;
		this.transformContentWithPropertyWriter((rawLine) => adapter.upsertPriority(rawLine, priority));
	}

	serialise(): string {
		if (this._deleted) {
			return "";
		}

		const placementTags = this.getCurrentPlacementTags();
		const currentColumnDefinition = this.getColumnDefinition(
			this.column && this.column !== "archived" && this.column !== "done" && this.column !== "uncategorised"
				? this.column
				: undefined,
		);
		const usesStatusPlacement = !!currentColumnDefinition && usesStatusMatching(currentColumnDefinition);
		const usesPriorityPlacement = !!currentColumnDefinition && usesPriorityMatching(currentColumnDefinition);
		const serialisedContent = placementTags.length > 0
			? this.stripPlacementTags(this.content.trim(), placementTags)
			: this.content.trim();
		const serialisedTags = this.consolidateTags
			? Array.from(this.tags).filter((tag) => !placementTags.includes(tag))
			: [];

		return [
			this.indentation,
			`- [${this._displayStatus}] `,
			serialisedContent,
			this.consolidateTags && serialisedTags.length > 0
				? ` ${serialisedTags
					.map((tag) => `#${tag}`)
					.join(" ")}`
				: "",
			this.column
				? this.column === "archived"
					? ` #${this.column}`
					: usesStatusPlacement || usesPriorityPlacement
						? ""
						: placementTags.length > 0
						? ` ${placementTags.map((tag) => `#${tag}`).join(" ")}`
						: ` #${this.column}`
				: "",
			this.blockLink ? ` ^${this.blockLink}` : "",
		]
			.join("")
			.trimEnd();
	}

	serialiseForColumn(column: ColumnTag | DefaultColumns): string {
		const originalColumn = this._column;
		const originalDone = this._done;
		const originalDisplayStatus = this._displayStatus;
		const originalContent = this.content;

		if (column === "done") {
			this.done = true;
		} else if (column === "uncategorised") {
			this.moveToUncategorised();
		} else {
			this.column = column;
		}

		try {
			return this.serialise();
		} finally {
			this._column = originalColumn;
			this._done = originalDone;
			this._displayStatus = originalDisplayStatus;
			this.content = originalContent;
		}
	}

	archive() {
		const sourceColumn = this.getColumnDefinition(
			this._column && this._column !== "archived" && this._column !== "done" && this._column !== "uncategorised"
				? this._column
				: undefined,
			this.sourceColumnDefinitions,
		);
		const sourcePrioritySchema = getColumnPrioritySchema(sourceColumn);
		if (sourceColumn && sourcePrioritySchema) {
			this.removePriorityPlacement(sourcePrioritySchema);
		}
		if (!this._done) {
			this._displayStatus = "x";
		}
		this._done = true;
		this._column = "archived";
	}

	cancel() {
		this._displayStatus = Array.from(this.cancelledStatusMarkers)[0] ?? "-";
	}

	restore() {
		this._displayStatus = " ";
	}

	delete() {
		this._deleted = true;
	}
}

type TaskString = Brand<string, "TaskString">;

export function isTrackedTaskString(input: string, ignoredStatusMarkers: string = DEFAULT_IGNORED_STATUS_MARKERS): input is TaskString {
	if (input.includes("#archived")) {
		return false;
	}

	if (!taskStringRegex.test(input)) {
		return false;
	}

	// Extract the checkbox status and check if it's ignored
	const match = input.match(taskStringRegex);
	if (match) {
		const [, , status] = match;
		if (isStatusMatch(status, ignoredStatusMarkers)) {
			return false;
		}
	}

	return true;
}

// begins with 0 or more whitespace chars
// then follows the pattern "- [ ]", "* [ ]", or "+ [ ]" with checkbox content
// then contains an additional whitespace before any trailing content
// excludes backlinks by ensuring brackets don't contain nested brackets
const taskStringRegex = /^(\s*)[-*+]\s\[([^\[\]]*)\]\s(.+)/;
const blockLinkRegexp = /\s\^([a-zA-Z0-9-]+)$/;

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTaskPriorityMatchValue(
	propertySchemaOption: PropertySchemaOption,
	properties: TaskPropertyMap,
): string | undefined {
	const priority = properties.get("priority");
	if (propertySchemaOption === PropertySchemaOption.TasksPlugin && typeof priority?.value === "number") {
		return getTasksPriorityValueFromWeight(priority.value);
	}
	if (propertySchemaOption === PropertySchemaOption.Dataview && typeof priority?.value === "string") {
		return priority.value.trim();
	}
	return undefined;
}

function getPriorityColumnContextSchema(
	propertySchemaOption: PropertySchemaOption,
): PriorityColumnSchema | undefined {
	return propertySchemaOption === PropertySchemaOption.TasksPlugin || propertySchemaOption === PropertySchemaOption.Dataview
		? propertySchemaOption
		: undefined;
}

function getTaskPriorityMatchValues(rawLine: string): Partial<Record<PriorityColumnSchema, string | undefined>> {
	return {
		[PropertySchemaOption.TasksPlugin]: getTaskPriorityMatchValue(
			PropertySchemaOption.TasksPlugin,
			getSchemaImpl(PropertySchemaOption.TasksPlugin).parseProperties(rawLine),
		),
		[PropertySchemaOption.Dataview]: getTaskPriorityMatchValue(
			PropertySchemaOption.Dataview,
			getSchemaImpl(PropertySchemaOption.Dataview).parseProperties(rawLine),
		),
	};
}
