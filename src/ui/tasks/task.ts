import sha256 from "crypto-js/sha256";
import type { Brand } from "src/brand";
import type {
	ColumnPlacementTagTable,
	ColumnDefinition,
	ColumnTag,
	DefaultColumns,
} from "../columns/columns";
import { getTagsFromContent, isValidTag } from "src/parsing/tags/tags";
import { isPlacementTag, resolveMatchedColumnDefinition } from "../columns/definitions";

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


export class Task {
	constructor(
		rawContent: TaskString,
		fileHandle: { path: string },
		readonly rowIndex: number,
		columnDefinitions: ColumnDefinition[],
		private readonly columnPlacementTagTable: ColumnPlacementTagTable,
		private readonly consolidateTags: boolean,
		private readonly doneStatusMarkers: string = DEFAULT_DONE_STATUS_MARKERS,
		private readonly cancelledStatusMarkers: string = DEFAULT_CANCELLED_STATUS_MARKERS,
		private readonly ignoredStatusMarkers: string = DEFAULT_IGNORED_STATUS_MARKERS
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
		this._done = isStatusMatch(this._displayStatus, this.doneStatusMarkers);
		this._path = fileHandle.path;
		this._indentation = indentation || "";
		const matchedColumn = resolveMatchedColumnDefinition(columnDefinitions, tags);

		for (const tag of tags) {
			if (tag === "done") {
				if (!this._column) {
					this._column = "done" as DefaultColumns;
				}
				tags.delete(tag);
				if (!consolidateTags) {
					this.content = this.stripTagFromContent(this.content, tag);
				}
				continue;
			}

			if (matchedColumn && isPlacementTag(matchedColumn, tag)) {
				if (!this._column) {
					this._column = matchedColumn.id;
				}
				tags.delete(tag);
				if (!consolidateTags) {
					this.content = this.stripTagFromContent(this.content, tag);
				}
			}
			if (consolidateTags) {
				this.content = this.stripTagFromContent(this.content, tag);
			}
		}

		this.tags = tags;
		this.blockLink = blockLink;

		if (this._done) {
			this._column = undefined;
		}
	}

	private _id: string;
	get id() {
		return this._id;
	}

	content: string;

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
	set column(column: ColumnTag) {
		this._column = column;
		this._done = false;
		this._displayStatus = " ";
	}

	readonly blockLink: string | undefined;
	readonly tags: ReadonlySet<string>;

	private getPlacementTagsForColumn(column: ColumnTag): string[] {
		return (this.columnPlacementTagTable[column] ?? []).filter((tag) => isValidTag(tag));
	}

	private getCurrentPlacementTags(): string[] {
		if (!this.column || this.column === "archived" || this.column === "done" || this.column === "uncategorised") {
			return [];
		}

		return this.getPlacementTagsForColumn(this.column as ColumnTag);
	}

	private stripTagFromContent(value: string, tag: string): string {
		return value
			.replaceAll(` #${tag}`, "")
			.replaceAll(`#${tag}`, "")
			.trim();
	}

	private stripPlacementTags(value: string, placementTags: string[]): string {
		return placementTags.reduce((nextValue, tag) => this.stripTagFromContent(nextValue, tag), value);
	}
	serialise(): string {
		if (this._deleted) {
			return "";
		}

		const placementTags = this.getCurrentPlacementTags();
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
					: placementTags.length > 0
						? ` ${placementTags.map((tag) => `#${tag}`).join(" ")}`
						: ` #${this.column}`
				: "",
			this.blockLink ? ` ^${this.blockLink}` : "",
		]
			.join("")
			.trimEnd();
	}

	archive() {
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
