import {
	type PropertySchema,
	PropertySchemaOption,
	type TaskPropertyMap,
	type PropertyKeyMeta,
	UNIVERSAL_STATUS_PROPERTY_KEY,
	parseUniversalStatus,
} from "./property_schema";

// Dataview inline fields can be:
// key:: value
// [key:: value]
// (key:: value)
const DATAVIEW_REGEX = /(?:\[|\()?\s*([a-zA-Z0-9_-]+)\s*::\s*([^\]\)]+?)\s*(?:\]|\)|$)/g;

function parseDataviewValue(value: string): string | number | Date {
	const trimmed = value.trim();
	
	// Check if ISO date
	if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/.test(trimmed)) {
		const parsed = new Date(trimmed);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}
	}
	
	// Check if pure number
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		const num = Number(trimmed);
		if (!isNaN(num)) {
			return num;
		}
	}
	
	return trimmed;
}

export class DataviewSchema implements PropertySchema {
	id = PropertySchemaOption.Dataview;
	label = "Dataview";

	parseProperties(rawLine: string): TaskPropertyMap {
		const properties: TaskPropertyMap = new Map();
		const statusProp = parseUniversalStatus(rawLine);
		properties.set(UNIVERSAL_STATUS_PROPERTY_KEY, statusProp);

		const matches = [...rawLine.matchAll(DATAVIEW_REGEX)];
		for (const match of matches) {
			const key = match[1];
			const rawValueStr = match[2];
			
			if (key && rawValueStr !== undefined && !properties.has(key)) {
				properties.set(key, {
					key,
					rawValue: match[0], // full matched substring e.g. "[due:: 2024-01-20]" or "due:: 2024"
					value: parseDataviewValue(rawValueStr),
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
			{ key: "done", label: "Done", type: "date" },
			{ key: "priority", label: "Priority", type: "text" }, // Dataview doesn't strictly have a "priority" enum type, we default text but could infer
		];
	}
}
