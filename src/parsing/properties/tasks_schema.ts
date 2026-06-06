import {
	type PropertySchema,
	PropertySchemaOption,
	type TaskPropertyMap,
	type PropertyKeyMeta,
	UNIVERSAL_STATUS_PROPERTY_KEY,
	parseUniversalStatus,
} from "./property_schema";

const TASKS_REGEX = {
	due: /📅\s*(\d{4}-\d{2}-\d{2})/,
	scheduled: /⏰\s*(\d{4}-\d{2}-\d{2})/,
	start: /🛫\s*(\d{4}-\d{2}-\d{2})/,
	done: /🏁\s*(\d{4}-\d{2}-\d{2})/,
	priority: /(🔺|⏫|🔼|🔽|⏬)/,
	recurrence: /🔁\s*([a-zA-Z0-9\s]+?)(?=\s*[📅⏰🛫🏁🔺⏫🔼🔽⏬]|$)/,
};

function parseDate(value: string): Date | null {
	const parsed = new Date(value);
	return isNaN(parsed.getTime()) ? null : parsed;
}

export class TasksPluginSchema implements PropertySchema {
	id = PropertySchemaOption.TasksPlugin;
	label = "Tasks Plugin";

	parseProperties(rawLine: string): TaskPropertyMap {
		const properties: TaskPropertyMap = new Map();
		const statusProp = parseUniversalStatus(rawLine);
		properties.set(UNIVERSAL_STATUS_PROPERTY_KEY, statusProp);

		const dueMatch = rawLine.match(TASKS_REGEX.due);
		if (dueMatch && dueMatch[1]) {
			properties.set("due", {
				key: "due",
				rawValue: dueMatch[0],
				value: parseDate(dueMatch[1]),
			});
		}

		const scheduledMatch = rawLine.match(TASKS_REGEX.scheduled);
		if (scheduledMatch && scheduledMatch[1]) {
			properties.set("scheduled", {
				key: "scheduled",
				rawValue: scheduledMatch[0],
				value: parseDate(scheduledMatch[1]),
			});
		}

		const startMatch = rawLine.match(TASKS_REGEX.start);
		if (startMatch && startMatch[1]) {
			properties.set("start", {
				key: "start",
				rawValue: startMatch[0],
				value: parseDate(startMatch[1]),
			});
		}

		const doneMatch = rawLine.match(TASKS_REGEX.done);
		if (doneMatch && doneMatch[1]) {
			properties.set("done", {
				key: "done",
				rawValue: doneMatch[0],
				value: parseDate(doneMatch[1]),
			});
		}

		const priorityMatch = rawLine.match(TASKS_REGEX.priority);
		if (priorityMatch && priorityMatch[1]) {
			properties.set("priority", {
				key: "priority",
				rawValue: priorityMatch[0],
				value: priorityMatch[1],
			});
		}

		const recurrenceMatch = rawLine.match(TASKS_REGEX.recurrence);
		if (recurrenceMatch && recurrenceMatch[1]) {
			properties.set("recurrence", {
				key: "recurrence",
				rawValue: recurrenceMatch[0],
				value: recurrenceMatch[1].trim(),
			});
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
			{ key: "priority", label: "Priority", type: "priority" },
			{ key: "recurrence", label: "Recurrence", type: "text" },
		];
	}
}
