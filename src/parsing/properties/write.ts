import { DataviewSchema } from "./dataview_schema";
import { PropertySchemaOption, type PropertySchema, type TaskProperty } from "./property_schema";
import { TasksPluginSchema, getTasksPriorityOption } from "./tasks_schema";

export type WritableDatePropertyKey = "due" | "scheduled" | "start" | "completion";
type EditableDatePropertyKey = Exclude<WritableDatePropertyKey, "completion">;

export interface PropertyWriteAdapter {
	schema: PropertySchemaOption.TasksPlugin | PropertySchemaOption.Dataview;
	addCompletionDateIfMissing(rawLine: string, date: string): string;
	upsertDate(rawLine: string, key: EditableDatePropertyKey, date: string): string;
	removeDate(rawLine: string, key: WritableDatePropertyKey): string;
	upsertPriority(rawLine: string, priority: string): string;
	removePriority(rawLine: string): string;
}

const TASKS_WRITERS: Record<EditableDatePropertyKey | "done", string> = {
	due: "📅",
	scheduled: "⏳",
	start: "🛫",
	done: "✅",
};

const DATAVIEW_WRITERS: Record<WritableDatePropertyKey, string> = {
	due: "due",
	scheduled: "scheduled",
	start: "start",
	completion: "completion",
};

const TRAILING_BLOCK_LINK_REGEX = /(\s\^[a-zA-Z0-9-]+)$/;

class TasksPluginWriteAdapter implements PropertyWriteAdapter {
	schema = PropertySchemaOption.TasksPlugin as const;
	private readonly propertySchema: PropertySchema = new TasksPluginSchema();

	addCompletionDateIfMissing(rawLine: string, date: string): string {
		if (this.propertySchema.parseProperties(rawLine).has("done")) {
			return rawLine;
		}
		return appendBeforeBlockLink(rawLine, `${TASKS_WRITERS.done} ${date}`);
	}

	upsertDate(rawLine: string, key: EditableDatePropertyKey, date: string): string {
		const marker = markerForExistingTasksProperty(rawLine, key) ?? TASKS_WRITERS[key];
		const property = this.propertySchema.parseProperties(rawLine).get(key);
		return upsertProperty(rawLine, property, `${marker} ${date}`);
	}

	removeDate(rawLine: string, key: WritableDatePropertyKey): string {
		const propertyKey = key === "completion" ? "done" : key;
		const property = this.propertySchema.parseProperties(rawLine).get(propertyKey);
		return property ? removeProperty(rawLine, property) : rawLine;
	}

	upsertPriority(rawLine: string, priority: string): string {
		const option = getTasksPriorityOption(priority);
		if (!option) {
			return rawLine;
		}
		const property = this.propertySchema.parseProperties(rawLine).get("priority");
		return upsertProperty(rawLine, property, option.emoji);
	}

	removePriority(rawLine: string): string {
		const property = this.propertySchema.parseProperties(rawLine).get("priority");
		return property ? removeProperty(rawLine, property) : rawLine;
	}
}

class DataviewWriteAdapter implements PropertyWriteAdapter {
	schema = PropertySchemaOption.Dataview as const;
	private readonly propertySchema: PropertySchema = new DataviewSchema();

	addCompletionDateIfMissing(rawLine: string, date: string): string {
		if (hasDataviewCompletionProperty(rawLine, this.propertySchema)) {
			return rawLine;
		}
		return appendBeforeBlockLink(rawLine, formatDataviewField("completion", date));
	}

	upsertDate(rawLine: string, key: EditableDatePropertyKey, date: string): string {
		const property = this.propertySchema.parseProperties(rawLine).get(key);
		return upsertProperty(rawLine, property, formatDataviewField(DATAVIEW_WRITERS[key], date));
	}

	removeDate(rawLine: string, key: WritableDatePropertyKey): string {
		const property = this.propertySchema.parseProperties(rawLine).get(key);
		return property ? removeProperty(rawLine, property) : rawLine;
	}

	upsertPriority(rawLine: string, _priority: string): string {
		return rawLine;
	}

	removePriority(rawLine: string): string {
		return rawLine;
	}
}

const WRITE_ADAPTERS = {
	[PropertySchemaOption.TasksPlugin]: new TasksPluginWriteAdapter(),
	[PropertySchemaOption.Dataview]: new DataviewWriteAdapter(),
} as const;

export function getPropertyWriteAdapter(
	schema: PropertySchemaOption,
): PropertyWriteAdapter | null {
	if (schema === PropertySchemaOption.TasksPlugin || schema === PropertySchemaOption.Dataview) {
		return WRITE_ADAPTERS[schema];
	}
	return null;
}

export function formatLocalDate(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatDataviewField(key: string, date: string): string {
	return `[${key}:: ${date}]`;
}

function upsertProperty(rawLine: string, property: TaskProperty | undefined, replacement: string): string {
	if (!property) {
		return appendBeforeBlockLink(rawLine, replacement);
	}
	return replaceProperty(rawLine, property, replacement);
}

function replaceProperty(rawLine: string, property: TaskProperty, replacement: string): string {
	return `${rawLine.slice(0, property.startIndex)}${replacement}${rawLine.slice(property.endIndex)}`;
}

function removeProperty(rawLine: string, property: TaskProperty): string {
	const next = `${rawLine.slice(0, property.startIndex)}${rawLine.slice(property.endIndex)}`;
	return normalizeWhitespaceAroundIndex(next, property.startIndex);
}

function appendBeforeBlockLink(rawLine: string, metadata: string): string {
	const match = rawLine.match(TRAILING_BLOCK_LINK_REGEX);
	if (!match?.index) {
		return `${rawLine.trimEnd()} ${metadata}`;
	}

	const body = rawLine.slice(0, match.index).trimEnd();
	return `${body} ${metadata}${match[0]}`;
}

function normalizeWhitespaceAroundIndex(rawLine: string, index: number): string {
	let start = Math.max(0, index);
	while (start > 0 && /[ \t]/.test(rawLine[start - 1] ?? "")) {
		start -= 1;
	}

	let end = Math.min(rawLine.length, index);
	while (end < rawLine.length && /[ \t]/.test(rawLine[end] ?? "")) {
		end += 1;
	}

	const before = rawLine.slice(0, start);
	const after = rawLine.slice(end);
	const separator = before && after ? " " : "";
	return `${before}${separator}${after}`.trimEnd();
}

function markerForExistingTasksProperty(rawLine: string, key: EditableDatePropertyKey): string | undefined {
	const property = new TasksPluginSchema().parseProperties(rawLine).get(key);
	if (!property) return undefined;
	const marker = Array.from(property.rawValue.trim())[0];
	return marker;
}

function hasDataviewCompletionProperty(rawLine: string, schema: PropertySchema): boolean {
	const properties = schema.parseProperties(rawLine);
	return properties.has("completion") || properties.has("done");
}
