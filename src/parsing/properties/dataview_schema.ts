import {
	type PropertySchema,
	PropertySchemaOption,
	type TaskPropertyMap,
	type PropertyKeyMeta,
	createPropertyMapWithStatus,
	UNIVERSAL_STATUS_PROPERTY_KEY,
} from "./property_schema";
import { getPropertyAliases } from "./normalization";
import { parseIsoDate, parseNumber } from "./value_parsers";

const DATAVIEW_KEY_PATTERN = "[a-zA-Z0-9_-]+";
const ENCLOSED_DATAVIEW_REGEX = /\[\s*([a-zA-Z0-9_-]+)\s*::\s*([^\]]*?)\s*\]|\(\s*([a-zA-Z0-9_-]+)\s*::\s*([^\)]*?)\s*\)/g;
const BARE_DATAVIEW_MARKER_REGEX = new RegExp(`(^|\\s)(${DATAVIEW_KEY_PATTERN})\\s*::\\s*`, "g");

type ParsedInlineField = {
	index: number;
	endIndex: number;
	key: string;
	rawValue: string;
	rawValueText: string;
};

function parseDataviewValue(value: string): string | number | Date {
	const trimmed = value.trim();

	const parsedDate = parseIsoDate(trimmed);
	if (parsedDate) {
		return parsedDate;
	}

	const parsedNumber = parseNumber(trimmed);
	if (parsedNumber !== null) {
		return parsedNumber;
	}

	return trimmed;
}

function isInsideRange(index: number, ranges: Array<{ start: number; end: number }>): boolean {
	return ranges.some((range) => index >= range.start && index < range.end);
}

function parseEnclosedFields(rawLine: string): ParsedInlineField[] {
	return [...rawLine.matchAll(ENCLOSED_DATAVIEW_REGEX)].flatMap((match) => {
		const index = match.index ?? Number.MAX_SAFE_INTEGER;
		const key = match[1] ?? match[3];
		const rawValueText = match[2] ?? match[4];

		if (!key || rawValueText === undefined) return [];

		return [{
			index,
			endIndex: index + match[0].length,
			key,
			rawValue: match[0],
			rawValueText,
		}];
	});
}

function parseBareFields(rawLine: string, enclosedFields: ParsedInlineField[]): ParsedInlineField[] {
	const enclosedRanges = enclosedFields.map((field) => ({ start: field.index, end: field.endIndex }));
	const markers = [...rawLine.matchAll(BARE_DATAVIEW_MARKER_REGEX)]
		.map((match) => {
			const prefix = match[1] ?? "";
			const index = (match.index ?? 0) + prefix.length;
			return {
				index,
				valueStart: (match.index ?? 0) + match[0].length,
				key: match[2],
			};
		})
		.filter((marker) => marker.key && !isInsideRange(marker.index, enclosedRanges));

	return markers.flatMap((marker, markerIndex) => {
		if (!marker.key) return [];

		const nextMarkerIndex = markers[markerIndex + 1]?.index ?? Number.MAX_SAFE_INTEGER;
		const nextEnclosedIndex = enclosedFields
			.map((field) => field.index)
			.filter((index) => index > marker.valueStart)
			.sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER;
		const endIndex = Math.min(nextMarkerIndex, nextEnclosedIndex, rawLine.length);
		const rawValueText = rawLine.slice(marker.valueStart, endIndex).trim();
		const rawValue = rawLine.slice(marker.index, endIndex).trimEnd();

		if (!rawValueText) return [];

		return [{
			index: marker.index,
			endIndex: marker.index + rawValue.length,
			key: marker.key,
			rawValue,
			rawValueText,
		}];
	});
}

export class DataviewSchema implements PropertySchema {
	id = PropertySchemaOption.Dataview;
	label = "Dataview";

	parseProperties(rawLine: string): TaskPropertyMap {
		const properties = createPropertyMapWithStatus(rawLine);
		const enclosedFields = parseEnclosedFields(rawLine);
		const fields = [
			...enclosedFields,
			...parseBareFields(rawLine, enclosedFields),
		].sort((a, b) => a.index - b.index);

		for (const field of fields) {
			if (!properties.has(field.key)) {
				properties.set(field.key, {
					key: field.key,
					rawValue: field.rawValue,
					value: parseDataviewValue(field.rawValueText),
					startIndex: field.index,
					endIndex: field.endIndex,
				});
			}
		}

		return properties;
	}

	knownKeys(): PropertyKeyMeta[] {
		return [
			{ key: UNIVERSAL_STATUS_PROPERTY_KEY, label: "Status", type: "text" },
			{ key: "due", label: "Due", type: "date" },
			{ key: "scheduled", label: "Scheduled", type: "date" },
			{ key: "start", label: "Start", type: "date" },
			{ key: "done", label: "Done", type: "date", aliases: getPropertyAliases("done") },
			{ key: "completion", label: "Completion", type: "date" },
			{ key: "created", label: "Created", type: "date" },
			{ key: "priority", label: "Priority", type: "text" },
			{ key: "repeat", label: "Repeat", type: "text", aliases: getPropertyAliases("repeat") },
		];
	}
}
